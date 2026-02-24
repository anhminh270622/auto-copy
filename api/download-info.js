import { Innertube, Platform } from "youtubei.js";

Platform.shim.eval = async (data, env) => {
  const props = [];
  if (env.n) props.push(`n: exportedVars.nFunction("${env.n}")`);
  if (env.sig) props.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  const code = `${data.output}\nreturn { ${props.join(", ")} }`;
  return new Function(code)();
};

function formatBytes(bytes) {
  if (!bytes) return "N/A";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const CLIENTS = ["ANDROID", "TVHTML5", "WEB"];

async function getNoembedInfo(videoId) {
  const response = await fetch(
    `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
  );
  if (!response.ok) {
    throw new Error(`noembed failed with status ${response.status}`);
  }
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return {
    title: data.title || "",
    thumbnail:
      data.thumbnail_url ||
      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    channel: data.author_name || "",
    duration: "",
  };
}

async function getInfoWithFallback(videoId) {
  let lastError;
  for (const clientType of CLIENTS) {
    try {
      console.log(`Trying client: ${clientType}`);
      const yt = await Innertube.create({ client_type: clientType });
      const info = await yt.getBasicInfo(videoId);

      // Check if we actually got streaming data
      if (info.streaming_data) {
        console.log(`Success with client: ${clientType}`);
        return { yt, info };
      }
      console.warn(`Client ${clientType} returned no streaming data`);
    } catch (err) {
      console.error(`Client ${clientType} failed:`, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error("All clients failed to retrieve streaming data");
}

export default async function handler(req, res) {
  const videoId = req.query.v;
  if (!videoId) return res.status(400).json({ error: "Missing video ID" });

  try {
    let info = null;
    let videoInfo = null;
    let fromYouTubeStream = true;

    try {
      const ytResult = await getInfoWithFallback(videoId);
      info = ytResult.info;
      videoInfo = {
        title: info.basic_info.title || "",
        thumbnail:
          info.basic_info.thumbnail?.[0]?.url ||
          `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        channel: info.basic_info.author || "",
        duration: formatDuration(info.basic_info.duration),
      };
    } catch (ytErr) {
      console.error("youtubei failed, fallback to noembed:", ytErr.message);
      videoInfo = await getNoembedInfo(videoId);
      fromYouTubeStream = false;
    }

    const combined = (info?.streaming_data?.formats || []).map((f) => ({
      format_id: String(f.itag),
      quality: f.quality_label || "360p",
      ext: f.mime_type?.includes("webm") ? "webm" : "mp4",
      hasVideo: true,
      hasAudio: true,
      size: formatBytes(f.content_length),
    }));

    const adaptive = (info?.streaming_data?.adaptive_formats || [])
      .filter((f) => f.content_length)
      .map((f) => {
        const isVideo = f.mime_type?.startsWith("video/");
        return {
          format_id: String(f.itag),
          quality: isVideo
            ? f.quality_label || ""
            : f.audio_quality?.replace("AUDIO_QUALITY_", "") || "Audio",
          ext: f.mime_type?.includes("webm")
            ? "webm"
            : f.mime_type?.includes("audio/mp4")
              ? "m4a"
              : "mp4",
          hasVideo: isVideo,
          hasAudio: !isVideo,
          size: formatBytes(f.content_length),
        };
      });

    const videoOnly = adaptive
      .filter((f) => f.hasVideo)
      .filter((f) => f.ext === "mp4")
      .sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

    const audioOnly = adaptive
      .filter((f) => f.hasAudio)
      .filter((f) => f.ext === "m4a")
      .sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

    const formats = [...combined, ...videoOnly, ...audioOnly];

    const finalFormats = fromYouTubeStream ? formats : [];

    res.status(200).json({
      info: videoInfo,
      formats: finalFormats,
      canDownload: fromYouTubeStream && finalFormats.length > 0,
      message: fromYouTubeStream
        ? undefined
        : "Video này YouTube không cho truy cập stream từ server hiện tại, nên chưa thể tải.",
    });
  } catch (err) {
    console.error("download-info error:", err);
    res
      .status(500)
      .json({
        error:
          "Không thể lấy thông tin video. YouTube có thể đang chặn dải IP này.",
      });
  }
}

export const config = { maxDuration: 30 };

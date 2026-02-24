import { Innertube, Platform } from "youtubei.js";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";

Platform.shim.eval = async (data, env) => {
  const props = [];
  if (env.n) props.push(`n: exportedVars.nFunction("${env.n}")`);
  if (env.sig) props.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  const code = `${data.output}\nreturn { ${props.join(", ")} }`;
  return new Function(code)();
};

const CLIENTS = ["ANDROID", "TVHTML5", "WEB"];
const isWin = process.platform === "win32";
const ytDlpBin = join(
  process.cwd(),
  "node_modules",
  "youtube-dl-exec",
  "bin",
  isWin ? "yt-dlp.exe" : "yt-dlp",
);

function getCookieString() {
  const raw = process.env.YT_COOKIE || "";
  if (!raw) return "";
  return raw.includes("\n") ? raw : raw.replace(/\\n/g, "\n");
}

async function getCookieArgs() {
  const cookieString = getCookieString();
  if (!cookieString) return [];
  const cookiePath = `/tmp/yt-cookie-${Date.now()}.txt`;
  await writeFile(cookiePath, cookieString, "utf8");
  return ["--cookies", cookiePath];
}

async function streamViaYtDlp({ videoId, formatId, title, ext, res }) {
  const rawName =
    decodeURIComponent(title || "video")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .substring(0, 80) || "video";
  const fileExt = ext || "mp4";
  const asciiName = rawName.replace(/[^\x20-\x7E]/g, "_") + "." + fileExt;
  const utf8Name = encodeURIComponent(rawName + "." + fileExt);

  const cookieArgs = await getCookieArgs();
  const args = [
    `https://www.youtube.com/watch?v=${videoId}`,
    "-f",
    formatId,
    "-o",
    "-",
    "--no-warnings",
    "--no-check-certificates",
    "--force-ipv4",
    "--extractor-args",
    "youtube:player_client=android,web",
    ...cookieArgs,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpBin, args);
    let headersSent = false;
    let stderrOutput = "";

    child.stdout.on("data", (chunk) => {
      if (!headersSent) {
        headersSent = true;
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
        });
      }
      res.write(chunk);
    });

    child.stderr.on("data", (data) => {
      stderrOutput += data.toString();
      if (stderrOutput.length > 4000) stderrOutput = stderrOutput.slice(-4000);
    });

    child.on("close", (code) => {
      if (code !== 0 && !headersSent) {
        reject(new Error(stderrOutput || "yt-dlp download failed"));
        return;
      }
      res.end();
      resolve();
    });

    child.on("error", (err) => reject(err));
  });
}

export default async function handler(req, res) {
  const { v: videoId, format_id, title, ext } = req.query;
  if (!videoId || !format_id) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  try {
    let yt, fmt, lastError;

    for (const clientType of CLIENTS) {
      try {
        console.log(`Trying client for download: ${clientType}`);
        yt = await Innertube.create({
          client_type: clientType,
          ...(getCookieString() ? { cookie: getCookieString() } : {}),
        });
        const info = await yt.getBasicInfo(videoId);

        const allFormats = [
          ...(info.streaming_data?.formats || []),
          ...(info.streaming_data?.adaptive_formats || []),
        ];
        fmt = allFormats.find((f) => String(f.itag) === format_id);

        if (fmt) {
          console.log(`Format ${format_id} found with client: ${clientType}`);
          break;
        }
        console.warn(
          `Format ${format_id} not found with client: ${clientType}`,
        );
      } catch (err) {
        console.error(`Client ${clientType} failed for download:`, err.message);
        lastError = err;
      }
    }

    if (!fmt) {
      await streamViaYtDlp({ videoId, formatId: format_id, title, ext, res });
      return;
    }

    let dlUrl = "";
    if (fmt.url) {
      dlUrl = String(fmt.url);
    } else {
      const url = await fmt.decipher(yt.session.player);
      dlUrl = url instanceof URL ? url.toString() : String(url);
    }

    const upstream = await fetch(dlUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "*/*",
        Referer: "https://www.youtube.com/",
        Origin: "https://www.youtube.com",
      },
    });

    if (!upstream.ok) {
      await streamViaYtDlp({ videoId, formatId: format_id, title, ext, res });
      return;
    }

    const rawName =
      decodeURIComponent(title || "video")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
        .substring(0, 80) || "video";
    const fileExt = ext || "mp4";
    const asciiName = rawName.replace(/[^\x20-\x7E]/g, "_") + "." + fileExt;
    const utf8Name = encodeURIComponent(rawName + "." + fileExt);

    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      ...(upstream.headers.get("content-length")
        ? { "Content-Length": upstream.headers.get("content-length") }
        : {}),
    });

    const readable = Readable.fromWeb(upstream.body);
    await pipeline(readable, res);
  } catch (err) {
    console.error("download error:", err);
    if (!res.headersSent) {
      const message = String(err?.message || "");
      const isUnavailable =
        /video unavailable|private video|sign in|age-restricted|members-only|not available/i.test(
          message,
        );
      res.status(isUnavailable ? 422 : 500).json({
        error: isUnavailable
          ? "Video này không thể tải (riêng tư/giới hạn khu vực/cần đăng nhập)."
          : "Download failed",
      });
    }
  }
}

export const config = { maxDuration: 60 };

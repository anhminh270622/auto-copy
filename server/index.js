import express from "express";
import cors from "cors";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const app = express();
const PORT = Number(process.env.PORT || 8787);

app.use(
  cors({
    origin: true,
  }),
);

const isWin = process.platform === "win32";
const ytDlpBin = join(
  process.cwd(),
  "node_modules",
  "youtube-dl-exec",
  "bin",
  isWin ? "yt-dlp.exe" : "yt-dlp",
);
const ytDlpAltBin = join(
  process.cwd(),
  "node_modules",
  "youtube-dl-exec",
  "bin",
  "yt-dlp",
);

function resolveYtDlpCommand() {
  if (existsSync(ytDlpBin)) return ytDlpBin;
  if (existsSync(ytDlpAltBin)) return ytDlpAltBin;
  return "yt-dlp";
}

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(bytes)) return "N/A";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(seconds) {
  if (!seconds || Number.isNaN(seconds)) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getCookieString() {
  const raw = process.env.YT_COOKIE || "";
  if (!raw) return "";
  return raw.includes("\n") ? raw : raw.replace(/\\n/g, "\n");
}

async function getCookieArgs() {
  const cookieString = getCookieString();
  if (!cookieString) return { cookiePath: null, cookieArgs: [] };
  const cookiePath = join(tmpdir(), `yt-cookie-${Date.now()}.txt`);
  await writeFile(cookiePath, cookieString, "utf8");
  return { cookiePath, cookieArgs: ["--cookies", cookiePath] };
}

function runYtDlpJson(videoId, cookieArgs) {
  return new Promise((resolve, reject) => {
    const ytdlpCommand = resolveYtDlpCommand();
    const args = [
      `https://www.youtube.com/watch?v=${videoId}`,
      "-J",
      "--ignore-config",
      "--no-warnings",
      "--no-check-certificates",
      "--force-ipv4",
      "--extractor-args",
      "youtube:player_client=android,web",
      ...cookieArgs,
    ];

    const child = spawn(ytdlpCommand, args);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 5000) stderr = stderr.slice(-5000);
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Failed to parse yt-dlp JSON output"));
      }
    });
  });
}

function normalizeFormats(info) {
  const seen = new Set();
  return (info.formats || [])
    .filter((f) => {
      if (!f.format_id || seen.has(f.format_id)) return false;
      seen.add(f.format_id);
      const hasVideo = f.vcodec && f.vcodec !== "none";
      const hasAudio = f.acodec && f.acodec !== "none";
      return hasVideo || hasAudio;
    })
    .map((f) => {
      const hasVideo = f.vcodec && f.vcodec !== "none";
      const hasAudio = f.acodec && f.acodec !== "none";
      return {
        format_id: String(f.format_id),
        quality: f.format_note || f.resolution || "Unknown",
        ext: f.ext || "mp4",
        hasVideo,
        hasAudio,
        size: formatBytes(f.filesize || f.filesize_approx || 0),
      };
    })
    .sort((a, b) => {
      if (a.hasVideo && a.hasAudio && !(b.hasVideo && b.hasAudio)) return -1;
      if (!(a.hasVideo && a.hasAudio) && b.hasVideo && b.hasAudio) return 1;
      if (a.hasVideo && !b.hasVideo) return -1;
      if (!a.hasVideo && b.hasVideo) return 1;
      return 0;
    });
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    ytdlpCommand: resolveYtDlpCommand(),
    ytdlpBinExists: existsSync(ytDlpBin) || existsSync(ytDlpAltBin),
  });
});

app.get("/api/download-info", async (req, res) => {
  const videoId = req.query.v;
  const debug = req.query.debug === "1";
  if (!videoId) {
    return res.status(400).json({ error: "Missing video ID" });
  }

  try {
    const { cookieArgs } = await getCookieArgs();
    const info = await runYtDlpJson(videoId, cookieArgs);

    const videoInfo = {
      title: info.title || "",
      thumbnail: info.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      channel: info.channel || info.uploader || "",
      duration: formatDuration(info.duration || 0),
    };

    const formats = normalizeFormats(info);
    return res.status(200).json({
      info: videoInfo,
      formats,
      canDownload: formats.length > 0,
      message: formats.length ? undefined : "Không tìm thấy định dạng tải về.",
    });
  } catch (err) {
    const message = String(err?.message || "");
    console.error("download-info error:", message);
    if (message.includes("ENOENT")) {
      return res.status(500).json({
        error: "Server thiếu yt-dlp binary. Kiểm tra deploy/build trên Railway.",
      });
    }
    const isUnavailable =
      /video unavailable|private video|sign in|age-restricted|members-only|not available in your country/i.test(
        message,
      );
    return res.status(isUnavailable ? 422 : 500).json({
      error: isUnavailable
        ? "Video này không thể tải (riêng tư/giới hạn khu vực/cần đăng nhập)."
        : "Không thể lấy thông tin video.",
      ...(debug ? { detail: message.slice(0, 800) } : {}),
    });
  }
});

app.get("/api/download", async (req, res) => {
  const { v: videoId, format_id: formatId, title, ext } = req.query;
  if (!videoId || !formatId) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const rawName =
    decodeURIComponent(title || "video")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .substring(0, 80) || "video";
  const fileExt = ext || "mp4";
  const asciiName = `${rawName.replace(/[^\x20-\x7E]/g, "_")}.${fileExt}`;
  const utf8Name = encodeURIComponent(`${rawName}.${fileExt}`);

  try {
    const { cookieArgs } = await getCookieArgs();
    const ytdlpCommand = resolveYtDlpCommand();
    const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let headersSent = false;

    const runDownload = (selector) =>
      new Promise((resolve, reject) => {
        const args = [
          sourceUrl,
          "-f",
          selector,
          "-o",
          "-",
          "--ignore-config",
          "--no-warnings",
          "--no-check-certificates",
          "--force-ipv4",
          "--extractor-args",
          "youtube:player_client=android,web",
          ...cookieArgs,
        ];
        const child = spawn(ytdlpCommand, args);
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

        child.on("error", (err) => reject(err));
        child.on("close", (code) => {
          if (code === 0) {
            if (headersSent) res.end();
            resolve({ ok: true, stderrOutput });
            return;
          }
          resolve({ ok: false, stderrOutput });
        });

        req.on("close", () => {
          if (!child.killed) child.kill();
        });
      });

    let result = await runDownload(String(formatId));

    if (!result.ok && !headersSent && /requested format is not available/i.test(result.stderrOutput)) {
      const fallbackSelector =
        fileExt === "m4a" || fileExt === "mp3"
          ? "bestaudio[ext=m4a]/bestaudio"
          : "best[ext=mp4][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]/best";
      result = await runDownload(fallbackSelector);
    }

    if (!result.ok && !headersSent) {
      const isUnavailable = /video unavailable|private video|sign in|age-restricted|members-only/i.test(
        result.stderrOutput,
      );
      res.status(isUnavailable ? 422 : 500).json({
        error: isUnavailable
          ? "Video này không thể tải (riêng tư/giới hạn khu vực/cần đăng nhập)."
          : "Download failed",
      });
      return;
    }
  } catch {
    return res.status(500).json({ error: "Download failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Download API running on port ${PORT}`);
});

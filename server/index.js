import express from "express";
import cors from "cors";
import youtubedl from "youtube-dl-exec";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const app = express();
const PORT = Number(process.env.PORT || 8787);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

app.use(
  cors({
    origin: true,
  }),
);

const isWin = process.platform === "win32";
const ytDlpName = isWin ? "yt-dlp.exe" : "yt-dlp";
const ytdlpFromPackage =
  youtubedl?.constants?.YOUTUBE_DL_PATH || youtubedl?.constants?.YTDLP_PATH || "";

let ytdlpPackageDir = "";
try {
  const ytdlpPkg = require.resolve("youtube-dl-exec/package.json");
  ytdlpPackageDir = dirname(ytdlpPkg);
} catch {
  ytdlpPackageDir = "";
}

const unpackedPackageDir = ytdlpPackageDir
  ? ytdlpPackageDir.replace("app.asar", "app.asar.unpacked")
  : "";

const ytDlpRoots = [
  process.cwd(),
  join(__dirname, ".."),
  ytdlpPackageDir ? join(ytdlpPackageDir, "..") : "",
  unpackedPackageDir ? join(unpackedPackageDir, "..") : "",
  process.resourcesPath ? join(process.resourcesPath, "app.asar") : "",
  process.resourcesPath ? join(process.resourcesPath, "app.asar.unpacked") : "",
  process.resourcesPath || "",
].filter(Boolean);

function collectYtDlpCandidates() {
  const names = isWin ? ["yt-dlp.exe", "yt-dlp"] : ["yt-dlp", "yt-dlp.exe"];
  const list = [];
  for (const root of ytDlpRoots) {
    for (const name of names) {
      list.push(join(root, "node_modules", "youtube-dl-exec", "bin", name));
    }
  }
  if (ytdlpFromPackage) {
    list.push(ytdlpFromPackage);
    list.push(ytdlpFromPackage.replace("app.asar", "app.asar.unpacked"));
  }
  if (ytdlpPackageDir) {
    for (const name of names) list.push(join(ytdlpPackageDir, "bin", name));
  }
  if (unpackedPackageDir) {
    for (const name of names) list.push(join(unpackedPackageDir, "bin", name));
  }
  return [...new Set(list)];
}

const ytDlpCandidates = collectYtDlpCandidates();

function resolveYtDlpCommand() {
  const preferred = ytDlpCandidates
    .filter((candidate) => candidate.includes("app.asar.unpacked"))
    .find((candidate) => existsSync(candidate));
  if (preferred) return preferred;

  const found = ytDlpCandidates
    .filter((candidate) => !candidate.includes("app.asar") || candidate.includes("app.asar.unpacked"))
    .find((candidate) => existsSync(candidate));
  if (found) return found;

  const asarFallback = ytDlpCandidates
    .filter((candidate) => candidate.includes("app.asar"))
    .find((candidate) => existsSync(candidate));
  if (asarFallback) return asarFallback;

  return isWin ? "yt-dlp.exe" : "yt-dlp";
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

function hasPlayableFormats(formats) {
  return (formats || []).some((f) => {
    const hasVideo = f.vcodec && f.vcodec !== "none" && f.vcodec !== "images";
    const hasAudio = f.acodec && f.acodec !== "none";
    return hasVideo || hasAudio;
  });
}

function formatTranscriptTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function decodeHtmlEntities(input) {
  return String(input || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanTranscriptText(input) {
  return decodeHtmlEntities(input)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseVttTranscript(rawText) {
  const lines = String(rawText || "").split(/\r?\n/);
  const items = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.includes("-->")) continue;
    const [start] = line.split("-->");
    const parts = start.trim().split(":").map((x) => Number(x.replace(",", ".")));
    let seconds = 0;
    if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1];
    } else {
      continue;
    }
    const textParts = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const t = lines[j];
      if (!t.trim()) break;
      textParts.push(t.trim());
    }
    const text = cleanTranscriptText(textParts.join(" "));
    if (!text) continue;
    items.push({ time: formatTranscriptTime(seconds), text });
  }
  return items;
}

function parseJson3Transcript(payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const items = [];
  for (const event of events) {
    const startMs = Number(event?.tStartMs);
    if (!Number.isFinite(startMs)) continue;
    const segs = Array.isArray(event?.segs) ? event.segs : [];
    const text = cleanTranscriptText(segs.map((seg) => seg?.utf8 || "").join(""));
    if (!text) continue;
    items.push({
      time: formatTranscriptTime(startMs / 1000),
      text,
    });
  }
  return items;
}

function pickCaptionTrack(info, preferredLang = "auto") {
  const pools = [
    { kind: "subtitles", tracks: info?.subtitles || {} },
    { kind: "automatic", tracks: info?.automatic_captions || {} },
  ];
  const preferred = String(preferredLang || "auto").toLowerCase();
  const langPriorityByPref = {
    vi: ["vi", "vi-VN", "vi-vn", "en", "en-US", "en-us"],
    en: ["en", "en-US", "en-us", "vi", "vi-VN", "vi-vn"],
    auto: ["vi", "vi-VN", "vi-vn", "en", "en-US", "en-us"],
  };
  const langPriority = langPriorityByPref[preferred] || langPriorityByPref.auto;
  const extPriority = ["json3", "vtt", "srv3", "srv2", "srv1", "ttml"];

  for (const pool of pools) {
    for (const lang of langPriority) {
      const entries = Array.isArray(pool.tracks?.[lang]) ? pool.tracks[lang] : [];
      if (!entries.length) continue;
      const pickedByExt =
        extPriority
          .map((ext) => entries.find((entry) => entry?.ext === ext && entry?.url))
          .find(Boolean) || entries.find((entry) => entry?.url);
      if (pickedByExt) {
        return { ...pickedByExt, lang, kind: pool.kind };
      }
    }
  }

  for (const pool of pools) {
    const langs = Object.keys(pool.tracks || {});
    for (const lang of langs) {
      const entries = Array.isArray(pool.tracks?.[lang]) ? pool.tracks[lang] : [];
      const picked = entries.find((entry) => entry?.url);
      if (picked) return { ...picked, lang, kind: pool.kind };
    }
  }
  return null;
}

const YT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function pickPlayerCaptionTrack(tracks, preferredLang = "auto") {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  const preferred = String(preferredLang || "auto").toLowerCase();
  const langPriorityByPref = {
    vi: ["vi", "vi-VN", "en", "en-US"],
    en: ["en", "en-US", "vi", "vi-VN"],
    auto: ["vi", "vi-VN", "en", "en-US"],
  };
  const langPriority = langPriorityByPref[preferred] || langPriorityByPref.auto;

  const score = (track) => {
    const code = String(track?.languageCode || "").toLowerCase();
    const idx = langPriority.findIndex(
      (lang) => code === lang.toLowerCase() || code.startsWith(`${lang.toLowerCase()}-`),
    );
    const langScore = idx >= 0 ? langPriority.length - idx : 0;
    const manualBonus = track?.kind === "asr" ? 0 : 10;
    return langScore * 10 + manualBonus;
  };

  const sorted = [...tracks].sort((a, b) => score(b) - score(a));
  const best = sorted[0];
  if (!best?.baseUrl) return null;
  return {
    url: `${best.baseUrl}${best.baseUrl.includes("fmt=") ? "" : "&fmt=json3"}`,
    lang: best.languageCode || "",
    kind: best.kind === "asr" ? "automatic" : "subtitles",
    ext: "json3",
  };
}

function extractYtInitialPlayerResponse(html) {
  const source = String(html || "");
  const marker = "ytInitialPlayerResponse";
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const brace = source.indexOf("{", start);
  if (brace < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(brace, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function fetchTranscriptViaPlayer(videoId, preferredLang = "auto") {
  const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      "user-agent": YT_UA,
      "accept-language": "en-US,en;q=0.9,vi;q=0.8",
    },
  });
  if (!watchRes.ok) {
    throw new Error(`watch page failed with status ${watchRes.status}`);
  }
  const html = await watchRes.text();
  const player = extractYtInitialPlayerResponse(html);
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const picked = pickPlayerCaptionTrack(tracks, preferredLang);
  if (!picked?.url) {
    return { lines: [], lang: "", kind: "" };
  }

  const transcriptRes = await fetch(picked.url, {
    headers: { "user-agent": YT_UA },
  });
  if (!transcriptRes.ok) {
    throw new Error(`player transcript fetch failed with status ${transcriptRes.status}`);
  }
  const contentType = transcriptRes.headers.get("content-type") || "";
  const payloadText = await transcriptRes.text();
  let lines = [];
  if (contentType.includes("json") || payloadText.trim().startsWith("{")) {
    try {
      lines = parseJson3Transcript(JSON.parse(payloadText));
    } catch {
      lines = parseVttTranscript(payloadText);
    }
  } else {
    lines = parseVttTranscript(payloadText);
  }
  return { lines, lang: picked.lang || "", kind: picked.kind || "player" };
}

async function fetchTranscriptViaYtDlp(videoId, cookieArgs, preferredLang = "auto") {
  const info = await runYtDlpJson(videoId, cookieArgs);
  const track = pickCaptionTrack(info, preferredLang);
  if (!track?.url) {
    return { lines: [], lang: "", kind: "" };
  }

  const transcriptRes = await fetch(track.url, {
    headers: { "user-agent": YT_UA },
  });
  if (!transcriptRes.ok) {
    throw new Error(`transcript fetch failed with status ${transcriptRes.status}`);
  }

  const isJson =
    String(track.ext || "").toLowerCase() === "json3" ||
    (transcriptRes.headers.get("content-type") || "").includes("application/json");
  const lines = isJson
    ? parseJson3Transcript(await transcriptRes.json())
    : parseVttTranscript(await transcriptRes.text());
  return { lines, lang: track.lang || "", kind: track.kind || "" };
}

async function fetchTranscriptLines(videoId, cookieArgs, preferredLang = "auto") {
  // Ưu tiên scrape player (không cần yt-dlp) — ổn định hơn trên bản zip Windows
  try {
    const viaPlayer = await fetchTranscriptViaPlayer(videoId, preferredLang);
    if (viaPlayer.lines.length) return viaPlayer;
  } catch (err) {
    console.warn("transcript player fallback failed:", err?.message || err);
  }

  try {
    return await fetchTranscriptViaYtDlp(videoId, cookieArgs, preferredLang);
  } catch (err) {
    console.warn("transcript yt-dlp failed:", err?.message || err);
    throw err;
  }
}

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
    thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    channel: data.author_name || "",
    duration: "",
  };
}

app.get("/health", (_req, res) => {
  const existing = ytDlpCandidates.filter((candidate) => existsSync(candidate));
  res.status(200).json({
    ok: true,
    ytdlpCommand: resolveYtDlpCommand(),
    ytdlpBinExists: existing.length > 0,
    ytdlpCandidates: existing,
    ytdlpPackageDir,
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
    if (!hasPlayableFormats(info.formats || [])) {
      return res.status(200).json({
        info: videoInfo,
        formats: [],
        canDownload: false,
        message:
          "YouTube hiện không trả stream audio/video cho video này trên server (chỉ có storyboard). Hãy cập nhật YT_COOKIE hoặc thử video khác.",
      });
    }
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
    if (/requested format is not available/i.test(message)) {
      try {
        const videoInfo = await getNoembedInfo(videoId);
        return res.status(200).json({
          info: videoInfo,
          formats: [],
          canDownload: false,
          message:
            "YouTube không trả stream audio/video cho video này trên server hiện tại (chỉ storyboard). Hãy cập nhật YT_COOKIE hoặc thử video khác.",
        });
      } catch {
        // fall through to generic error response
      }
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
  const debug = req.query.debug === "1";
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

    const runDownload = (selector, useExtractorArgs = true) =>
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
          ...(useExtractorArgs ? ["--extractor-args", "youtube:player_client=android,web"] : []),
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

    const isAuto = String(formatId) === "auto";
    const requestedSelector = isAuto ? "best" : String(formatId);
    const selectors = isAuto
      ? [
          requestedSelector,
          "18/22/best[ext=mp4]/best",
          "best[ext=mp4][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]/best",
        ]
      : [requestedSelector];
    const modes = [true, false];
    let result = { ok: false, stderrOutput: "" };

    for (const selector of selectors) {
      for (const useExtractorArgs of modes) {
        result = await runDownload(selector, useExtractorArgs);
        if (result.ok || headersSent) break;
      }
      if (result.ok || headersSent) break;
    }

    if (!result.ok && !headersSent) {
      if (/requested format is not available/i.test(result.stderrOutput)) {
        res.status(422).json({
          error:
            "YouTube không trả stream tải về cho video này trên server hiện tại. Hãy cập nhật YT_COOKIE hoặc thử video khác.",
          ...(debug ? { detail: result.stderrOutput.slice(0, 800) } : {}),
        });
        return;
      }
      const isUnavailable = /video unavailable|private video|sign in|age-restricted|members-only/i.test(
        result.stderrOutput,
      );
      res.status(isUnavailable ? 422 : 500).json({
        error: isUnavailable
          ? "Video này không thể tải (riêng tư/giới hạn khu vực/cần đăng nhập)."
          : "Download failed",
        ...(debug ? { detail: result.stderrOutput.slice(0, 800) } : {}),
      });
      return;
    }
  } catch (err) {
    const message = String(err?.message || "");
    return res.status(500).json({
      error: "Download failed",
      ...(debug ? { detail: message.slice(0, 800) } : {}),
    });
  }
});

app.get("/api/transcript", async (req, res) => {
  const videoId = req.query.v;
  const lang = String(req.query.lang || "auto").toLowerCase();
  const debug = req.query.debug === "1";
  if (!videoId) {
    return res.status(400).json({ error: "Missing video ID" });
  }

  try {
    const { cookieArgs } = await getCookieArgs();
    const result = await fetchTranscriptLines(videoId, cookieArgs, lang);
    if (!result.lines.length) {
      return res.status(200).json({
        transcript: "",
        lines: [],
        message:
          lang === "en"
            ? "Không tìm thấy bản chép lời tiếng Anh cho video này."
            : lang === "vi"
              ? "Không tìm thấy bản chép lời tiếng Việt cho video này."
              : "Không tìm thấy bản chép lời cho video này.",
      });
    }
    return res.status(200).json({
      transcript: result.lines.map((line) => `${line.time} ${line.text}`).join("\n"),
      lines: result.lines,
      language: result.lang,
      source: result.kind,
    });
  } catch (err) {
    const message = String(err?.message || "");
    return res.status(200).json({
      transcript: "",
      lines: [],
      message: "Không thể lấy bản chép lời cho video này.",
      ...(debug ? { detail: message.slice(0, 800) } : {}),
    });
  }
});

app.get("/api/thumbnail", async (req, res) => {
  const rawUrl = String(req.query.url || "");
  if (!rawUrl) {
    return res.status(400).json({ error: "Missing image url" });
  }

  let remote;
  try {
    remote = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: "Invalid image url" });
  }

  if (!/^https?:$/.test(remote.protocol)) {
    return res.status(400).json({ error: "Unsupported protocol" });
  }

  try {
    const upstream = await fetch(remote.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        referer: "https://www.youtube.com/",
      },
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: "Failed to fetch image" });
    }
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).send(bytes);
  } catch {
    return res.status(500).json({ error: "Proxy image failed" });
  }
});

let activeServer = null;

export async function startDownloadApi({ port = PORT, host = "127.0.0.1" } = {}) {
  if (activeServer) return activeServer;
  await new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      activeServer = server;
      resolve();
    });
    server.on("error", reject);
  });
  return activeServer;
}

export async function stopDownloadApi() {
  if (!activeServer) return;
  await new Promise((resolve) => activeServer.close(resolve));
  activeServer = null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startDownloadApi({ port: PORT, host: "0.0.0.0" })
    .then(() => {
      console.log(`Download API running on port ${PORT}`);
    })
    .catch((err) => {
      console.error("Failed to start Download API:", err);
      process.exit(1);
    });
}

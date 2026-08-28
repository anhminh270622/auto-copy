/** YouTube transcript helpers (Innertube IOS/ANDROID — tránh PoToken/empty timedtext của WEB). */

export function formatTranscriptTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function decodeHtmlEntities(input) {
  return String(input || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function cleanTranscriptText(input) {
  return decodeHtmlEntities(input)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseVttTranscript(rawText) {
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

export function parseJson3Transcript(payload) {
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

/** XML from timedtext (default) or srv3 `<timedtext>` / `<p t="ms">`. */
export function parseXmlTranscript(rawText) {
  const source = String(rawText || "");
  const items = [];
  const textRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let match;
  while ((match = textRe.exec(source))) {
    const attrs = match[1] || "";
    const startMatch = /\bstart="([^"]+)"/i.exec(attrs);
    if (!startMatch) continue;
    const text = cleanTranscriptText(match[2]);
    if (!text) continue;
    items.push({ time: formatTranscriptTime(Number(startMatch[1])), text });
  }
  if (items.length) return items;

  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  while ((match = pRe.exec(source))) {
    const attrs = match[1] || "";
    const tMatch = /\bt="(\d+)"/i.exec(attrs);
    if (!tMatch) continue;
    const text = cleanTranscriptText(match[2]);
    if (!text) continue;
    items.push({ time: formatTranscriptTime(Number(tMatch[1]) / 1000), text });
  }
  return items;
}

export function parseTimedtextPayload(payloadText, contentType = "") {
  const text = String(payloadText || "");
  const trimmed = text.trim();
  if (!trimmed) return [];

  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("json") || trimmed.startsWith("{")) {
    try {
      return parseJson3Transcript(JSON.parse(trimmed));
    } catch {
      /* fall through */
    }
  }
  if (
    trimmed.includes("<transcript") ||
    trimmed.includes("<timedtext") ||
    /<text\b/i.test(trimmed) ||
    /<p\b[^>]*\bt="/i.test(trimmed)
  ) {
    const xmlLines = parseXmlTranscript(trimmed);
    if (xmlLines.length) return xmlLines;
  }
  return parseVttTranscript(trimmed);
}

export function pickPlayerCaptionTrack(tracks, preferredLang = "auto") {
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
  const url = best.baseUrl.includes("fmt=")
    ? best.baseUrl
    : `${best.baseUrl}&fmt=json3`;
  return {
    url,
    lang: best.languageCode || "",
    kind: best.kind === "asr" ? "automatic" : "subtitles",
    ext: "json3",
  };
}

const INNERTUBE_CLIENTS = [
  {
    name: "IOS",
    clientId: "5",
    clientVersion: "20.10.4",
    userAgent:
      "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)",
    clientContext: {
      clientName: "IOS",
      clientVersion: "20.10.4",
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      osName: "iPhone",
      osVersion: "17.5.1.21F90",
      hl: "en",
      gl: "US",
    },
  },
  {
    name: "ANDROID",
    clientId: "3",
    clientVersion: "20.10.38",
    userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
    clientContext: {
      clientName: "ANDROID",
      clientVersion: "20.10.38",
      androidSdkVersion: 34,
      hl: "en",
      gl: "US",
    },
  },
];

async function fetchPlayerViaInnertube(videoId, client) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": client.userAgent,
      "x-youtube-client-name": client.clientId,
      "x-youtube-client-version": client.clientVersion,
    },
    body: JSON.stringify({
      context: { client: client.clientContext },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`innertube ${client.name} status ${res.status}`);
  }
  return res.json();
}

/**
 * Lấy bản chép lời qua Innertube (IOS/ANDROID).
 * WEB scrape + timedtext thường trả body rỗng vì thiếu PoToken (exp=xpe).
 */
export async function fetchTranscriptViaInnertube(videoId, preferredLang = "auto") {
  let lastError = null;
  for (const client of INNERTUBE_CLIENTS) {
    try {
      const player = await fetchPlayerViaInnertube(videoId, client);
      const status = player?.playabilityStatus?.status;
      if (status && status !== "OK") {
        throw new Error(`playability ${status}`);
      }
      const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      const picked = pickPlayerCaptionTrack(tracks, preferredLang);
      if (!picked?.url) {
        throw new Error(`no caption tracks (${client.name})`);
      }

      const transcriptRes = await fetch(picked.url, {
        headers: {
          "user-agent": client.userAgent,
          referer: `https://www.youtube.com/watch?v=${videoId}`,
        },
      });
      if (!transcriptRes.ok) {
        throw new Error(`timedtext status ${transcriptRes.status}`);
      }
      const contentType = transcriptRes.headers.get("content-type") || "";
      const payloadText = await transcriptRes.text();
      if (!payloadText.trim()) {
        throw new Error(`empty timedtext (${client.name})`);
      }
      const lines = parseTimedtextPayload(payloadText, contentType);
      if (!lines.length) {
        throw new Error(`parsed 0 lines (${client.name})`);
      }
      return { lines, lang: picked.lang || "", kind: picked.kind || client.name.toLowerCase() };
    } catch (err) {
      lastError = err;
      console.warn(`transcript ${client.name} failed:`, err?.message || err);
    }
  }
  if (lastError) throw lastError;
  return { lines: [], lang: "", kind: "" };
}

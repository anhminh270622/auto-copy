#!/usr/bin/env node
/**
 * Khi build Windows từ Linux, youtube-dl-exec chỉ có binary Linux (yt-dlp).
 * Script này tải thêm yt-dlp.exe để bản zip/NSIS chạy được trên Windows.
 */
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const binDir = join(__dirname, "..", "node_modules", "youtube-dl-exec", "bin");
const target = join(binDir, "yt-dlp.exe");
const url =
  process.env.YTDLP_WIN_URL ||
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";

async function main() {
  if (existsSync(target) && !process.env.FORCE_YTDLP_WIN) {
    console.log(`[ensure-win-ytdlp] already exists: ${target}`);
    return;
  }
  await mkdir(binDir, { recursive: true });
  console.log(`[ensure-win-ytdlp] downloading ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: HTTP ${res.status}`);
  }
  await pipeline(res.body, createWriteStream(target));
  try {
    await chmod(target, 0o755);
  } catch {
    /* Windows may ignore chmod */
  }
  console.log(`[ensure-win-ytdlp] saved ${target}`);
}

main().catch((err) => {
  console.error("[ensure-win-ytdlp] failed:", err.message || err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Build Windows zip, publish GitHub Release, rồi push code + tag lên remote.
 * Dùng: npm run release:win
 * (Nhớ bump version trong package.json và commit thay đổi trước khi chạy, hoặc để script tự commit nếu còn file chưa commit.)
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;
const tag = `v${version}`;

function sh(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root, ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
}

function main() {
  const status = shOut("git status --porcelain");
  if (status) {
    console.log("Có thay đổi chưa commit — đang commit trước khi release...");
    sh("git add -A");
    // Không commit file nhạy cảm
    try {
      sh("git reset HEAD -- .env .env.local 2>/dev/null || true");
    } catch {
      /* ignore */
    }
    const left = shOut("git status --porcelain");
    if (left) {
      sh(`git commit -m "release ${tag}"`);
    } else {
      console.log("Không còn file để commit (có thể chỉ có .env).");
    }
  }

  sh("node scripts/ensure-win-ytdlp.mjs");
  sh("cross-env VITE_DESKTOP_BUILD=1 npm run build");
  sh("npx electron-builder --win zip --x64 --publish always");

  const existingTag = shOut(`git tag -l ${tag}`);
  if (!existingTag) {
    sh(`git tag -a ${tag} -m "Release ${tag}"`);
  } else {
    console.log(`Tag ${tag} đã tồn tại — bỏ qua tạo tag.`);
  }

  sh("git push origin HEAD");
  sh(`git push origin ${tag}`);
  console.log(`\nDone. Released ${tag} và đã push code lên remote.`);
}

main();

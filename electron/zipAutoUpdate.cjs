const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, dialog, BrowserWindow, shell } = require("electron");

const GITHUB_REPO = "anhminh270622/auto-copy";
const LATEST_YML_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/latest.yml`;

function getUpdateDir() {
  return path.join(app.getPath("localAppData"), "auto-copy-updater");
}

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, "").split(".").map((n) => Number(n) || 0);
  const pb = String(b).replace(/^v/i, "").split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function parseLatestYml(text) {
  const versionMatch = /^version:\s*(.+)$/m.exec(text);
  const pathMatch = /^path:\s*(.+)$/m.exec(text);
  const shaMatch = /^sha512:\s*(.+)$/m.exec(text);
  const sizeMatch = /^size:\s*(\d+)$/m.exec(text);
  const fileUrlMatch = /^\s+-\s+url:\s*(.+)$/m.exec(text);
  const fileShaMatch = /^\s+sha512:\s*(.+)$/m.exec(text);

  if (!versionMatch) throw new Error("latest.yml thiếu version");
  const fileName = (pathMatch?.[1] || fileUrlMatch?.[1] || "").trim();
  if (!fileName) throw new Error("latest.yml thiếu path/url file zip");

  return {
    version: versionMatch[1].trim(),
    fileName,
    sha512: (shaMatch?.[1] || fileShaMatch?.[1] || "").trim(),
    size: sizeMatch ? Number(sizeMatch[1]) : 0,
    downloadUrl: `https://github.com/${GITHUB_REPO}/releases/latest/download/${encodeURIComponent(fileName).replace(/%2F/g, "/")}`,
  };
}

async function fetchLatestMeta() {
  const res = await fetch(LATEST_YML_URL, {
    headers: { "user-agent": "Auto-Copy-Updater" },
  });
  if (!res.ok) {
    throw new Error(`Không tải được latest.yml (HTTP ${res.status})`);
  }
  return parseLatestYml(await res.text());
}

function setProgressBar(percent) {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (percent < 0) win.setProgressBar(-1);
  else win.setProgressBar(Math.max(0, Math.min(1, percent / 100)));
}

async function downloadZip(meta, onProgress) {
  const updateDir = getUpdateDir();
  const pendingDir = path.join(updateDir, "pending");
  fs.mkdirSync(pendingDir, { recursive: true });
  const zipPath = path.join(pendingDir, meta.fileName);

  const res = await fetch(meta.downloadUrl, {
    headers: { "user-agent": "Auto-Copy-Updater" },
  });
  if (!res.ok) {
    throw new Error(`Không tải được bản cập nhật (HTTP ${res.status})`);
  }

  const total = Number(res.headers.get("content-length") || meta.size || 0);
  const reader = res.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (meta.sha512) verifySha512(buf, meta.sha512);
    fs.writeFileSync(zipPath, buf);
    onProgress?.(100);
    return zipPath;
  }

  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) onProgress?.((received / total) * 100);
  }

  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  if (meta.sha512) verifySha512(buf, meta.sha512);
  fs.writeFileSync(zipPath, buf);
  onProgress?.(100);
  return zipPath;
}

function verifySha512(buf, expected) {
  const actual = crypto.createHash("sha512").update(buf).digest("base64");
  if (actual !== expected) {
    throw new Error("File cập nhật không khớp checksum (sha512)");
  }
}

function installZipUpdate(zipPath) {
  const installDir = path.dirname(process.execPath);
  const exePath = process.execPath;
  const extractDir = path.join(getUpdateDir(), "extract");
  const scriptPath = path.join(getUpdateDir(), "apply-update.bat");

  const bat = `@echo off
chcp 65001 >nul
timeout /t 2 /nobreak >nul
set "ZIP=${zipPath.replace(/"/g, '""')}"
set "DST=${installDir.replace(/"/g, '""')}"
set "EXE=${exePath.replace(/"/g, '""')}"
set "TMP=${extractDir.replace(/"/g, '""')}"
if exist "%TMP%" rd /s /q "%TMP%"
mkdir "%TMP%"
tar -xf "%ZIP%" -C "%TMP%"
if errorlevel 1 (
  powershell -NoProfile -Command "Expand-Archive -Path '%ZIP%' -DestinationPath '%TMP%' -Force"
)
xcopy /E /Y /I /Q "%TMP%\\*" "%DST%\\"
start "" "%EXE%"
del "%~f0"
`;

  fs.mkdirSync(getUpdateDir(), { recursive: true });
  fs.writeFileSync(scriptPath, bat, "utf8");

  spawn("cmd.exe", ["/c", scriptPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();

  app.quit();
}

function setupZipAutoUpdater() {
  let checking = false;
  let downloading = false;

  async function checkForUpdates() {
    if (checking || downloading) return;
    checking = true;
    try {
      const meta = await fetchLatestMeta();
      const current = app.getVersion();
      if (compareVersions(meta.version, current) <= 0) {
        console.log(`App đang ở phiên bản mới nhất (${current}).`);
        return;
      }

      const { response } = await dialog.showMessageBox({
        type: "info",
        title: "Cập nhật mới",
        message: `Phiên bản ${meta.version} đã sẵn sàng!`,
        detail: `Bạn đang dùng ${current}. Tải và cài bản zip mới?`,
        buttons: ["Cập nhật ngay", "Để sau"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response !== 0) return;

      downloading = true;
      const zipPath = await downloadZip(meta, (percent) => setProgressBar(percent));
      setProgressBar(-1);

      const { response: installResponse } = await dialog.showMessageBox({
        type: "info",
        title: "Cập nhật đã sẵn sàng",
        message: "Bản cập nhật đã tải xong. Khởi động lại để hoàn tất?",
        detail: "Ứng dụng sẽ tự giải nén bản mới vào thư mục hiện tại.",
        buttons: ["Khởi động lại", "Để sau"],
        defaultId: 0,
        cancelId: 1,
      });
      if (installResponse === 0) {
        installZipUpdate(zipPath);
      }
    } catch (err) {
      console.error("Lỗi khi kiểm tra/cập nhật:", err);
      const { response } = await dialog.showMessageBox({
        type: "warning",
        title: "Không thể tự cập nhật",
        message: "Không tải/cài bản mới tự động được.",
        detail: `${err?.message || err}\n\nBạn có thể tải zip mới từ GitHub Releases.`,
        buttons: ["Mở GitHub", "Đóng"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) {
        shell.openExternal(`https://github.com/${GITHUB_REPO}/releases/latest`);
      }
    } finally {
      checking = false;
      downloading = false;
    }
  }

  checkForUpdates();
}

module.exports = { setupZipAutoUpdater };

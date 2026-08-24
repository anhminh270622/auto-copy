const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, clipboard, ipcMain, nativeImage, dialog } = require("electron");
const fs = require("node:fs");
const { autoUpdater } = require("electron-updater");

let stopApi = null;

async function startEmbeddedApi() {
  const apiBase = "http://127.0.0.1:8787";
  process.env.ELECTRON_API_BASE = apiBase;

  const serverEntry = path.join(__dirname, "..", "server", "index.js");
  const mod = await import(pathToFileURL(serverEntry).href);
  await mod.startDownloadApi({ port: 8787, host: "127.0.0.1" });
  stopApi = mod.stopDownloadApi;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1260,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    return;
  }

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(async () => {
  try {
    await startEmbeddedApi();
    createWindow();
    setupAutoUpdater();
  } catch (err) {
    console.error("Failed to boot desktop app:", err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  if (typeof stopApi === "function") {
    await stopApi();
  }
});

ipcMain.handle("clipboard:copy-text", async (_event, text) => {
  const value = String(text || "");
  if (!value) return { ok: false, message: "Empty text" };
  clipboard.writeText(value);
  return { ok: true };
});

ipcMain.handle("clipboard:copy-image-from-url", async (_event, imageUrl) => {
  const url = String(imageUrl || "");
  if (!url) return { ok: false, message: "Empty url" };
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      referer: "https://www.youtube.com/",
    },
  });
  if (!response.ok) {
    return { ok: false, message: `HTTP ${response.status}` };
  }
  const buf = Buffer.from(await response.arrayBuffer());
  const image = nativeImage.createFromBuffer(buf);
  if (image.isEmpty()) {
    return { ok: false, message: "Invalid image" };
  }
  clipboard.writeImage(image);
  return { ok: true };
});

ipcMain.handle("clipboard:copy-image-from-data-url", async (_event, dataUrl) => {
  const value = String(dataUrl || "");
  if (!value.startsWith("data:image/")) {
    return { ok: false, message: "Invalid data URL" };
  }
  const image = nativeImage.createFromDataURL(value);
  if (image.isEmpty()) {
    return { ok: false, message: "Invalid image data" };
  }
  clipboard.writeImage(image);
  return { ok: true };
});

ipcMain.handle("file:save", async (_event, options, dataBuffer) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: options.title || "Save File",
    defaultPath: options.defaultPath,
    filters: options.filters
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, Buffer.from(dataBuffer));
  return { ok: true, filePath };
});

ipcMain.handle("file:save-base64", async (_event, options, base64Data) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: options.title || "Save File",
    defaultPath: options.defaultPath,
    filters: options.filters
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
  return { ok: true, filePath };
});

// ============ AUTO UPDATE ============
function setupAutoUpdater() {
  // Không check update khi đang chạy dev
  if (process.env.VITE_DEV_SERVER_URL) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    dialog.showMessageBox({
      type: "info",
      title: "Cập nhật mới",
      message: `Phiên bản ${info.version} đã sẵn sàng!`,
      detail: "Bạn có muốn tải và cài đặt bản cập nhật mới không?",
      buttons: ["Cập nhật ngay", "Để sau"],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("App đang ở phiên bản mới nhất.");
  });

  autoUpdater.on("download-progress", (progress) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.setProgressBar(progress.percent / 100);
    }
  });

  autoUpdater.on("update-downloaded", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.setProgressBar(-1);

    dialog.showMessageBox({
      type: "info",
      title: "Cập nhật đã sẵn sàng",
      message: "Bản cập nhật đã tải xong. Khởi động lại ứng dụng để hoàn tất?",
      buttons: ["Khởi động lại", "Để sau"],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on("error", (err) => {
    console.error("Lỗi khi kiểm tra cập nhật:", err);
  });

  // Kiểm tra cập nhật khi mở app
  autoUpdater.checkForUpdates();
}

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, clipboard, ipcMain, nativeImage, dialog, Menu } = require("electron");
const fs = require("node:fs");
const { setupZipAutoUpdater } = require("./zipAutoUpdate.cjs");

let stopApi = null;
let serverApi = null;

async function startEmbeddedApi() {
  const apiBase = "http://127.0.0.1:8787";
  process.env.ELECTRON_API_BASE = apiBase;

  const serverEntry = path.join(__dirname, "..", "server", "index.js");
  serverApi = await import(pathToFileURL(serverEntry).href);
  await serverApi.startDownloadApi({ port: 8787, host: "127.0.0.1" });
  stopApi = serverApi.stopDownloadApi;
}

function createWindow() {
  // Bỏ menu Edit/Find mặc định để Ctrl+F/H vào sheet (Univer Find & Replace)
  Menu.setApplicationMenu(null);

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

ipcMain.handle("transcript:get", async (_event, videoId, preferredLang = "auto") => {
  if (!videoId) {
    return { transcript: "", message: "Thiếu video ID", language: "", source: "" };
  }
  if (!serverApi?.fetchTranscriptForVideo) {
    return { transcript: "", message: "API bản chép lời chưa sẵn sàng", language: "", source: "" };
  }
  return serverApi.fetchTranscriptForVideo(String(videoId), preferredLang, true);
});

ipcMain.handle("app:get-version", () => app.getVersion());

// ============ AUTO UPDATE (zip portable — không dùng NSIS updater) ============
function setupAutoUpdater() {
  if (process.env.VITE_DEV_SERVER_URL) return;
  if (process.platform !== "win32") return;
  setupZipAutoUpdater();
}

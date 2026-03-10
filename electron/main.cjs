const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, clipboard, ipcMain, nativeImage } = require("electron");

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

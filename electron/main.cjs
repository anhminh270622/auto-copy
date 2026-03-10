const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow } = require("electron");

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

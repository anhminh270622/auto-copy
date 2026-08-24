const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronApp", {
  apiBase: process.env.ELECTRON_API_BASE || "http://127.0.0.1:8787",
  copyText: (text) => ipcRenderer.invoke("clipboard:copy-text", text),
  copyImageFromUrl: (imageUrl) => ipcRenderer.invoke("clipboard:copy-image-from-url", imageUrl),
  copyImageFromDataUrl: (dataUrl) => ipcRenderer.invoke("clipboard:copy-image-from-data-url", dataUrl),
  saveFile: (options, dataBuffer) => ipcRenderer.invoke("file:save", options, dataBuffer),
  saveFileBase64: (options, base64Data) => ipcRenderer.invoke("file:save-base64", options, base64Data),
});

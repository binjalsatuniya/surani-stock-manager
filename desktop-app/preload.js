// preload.js — runs in renderer with Node access but exposes nothing extra
// (contextIsolation: true keeps the renderer safe)
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronApp', {
  platform: process.platform,
  version: process.versions.electron,
});

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("zfiles", {
  isElectron: true,
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  openReceived: () => ipcRenderer.invoke("zfiles:open-received"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  getPendingUpdate: () => ipcRenderer.invoke("update:get-pending"),
  openUpdateDownload: (url) => ipcRenderer.invoke("update:open-download", url),
  dismissUpdate: (version) => ipcRenderer.invoke("update:dismiss", version),
  onMaximizedChange: (callback) => {
    ipcRenderer.on("window:maximized-changed", (_event, value) => callback(value));
  },
  onWindowShow: (callback) => {
    ipcRenderer.on("window:shown", () => callback());
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on("update:available", (_event, info) => callback(info));
  },
});

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rewriteHelper", {
  onSelectionLoaded: (callback) => ipcRenderer.on("selection:loaded", (_event, payload) => callback(payload)),
  onSelectionError: (callback) => ipcRenderer.on("selection:error", (_event, payload) => callback(payload)),
  onSettingsLoaded: (callback) => ipcRenderer.on("settings:loaded", (_event, payload) => callback(payload)),
  onPermissionsLoaded: (callback) => ipcRenderer.on("permissions:loaded", (_event, payload) => callback(payload)),
  runRewrite: (text) => ipcRenderer.invoke("rewrite:run", text),
  copyText: (text) => ipcRenderer.invoke("clipboard:write", text),
  hideWindow: () => ipcRenderer.invoke("window:hide"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  getPermissions: () => ipcRenderer.invoke("permissions:get"),
  refreshPermissions: () => ipcRenderer.invoke("permissions:refresh"),
  requestAccessibilityPermission: () => ipcRenderer.invoke("permissions:request-accessibility"),
  openPermissionSettings: () => ipcRenderer.invoke("permissions:open-settings"),
});

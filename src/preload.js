const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rewriteHelper", {
  onSelectionLoaded: (callback) => ipcRenderer.on("selection:loaded", (_event, payload) => callback(payload)),
  onSelectionError: (callback) => ipcRenderer.on("selection:error", (_event, payload) => callback(payload)),
  onSettingsLoaded: (callback) => ipcRenderer.on("settings:loaded", (_event, payload) => callback(payload)),
  onPermissionsLoaded: (callback) => ipcRenderer.on("permissions:loaded", (_event, payload) => callback(payload)),
  onUpdateAvailable: (callback) => ipcRenderer.on("update:available", (_event, info) => callback(info)),
  onUpdateDownloaded: (callback) => ipcRenderer.on("update:downloaded", (_event, info) => callback(info)),
  getDefaultPrompt: () => ipcRenderer.invoke("prompt:getDefault"),
  runRewrite: (text, options) => ipcRenderer.invoke("rewrite:run", text, options || {}),
  abortRewrite: () => ipcRenderer.invoke("rewrite:abort"),
  copyText: (text) => ipcRenderer.invoke("clipboard:write", text),
  replaceText: (text) => ipcRenderer.invoke("text:replace", text),
  onRewriteCard: (callback) => {
    const handler = (_event, card) => callback(card);
    ipcRenderer.on("rewrite:card", handler);
    return () => ipcRenderer.removeListener("rewrite:card", handler);
  },
  hideWindow: () => ipcRenderer.invoke("window:hide"),
  setPinned: (pinned) => ipcRenderer.invoke("window:set-pinned", pinned),
  testProvider: (testSettings) => ipcRenderer.invoke("provider:test", testSettings),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  getPermissions: () => ipcRenderer.invoke("permissions:get"),
  refreshPermissions: () => ipcRenderer.invoke("permissions:refresh"),
  requestAccessibilityPermission: () => ipcRenderer.invoke("permissions:request-accessibility"),
  openPermissionSettings: () => ipcRenderer.invoke("permissions:open-settings"),
  loadHistory: () => ipcRenderer.invoke("history:get"),
  saveHistory: (entries) => ipcRenderer.invoke("history:save", entries),
  installUpdate: () => ipcRenderer.invoke("updater:install"),
});

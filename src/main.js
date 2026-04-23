const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  nativeTheme,
  nativeImage,
  safeStorage,
  screen,
  shell,
  systemPreferences,
  Tray,
  Menu,
} = require("electron");

require("dotenv").config();

const { streamRewriteText, testProviderConnection, SYSTEM_PROMPT } = require("./rewriteService");

let autoUpdater;
try {
  autoUpdater = require("electron-updater").autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
} catch {
  // electron-updater not available in dev without proper setup
  autoUpdater = null;
}

const execFileAsync = promisify(execFile);
const DEFAULT_SHORTCUT = "CommandOrControl+Shift+Space";
const COPY_WAIT_MS = 220;
const SETTINGS_FILE_NAME = "settings.json";
const HISTORY_FILE_NAME = "history.json";
const ENCRYPTED_KEY_SUFFIX = "_enc";
const ENCRYPTABLE_KEYS = ["openaiApiKey", "openrouterApiKey"];

let mainWindow;
let tray;
let selectedTextCache = "";
let settings;
let shortcutRegistered = false;
let sourceApp = null;
let originalClipboard = "";
let isPinned = false;
let currentAbortController = null;

nativeTheme.themeSource = "light";

// ── Encryption helpers ────────────────────────────────────────────────────────

function canEncrypt() {
  return safeStorage.isEncryptionAvailable();
}

function encryptApiKey(plaintext) {
  if (!plaintext || !canEncrypt()) return plaintext;
  return safeStorage.encryptString(plaintext).toString("base64");
}

function decryptApiKey(encryptedBase64) {
  if (!encryptedBase64 || !canEncrypt()) return encryptedBase64;
  try {
    return safeStorage.decryptString(Buffer.from(encryptedBase64, "base64"));
  } catch {
    return "";
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

function getDefaultSettings() {
  return {
    shortcut: DEFAULT_SHORTCUT,
    autoGenerate: true,
    customPrompt: "",
    provider: process.env.LLM_PROVIDER || "openrouter",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
    openrouterModel: process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini",
    openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    openrouterHttpReferer: process.env.OPENROUTER_HTTP_REFERER || "https://example.com",
    openrouterAppTitle: process.env.OPENROUTER_APP_TITLE || "Quick Rewrite",
  };
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE_NAME);
}

function loadSettings() {
  const defaults = getDefaultSettings();
  const settingsPath = getSettingsPath();

  try {
    if (!fs.existsSync(settingsPath)) return defaults;

    const raw = fs.readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw);

    // Decrypt any encrypted keys — migrate plaintext on next save
    for (const key of ENCRYPTABLE_KEYS) {
      const encKey = `${key}${ENCRYPTED_KEY_SUFFIX}`;
      if (parsed[encKey]) {
        parsed[key] = decryptApiKey(parsed[encKey]);
        delete parsed[encKey];
      }
    }

    return { ...defaults, ...parsed };
  } catch (error) {
    console.error("Failed to load settings:", error);
    return defaults;
  }
}

function saveSettings(nextSettings) {
  settings = { ...settings, ...nextSettings };

  // Build what goes to disk: encrypt API keys, strip plaintext versions
  const onDisk = { ...settings };
  for (const key of ENCRYPTABLE_KEYS) {
    if (onDisk[key]) {
      if (canEncrypt()) {
        onDisk[`${key}${ENCRYPTED_KEY_SUFFIX}`] = encryptApiKey(onDisk[key]);
        delete onDisk[key];
      }
      // If encryption not available, fall through and store plaintext
    }
  }

  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(onDisk, null, 2), "utf8");
  return settings;
}

// ── History ───────────────────────────────────────────────────────────────────

function getHistoryPath() {
  return path.join(app.getPath("userData"), HISTORY_FILE_NAME);
}

function loadHistoryFromDisk() {
  try {
    const historyPath = getHistoryPath();
    if (!fs.existsSync(historyPath)) return [];
    const raw = fs.readFileSync(historyPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
  } catch {
    return [];
  }
}

function saveHistoryToDisk(entries) {
  try {
    fs.mkdirSync(path.dirname(getHistoryPath()), { recursive: true });
    fs.writeFileSync(getHistoryPath(), JSON.stringify(entries.slice(0, 50), null, 2), "utf8");
  } catch (error) {
    console.error("Failed to save history:", error);
  }
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 560,
    height: 820,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    transparent: false,
    title: "Quick Rewrite",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("settings:loaded", settings);
    mainWindow.webContents.send("permissions:loaded", getPermissionStatus());
  });

  mainWindow.on("blur", () => {
    if (!isPinned && !mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide();
    }
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Text capture ──────────────────────────────────────────────────────────────

async function simulateCopyShortcut() {
  if (process.platform === "darwin") {
    if (!systemPreferences.isTrustedAccessibilityClient(false)) {
      throw new Error(
        "Accessibility permission is not granted. Open the Setup tab and allow Quick Rewrite in System Settings."
      );
    }
    await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to keystroke "c" using command down',
    ]);
    return;
  }

  if (process.platform === "win32") {
    await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')",
    ]);
    return;
  }

  throw new Error("Selected text capture is only implemented for macOS and Windows.");
}

async function captureSourceApp() {
  if (process.platform === "darwin") {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to get name of first process whose frontmost is true',
    ]);
    return { platform: "darwin", appName: stdout.trim() };
  }

  if (process.platform === "win32") {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class WinCapture { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); }' -Language CSharp; [WinCapture]::GetForegroundWindow().ToInt64()",
    ]);
    return { platform: "win32", hwnd: stdout.trim() };
  }

  return null;
}

async function simulatePasteToSourceApp() {
  if (!sourceApp) return;

  if (sourceApp.platform === "darwin") {
    const safeName = sourceApp.appName.replace(/[\r\n"\\]/g, "");
    const script = [
      `tell application "${safeName}" to activate`,
      "delay 0.15",
      'tell application "System Events" to keystroke "v" using command down',
    ].join("\n");
    await execFileAsync("osascript", ["-e", script]);
    return;
  }

  if (sourceApp.platform === "win32") {
    await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `$hwnd = [IntPtr][int64]${sourceApp.hwnd}; Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class WinPaste { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }' -Language CSharp; [WinPaste]::ShowWindow($hwnd, 5); [WinPaste]::SetForegroundWindow($hwnd); Start-Sleep -Milliseconds 200; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')`,
    ]);
    return;
  }
}

async function captureSelectedText() {
  originalClipboard = clipboard.readText();
  await simulateCopyShortcut();
  await delay(COPY_WAIT_MS);

  const capturedText = clipboard.readText().trim();

  await delay(30);
  clipboard.writeText(originalClipboard);

  if (capturedText && capturedText !== originalClipboard) {
    selectedTextCache = capturedText;
    return selectedTextCache;
  }

  return "";
}

// ── Window positioning ────────────────────────────────────────────────────────

function positionWindowNearCursor() {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const [windowWidth, windowHeight] = mainWindow.getSize();
  const padding = 20;

  const x = Math.min(
    Math.max(display.workArea.x + padding, point.x - Math.floor(windowWidth / 2)),
    display.workArea.x + display.workArea.width - windowWidth - padding
  );

  const y = Math.min(
    Math.max(display.workArea.y + padding, point.y + 16),
    display.workArea.y + display.workArea.height - windowHeight - padding
  );

  mainWindow.setPosition(x, y, false);
}

function showMainWindow() {
  positionWindowNearCursor();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
}

async function openRewriteWindow() {
  sourceApp = null;
  try {
    try {
      sourceApp = await captureSourceApp();
    } catch {
      // Non-fatal
    }

    const selectedText = await captureSelectedText();

    showMainWindow();
    mainWindow.webContents.send("selection:loaded", {
      selectedText,
      shortcut: settings.shortcut,
      platform: process.platform,
      settings,
      canReplace: sourceApp !== null,
    });
  } catch (error) {
    showMainWindow();
    mainWindow.webContents.send("selection:error", {
      message: error.message,
      shortcut: settings.shortcut,
      platform: process.platform,
      settings,
      canReplace: false,
    });
  }
}

// ── Shortcut ──────────────────────────────────────────────────────────────────

function registerShortcut(shortcut = settings.shortcut) {
  if (!shortcut || !shortcut.trim()) throw new Error("Shortcut cannot be empty.");

  globalShortcut.unregisterAll();

  const registered = globalShortcut.register(shortcut, () => {
    openRewriteWindow().catch((error) => {
      mainWindow.webContents.send("selection:error", {
        message: error.message,
        shortcut: settings.shortcut,
        platform: process.platform,
        settings,
      });
    });
  });

  if (!registered) {
    shortcutRegistered = false;
    throw new Error(`Failed to register shortcut: ${shortcut}`);
  }

  shortcutRegistered = true;
}

// ── Permissions ───────────────────────────────────────────────────────────────

function getPermissionStatus() {
  const providerConfigured =
    settings.provider === "openai"
      ? Boolean(settings.openaiApiKey || process.env.OPENAI_API_KEY)
      : Boolean(settings.openrouterApiKey || process.env.OPENROUTER_API_KEY);

  return {
    platform: process.platform,
    provider: settings.provider,
    providerConfigured,
    shortcut: settings.shortcut,
    shortcutRegistered,
    accessibility: {
      supported: process.platform === "darwin",
      granted: process.platform === "darwin" ? systemPreferences.isTrustedAccessibilityClient(false) : null,
      label: process.platform === "darwin" ? "Accessibility" : "Accessibility-style automation",
      helpText:
        process.platform === "darwin"
          ? "Required so the app can trigger Cmd+C in the focused app and capture your selected text."
          : "Windows does not expose the same Accessibility trust switch. Text capture still depends on the active app allowing simulated Ctrl+C.",
    },
  };
}

async function openPermissionSettings() {
  if (process.platform === "darwin") {
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
    );
    return;
  }

  if (process.platform === "win32") {
    await shell.openExternal("ms-settings:privacy");
    return;
  }

  throw new Error("Permission shortcuts are not set up for this platform yet.");
}

function broadcastPermissionStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("permissions:loaded", getPermissionStatus());
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
      <rect x="1" y="1" width="14" height="14" rx="4" fill="#A24B2A"/>
      <path d="M5 5h6v1.5H6.8V8H10v1.5H6.8v1.5H11V12H5V5z" fill="#FFF8F1"/>
    </svg>
  `.trim();

  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function createTray() {
  if (tray) tray.destroy();

  tray = new Tray(createTrayIcon());
  tray.setToolTip(`Quick Rewrite (${settings.shortcut})`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Quick Rewrite",
        click: () => {
          showMainWindow();
          mainWindow.webContents.send("settings:loaded", settings);
          broadcastPermissionStatus();
        },
      },
      { label: "Quit", click: () => app.quit() },
    ])
  );

  tray.on("click", () => {
    showMainWindow();
    mainWindow.webContents.send("settings:loaded", settings);
    broadcastPermissionStatus();
  });
}

// ── Auto-updater ──────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  if (!autoUpdater) return;

  autoUpdater.on("update-available", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update:available", { version: info.version });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update:downloaded", { version: info.version });
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-updater error:", err.message);
  });

  // Check for updates after a short delay so the app finishes launching first
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }, 5000);
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle("prompt:getDefault", () => SYSTEM_PROMPT);

ipcMain.handle("rewrite:run", async (_event, inputText, options = {}) => {
  if (!inputText || !inputText.trim()) throw new Error("Please select text first.");

  // Abort any in-flight request before starting a new one
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();
  const { signal } = currentAbortController;

  try {
    return await streamRewriteText(inputText.trim(), settings, (card) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("rewrite:card", card);
      }
    }, { signal, length: options.length });
  } finally {
    currentAbortController = null;
  }
});

ipcMain.handle("rewrite:abort", () => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  return { ok: true };
});

ipcMain.handle("clipboard:write", async (_event, text) => {
  clipboard.writeText(text || "");
  return { ok: true };
});

ipcMain.handle("text:replace", async (_event, text) => {
  if (!text) throw new Error("No text to replace with.");
  if (!sourceApp) throw new Error("Replace is only available when triggered via the global shortcut.");

  clipboard.writeText(text);
  mainWindow.hide();
  await delay(80);

  try {
    await simulatePasteToSourceApp();
  } finally {
    await delay(200);
    clipboard.writeText(originalClipboard);
    sourceApp = null;
  }

  return { ok: true };
});

ipcMain.handle("window:hide", async () => {
  mainWindow.hide();
  return { ok: true };
});

ipcMain.handle("window:set-pinned", async (_event, pinned) => {
  isPinned = Boolean(pinned);
  return { ok: true };
});

ipcMain.handle("settings:get", async () => settings);

ipcMain.handle("settings:save", async (_event, nextSettings) => {
  const previousShortcut = settings.shortcut;
  const mergedDraft = { ...settings, ...(nextSettings || {}) };
  mergedDraft.shortcut = (mergedDraft.shortcut || "").trim();

  if (mergedDraft.shortcut !== previousShortcut) {
    try {
      registerShortcut(mergedDraft.shortcut);
    } catch (error) {
      registerShortcut(previousShortcut);
      throw error;
    }
  }

  const merged = saveSettings(mergedDraft);

  if (tray) tray.setToolTip(`Quick Rewrite (${merged.shortcut})`);

  mainWindow.webContents.send("settings:loaded", merged);
  broadcastPermissionStatus();
  return merged;
});

ipcMain.handle("permissions:get", async () => getPermissionStatus());

ipcMain.handle("permissions:refresh", async () => {
  const status = getPermissionStatus();
  broadcastPermissionStatus();
  return status;
});

ipcMain.handle("permissions:request-accessibility", async () => {
  if (process.platform !== "darwin") {
    throw new Error("Accessibility permission prompt is only available on macOS.");
  }
  systemPreferences.isTrustedAccessibilityClient(true);
  const status = getPermissionStatus();
  broadcastPermissionStatus();
  return status;
});

ipcMain.handle("permissions:open-settings", async () => {
  await openPermissionSettings();
  return { ok: true };
});

ipcMain.handle("provider:test", async (_event, testSettings) => {
  return testProviderConnection(testSettings);
});

ipcMain.handle("history:get", async () => loadHistoryFromDisk());

ipcMain.handle("history:save", async (_event, entries) => {
  saveHistoryToDisk(entries);
  return { ok: true };
});

ipcMain.handle("updater:install", async () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
  return { ok: true };
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  settings = loadSettings();
  createWindow();
  createTray();
  registerShortcut();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 || !mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      createTray();
      registerShortcut();
      return;
    }

    showMainWindow();
    mainWindow.webContents.send("settings:loaded", settings);
    broadcastPermissionStatus();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

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
  screen,
  shell,
  systemPreferences,
  Tray,
  Menu,
} = require("electron");

require("dotenv").config();

const { rewriteText } = require("./rewriteService");

const execFileAsync = promisify(execFile);
const DEFAULT_SHORTCUT = "CommandOrControl+Shift+Space";
const COPY_WAIT_MS = 220;
const SETTINGS_FILE_NAME = "settings.json";

let mainWindow;
let tray;
let selectedTextCache = "";
let settings;
let shortcutRegistered = false;

nativeTheme.themeSource = "light";

function getDefaultSettings() {
  return {
    shortcut: DEFAULT_SHORTCUT,
    provider: process.env.LLM_PROVIDER || "openrouter",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-5-mini",
    openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
    openrouterModel: process.env.OPENROUTER_MODEL || "openai/gpt-5-mini",
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
    if (!fs.existsSync(settingsPath)) {
      return defaults;
    }

    const raw = fs.readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch (error) {
    console.error("Failed to load settings:", error);
    return defaults;
  }
}

function saveSettings(nextSettings) {
  settings = { ...settings, ...nextSettings };
  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), "utf8");
  return settings;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 780,
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
    if (!mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide();
    }
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function captureSelectedText() {
  const previousClipboardText = clipboard.readText();

  await simulateCopyShortcut();
  await delay(COPY_WAIT_MS);

  const capturedText = clipboard.readText().trim();

  if (capturedText && capturedText !== previousClipboardText) {
    selectedTextCache = capturedText;
  }

  await delay(30);
  clipboard.writeText(previousClipboardText);

  return selectedTextCache;
}

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
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
}

async function openRewriteWindow() {
  try {
    const selectedText = await captureSelectedText();

    showMainWindow();
    mainWindow.webContents.send("selection:loaded", {
      selectedText,
      shortcut: settings.shortcut,
      platform: process.platform,
      settings,
    });
  } catch (error) {
    showMainWindow();
    mainWindow.webContents.send("selection:error", {
      message: error.message,
      shortcut: settings.shortcut,
      platform: process.platform,
      settings,
    });
  }
}

function registerShortcut(shortcut = settings.shortcut) {
  if (!shortcut || !shortcut.trim()) {
    throw new Error("Shortcut cannot be empty.");
  }

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

function getPermissionStatus() {
  const providerConfigured =
    settings.provider === "openai"
      ? Boolean(settings.openaiApiKey || process.env.OPENAI_API_KEY)
      : Boolean(settings.openrouterApiKey || process.env.OPENROUTER_API_KEY);

  const status = {
    platform: process.platform,
    provider: settings.provider,
    providerConfigured,
    shortcut: settings.shortcut,
    shortcutRegistered,
    accessibility: {
      supported: process.platform === "darwin",
      granted: process.platform === "darwin" ? systemPreferences.isTrustedAccessibilityClient(false) : null,
      label:
        process.platform === "darwin"
          ? "Accessibility"
          : "Accessibility-style automation",
      helpText:
        process.platform === "darwin"
          ? "Required so the app can trigger Cmd+C in the focused app and capture your selected text."
          : "Windows does not expose the same Accessibility trust switch. Text capture still depends on the active app allowing simulated Ctrl+C.",
    },
  };

  return status;
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
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("permissions:loaded", getPermissionStatus());
}

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
  if (tray) {
    tray.destroy();
  }

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
      {
        label: "Quit",
        click: () => {
          app.quit();
        },
      },
    ])
  );

  tray.on("click", () => {
    showMainWindow();
    mainWindow.webContents.send("settings:loaded", settings);
    broadcastPermissionStatus();
  });
}

ipcMain.handle("rewrite:run", async (_event, inputText) => {
  if (!inputText || !inputText.trim()) {
    throw new Error("Please select text first.");
  }

  return rewriteText(inputText.trim(), settings);
});

ipcMain.handle("clipboard:write", async (_event, text) => {
  clipboard.writeText(text || "");
  return { ok: true };
});

ipcMain.handle("window:hide", async () => {
  mainWindow.hide();
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

  if (tray) {
    tray.setToolTip(`Quick Rewrite (${merged.shortcut})`);
  }

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

app.whenReady().then(() => {
  settings = loadSettings();
  createWindow();
  createTray();
  registerShortcut();

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

// ── DOM references ──────────────────────────────────────────────────────────
const sourceText = document.getElementById("sourceText");
const statusText = document.getElementById("statusText");
const shortcutText = document.getElementById("shortcutText");
const wordCountPill = document.getElementById("wordCountPill");
const providerPill = document.getElementById("providerPill");
const tokenPill = document.getElementById("tokenPill");
const latencyPill = document.getElementById("latencyPill");
const cachePill = document.getElementById("cachePill");
const rewriteButton = document.getElementById("rewriteButton");
const stopButton = document.getElementById("stopButton");
const clearButton = document.getElementById("clearButton");
const closeButton = document.getElementById("closeButton");
const pinButton = document.getElementById("pinButton");
const showRewriteTab = document.getElementById("showRewriteTab");
const showPermissionsTab = document.getElementById("showPermissionsTab");
const showSettingsTab = document.getElementById("showSettingsTab");
const showHistoryTab = document.getElementById("showHistoryTab");
const rewritePanel = document.getElementById("rewritePanel");
const permissionsPanel = document.getElementById("permissionsPanel");
const settingsPanel = document.getElementById("settingsPanel");
const historyPanel = document.getElementById("historyPanel");
const historyList = document.getElementById("historyList");
const historyEmpty = document.getElementById("historyEmpty");
const clearHistoryButton = document.getElementById("clearHistoryButton");
const testOpenRouterButton = document.getElementById("testOpenRouterButton");
const testOpenRouterStatus = document.getElementById("testOpenRouterStatus");
const testOpenAIButton = document.getElementById("testOpenAIButton");
const testOpenAIStatus = document.getElementById("testOpenAIStatus");
const settingsForm = document.getElementById("settingsForm");
const saveSettingsButton = document.getElementById("saveSettingsButton");
const refreshPermissionsButton = document.getElementById("refreshPermissionsButton");
const requestAccessibilityButton = document.getElementById("requestAccessibilityButton");
const openPermissionSettingsButton = document.getElementById("openPermissionSettingsButton");
const accessibilityTitle = document.getElementById("accessibilityTitle");
const accessibilityDescription = document.getElementById("accessibilityDescription");
const accessibilityStatus = document.getElementById("accessibilityStatus");
const shortcutStatus = document.getElementById("shortcutStatus");
const shortcutDetail = document.getElementById("shortcutDetail");
const providerStatus = document.getElementById("providerStatus");
const providerDetail = document.getElementById("providerDetail");
const resultsSummary = document.getElementById("resultsSummary");
const loadingState = document.getElementById("loadingState");
const emptyState = document.getElementById("emptyState");
const resultsContainer = document.getElementById("resultsContainer");
const cardTemplate = document.getElementById("cardTemplate");
const openrouterBlock = document.getElementById("openrouterBlock");
const openaiBlock = document.getElementById("openaiBlock");
const resetPromptButton = document.getElementById("resetPromptButton");
const promptCharCount = document.getElementById("promptCharCount");
const toastContainer = document.getElementById("toastContainer");
const updateBanner = document.getElementById("updateBanner");
const updateBannerText = document.getElementById("updateBannerText");
const installUpdateButton = document.getElementById("installUpdateButton");
const dismissUpdateButton = document.getElementById("dismissUpdateButton");
const setupSuccessBanner = document.getElementById("setupSuccessBanner");

// ── State ────────────────────────────────────────────────────────────────────
let currentSettings = null;
let currentPermissions = null;
let hasAutoOpenedSetup = false;
let requestStartedAt = 0;
let defaultPromptText = "";
let canReplace = false;
let rewriteHistory = [];
let currentLength = "same";
let isPinned = false;

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = "info", durationMs = 3000) {
  const toast = document.createElement("div");
  toast.className = `toast toast${type.charAt(0).toUpperCase() + type.slice(1)}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  const dismiss = () => {
    toast.classList.add("toastFadeOut");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };

  setTimeout(dismiss, durationMs);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("isError", isError);
}

function getWordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function updateSourceMeta() {
  const text = sourceText.value || "";
  const wordCount = getWordCount(text);
  const charCount = text.length;
  wordCountPill.textContent = `${wordCount} ${wordCount === 1 ? "word" : "words"} · ${charCount.toLocaleString()} chars`;
  providerPill.textContent = currentSettings?.provider === "openai" ? "OpenAI" : "OpenRouter";
}

function isProviderConfigured() {
  const provider = currentSettings?.provider || "openrouter";
  return provider === "openai"
    ? Boolean(currentSettings?.openaiApiKey)
    : Boolean(currentSettings?.openrouterApiKey);
}

// ── UI state ─────────────────────────────────────────────────────────────────
function showLoadingState() {
  resultsContainer.innerHTML = "";
  emptyState.classList.add("isHidden");
  resultsSummary.classList.remove("isHidden");
  loadingState.classList.remove("isHidden");
  latencyPill.textContent = "Thinking…";
  cachePill.textContent = "Fresh";
  tokenPill.classList.add("isHidden");
}

function hideLoadingState() {
  loadingState.classList.add("isHidden");
}

function setGenerating(generating) {
  rewriteButton.disabled = generating;
  rewriteButton.querySelector(".kbdHint").style.opacity = generating ? "0" : "";
  stopButton.classList.toggle("isHidden", !generating);
  clearButton.classList.toggle("isHidden", generating);
  if (generating) {
    rewriteButton.childNodes[0].textContent = "Generating…";
  } else {
    rewriteButton.childNodes[0].textContent = "Rewrite";
  }
}

// ── Cards ────────────────────────────────────────────────────────────────────
function renderCard(title, text, originalText = null) {
  const fragment = cardTemplate.content.cloneNode(true);
  const cardEl = fragment.querySelector(".resultCard");
  const badgeNode = fragment.querySelector(".resultBadge");
  const titleNode = fragment.querySelector(".resultTitle");
  const bodyNode = fragment.querySelector(".resultBody");
  const copyButton = fragment.querySelector(".copyButton");
  const replaceButton = fragment.querySelector(".replaceButton");

  const isNoChange = originalText !== null && text.trim() === originalText.trim();

  badgeNode.textContent = title;
  if (isNoChange) {
    const noChangePill = document.createElement("span");
    noChangePill.className = "noChangeBadge";
    noChangePill.textContent = "no change";
    badgeNode.appendChild(noChangePill);
    cardEl.classList.add("noChange");
  }

  titleNode.textContent = title;
  bodyNode.textContent = text;

  if (!canReplace) {
    replaceButton.classList.add("isHidden");
  } else {
    replaceButton.addEventListener("click", async () => {
      replaceButton.disabled = true;
      replaceButton.textContent = "Replacing…";
      try {
        await window.rewriteHelper.replaceText(text);
        replaceButton.textContent = "✓ Replaced";
        replaceButton.classList.add("replaceDone");
        setStatus(`Replaced with ${title.toLowerCase()}.`);
        setTimeout(() => {
          replaceButton.disabled = false;
          replaceButton.textContent = "Replace";
          replaceButton.classList.remove("replaceDone");
        }, 2000);
      } catch (error) {
        replaceButton.disabled = false;
        replaceButton.textContent = "Replace";
        showToast(error.message || "Failed to replace text.", "error");
      }
    });
  }

  copyButton.addEventListener("click", async () => {
    await window.rewriteHelper.copyText(text);
    copyButton.textContent = "✓ Copied";
    copyButton.classList.add("copyDone");
    setTimeout(() => {
      copyButton.textContent = "Copy";
      copyButton.classList.remove("copyDone");
    }, 1500);
    setStatus(`Copied ${title.toLowerCase()} to clipboard.`);
  });

  resultsContainer.appendChild(fragment);
}

function renderResults(payload) {
  resultsContainer.innerHTML = "";
  emptyState.classList.add("isHidden");
  resultsSummary.classList.remove("isHidden");
  hideLoadingState();

  const tokens = payload?.meta?.tokens;
  if (tokens) {
    tokenPill.textContent = `${tokens.toLocaleString()} tokens`;
    tokenPill.classList.remove("isHidden");
  } else {
    tokenPill.classList.add("isHidden");
  }

  const original = sourceText.value.trim();
  renderCard("Grammar Fix", payload.grammar_fixed, original);
  renderCard("Improved Rewrite", payload.rewritten, original);
  for (const tone of payload.tones) {
    renderCard(tone.label, tone.text, original);
  }
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
function showTab(name) {
  rewritePanel.classList.toggle("isHidden", name !== "rewrite");
  permissionsPanel.classList.toggle("isHidden", name !== "permissions");
  settingsPanel.classList.toggle("isHidden", name !== "settings");
  historyPanel.classList.toggle("isHidden", name !== "history");
  showRewriteTab.classList.toggle("isActive", name === "rewrite");
  showPermissionsTab.classList.toggle("isActive", name === "permissions");
  showSettingsTab.classList.toggle("isActive", name === "settings");
  showHistoryTab.classList.toggle("isActive", name === "history");
  if (name === "history") renderHistoryList();
}

// ── History ───────────────────────────────────────────────────────────────────
function relativeTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function pushHistory(inputText, cards) {
  rewriteHistory.unshift({ id: Date.now(), timestamp: Date.now(), inputText, cards });
  if (rewriteHistory.length > 50) rewriteHistory.pop();
  window.rewriteHelper.saveHistory(rewriteHistory).catch(() => {});
}

function deleteHistoryEntry(id) {
  rewriteHistory = rewriteHistory.filter((e) => e.id !== id);
  window.rewriteHelper.saveHistory(rewriteHistory).catch(() => {});
  renderHistoryList();
}

function loadFromHistory(entry) {
  canReplace = false;
  sourceText.value = entry.inputText;
  updateSourceMeta();
  resultsContainer.innerHTML = "";
  resultsSummary.classList.remove("isHidden");
  hideLoadingState();
  emptyState.classList.add("isHidden");
  tokenPill.classList.add("isHidden");
  latencyPill.textContent = "History";
  cachePill.textContent = "Restored";
  const original = entry.inputText.trim();
  for (const card of entry.cards) {
    renderCard(card.label, card.text, original);
  }
  setStatus("Loaded from history.");
  showTab("rewrite");
}

function renderHistoryList() {
  if (rewriteHistory.length === 0) {
    historyEmpty.classList.remove("isHidden");
    historyList.classList.add("isHidden");
    return;
  }
  historyEmpty.classList.add("isHidden");
  historyList.classList.remove("isHidden");
  historyList.innerHTML = "";
  for (const entry of rewriteHistory) {
    const item = document.createElement("div");
    item.className = "historyItem";
    const preview =
      entry.inputText.length > 55
        ? escapeHtml(entry.inputText.slice(0, 55)) + "…"
        : escapeHtml(entry.inputText);
    item.innerHTML = `
      <span class="historyTime">${relativeTime(entry.timestamp)}</span>
      <span class="historyPreview">${preview}</span>
      <span class="historyCount">${entry.cards.length} cards</span>
      <div class="historyActions">
        <button class="ghostButton compactButton historyLoadBtn" type="button">Load</button>
        <button class="historyDeleteBtn" type="button" title="Delete" aria-label="Delete entry">✕</button>
      </div>
    `;
    item.querySelector(".historyLoadBtn").addEventListener("click", () => loadFromHistory(entry));
    item.querySelector(".historyDeleteBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteHistoryEntry(entry.id);
    });
    historyList.appendChild(item);
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────
function updateProviderSections() {
  const isOpenRouter = settingsForm.provider.value === "openrouter";
  openrouterBlock.classList.toggle("isHidden", !isOpenRouter);
  openaiBlock.classList.toggle("isHidden", isOpenRouter);
}

function updatePromptCharCount() {
  const len = settingsForm.customPrompt.value.length;
  promptCharCount.textContent = `${len.toLocaleString()} chars`;
}

function populateSettingsForm(settings) {
  currentSettings = settings;
  settingsForm.shortcut.value = settings.shortcut || "";
  settingsForm.autoGenerate.checked = settings.autoGenerate !== false;
  settingsForm.customPrompt.value = settings.customPrompt || defaultPromptText;
  settingsForm.provider.value = settings.provider || "openrouter";
  settingsForm.openrouterApiKey.value = settings.openrouterApiKey || "";
  settingsForm.openrouterModel.value = settings.openrouterModel || "";
  settingsForm.openrouterBaseUrl.value = settings.openrouterBaseUrl || "";
  settingsForm.openrouterHttpReferer.value = settings.openrouterHttpReferer || "";
  settingsForm.openrouterAppTitle.value = settings.openrouterAppTitle || "";
  settingsForm.openaiApiKey.value = settings.openaiApiKey || "";
  settingsForm.openaiModel.value = settings.openaiModel || "";
  settingsForm.openaiBaseUrl.value = settings.openaiBaseUrl || "";
  shortcutText.textContent = settings.shortcut || "";
  updateProviderSections();
  updateSourceMeta();
  updatePromptCharCount();
}

// ── Permissions ──────────────────────────────────────────────────────────────
function setPillState(node, state, text) {
  node.classList.remove("isReady", "isWarn", "isMuted");
  if (state === "ready") node.classList.add("isReady");
  else if (state === "warn") node.classList.add("isWarn");
  else node.classList.add("isMuted");
  node.textContent = text;
}

function renderPermissions(status) {
  currentPermissions = status;
  accessibilityTitle.textContent = status.accessibility.label;
  accessibilityDescription.textContent = status.accessibility.helpText;

  if (!status.accessibility.supported) {
    setPillState(accessibilityStatus, "muted", "Info");
    requestAccessibilityButton.disabled = true;
    requestAccessibilityButton.textContent = "Not Needed Here";
  } else if (status.accessibility.granted) {
    setPillState(accessibilityStatus, "ready", "Granted");
    requestAccessibilityButton.disabled = false;
    requestAccessibilityButton.textContent = "Recheck Access";
  } else {
    setPillState(accessibilityStatus, "warn", "Required");
    requestAccessibilityButton.disabled = false;
    requestAccessibilityButton.textContent = "Prompt For Access";
  }

  if (status.shortcutRegistered) {
    setPillState(shortcutStatus, "ready", "Ready");
  } else {
    setPillState(shortcutStatus, "warn", "Problem");
  }
  shortcutDetail.textContent = `Current shortcut: ${status.shortcut || "Not set"}`;

  if (status.providerConfigured) {
    setPillState(providerStatus, "ready", "Configured");
  } else {
    setPillState(providerStatus, "warn", "Missing Key");
  }
  providerDetail.textContent = `Current provider: ${status.provider}`;

  // Show success banner when everything is ready
  const accessibilityOk = !status.accessibility.supported || status.accessibility.granted;
  const allReady = accessibilityOk && status.shortcutRegistered && status.providerConfigured;
  setupSuccessBanner.classList.toggle("isHidden", !allReady);
}

// ── Offline detection ─────────────────────────────────────────────────────────
window.addEventListener("offline", () => {
  showToast("No internet connection — rewrites will fail.", "error", 5000);
});

// ── Rewrite ───────────────────────────────────────────────────────────────────
async function runRewrite() {
  const text = sourceText.value.trim();

  if (!text) {
    setStatus("Select some text first, then trigger the shortcut.", true);
    return;
  }

  if (!navigator.onLine) {
    showToast("No internet connection.", "error");
    return;
  }

  if (!isProviderConfigured()) {
    const providerName = currentSettings?.provider === "openai" ? "OpenAI" : "OpenRouter";
    setStatus(`No API key set for ${providerName}. Opening Settings…`, true);
    setTimeout(() => showTab("settings"), 700);
    return;
  }

  setGenerating(true);
  requestStartedAt = Date.now();
  showLoadingState();
  setStatus("Creating rewrite suggestions…");

  let firstCardReceived = false;
  const collectedCards = [];
  const cleanupCardListener = window.rewriteHelper.onRewriteCard((card) => {
    if (!firstCardReceived) {
      firstCardReceived = true;
      hideLoadingState();
    }
    collectedCards.push(card);
    renderCard(card.label, card.text, text);
  });

  try {
    const result = await window.rewriteHelper.runRewrite(text, { length: currentLength });
    const elapsedMs = Date.now() - requestStartedAt;
    latencyPill.textContent = `${(elapsedMs / 1000).toFixed(elapsedMs >= 10000 ? 0 : 1)}s`;
    cachePill.textContent = result?.meta?.cached ? "Cached" : "Fresh";
    setStatus(result?.meta?.cached ? "Suggestions loaded from cache." : "Suggestions ready.");
    if (collectedCards.length > 0) pushHistory(text, collectedCards);
    const tokens = result?.meta?.tokens;
    if (tokens) {
      tokenPill.textContent = `${tokens.toLocaleString()} tokens`;
      tokenPill.classList.remove("isHidden");
    } else {
      tokenPill.classList.add("isHidden");
    }
  } catch (error) {
    const isAbort = error?.name === "AbortError" || error?.message?.includes("aborted");
    hideLoadingState();
    if (collectedCards.length === 0) {
      resultsSummary.classList.add("isHidden");
      emptyState.classList.remove("isHidden");
    }
    if (isAbort) {
      setStatus("Stopped.");
    } else {
      showToast(error.message || "Failed to generate suggestions.", "error", 5000);
      setStatus(error.message || "Failed to generate suggestions.", true);
    }
  } finally {
    cleanupCardListener();
    setGenerating(false);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────
rewriteButton.addEventListener("click", runRewrite);

stopButton.addEventListener("click", async () => {
  await window.rewriteHelper.abortRewrite();
  setStatus("Stopped.");
  setGenerating(false);
  hideLoadingState();
  if (resultsContainer.children.length === 0) {
    resultsSummary.classList.add("isHidden");
    emptyState.classList.remove("isHidden");
  }
});

clearButton.addEventListener("click", () => {
  sourceText.value = "";
  updateSourceMeta();
  resultsContainer.innerHTML = "";
  hideLoadingState();
  resultsSummary.classList.add("isHidden");
  emptyState.classList.remove("isHidden");
  setStatus("Cleared. Select new text or paste something in.");
});

closeButton.addEventListener("click", async () => {
  await window.rewriteHelper.hideWindow();
});

pinButton.addEventListener("click", async () => {
  isPinned = !isPinned;
  pinButton.classList.toggle("isPinned", isPinned);
  pinButton.setAttribute("aria-pressed", String(isPinned));
  pinButton.title = isPinned ? "Unpin window" : "Pin window (keep open)";
  await window.rewriteHelper.setPinned(isPinned);
});

showRewriteTab.addEventListener("click", () => showTab("rewrite"));
showPermissionsTab.addEventListener("click", () => showTab("permissions"));
showSettingsTab.addEventListener("click", () => showTab("settings"));
showHistoryTab.addEventListener("click", () => showTab("history"));

clearHistoryButton.addEventListener("click", () => {
  rewriteHistory = [];
  window.rewriteHelper.saveHistory([]).catch(() => {});
  renderHistoryList();
});

// Length chip selection
document.querySelectorAll(".lengthChip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".lengthChip").forEach((c) => c.classList.remove("isActive"));
    chip.classList.add("isActive");
    currentLength = chip.dataset.length;
  });
});

// Password show/hide toggles
document.querySelectorAll(".eyeBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const isText = input.type === "text";
    input.type = isText ? "password" : "text";
    btn.querySelector(".eyeShow").classList.toggle("isHidden", !isText);
    btn.querySelector(".eyeHide").classList.toggle("isHidden", isText);
  });
});

// Prompt char counter
document.getElementById("customPromptTextarea").addEventListener("input", updatePromptCharCount);

async function testConnection(provider, statusEl, buttonEl) {
  buttonEl.disabled = true;
  buttonEl.textContent = "Testing…";
  statusEl.textContent = "";
  statusEl.className = "testStatus";
  try {
    await window.rewriteHelper.testProvider({
      provider,
      openaiApiKey: settingsForm.openaiApiKey.value.trim(),
      openaiBaseUrl: settingsForm.openaiBaseUrl.value.trim() || undefined,
      openrouterApiKey: settingsForm.openrouterApiKey.value.trim(),
      openrouterBaseUrl: settingsForm.openrouterBaseUrl.value.trim() || undefined,
    });
    statusEl.textContent = "✓ Connected";
    statusEl.classList.add("testOk");
  } catch (error) {
    statusEl.textContent = `✕ ${error.message}`;
    statusEl.classList.add("testFail");
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = "Test Connection";
  }
}

testOpenRouterButton.addEventListener("click", () =>
  testConnection("openrouter", testOpenRouterStatus, testOpenRouterButton)
);
testOpenAIButton.addEventListener("click", () =>
  testConnection("openai", testOpenAIStatus, testOpenAIButton)
);

settingsForm.provider.addEventListener("change", updateProviderSections);

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveSettingsButton.disabled = true;
  saveSettingsButton.textContent = "Saving…";

  try {
    const saved = await window.rewriteHelper.saveSettings({
      shortcut: settingsForm.shortcut.value.trim(),
      autoGenerate: settingsForm.autoGenerate.checked,
      customPrompt: settingsForm.customPrompt.value.trim() === defaultPromptText
        ? ""
        : settingsForm.customPrompt.value.trim(),
      provider: settingsForm.provider.value,
      openrouterApiKey: settingsForm.openrouterApiKey.value.trim(),
      openrouterModel: settingsForm.openrouterModel.value.trim(),
      openrouterBaseUrl: settingsForm.openrouterBaseUrl.value.trim(),
      openrouterHttpReferer: settingsForm.openrouterHttpReferer.value.trim(),
      openrouterAppTitle: settingsForm.openrouterAppTitle.value.trim(),
      openaiApiKey: settingsForm.openaiApiKey.value.trim(),
      openaiModel: settingsForm.openaiModel.value.trim(),
      openaiBaseUrl: settingsForm.openaiBaseUrl.value.trim(),
    });

    populateSettingsForm(saved);
    showToast("Settings saved.", "info");
    showTab("rewrite");
  } catch (error) {
    showToast(error.message || "Failed to save settings.", "error");
    setStatus(error.message || "Failed to save settings.", true);
  } finally {
    saveSettingsButton.disabled = false;
    saveSettingsButton.textContent = "Save Settings";
  }
});

refreshPermissionsButton.addEventListener("click", async () => {
  try {
    const status = await window.rewriteHelper.refreshPermissions();
    renderPermissions(status);
    setStatus("Permission status updated.");
  } catch (error) {
    showToast(error.message || "Failed to refresh permissions.", "error");
  }
});

requestAccessibilityButton.addEventListener("click", async () => {
  try {
    const status = await window.rewriteHelper.requestAccessibilityPermission();
    renderPermissions(status);
    showTab("permissions");
    setStatus("Accessibility prompt triggered. Grant access in System Settings if macOS shows it.");
  } catch (error) {
    showToast(error.message || "Failed to request accessibility access.", "error");
  }
});

openPermissionSettingsButton.addEventListener("click", async () => {
  try {
    await window.rewriteHelper.openPermissionSettings();
    setStatus("Opened system permission settings.");
  } catch (error) {
    showToast(error.message || "Failed to open system settings.", "error");
  }
});

resetPromptButton.addEventListener("click", () => {
  settingsForm.customPrompt.value = defaultPromptText;
  updatePromptCharCount();
});

sourceText.addEventListener("input", updateSourceMeta);

// Update banner
installUpdateButton.addEventListener("click", async () => {
  await window.rewriteHelper.installUpdate();
});
dismissUpdateButton.addEventListener("click", () => {
  updateBanner.classList.add("isHidden");
});

// Keyboard shortcuts
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    if (!rewriteButton.disabled) runRewrite();
    return;
  }

  if (event.key === "Escape") {
    const tag = document.activeElement?.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
      window.rewriteHelper.hideWindow();
    }
  }
});

// ── IPC event handlers ────────────────────────────────────────────────────────
window.rewriteHelper.onSelectionLoaded(({ selectedText, shortcut, settings, canReplace: cr }) => {
  if (settings) populateSettingsForm(settings);
  shortcutText.textContent = shortcut;
  showTab("rewrite");

  if (selectedText) {
    // Fresh selection — reset everything and load the new text
    canReplace = cr || false;
    resultsContainer.innerHTML = "";
    hideLoadingState();
    resultsSummary.classList.add("isHidden");
    emptyState.classList.remove("isHidden");
    sourceText.value = selectedText;
    updateSourceMeta();
    setStatus("Selected text loaded.");
    sourceText.focus();
    sourceText.select();

    if (isProviderConfigured() && currentSettings?.autoGenerate !== false) {
      runRewrite();
    } else if (!isProviderConfigured()) {
      const providerName = currentSettings?.provider === "openai" ? "OpenAI" : "OpenRouter";
      setStatus(`Add a ${providerName} API key in Settings to start generating.`, true);
    }
  } else {
    // No selection — preserve whatever the user already has in the textarea
    canReplace = false;
    setStatus("No fresh selection found. You can paste text manually.", true);
    if (!sourceText.value.trim()) sourceText.focus();
  }
});

window.rewriteHelper.onSelectionError(({ message, shortcut, settings }) => {
  canReplace = false;
  if (settings) populateSettingsForm(settings);
  shortcutText.textContent = shortcut;
  // Preserve existing textarea content — only show the error
  setStatus(message, true);
});

window.rewriteHelper.onSettingsLoaded((settings) => {
  populateSettingsForm(settings);
});

window.rewriteHelper.onPermissionsLoaded((status) => {
  renderPermissions(status);

  if (!hasAutoOpenedSetup && status.accessibility.supported && !status.accessibility.granted) {
    hasAutoOpenedSetup = true;
    showTab("permissions");
    setStatus("Accessibility access is still needed before text capture can work.", true);
  }
});

window.rewriteHelper.onUpdateAvailable((info) => {
  updateBannerText.textContent = `Version ${info.version} is downloading…`;
  updateBanner.classList.remove("isHidden");
});

window.rewriteHelper.onUpdateDownloaded((info) => {
  updateBannerText.textContent = `Version ${info.version} is ready to install.`;
  updateBanner.classList.remove("isHidden");
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
window.rewriteHelper.getDefaultPrompt().then((prompt) => {
  defaultPromptText = prompt || "";
  if (!settingsForm.customPrompt.value) {
    settingsForm.customPrompt.value = defaultPromptText;
    updatePromptCharCount();
  }
});

window.rewriteHelper.getSettings().then((settings) => {
  if (settings) populateSettingsForm(settings);
});

window.rewriteHelper.getPermissions().then((status) => {
  if (status) renderPermissions(status);
});

window.rewriteHelper.loadHistory().then((entries) => {
  if (Array.isArray(entries) && entries.length > 0) {
    rewriteHistory = entries;
  }
}).catch(() => {});

updateSourceMeta();

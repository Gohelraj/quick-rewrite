const sourceText = document.getElementById("sourceText");
const statusText = document.getElementById("statusText");
const shortcutText = document.getElementById("shortcutText");
const wordCountPill = document.getElementById("wordCountPill");
const providerPill = document.getElementById("providerPill");
const latencyPill = document.getElementById("latencyPill");
const cachePill = document.getElementById("cachePill");
const rewriteButton = document.getElementById("rewriteButton");
const clearButton = document.getElementById("clearButton");
const closeButton = document.getElementById("closeButton");
const showRewriteTab = document.getElementById("showRewriteTab");
const showPermissionsTab = document.getElementById("showPermissionsTab");
const showSettingsTab = document.getElementById("showSettingsTab");
const rewritePanel = document.getElementById("rewritePanel");
const permissionsPanel = document.getElementById("permissionsPanel");
const settingsPanel = document.getElementById("settingsPanel");
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
let currentSettings = null;
let currentPermissions = null;
let hasAutoOpenedSetup = false;
let requestStartedAt = 0;

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
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function updateSourceMeta() {
  const text = sourceText.value || "";
  const wordCount = getWordCount(text);
  wordCountPill.textContent = `${wordCount} ${wordCount === 1 ? "word" : "words"}`;
  providerPill.textContent = currentSettings?.provider === "openai" ? "OpenAI" : "OpenRouter";
}

function showLoadingState() {
  resultsContainer.innerHTML = "";
  emptyState.classList.add("isHidden");
  resultsSummary.classList.remove("isHidden");
  loadingState.classList.remove("isHidden");
  latencyPill.textContent = "Thinking...";
  cachePill.textContent = "Fresh";
}

function hideLoadingState() {
  loadingState.classList.add("isHidden");
}

function renderCard(title, text) {
  const fragment = cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".resultCard");
  const badgeNode = fragment.querySelector(".resultBadge");
  const titleNode = fragment.querySelector(".resultTitle");
  const bodyNode = fragment.querySelector(".resultBody");
  const copyButton = fragment.querySelector(".copyButton");

  badgeNode.textContent = title;
  titleNode.textContent = title;
  bodyNode.innerHTML = escapeHtml(text).replaceAll("\n", "<br>");

  copyButton.addEventListener("click", async () => {
    await window.rewriteHelper.copyText(text);
    setStatus(`Copied ${title.toLowerCase()} to clipboard.`);
  });

  resultsContainer.appendChild(card);
}

function renderResults(payload) {
  resultsContainer.innerHTML = "";
  emptyState.classList.add("isHidden");
  resultsSummary.classList.remove("isHidden");
  hideLoadingState();

  renderCard("Grammar Fix", payload.grammar_fixed);
  renderCard("Improved Rewrite", payload.rewritten);

  for (const tone of payload.tones) {
    renderCard(tone.label, tone.text);
  }
}

function showTab(name) {
  rewritePanel.classList.toggle("isHidden", name !== "rewrite");
  permissionsPanel.classList.toggle("isHidden", name !== "permissions");
  settingsPanel.classList.toggle("isHidden", name !== "settings");
  showRewriteTab.classList.toggle("isActive", name === "rewrite");
  showPermissionsTab.classList.toggle("isActive", name === "permissions");
  showSettingsTab.classList.toggle("isActive", name === "settings");
}

function populateSettingsForm(settings) {
  currentSettings = settings;
  settingsForm.shortcut.value = settings.shortcut || "";
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
  updateSourceMeta();
}

function setPillState(node, state, text) {
  node.classList.remove("isReady", "isWarn", "isMuted");
  if (state === "ready") {
    node.classList.add("isReady");
  } else if (state === "warn") {
    node.classList.add("isWarn");
  } else {
    node.classList.add("isMuted");
  }
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
}

async function runRewrite() {
  const text = sourceText.value.trim();

  if (!text) {
    setStatus("Select some text first, then trigger the shortcut.", true);
    return;
  }

  rewriteButton.disabled = true;
  rewriteButton.textContent = "Generating...";
  requestStartedAt = Date.now();
  showLoadingState();
  setStatus("Creating rewrite suggestions...");

  try {
    const result = await window.rewriteHelper.runRewrite(text);
    renderResults(result);
    const elapsedMs = Date.now() - requestStartedAt;
    latencyPill.textContent = `${(elapsedMs / 1000).toFixed(elapsedMs >= 10000 ? 0 : 1)}s`;
    cachePill.textContent = result?.meta?.cached ? "Cached" : "Fresh";
    setStatus(result?.meta?.cached ? "Suggestions loaded from cache." : "Suggestions ready.");
  } catch (error) {
    hideLoadingState();
    resultsSummary.classList.add("isHidden");
    emptyState.classList.remove("isHidden");
    setStatus(error.message || "Failed to generate suggestions.", true);
  } finally {
    rewriteButton.disabled = false;
    rewriteButton.textContent = "Generate Suggestions";
  }
}

rewriteButton.addEventListener("click", runRewrite);

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

showRewriteTab.addEventListener("click", () => showTab("rewrite"));
showPermissionsTab.addEventListener("click", () => showTab("permissions"));
showSettingsTab.addEventListener("click", () => showTab("settings"));

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveSettingsButton.disabled = true;
  saveSettingsButton.textContent = "Saving...";
  setStatus("Saving settings...");

  try {
    const saved = await window.rewriteHelper.saveSettings({
      shortcut: settingsForm.shortcut.value.trim(),
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
    setStatus("Settings saved.");
    showTab("rewrite");
  } catch (error) {
    setStatus(error.message || "Failed to save settings.", true);
  } finally {
    saveSettingsButton.disabled = false;
    saveSettingsButton.textContent = "Save Settings";
  }
});

refreshPermissionsButton.addEventListener("click", async () => {
  setStatus("Refreshing permission status...");
  try {
    const status = await window.rewriteHelper.refreshPermissions();
    renderPermissions(status);
    setStatus("Permission status updated.");
  } catch (error) {
    setStatus(error.message || "Failed to refresh permission status.", true);
  }
});

requestAccessibilityButton.addEventListener("click", async () => {
  setStatus("Opening accessibility permission prompt...");
  try {
    const status = await window.rewriteHelper.requestAccessibilityPermission();
    renderPermissions(status);
    showTab("permissions");
    setStatus("Accessibility prompt triggered. Grant access in System Settings if macOS shows it.");
  } catch (error) {
    setStatus(error.message || "Failed to request accessibility access.", true);
  }
});

openPermissionSettingsButton.addEventListener("click", async () => {
  try {
    await window.rewriteHelper.openPermissionSettings();
    setStatus("Opened system permission settings.");
  } catch (error) {
    setStatus(error.message || "Failed to open system settings.", true);
  }
});

sourceText.addEventListener("input", updateSourceMeta);

window.rewriteHelper.onSelectionLoaded(({ selectedText, shortcut, settings }) => {
  if (settings) {
    populateSettingsForm(settings);
  }
  if (selectedText) {
    sourceText.value = selectedText;
    setStatus("Selected text loaded.");
  } else {
    setStatus("No fresh selection found. You can paste text manually.", true);
  }

  shortcutText.textContent = shortcut;
  updateSourceMeta();
  sourceText.focus();
  sourceText.select();
  showTab("rewrite");
});

window.rewriteHelper.onSelectionError(({ message, shortcut, settings }) => {
  if (settings) {
    populateSettingsForm(settings);
  }
  shortcutText.textContent = shortcut;
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

window.rewriteHelper.getSettings().then((settings) => {
  if (settings) {
    populateSettingsForm(settings);
  }
});

window.rewriteHelper.getPermissions().then((status) => {
  if (status) {
    renderPermissions(status);
  }
});

updateSourceMeta();

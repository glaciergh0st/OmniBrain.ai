const settingsForm = document.getElementById("settingsForm");
const personaSelect = document.getElementById("personaSelect");
const modeSelect = document.getElementById("modeSelect");
const domainSelect = document.getElementById("domainSelect");
const objectiveInput = document.getElementById("objectiveInput");
const contextToggle = document.getElementById("contextToggle");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const newChatButton = document.getElementById("newChatButton");
const copyLastButton = document.getElementById("copyLastButton");
const downloadLastButton = document.getElementById("downloadLastButton");
const loadPromptButton = document.getElementById("loadPromptButton");
const statusMessage = document.getElementById("statusMessage");
const providerInfo = document.getElementById("providerInfo");
const runtimeBadge = document.getElementById("runtimeBadge");
const chatThread = document.getElementById("chatThread");
const jsonOutput = document.getElementById("jsonOutput");
const promptOutput = document.getElementById("promptOutput");
const promptDetails = document.getElementById("promptDetails");

const SETTINGS_KEY = "sec-sme-chat-settings-v2";
const CHAT_KEY = "sec-sme-chat-history-v2";
const MAX_SAVED_MESSAGES = 30;
const MAX_CONTEXT_MESSAGES = 12;

let conversation = [];
let latestAssistantText = "";
let latestStructuredResponse = null;
let isRequestInFlight = false;

function setStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.classList.remove("ok", "error");
  if (type) {
    statusMessage.classList.add(type);
  }
}

function setRuntimeBadge(text, className = "") {
  runtimeBadge.textContent = text;
  runtimeBadge.classList.remove("badge-ok", "badge-warn", "badge-error");
  if (className) {
    runtimeBadge.classList.add(className);
  }
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorText = Array.isArray(payload.errors)
      ? payload.errors.join(" ")
      : payload.error || `Request failed with status ${response.status}.`;
    throw new Error(errorText);
  }
  return payload;
}

function getSettingsFromForm() {
  return {
    persona: String(personaSelect.value || "ARCHITECT"),
    mode: String(modeSelect.value || ""),
    domain: String(domainSelect.value || ""),
    strategicObjective: String(objectiveInput.value || "").trim(),
    useContext: Boolean(contextToggle.checked),
  };
}

function persistSettings() {
  const settings = getSettingsFromForm();
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function restoreSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    personaSelect.value = parsed.persona || "ARCHITECT";
    modeSelect.value = parsed.mode || "";
    domainSelect.value = parsed.domain || "";
    objectiveInput.value = parsed.strategicObjective || "";
    contextToggle.checked = parsed.useContext !== false;
  } catch (_error) {
    // Ignore corrupted local storage data.
  }
}

function persistConversation() {
  const trimmed = conversation.slice(-MAX_SAVED_MESSAGES);
  window.localStorage.setItem(CHAT_KEY, JSON.stringify(trimmed));
}

function restoreConversation() {
  try {
    const raw = window.localStorage.getItem(CHAT_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return;
    }
    conversation = parsed
      .map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.content || "").trim(),
        timestamp: item.timestamp || new Date().toISOString(),
      }))
      .filter((item) => item.content);
  } catch (_error) {
    conversation = [];
  }
}

function formatTime(isoValue) {
  return new Date(isoValue).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildMessageNode(message, index) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;

  const header = document.createElement("div");
  header.className = "message-header";

  const title = document.createElement("strong");
  title.textContent = message.role === "assistant" ? "SEC SME Copilot" : "You";
  header.appendChild(title);

  const meta = document.createElement("span");
  meta.className = "message-meta";
  meta.textContent = formatTime(message.timestamp);
  header.appendChild(meta);

  if (message.role === "assistant") {
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "message-copy";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(message.content);
        setStatus("Assistant message copied.", "ok");
      } catch (_error) {
        setStatus("Clipboard copy failed.", "error");
      }
    });
    header.appendChild(copyButton);
  }

  const body = document.createElement("pre");
  body.className = "message-body";
  body.textContent = message.content;

  article.appendChild(header);
  article.appendChild(body);
  article.setAttribute("data-message-index", String(index));
  return article;
}

function renderConversation() {
  chatThread.innerHTML = "";
  if (!conversation.length) {
    const empty = document.createElement("div");
    empty.className = "message system";
    empty.innerHTML =
      "<p><strong>Ready.</strong> Ask any security question. The assistant will adapt persona, mode, and domain automatically if needed.</p>";
    chatThread.appendChild(empty);
    return;
  }

  conversation.forEach((message, index) => {
    chatThread.appendChild(buildMessageNode(message, index));
  });

  chatThread.scrollTop = chatThread.scrollHeight;
}

function appendMessage(role, content) {
  const message = {
    role,
    content: String(content || "").trim(),
    timestamp: new Date().toISOString(),
  };
  if (!message.content) {
    return;
  }
  conversation.push(message);
  conversation = conversation.slice(-MAX_SAVED_MESSAGES);
  persistConversation();
  renderConversation();
}

function renderStructuredResponse(result) {
  latestStructuredResponse = result;
  latestAssistantText = result?.responseText || "";
  jsonOutput.textContent = JSON.stringify(result, null, 2);
  copyLastButton.disabled = !latestAssistantText;
  downloadLastButton.disabled = !latestAssistantText;
}

function setLoadingState(loading) {
  isRequestInFlight = loading;
  sendButton.disabled = loading;
  messageInput.disabled = loading;
  if (loading) {
    sendButton.textContent = "Generating...";
  } else {
    sendButton.textContent = "Send";
  }
}

function buildChatPayload(userMessage) {
  const settings = getSettingsFromForm();
  const payload = {
    persona: settings.persona,
    mode: settings.mode || undefined,
    domain: settings.domain || undefined,
    strategicObjective: settings.strategicObjective || undefined,
    message: userMessage,
  };

  if (settings.useContext) {
    payload.history = conversation
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((item) => ({
        role: item.role,
        content: item.content,
      }));
  }

  return payload;
}

async function handleChatSubmit(event) {
  event.preventDefault();
  if (isRequestInFlight) {
    return;
  }

  const message = String(messageInput.value || "").trim();
  if (!message) {
    setStatus("Enter a request before sending.", "error");
    messageInput.focus();
    return;
  }

  persistSettings();
  appendMessage("user", message);
  messageInput.value = "";
  setLoadingState(true);
  setStatus("Generating response...");

  const payload = buildChatPayload(message);

  try {
    const result = await apiRequest("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    appendMessage("assistant", result.responseText || "No response generated.");
    renderStructuredResponse(result);

    const providerLabel = result.fallbackUsed
      ? "Fallback engine"
      : `${result.provider || "llm"} (${result.model || "model"})`;
    providerInfo.textContent = `Provider: ${providerLabel}`;

    setStatus(
      result.fallbackUsed
        ? "Generated with fallback engine."
        : "Generated with live AI provider.",
      result.fallbackUsed ? "error" : "ok",
    );
  } catch (error) {
    appendMessage(
      "assistant",
      `Generation failed: ${error.message}\n\nTry again or verify your LLM provider configuration.`,
    );
    setStatus(error.message, "error");
  } finally {
    setLoadingState(false);
    messageInput.focus();
  }
}

function newChat() {
  conversation = [];
  latestAssistantText = "";
  latestStructuredResponse = null;
  jsonOutput.textContent = "";
  copyLastButton.disabled = true;
  downloadLastButton.disabled = true;
  window.localStorage.removeItem(CHAT_KEY);
  renderConversation();
  setStatus("Started a new chat.", "ok");
}

async function copyLastResponse() {
  if (!latestAssistantText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(latestAssistantText);
    setStatus("Copied last assistant response.", "ok");
  } catch (_error) {
    setStatus("Clipboard copy failed.", "error");
  }
}

function downloadLastResponse() {
  if (!latestAssistantText) {
    return;
  }
  const blob = new Blob([latestAssistantText], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `sec-sme-chat-${stamp}.md`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Downloaded last response.", "ok");
}

async function loadPrompt() {
  loadPromptButton.disabled = true;
  setStatus("Loading system prompt...");
  try {
    const result = await apiRequest("/api/system-prompt");
    promptOutput.textContent = result.prompt || "Prompt file is empty.";
    promptDetails.open = true;
    setStatus("System prompt loaded.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    loadPromptButton.disabled = false;
  }
}

async function loadRuntime() {
  try {
    const runtime = await apiRequest("/api/runtime");
    if (runtime.llm?.configured) {
      setRuntimeBadge(
        `AI Online · ${runtime.llm.model || "configured model"}`,
        "badge-ok",
      );
      providerInfo.textContent = `Provider: ${
        runtime.llm.provider || "llm"
      } (${runtime.llm.baseUrl})`;
    } else {
      setRuntimeBadge("AI Offline · Fallback mode", "badge-warn");
      providerInfo.textContent =
        "No API key configured. The deterministic fallback engine will be used.";
    }
  } catch (_error) {
    setRuntimeBadge("Runtime unavailable", "badge-error");
  }
}

function populateConfig(config) {
  if (Array.isArray(config.personas)) {
    const current = personaSelect.value || "ARCHITECT";
    personaSelect.innerHTML = "";
    config.personas.forEach((persona) => {
      const option = document.createElement("option");
      option.value = persona.id;
      option.textContent = `${persona.id} - ${persona.label}`;
      option.selected = persona.id === current;
      personaSelect.appendChild(option);
    });
  }

  if (Array.isArray(config.domains)) {
    const current = domainSelect.value || "";
    domainSelect.innerHTML = "";
    const auto = document.createElement("option");
    auto.value = "";
    auto.textContent = "Auto infer";
    domainSelect.appendChild(auto);
    config.domains.forEach((domain) => {
      const option = document.createElement("option");
      option.value = domain;
      option.textContent = domain;
      option.selected = domain === current;
      domainSelect.appendChild(option);
    });
  }
}

function handleInputKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
}

async function bootstrap() {
  setStatus("Initializing...");
  restoreConversation();
  renderConversation();

  try {
    const config = await apiRequest("/api/config");
    populateConfig(config);
    restoreSettings();
    await loadRuntime();
    setStatus("Ready.", "ok");
  } catch (error) {
    setStatus(`Startup failed: ${error.message}`, "error");
  }
}

chatForm.addEventListener("submit", handleChatSubmit);
newChatButton.addEventListener("click", newChat);
copyLastButton.addEventListener("click", copyLastResponse);
downloadLastButton.addEventListener("click", downloadLastResponse);
loadPromptButton.addEventListener("click", loadPrompt);
settingsForm.addEventListener("change", persistSettings);
messageInput.addEventListener("keydown", handleInputKeydown);

bootstrap();

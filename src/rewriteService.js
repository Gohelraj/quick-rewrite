const SYSTEM_PROMPT = `
You rewrite text for real-world communication.
Return strict JSON with this shape:
{
  "grammar_fixed": "string",
  "rewritten": "string",
  "tones": [
    { "id": "casual", "label": "Casual", "text": "string" },
    { "id": "friendly", "label": "Friendly", "text": "string" },
    { "id": "formal", "label": "Formal", "text": "string" },
    { "id": "professional", "label": "Professional", "text": "string" }
  ]
}
Rules:
- Preserve original meaning.
- Keep each version crisp and ready to paste.
- Fix grammar and spelling naturally.
- Do not add commentary.
- Return only valid JSON.
`.trim();

const CACHE_TTL_MS = 5 * 60 * 1000;
const rewriteCache = new Map();

function getProviderModel(settings) {
  const provider = settings.provider || process.env.LLM_PROVIDER || "openrouter";

  return {
    provider,
    model:
      provider === "openai"
        ? settings.openaiModel || process.env.OPENAI_MODEL || "gpt-5-mini"
        : settings.openrouterModel || process.env.OPENROUTER_MODEL || "openai/gpt-5-mini",
  };
}

function buildCacheKey(inputText, settings) {
  const { provider, model } = getProviderModel(settings);
  return JSON.stringify({
    provider,
    model,
    inputText: inputText.trim(),
    promptVersion: 2,
  });
}

function getCachedResult(cacheKey) {
  const entry = rewriteCache.get(cacheKey);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    rewriteCache.delete(cacheKey);
    return null;
  }

  return entry.value;
}

function setCachedResult(cacheKey, value) {
  rewriteCache.set(cacheKey, {
    createdAt: Date.now(),
    value,
  });
}

function extractOpenAIOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const messageItems = Array.isArray(payload.output) ? payload.output : [];

  for (const item of messageItems) {
    if (item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  throw new Error("The AI response did not include any text output.");
}

function extractOpenRouterOutputText(payload) {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content;
  }

  throw new Error("The OpenRouter response did not include any text output.");
}

async function callOpenAI(inputText, settings) {
  const apiKey = settings.openaiApiKey || process.env.OPENAI_API_KEY;
  const model = settings.openaiModel || process.env.OPENAI_MODEL || "gpt-5-mini";
  const baseUrl = settings.openaiBaseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  if (!apiKey) {
    throw new Error("Missing OpenAI API key. Add it in Settings or your .env file.");
  }

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: SYSTEM_PROMPT,
      input: inputText,
      max_output_tokens: 700,
      temperature: 0.4,
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Rewrite request failed: ${response.status} ${errorBody}`);
  }

  const payload = await response.json();
  return extractOpenAIOutputText(payload);
}

async function callOpenRouter(inputText, settings) {
  const apiKey = settings.openrouterApiKey || process.env.OPENROUTER_API_KEY;
  const model = settings.openrouterModel || process.env.OPENROUTER_MODEL || "openai/gpt-5-mini";
  const baseUrl =
    settings.openrouterBaseUrl || process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const httpReferer =
    settings.openrouterHttpReferer || process.env.OPENROUTER_HTTP_REFERER || "https://example.com";
  const appTitle = settings.openrouterAppTitle || process.env.OPENROUTER_APP_TITLE || "Quick Rewrite";

  if (!apiKey) {
    throw new Error("Missing OpenRouter API key. Add it in Settings or your .env file.");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": httpReferer,
      "X-OpenRouter-Title": appTitle,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: inputText,
        },
      ],
      max_tokens: 700,
      temperature: 0.4,
      response_format: {
        type: "json_object",
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Rewrite request failed: ${response.status} ${errorBody}`);
  }

  const payload = await response.json();
  return extractOpenRouterOutputText(payload);
}

async function rewriteText(inputText, settings = {}) {
  const cacheKey = buildCacheKey(inputText, settings);
  const cached = getCachedResult(cacheKey);

  if (cached) {
    return {
      ...cached,
      meta: {
        ...(cached.meta || {}),
        cached: true,
      },
    };
  }

  const provider = settings.provider || process.env.LLM_PROVIDER || "openrouter";
  const outputText =
    provider === "openai"
      ? await callOpenAI(inputText, settings)
      : await callOpenRouter(inputText, settings);
  const parsed = JSON.parse(outputText);

  if (!parsed.grammar_fixed || !parsed.rewritten || !Array.isArray(parsed.tones)) {
    throw new Error("The AI response JSON was missing expected fields.");
  }

  const result = {
    ...parsed,
    meta: {
      cached: false,
      provider,
    },
  };

  setCachedResult(cacheKey, result);
  return result;
}

module.exports = {
  rewriteText,
};

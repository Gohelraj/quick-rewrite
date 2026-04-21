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
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["grammar_fixed", "rewritten", "tones"],
  properties: {
    grammar_fixed: {
      type: "string",
    },
    rewritten: {
      type: "string",
    },
    tones: {
      type: "array",
      minItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "text"],
        properties: {
          id: {
            type: "string",
          },
          label: {
            type: "string",
          },
          text: {
            type: "string",
          },
        },
      },
    },
  },
};

function getProviderModel(settings) {
  const provider = settings.provider || process.env.LLM_PROVIDER || "openrouter";

  return {
    provider,
    model:
      provider === "openai"
        ? settings.openaiModel || process.env.OPENAI_MODEL || "gpt-4.1-mini"
        : settings.openrouterModel || process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini",
  };
}

function buildCacheKey(inputText, settings) {
  const { provider, model } = getProviderModel(settings);
  return JSON.stringify({
    provider,
    model,
    inputText: inputText.trim(),
    customPrompt: settings.customPrompt?.trim() || "",
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

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (typeof part?.text === "string") {
          return part.text;
        }

        if (typeof part?.content === "string") {
          return part.content;
        }

        return "";
      })
      .join("\n")
      .trim();

    if (text) {
      return text;
    }
  }

  throw new Error("The OpenRouter response did not include any text output.");
}

function stripMarkdownCodeFence(text) {
  const fencedMatch = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : text.trim();
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return text.slice(start);
}

function escapeRawControlCharsInStrings(text) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }

    if (char === "\"") {
      result += char;
      inString = !inString;
      continue;
    }

    if (inString) {
      if (char === "\n") {
        result += "\\n";
        continue;
      }

      if (char === "\r") {
        result += "\\r";
        continue;
      }

      if (char === "\t") {
        result += "\\t";
        continue;
      }
    }

    result += char;
  }

  return result;
}

function parseJsonCandidate(text) {
  const normalized = stripMarkdownCodeFence(text);
  const directCandidates = [normalized, extractFirstJsonObject(normalized)].filter(Boolean);

  for (const candidate of directCandidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      // Keep trying repair strategies below.
    }

    try {
      return JSON.parse(escapeRawControlCharsInStrings(candidate));
    } catch (error) {
      // Keep trying other candidates.
    }

    try {
      const parsed = JSON.parse(JSON.parse(candidate));
      return parsed;
    } catch (error) {
      // Keep trying other candidates.
    }
  }

  throw new Error("The AI returned malformed JSON.");
}

function toToneId(label = "", fallbackIndex = 0) {
  const normalized = String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || `tone_${fallbackIndex + 1}`;
}

function normalizeRewritePayload(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const grammarFixed =
    value.grammar_fixed || value.grammarFixed || value.grammar || value.corrected || value.edited;
  const rewritten =
    value.rewritten || value.rewrite || value.improved || value.improved_rewrite || value.polished;

  let tones = [];

  if (Array.isArray(value.tones)) {
    tones = value.tones
      .map((tone, index) => {
        if (!tone || typeof tone !== "object") {
          return null;
        }

        const label = tone.label || tone.name || tone.id || `Tone ${index + 1}`;
        const text = tone.text || tone.value || tone.content || tone.rewrite;

        if (!text) {
          return null;
        }

        return {
          id: tone.id || toToneId(label, index),
          label,
          text,
        };
      })
      .filter(Boolean);
  } else {
    const toneSources = [
      ["casual", value.casual],
      ["friendly", value.friendly],
      ["formal", value.formal],
      ["professional", value.professional],
    ];

    tones = toneSources
      .map(([id, text]) => {
        if (!text || typeof text !== "string") {
          return null;
        }

        return {
          id,
          label: id.charAt(0).toUpperCase() + id.slice(1),
          text,
        };
      })
      .filter(Boolean);
  }

  if (!grammarFixed || !rewritten || tones.length === 0) {
    return null;
  }

  return {
    grammar_fixed: grammarFixed,
    rewritten,
    tones,
  };
}

function extractUsage(payload, provider) {
  const usage = payload?.usage;

  if (!usage) {
    return null;
  }

  if (provider === "openai") {
    const input = usage.input_tokens ?? usage.prompt_tokens ?? 0;
    const output = usage.output_tokens ?? usage.completion_tokens ?? 0;
    return { inputTokens: input, outputTokens: output, totalTokens: input + output };
  }

  const input = usage.prompt_tokens ?? 0;
  const output = usage.completion_tokens ?? 0;
  return { inputTokens: input, outputTokens: output, totalTokens: usage.total_tokens ?? input + output };
}


async function callOpenAI(inputText, settings, options = {}) {
  const apiKey = settings.openaiApiKey || process.env.OPENAI_API_KEY;
  const model = settings.openaiModel || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const baseUrl = settings.openaiBaseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const instructions = options.instructions || settings.customPrompt?.trim() || SYSTEM_PROMPT;
  const textFormat = options.textFormat || {
    type: "json_schema",
    name: "rewrite_result",
    strict: true,
    schema: OUTPUT_SCHEMA,
  };

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
      instructions,
      input: inputText,
      max_output_tokens: 1500,
      temperature: 0.4,
      text: {
        format: textFormat,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Rewrite request failed: ${response.status} ${errorBody}`);
  }

  const payload = await response.json();
  return { text: extractOpenAIOutputText(payload), usage: extractUsage(payload, "openai") };
}

async function repairMalformedJson(rawOutputText, settings) {
  const provider = settings.provider || process.env.LLM_PROVIDER || "openrouter";
  const repairSystemPrompt = `
You repair malformed JSON.
Return only valid JSON using this schema:
${JSON.stringify(OUTPUT_SCHEMA, null, 2)}
  `.trim();
  const repairPrompt = `
Convert this malformed JSON-like text into valid JSON without changing the intended wording more than necessary:

${rawOutputText}
  `.trim();

  const repairedText =
    provider === "openai"
      ? (await callOpenAI(repairPrompt, settings, {
          instructions: repairSystemPrompt,
          textFormat: {
            type: "json_schema",
            name: "rewrite_result_repair",
            strict: true,
            schema: OUTPUT_SCHEMA,
          },
        })).text
      : (await callOpenRouter(repairPrompt, settings, {
          systemPrompt: repairSystemPrompt,
          responseFormat: {
            type: "json_object",
          },
        })).text;

  return parseJsonCandidate(repairedText);
}

async function callOpenRouter(inputText, settings, options = {}) {
  const apiKey = settings.openrouterApiKey || process.env.OPENROUTER_API_KEY;
  const model = settings.openrouterModel || process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";
  const baseUrl =
    settings.openrouterBaseUrl || process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const httpReferer =
    settings.openrouterHttpReferer || process.env.OPENROUTER_HTTP_REFERER || "https://example.com";
  const appTitle = settings.openrouterAppTitle || process.env.OPENROUTER_APP_TITLE || "Quick Rewrite";
  const systemPrompt = options.systemPrompt || settings.customPrompt?.trim() || SYSTEM_PROMPT;
  const responseFormat = options.responseFormat || {
    type: "json_object",
  };

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
          content: systemPrompt,
        },
        {
          role: "user",
          content: inputText,
        },
      ],
      max_tokens: 1500,
      temperature: 0.4,
      response_format: responseFormat,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Rewrite request failed: ${response.status} ${errorBody}`);
  }

  const payload = await response.json();
  return { text: extractOpenRouterOutputText(payload), usage: extractUsage(payload, "openrouter") };
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
  const { text: outputText, usage } =
    provider === "openai"
      ? await callOpenAI(inputText, settings)
      : await callOpenRouter(inputText, settings);
  let parsed;

  try {
    parsed = parseJsonCandidate(outputText);
  } catch (error) {
    parsed = await repairMalformedJson(outputText, settings);
  }

  parsed = normalizeRewritePayload(parsed) || parsed;

  if (!parsed.grammar_fixed || !parsed.rewritten || !Array.isArray(parsed.tones)) {
    throw new Error("The AI response JSON was missing expected fields.");
  }

  const result = {
    ...parsed,
    meta: {
      cached: false,
      provider,
      tokens: usage?.totalTokens ?? null,
    },
  };

  setCachedResult(cacheKey, result);
  return result;
}

module.exports = {
  rewriteText,
  SYSTEM_PROMPT,
};

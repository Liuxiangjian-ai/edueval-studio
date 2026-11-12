import { errorText, redact } from './util.js';

export class LlmHttpError extends Error {
  constructor(status, message, body = '') {
    super(message);
    this.name = 'LlmHttpError';
    this.status = status;
    this.body = body;
  }
}

function endpointFor(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('model base URL is empty');
  if (/\/chat\/completions$/.test(base)) return base;
  return `${base}/chat/completions`;
}

function extractText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('');
  }
  if (typeof message?.reasoning_content === 'string' && message.reasoning_content) return message.reasoning_content;
  return '';
}

/**
 * One OpenAI-compatible chat completion. The caller owns retries and records;
 * this function has no Agent, tool, memory, or session integration by design.
 */
export async function chatCompletion({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0.2,
  maxTokens = 2048,
  timeoutMs = 120000,
  signal,
  jsonMode = false,
  extraHeaders = {},
}) {
  if (!model) throw new Error('model id is required');
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('messages are required');
  const endpoint = endpointFor(baseUrl);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1000, Number(timeoutMs) || 120000));
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const started = Date.now();
  try {
    const headers = {
      'content-type': 'application/json',
      ...extraHeaders,
    };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const body = {
      model,
      messages,
      temperature: Math.min(2, Math.max(0, Number(temperature) || 0)),
      stream: false,
    };
    // 0 / missing means "let the provider use its own output limit". There is
    // intentionally no upper cap on an explicitly configured value.
    const configuredMax = Math.round(Number(maxTokens));
    if (Number.isFinite(configuredMax) && configuredMax > 0) body.max_tokens = configuredMax;
    if (jsonMode) body.response_format = { type: 'json_object' };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const rawText = await response.text();
    let payload = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const providerMessage = payload?.error?.message || payload?.message || rawText || response.statusText;
      throw new LlmHttpError(
        response.status,
        `${model} returned HTTP ${response.status}: ${redact(String(providerMessage)).slice(0, 800)}`,
        redact(String(rawText)).slice(0, 2000),
      );
    }
    if (!payload) throw new Error(`${model} returned a non-JSON response`);
    const choice = payload.choices?.[0];
    const text = extractText(choice?.message);
    if (!text.trim()) throw new Error(`${model} returned an empty completion`);
    return {
      text,
      usage: {
        prompt_tokens: Number(payload.usage?.prompt_tokens) || 0,
        completion_tokens: Number(payload.usage?.completion_tokens) || 0,
        total_tokens: Number(payload.usage?.total_tokens) || 0,
      },
      finish_reason: choice?.finish_reason || '',
      durationMs: Date.now() - started,
      model: payload.model || model,
    };
  } catch (err) {
    if (timedOut) {
      const timeoutError = new Error(`${model} timed out after ${timeoutMs}ms`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    if (err?.name === 'AbortError' && signal?.aborted) {
      const abort = new Error('operation cancelled');
      abort.name = 'AbortError';
      throw abort;
    }
    if (err instanceof LlmHttpError) throw err;
    throw new Error(`${model} request failed: ${errorText(err)}`);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export function judgeMessages(systemPrompt, userPrompt) {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

export function generationMessages(query) {
  return [
    {
      role: 'system',
      content:
        '你是教学设计助手。只根据用户给出的任务完成交付，不调用工具、不读取外部上下文、不询问澄清问题。输出完整、可直接使用的教学文档。',
    },
    { role: 'user', content: query },
  ];
}

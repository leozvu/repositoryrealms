export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_OPENROUTER_MODEL = '~google/gemini-flash-latest';
export const OPENROUTER_MAX_OUTPUT_TOKENS = 1500;
export const OPENROUTER_TIMEOUT_MS = 45_000;

const ALLOWED_ROLES = new Set(['user', 'assistant']);

export class OpenRouterError extends Error {
  constructor(message, { status = 502, type = 'provider_error' } = {}) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
    this.type = type;
  }
}

export function normalizeOpenRouterMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => ALLOWED_ROLES.has(message?.role) && typeof message?.content === 'string')
    .map((message) => ({ role: message.role, content: message.content.trim().slice(0, 12_000) }))
    .filter((message) => message.content)
    .slice(-10);
}

export function openRouterRequestBody({ system, messages, model = DEFAULT_OPENROUTER_MODEL }) {
  return {
    model,
    max_tokens: OPENROUTER_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      ...normalizeOpenRouterMessages(messages),
    ],
  };
}

export function openRouterReplyText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === 'string' ? part : part?.type === 'text' ? part.text : '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

export function openRouterUserMessage(error) {
  const type = error?.type;
  if (type === 'authentication') return 'OpenRouter API key không hợp lệ hoặc đã bị thu hồi.';
  if (type === 'payment_required') return 'Tài khoản OpenRouter không còn đủ credit.';
  if (type === 'rate_limit_exceeded') return 'OpenRouter đang giới hạn lưu lượng. Vui lòng thử lại sau.';
  if (type === 'context_length_exceeded' || type === 'max_tokens_exceeded') return 'Ngữ cảnh Copilot quá dài cho model hiện tại.';
  if (type === 'timeout') return 'OpenRouter phản hồi quá chậm. Vui lòng thử lại.';
  return 'OpenRouter tạm thời không thể xử lý yêu cầu.';
}

export async function requestOpenRouterCompletion({
  apiKey,
  system,
  messages,
  model = DEFAULT_OPENROUTER_MODEL,
  siteUrl,
  fetchImpl = fetch,
  timeoutMs = OPENROUTER_TIMEOUT_MS,
}) {
  if (!apiKey) throw new OpenRouterError('Missing OpenRouter API key.', { status: 401, type: 'authentication' });
  const normalizedMessages = normalizeOpenRouterMessages(messages);
  if (!normalizedMessages.some((message) => message.role === 'user')) {
    throw new OpenRouterError('At least one user message is required.', { status: 400, type: 'invalid_prompt' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-OpenRouter-Title': 'CRMegoric ERP · CRM',
    };
    if (siteUrl) headers['HTTP-Referer'] = siteUrl;
    const response = await fetchImpl(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(openRouterRequestBody({ system, messages: normalizedMessages, model })),
    });
    const payload = await response.json().catch(() => ({}));
    const responseError = payload?.error || payload?.choices?.[0]?.error;
    if (!response.ok || responseError) {
      throw new OpenRouterError(responseError?.message || `OpenRouter returned HTTP ${response.status}.`, {
        status: Number(responseError?.code) || response.status || 502,
        type: responseError?.metadata?.error_type || 'provider_error',
      });
    }
    const reply = openRouterReplyText(payload);
    if (!reply) throw new OpenRouterError('OpenRouter returned no content.', { status: 502, type: 'provider_unavailable' });
    return {
      reply,
      model: payload.model || model,
      usage: payload.usage || null,
      generationId: payload.id || null,
    };
  } catch (error) {
    if (error instanceof OpenRouterError) throw error;
    if (error?.name === 'AbortError') {
      throw new OpenRouterError('OpenRouter request timed out.', { status: 408, type: 'timeout' });
    }
    throw new OpenRouterError('Unable to connect to OpenRouter.', { status: 502, type: 'network_error' });
  } finally {
    clearTimeout(timeout);
  }
}

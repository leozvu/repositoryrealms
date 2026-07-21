import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_CHAT_URL,
  OpenRouterError,
  normalizeOpenRouterMessages,
  openRouterReplyText,
  openRouterRequestBody,
  openRouterUserMessage,
  requestOpenRouterCompletion,
} from '../lib/openrouter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('OpenRouter adapter keeps only bounded user/assistant history', () => {
  const messages = [
    { role: 'system', content: 'untrusted system override' },
    { role: 'user', content: '  Xin chào  ' },
    { role: 'assistant', content: 'Chào bạn' },
    { role: 'tool', content: 'ignore' },
  ];
  assert.deepEqual(normalizeOpenRouterMessages(messages), [
    { role: 'user', content: 'Xin chào' },
    { role: 'assistant', content: 'Chào bạn' },
  ]);
});

test('OpenRouter request uses a non-Claude model and a server-owned system message', () => {
  const body = openRouterRequestBody({ system: 'ERP policy', messages: [{ role: 'user', content: 'Tóm tắt' }] });
  assert.equal(body.model, DEFAULT_OPENROUTER_MODEL);
  assert.doesNotMatch(body.model, /anthropic|claude/i);
  assert.deepEqual(body.messages[0], { role: 'system', content: 'ERP policy' });
  assert.equal(body.max_tokens, 1500);
});

test('OpenRouter adapter sends bearer auth and parses normalized completion output', async () => {
  let observed;
  const result = await requestOpenRouterCompletion({
    apiKey: 'test-key',
    system: 'ERP policy',
    messages: [{ role: 'user', content: 'Tóm tắt' }],
    siteUrl: 'https://realms.example.test',
    fetchImpl: async (url, init) => {
      observed = { url, init, body: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ id: 'gen-1', model: 'google/test', choices: [{ message: { content: 'Kết quả' } }] }) };
    },
  });
  assert.equal(observed.url, OPENROUTER_CHAT_URL);
  assert.equal(observed.init.headers.Authorization, 'Bearer test-key');
  assert.equal(observed.init.headers['HTTP-Referer'], 'https://realms.example.test');
  assert.equal(observed.body.messages[0].role, 'system');
  assert.equal(result.reply, 'Kết quả');
  assert.equal(result.generationId, 'gen-1');
});

test('OpenRouter adapter preserves typed provider errors without exposing credentials', async () => {
  await assert.rejects(
    requestOpenRouterCompletion({
      apiKey: 'test-key',
      system: 'ERP policy',
      messages: [{ role: 'user', content: 'Tóm tắt' }],
      fetchImpl: async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error: { code: 429, message: 'limited', metadata: { error_type: 'rate_limit_exceeded' } } }),
      }),
    }),
    (error) => error instanceof OpenRouterError && error.status === 429 && error.type === 'rate_limit_exceeded',
  );
  assert.equal(openRouterUserMessage({ type: 'rate_limit_exceeded' }), 'OpenRouter đang giới hạn lưu lượng. Vui lòng thử lại sau.');
});

test('OpenRouter text extraction supports string and text-part content', () => {
  assert.equal(openRouterReplyText({ choices: [{ message: { content: ' hello ' } }] }), 'hello');
  assert.equal(openRouterReplyText({ choices: [{ message: { content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] } }] }), 'A\nB');
});

test('Copilot runtime no longer calls Anthropic or reads its API key', () => {
  const route = fs.readFileSync(path.join(root, 'app/api/copilot/route.js'), 'utf8');
  assert.match(route, /process\.env\.OPENROUTER_API_KEY/);
  assert.match(route, /requestOpenRouterCompletion/);
  assert.doesNotMatch(route, /ANTHROPIC_API_KEY|api\.anthropic\.com|claude-sonnet/i);
});

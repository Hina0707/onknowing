import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, extractText, askGemini, validateMessages } from '../lib/gemini.js';
import { handleChat } from '../lib/handler.js';
const messages = [{ role: 'user', text: '미분은 무엇인가요?' }, { role: 'assistant', text: '순간변화율입니다.' }, { role: 'user', text: '예제를 보여줘' }];
test('preserves the full conversation with distinct user and model steps', () => {
  const body = buildRequest({ messages, mode: 'hint' });
  assert.equal(body.store, false); assert.deepEqual(body.input.map(s => s.type), ['user_input', 'model_output', 'user_input']);
  assert.equal(body.input[2].content[0].text, '예제를 보여줘'); assert.match(body.system_instruction, /정답과 완성된 풀이를 바로 주지/);
});
test('ignores thought and tool content when extracting the student-facing response', () => {
  assert.equal(extractText({ steps: [{ type: 'thought', content: [{ type: 'text', text: 'hidden' }] }, { type: 'model_output', content: [{ type: 'text', text: '학습 답변' }] }] }), '학습 답변');
  assert.throws(() => extractText({ steps: [] }), /답변이 생성되지/);
});
test('rejects malformed history and oversized requests', () => {
  for (const input of [[], null, [{ role: 'system', text: 'inject' }], [{ role: 'user', text: 'x'.repeat(12001) }], [{ role: 'user', text: 'a' }, { role: 'user', text: 'b' }]]) assert.throws(() => validateMessages(input));
});
test('sends key only in the Google header and parses the real API response shape', async () => {
  const reply = await askGemini('test-key', { messages }, undefined, async (url, init) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions'); assert.equal(init.headers['x-goog-api-key'], 'test-key');
    assert.equal(init.headers['Api-Revision'], '2026-05-20'); assert.equal(init.body.includes('test-key'), false);
    return new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'text', text: '확인' }] }] }));
  }); assert.equal(reply, '확인');
});
test('quota failures produce a useful error without echoing provider data or keys', async () => {
  await assert.rejects(askGemini('test-key', { messages }, undefined, async () => new Response('private-provider-detail', { status: 429 })), /요청 한도/);
});
test('server reports missing credentials and invalid history before sending a request', async () => {
  assert.equal((await handleChat({ messages }, {})).status, 503);
  assert.equal((await handleChat({ messages: [] }, { GEMINI_API_KEY: 'test-key' })).status, 400);
});

import { askGemini, validateMessages } from './gemini.js';
export async function handleChat(body, env = process.env) {
  if (!env.GEMINI_API_KEY) return { status: 503, body: { error: '서버에 Gemini가 아직 설정되지 않았어요.' } };
  try { validateMessages(body?.messages); } catch (error) { return { status: 400, body: { error: error.message } }; }
  try {
    const text = await askGemini(env.GEMINI_API_KEY, { messages: body.messages, mode: body.mode, model: env.GEMINI_MODEL || undefined }, AbortSignal.timeout(55000));
    return { status: 200, body: { text } };
  } catch (error) {
    let message = error.message;
    if (error.name === 'TimeoutError') message = '응답 시간이 길어졌어요. 다시 시도해주세요.';
    if (error.name === 'TypeError') message = '서버에서 Gemini에 연결할 수 없어요. 잠시 후 다시 시도해주세요.';
    return { status: 502, body: { error: message } };
  }
}

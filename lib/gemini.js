export const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
export const MATH_FORMAT_INSTRUCTION = String.raw`수학 기호나 식 전체는 평문에 섞어 쓰지 말고 인라인 LaTeX \(f(x)=x^2\) 또는 독립된 식 \[\frac{1}{2}\]로 감싸세요. 근호, 분수, 지수, 적분도 표준 LaTeX 명령을 사용하세요. 수식 밖의 본문과 단위 설명, 코드, 그림 요소의 짧은 라벨은 평문으로 쓰세요.`;
export const MODES = {
  concept: '질문한 개념을 직관적인 설명, 핵심 식, 짧은 예제 순서로 설명하세요. 마지막에 이해를 확인하는 질문 하나를 제시하세요.',
  hint: '정답과 완성된 풀이를 바로 주지 마세요. 학생이 다음 단계를 스스로 찾도록 핵심 힌트 하나와 짧은 질문 하나를 주세요.',
  review: '학생의 풀이를 검토하세요. 맞는 부분과 처음 잘못된 단계를 구분하고 그 이유를 설명하세요. 풀이가 없으면 먼저 풀이를 요청하세요.'
};
export function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 40) throw new Error('대화는 1~40개 메시지까지 전송할 수 있어요. 새 대화를 시작해주세요.');
  let size = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || m.role !== (i % 2 === 0 ? 'user' : 'assistant') || typeof m.text !== 'string' || !m.text.trim() || m.text.length > 12000) throw new Error('대화 형식을 확인해주세요. 질문은 12,000자까지 입력할 수 있어요.');
    size += m.text.length;
  }
  if (messages.at(-1).role !== 'user' || size > 100000) throw new Error('대화가 길어졌어요. 새 대화를 시작해주세요.');
}
export function buildRequest({ messages, mode = 'concept', model = DEFAULT_MODEL }) {
  validateMessages(messages);
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model)) throw new Error('모델 이름을 확인해주세요.');
  return {
    model, store: false,
    system_instruction: '당신은 온전히의 대학 공학수학 학습 코치입니다. 한국어 존댓말로 친절하고 정확하게 답하세요. 수식의 가정과 적용 조건을 확인하고 불확실한 내용은 밝히세요. 답변은 읽기 쉽게 간결하게, 수식은 일반 텍스트로 작성하세요. ' + (MODES[mode] || MODES.concept),
    input: messages.map(m => ({ type: m.role === 'user' ? 'user_input' : 'model_output', content: [{ type: 'text', text: m.text }] }))
  };
}
export function extractText(data) {
  const text = (data.steps || []).filter(s => s.type === 'model_output').flatMap(s => s.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  if (!text) throw new Error('답변이 생성되지 않았어요. 질문을 바꿔 다시 시도해주세요.');
  return text;
}
export function apiError(status) {
  if ([400, 401, 403].includes(status)) return 'Gemini 요청이 거절됐어요. 서버의 API 설정을 확인해주세요.';
  if (status === 404) return '설정된 Gemini 모델을 사용할 수 없어요. 서버의 모델 설정을 확인해주세요.';
  if (status === 429) return 'Gemini 요청 한도에 도달했어요. 잠시 후 다시 시도하거나 AI Studio에서 할당량을 확인해주세요.';
  return 'Gemini가 응답하지 않았어요. 잠시 후 다시 시도해주세요.';
}
export async function askGemini(key, options, signal, fetcher = fetch) {
  return requestGemini(key, buildRequest(options), signal, fetcher);
}

export async function requestGemini(key, body, signal, fetcher = fetch) {
  const response = await fetcher('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key, 'Api-Revision': '2026-05-20' },
    body: JSON.stringify(body), signal
  });
  if (!response.ok) throw new Error(apiError(response.status));
  return extractText(await response.json());
}

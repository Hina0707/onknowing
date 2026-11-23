import { handleQuiz, QUIZ_REQUEST_LIMIT } from '../lib/quiz.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }
  if (Number(req.headers['content-length'] || 0) > QUIZ_REQUEST_LIMIT) {
    return res.status(413).json({ error: '3MB 이하의 파일을 선택해 주세요.' });
  }
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: '요청 형식을 확인해 주세요.' });
  }
  const result = await handleQuiz(body);
  return res.status(result.status).json(result.body);
}

import { handleChat } from '../lib/handler.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST 요청만 지원합니다.' }); }
  if (Number(req.headers['content-length'] || 0) > 500000) return res.status(413).json({ error: '질문이 너무 길어요.' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: '요청 형식을 확인해주세요.' }); }
  const result = await handleChat(body);
  return res.status(result.status).json(result.body);
}

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { handleChat } from './lib/handler.js';
import { DEFAULT_MODEL } from './lib/gemini.js';
import { handleQuiz, QUIZ_REQUEST_LIMIT } from './lib/quiz.js';
import { handleCoach, COACH_REQUEST_LIMIT } from './lib/coach.js';
const root = fileURLToPath(new URL('./dist/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm'
};
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const postRoutes = new Map([
  ['/api/chat', { handle: handleChat, limit: 500000 }],
  ['/api/quiz', { handle: handleQuiz, limit: QUIZ_REQUEST_LIMIT }],
  ['/api/coach', { handle: handleCoach, limit: COACH_REQUEST_LIMIT }]
]);
createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return json(res, 400, { error: '잘못된 경로입니다.' }); }
  if (pathname === '/api/config') return json(res, 200, { configured: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL || DEFAULT_MODEL });
  const route = postRoutes.get(pathname);
  if (route) {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST 요청만 지원합니다.' });
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > route.limit) return json(res, 413, { error: '입력이 너무 길어요.' });
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      let body; try { body = JSON.parse(raw); } catch { return json(res, 400, { error: '요청 형식을 확인해주세요.' }); }
      const result = await route.handle(body); return json(res, result.status, result.body);
    } catch { if (!res.headersSent) return json(res, 500, { error: '요청을 처리하지 못했어요.' }); return; }
  }
  if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: '지원하지 않는 요청입니다.' });
  const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) return json(res, 403, { error: '접근할 수 없습니다.' });
  try { const data = await readFile(target); res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(req.method === 'HEAD' ? undefined : data); }
  catch { json(res, 404, { error: '페이지를 찾을 수 없어요.' }); }
}).listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Local: http://localhost:${process.env.PORT || 3000}`));

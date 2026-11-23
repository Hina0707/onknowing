import { DEFAULT_MODEL } from '../lib/gemini.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ configured: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL || DEFAULT_MODEL });
}

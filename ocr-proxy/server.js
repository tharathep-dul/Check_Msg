#!/usr/bin/env node
/**
 * Node server — ตัวกลางเรียก Typhoon OCR (เวอร์ชันสำหรับ self-host / Docker)
 *
 *   TYPHOON_API_KEY=xxx node server.js
 *   หรือ docker compose up
 *
 * ใช้ http ของ Node ล้วน ไม่มี dependency ภายนอกเลย
 * ไม่บันทึกภาพหรือข้อความที่ผ่านตัวนี้ลงที่ใดทั้งสิ้น log มีแค่สถานะกับเวลา
 */

import http from 'node:http';
import { typhoonOcr, markdownToPlain, validateImage, makeRateLimiter } from './typhoon.js';

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.TYPHOON_API_KEY;
const ALLOWED = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const MAX_BYTES = Number(process.env.MAX_IMAGE_MB || 6) * 1024 * 1024;

if (!API_KEY) {
  console.error('ไม่พบ TYPHOON_API_KEY — ตั้งค่า environment variable ก่อนรัน');
  process.exit(1);
}

const limiter = makeRateLimiter({
  perSecond: Number(process.env.RATE_PER_SECOND || 2),
  perMinute: Number(process.env.RATE_PER_MINUTE || 20)
});

function originOf(req) {
  const o = req.headers.origin || '';
  if (ALLOWED.includes('*')) return o || '*';
  return ALLOWED.includes(o) ? o : null;
}

function send(res, status, obj, origin) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || 'null',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('payload ใหญ่เกินกำหนด')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const origin = originOf(req);

  if (req.method === 'OPTIONS') {
    res.writeHead(origin ? 204 : 403, {
      'Access-Control-Allow-Origin': origin || 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  if (req.url === '/health') return send(res, 200, { ok: true }, origin || '*');
  if (origin === null) return send(res, 403, { error: 'origin ไม่ได้รับอนุญาต' }, null);
  if (req.method !== 'POST') return send(res, 405, { error: 'ต้องเป็น POST' }, origin);

  const rl = limiter();
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return send(res, 429, { error: 'ใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่' }, origin);
  }

  let body;
  try { body = JSON.parse(await readBody(req, MAX_BYTES + 1024)); }
  catch (e) { return send(res, 400, { error: 'อ่าน body ไม่ได้', detail: e.message }, origin); }

  const bad = validateImage(body.image, MAX_BYTES);
  if (bad) return send(res, 400, { error: bad }, origin);

  try {
    const md = await typhoonOcr(body.image, API_KEY, {
      baseUrl: process.env.TYPHOON_BASE_URL,
      model: process.env.TYPHOON_MODEL
    });
    console.log(`[ocr] 200 ${Date.now() - started}ms`);   // ไม่ log เนื้อหา
    return send(res, 200, { text: markdownToPlain(md), markdown: md }, origin);
  } catch (err) {
    const status = err.status === 429 ? 429 : 502;
    console.error(`[ocr] ${status} ${Date.now() - started}ms ${err.message}`);
    return send(res, status, { error: 'เรียก Typhoon ไม่สำเร็จ', detail: String(err.message).slice(0, 200) }, origin);
  }
});

server.listen(PORT, () => console.log(`OCR proxy ทำงานที่ http://localhost:${PORT}`));

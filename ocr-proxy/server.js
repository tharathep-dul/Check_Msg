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
import { typhoonOcr, markdownToPlain, validateImage, makeRateLimiter, makeKeyedRateLimiter } from './typhoon.js';

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.TYPHOON_API_KEY;
const ALLOWED = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const MAX_BYTES = Number(process.env.MAX_IMAGE_MB || 6) * 1024 * 1024;
// base64 ทำให้ payload โตขึ้น 4/3 เท่า บวกเผื่อ JSON ที่ห่ออยู่
// ถ้าตั้งเท่ากับ MAX_BYTES เฉย ๆ ภาพจะถูกปัดตกตั้งแต่ยังไม่ถึงขนาดที่ประกาศไว้
const MAX_BODY = Math.ceil(MAX_BYTES * 4 / 3) + 1024;
const UPSTREAM_TIMEOUT = Number(process.env.TYPHOON_TIMEOUT_MS || 60000);
// header ที่ client ปลอมได้ จึงเชื่อเฉพาะเมื่อบอกไว้ชัดว่ามี reverse proxy อยู่ข้างหน้าจริง
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

if (!API_KEY) {
  console.error('ไม่พบ TYPHOON_API_KEY — ตั้งค่า environment variable ก่อนรัน');
  process.exit(1);
}

// สองชั้น: ต่อ IP กันคนเดียวกินโควตาคนอื่น, รวมทั้ง server กันยิงเกินที่ Typhoon อนุญาต
const perIpLimiter = makeKeyedRateLimiter({
  perSecond: Number(process.env.RATE_PER_IP_SECOND || 1),
  perMinute: Number(process.env.RATE_PER_IP_MINUTE || 6)
});
const limiter = makeRateLimiter({
  perSecond: Number(process.env.RATE_PER_SECOND || 2),
  perMinute: Number(process.env.RATE_PER_MINUTE || 20)
});

function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

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
    'Vary': 'Origin',        // คำตอบต่างกันตาม Origin — ไม่มีบรรทัดนี้ cache กลางจะจ่ายผิดคน
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0, tooLarge = false;
    const chunks = [];
    req.on('data', c => {
      if (tooLarge) return;                 // ทิ้งส่วนที่เหลือ แต่ยังอ่านต่อให้จบ
      size += c.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        // ห้าม req.destroy() ตรงนี้ — socket จะขาดก่อนที่คำตอบจะถูกส่งออกไป
        // ฝั่งเบราว์เซอร์จะเห็นแค่ "Failed to fetch" แทนที่จะรู้ว่าภาพใหญ่เกิน
        const err = new Error('payload ใหญ่เกินกำหนด');
        err.tooLarge = true;
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8')); });
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
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    });
    return res.end();
  }

  const path = req.url.split('?')[0];
  if (path === '/health') return send(res, 200, { ok: true }, origin || '*');
  if (origin === null) return send(res, 403, { error: 'origin ไม่ได้รับอนุญาต' }, null);
  if (req.method !== 'POST') return send(res, 405, { error: 'ต้องเป็น POST' }, origin);

  const ip = clientIp(req);
  const perIp = perIpLimiter(ip);
  if (!perIp.ok) {
    res.setHeader('Retry-After', String(perIp.retryAfter));
    return send(res, 429, { error: 'ใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่' }, origin);
  }
  const rl = limiter();
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return send(res, 429, { error: 'ระบบกำลังมีผู้ใช้พร้อมกันจำนวนมาก รอสักครู่แล้วลองใหม่' }, origin);
  }

  let body;
  try {
    body = JSON.parse(await readBody(req, MAX_BODY));
  } catch (e) {
    if (e.tooLarge) {
      res.setHeader('Connection', 'close');
      return send(res, 413, { error: `ภาพใหญ่เกินกำหนด (รับได้ไม่เกิน ${(MAX_BYTES / 1048576).toFixed(0)} MB)` }, origin);
    }
    return send(res, 400, { error: 'อ่าน body ไม่ได้', detail: e.message }, origin);
  }

  const bad = validateImage(body.image, MAX_BYTES);
  if (bad) return send(res, 400, { error: bad }, origin);

  try {
    const md = await typhoonOcr(body.image, API_KEY, {
      baseUrl: process.env.TYPHOON_BASE_URL,
      model: process.env.TYPHOON_MODEL,
      // ไม่มีตัวนี้ ถ้า Typhoon ค้างไม่ตอบ connection จะค้างยาวจนกินทรัพยากรทิ้ง
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT)
    });
    console.log(`[ocr] 200 ${Date.now() - started}ms`);   // ไม่ log เนื้อหา
    return send(res, 200, { text: markdownToPlain(md), markdown: md }, origin);
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    const status = timedOut ? 504 : err.status === 429 ? 429 : 502;
    console.error(`[ocr] ${status} ${Date.now() - started}ms ${err.message}`);
    const error = timedOut ? 'Typhoon ไม่ตอบกลับภายในเวลาที่กำหนด' : 'เรียก Typhoon ไม่สำเร็จ';
    return send(res, status, { error, detail: String(err.message).slice(0, 200) }, origin);
  }
});

server.listen(PORT, () => console.log(`OCR proxy ทำงานที่ http://localhost:${PORT}`));

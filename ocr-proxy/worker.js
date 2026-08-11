/**
 * Cloudflare Worker — ตัวกลางเรียก Typhoon OCR
 *
 * หน้าที่เดียว: รับภาพจากหน้าเว็บ ส่งต่อไป Typhoon แล้วคืนข้อความกลับ
 * เหตุผลที่ต้องมี: API key ใส่ในหน้าเว็บไม่ได้ ใครก็เปิด view-source แล้วเอาไปใช้
 *
 * deploy
 *   npm i -g wrangler
 *   wrangler secret put TYPHOON_API_KEY
 *   wrangler deploy
 *
 * ตั้ง ALLOWED_ORIGINS ใน wrangler.toml ให้เป็นโดเมนของหน้าเว็บจริง
 * ไม่บันทึกภาพหรือข้อความที่ผ่านตัวนี้ลงที่ใดทั้งสิ้น
 */

import { typhoonOcr, markdownToPlain, validateImage } from './typhoon.js';

const json = (obj, status, origin) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || '*',
    'Vary': 'Origin',        // คำตอบต่างกันตาม Origin — ไม่มีบรรทัดนี้ cache กลางจะจ่ายผิดคน
    'Cache-Control': 'no-store'
  }
});

function pickOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.includes('*')) return origin || '*';
  return allowed.includes(origin) ? origin : null;
}

export default {
  async fetch(request, env) {
    const origin = pickOrigin(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: origin ? 204 : 403,
        headers: {
          'Access-Control-Allow-Origin': origin || 'null',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin'
        }
      });
    }

    if (origin === null) return json({ error: 'origin ไม่ได้รับอนุญาต' }, 403, null);
    if (request.method !== 'POST') return json({ error: 'ต้องเป็น POST' }, 405, origin);
    if (!env.TYPHOON_API_KEY) return json({ error: 'ยังไม่ได้ตั้งค่า TYPHOON_API_KEY บน worker' }, 500, origin);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'body ไม่ใช่ JSON' }, 400, origin); }

    const bad = validateImage(body.image);
    if (bad) return json({ error: bad }, 400, origin);

    // จำกัดอัตราแบบง่ายด้วย KV ถ้ามีผูกไว้ (ไม่มีก็ข้าม — Typhoon จำกัด 20 req/min อยู่แล้ว)
    // KV เป็น eventually consistent และ read-then-write นี้ไม่ใช่ atomic คนที่ยิงพร้อมกัน
    // จากหลาย edge จึงลอดได้บ้าง ถ้าต้องการนับแม่นจริงต้องใช้ Durable Object
    if (env.RATE_KV) {
      const key = 'rl:' + (request.headers.get('CF-Connecting-IP') || 'anon');
      const count = Number(await env.RATE_KV.get(key)) || 0;
      if (count >= Number(env.RATE_PER_MINUTE || 10)) {
        return json({ error: 'ใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่' }, 429, origin);
      }
      await env.RATE_KV.put(key, String(count + 1), { expirationTtl: 60 });
    }

    try {
      const md = await typhoonOcr(body.image, env.TYPHOON_API_KEY, {
        baseUrl: env.TYPHOON_BASE_URL,
        model: env.TYPHOON_MODEL,
        // Worker ถูกตัดที่ CPU time ไม่ใช่เวลารอ I/O ถ้า Typhoon ค้างต้องมีตัวตัดเอง
        signal: AbortSignal.timeout(Number(env.TYPHOON_TIMEOUT_MS || 60000))
      });
      return json({ text: markdownToPlain(md), markdown: md }, 200, origin);
    } catch (err) {
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      const status = timedOut ? 504 : err.status === 429 ? 429 : 502;
      const error = timedOut ? 'Typhoon ไม่ตอบกลับภายในเวลาที่กำหนด' : 'เรียก Typhoon ไม่สำเร็จ';
      return json({ error, detail: String(err.message).slice(0, 200) }, status, origin);
    }
  }
};

/**
 * ตรรกะเรียก Typhoon OCR — ใช้ร่วมกันทั้ง Cloudflare Worker และ Node server
 *
 * อ้างอิงจาก source ของ package `typhoon-ocr` v0.4.1 (ocr_utils.py) โดยตรง
 * ไม่ได้เดา parameter เอง:
 *   endpoint       POST {base}/chat/completions
 *   model          typhoon-ocr        (Typhoon OCR 1.5 — 2B)
 *   max_tokens     16384
 *   temperature    0.1
 *   top_p          0.6
 *   repetition_penalty 1.1   (ค่า v1.5 ของ SDK)
 * v1.5 คืน markdown ตรง ๆ ไม่ห่อ JSON
 */

export const TYPHOON_BASE = 'https://api.opentyphoon.ai/v1';
export const TYPHOON_MODEL = 'typhoon-ocr';

/** prompt ของ v1.5 — คัดลอกจาก PROMPTS_SYS['v1.5'] ใน SDK */
export function v15Prompt(figureLanguage = 'Thai') {
  return `Extract all text from the image.


Instructions:
- Only return the clean Markdown.
- Do not include any explanation or extra text.
- You must include all information on the page.


Formatting Rules:
- Tables: Render tables using <table>...</table> in clean HTML format.
- Equations: Render equations using LaTeX syntax with inline ($...$) and block ($$...$$).
- Images/Charts/Diagrams: Wrap any clearly defined visual areas (e.g. charts, diagrams, pictures) in:


<figure>
Describe the image's main elements (people, objects, text), note any contextual clues (place, event, culture), mention visible text and its meaning, provide deeper analysis when relevant (especially for financial charts, graphs, or documents), comment on style or architecture if relevant, then give a concise overall summary. Describe in ${figureLanguage}.
</figure>


- Page Numbers: Wrap page numbers in <page_number>...</page_number> (e.g., <page_number>14</page_number>).
- Checkboxes: Use ☐ for unchecked and ☑ for checked boxes.
    `;
}

/**
 * @param {string} dataUrl  รูปในรูปแบบ data:image/...;base64,....
 * @param {string} apiKey
 * @param {object} opts     { baseUrl, model, figureLanguage, signal }
 * @returns {Promise<string>} markdown
 */
export async function typhoonOcr(dataUrl, apiKey, opts = {}) {
  const base = opts.baseUrl || TYPHOON_BASE;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model || TYPHOON_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: v15Prompt(opts.figureLanguage || 'Thai') },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }],
      max_tokens: 16384,
      temperature: 0.1,
      top_p: 0.6,
      repetition_penalty: 1.1
    })
  });

  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify((await res.json()).error || {}); } catch { detail = await res.text().catch(() => ''); }
    const err = new Error(`typhoon ${res.status}: ${String(detail).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('รูปแบบผลลัพธ์จาก Typhoon ไม่ตรงกับที่คาด');
  return text;
}

/** ตัด markup ที่ OCR ใส่มา ให้เหลือข้อความล้วนสำหรับป้อนเข้าตัวตรวจสแกม */
export function markdownToPlain(md) {
  return String(md)
    .replace(/<figure>[\s\S]*?<\/figure>/gi, ' ')     // คำบรรยายภาพ ไม่ใช่ข้อความในข้อความ
    .replace(/<page_number>[\s\S]*?<\/page_number>/gi, ' ')
    .replace(/<\/?(table|thead|tbody|tr)[^>]*>/gi, '\n')
    .replace(/<\/?(td|th)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*|__|\*|`/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** จำกัดจำนวนครั้งต่อช่วงเวลา — Typhoon จำกัด 2 req/s และ 20 req/min */
export function makeRateLimiter({ perSecond = 2, perMinute = 20 } = {}) {
  let sec = [], min = [];
  return function check(now = Date.now()) {
    sec = sec.filter(t => now - t < 1000);
    min = min.filter(t => now - t < 60000);
    if (sec.length >= perSecond) return { ok: false, retryAfter: 1 };
    if (min.length >= perMinute) return { ok: false, retryAfter: 60 };
    sec.push(now); min.push(now);
    return { ok: true };
  };
}

/** ตรวจ payload ก่อนส่งต่อ กันคนยิงอะไรก็ได้เข้ามา */
export function validateImage(dataUrl, maxBytes = 6 * 1024 * 1024) {
  if (typeof dataUrl !== 'string') return 'ไม่พบภาพในคำขอ';
  const m = /^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return 'รูปแบบภาพไม่ถูกต้อง รองรับ png, jpeg, webp แบบ base64 เท่านั้น';
  const bytes = Math.floor(m[3].length * 3 / 4);
  if (bytes > maxBytes) return `ภาพใหญ่เกินไป (${(bytes / 1048576).toFixed(1)} MB เกิน ${(maxBytes / 1048576).toFixed(0)} MB)`;
  return null;
}

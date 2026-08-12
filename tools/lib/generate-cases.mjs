/**
 * สร้างเคสกัดใหม่จากตัวอย่างสแกมจริง เพื่อวัดว่า engine ยังตามคนร้ายทันไหม
 *
 * ★★ กฎ R3 ในเอกสารออกแบบ — ห้ามให้ LLM เห็น patterns.json ★★
 *
 * ฟังก์ชันในไฟล์นี้จึงไม่รับคลังคำเป็นพารามิเตอร์เลย และห้ามเพิ่มภายหลัง
 * ถ้า LLM เห็นคลังคำ มันจะเขียนเคสที่วนอยู่รอบคำที่มีอยู่แล้ว ซึ่งคือกับดัก
 * เดียวกับ regression_v03 แค่เปลี่ยนคนออกข้อสอบเป็น AI
 *
 * ส่วนบริสุทธิ์ (buildPrompt, validateGenerated, CASE_SCHEMA) แยกจากการเรียก API
 * เพื่อให้ทดสอบได้ครบโดยไม่ต้องมี API key และเปลี่ยนผู้ให้บริการได้โดยไม่แตะส่วนอื่น
 */

/** บังคับรูปแบบผลลัพธ์ด้วย structured outputs จะได้ไม่ต้อง parse ข้อความอิสระ */
export const CASE_SCHEMA = {
  type: 'object',
  properties: {
    cases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'ข้อความสแกมที่เขียนใหม่' },
          lang: { type: 'string', enum: ['th', 'en'] },
          seedId: { type: 'string', description: 'id ของตัวอย่างที่ใช้เป็นต้นแบบ' },
          technique: { type: 'string', description: 'เทคนิคที่ใช้เลี่ยงคำ' }
        },
        required: ['text', 'lang', 'seedId', 'technique'],
        additionalProperties: false
      }
    }
  },
  required: ['cases'],
  additionalProperties: false
};

export function buildPrompt(seeds, count) {
  const examples = seeds.map(s => `- [${s.id}] (${s.lang}) ${s.text}`).join('\n');

  return `งานนี้เป็นการทดสอบความทนทานของเครื่องมือคัดกรองข้อความหลอกลวงทางการเงิน \
เพื่อวัดว่าเครื่องมือยังจับสแกมได้อยู่ไหมเมื่อคนร้ายเปลี่ยนคำ ผลลัพธ์ใช้เป็นชุดทดสอบภายในเท่านั้น

ด้านล่างคือข้อความหลอกลวงที่เคยระบาดจริงและถูกประกาศเตือนต่อสาธารณะแล้ว

${examples}

เขียนข้อความใหม่ ${count} ข้อความ ที่มีเจตนาเดียวกันกับตัวอย่างข้างบน แต่ใช้คำคนละชุด \
เลียนแบบวิธีที่คนร้ายตัวจริงเปลี่ยนคำเพื่อหลบเครื่องมือคัดกรอง เช่น สะกดต่าง ใช้คำพ้องความหมาย \
ย่อคำ เลี่ยงศัพท์ตรง ๆ หรือเรียบเรียงประโยคใหม่

ข้อกำหนด
- ช่อง text ต้องเป็น **ตัวข้อความที่เหยื่อจะได้รับจริง** เท่านั้น
  ห้ามเป็นคำอธิบายว่าข้อความหน้าตาเป็นยังไง และห้ามอธิบายเทคนิคในช่องนี้
  (คำอธิบายเทคนิคใส่ในช่อง technique ซึ่งมีไว้สำหรับสิ่งนั้นอยู่แล้ว)
- ห้ามใส่คำนำหน้าอย่าง "ตัวอย่าง:" และห้ามใส่ [redacted] หรือช่องว่างแทนคำ
  ถ้าต้องมีตัวเลขให้แต่งขึ้นมาใหม่ อย่าเว้นไว้
- กระจายให้ครบทุกตัวอย่างต้นแบบ อย่ากระจุกอยู่กับตัวอย่างเดียว
- คงสัดส่วนภาษาไทยกับอังกฤษใกล้เคียงกับตัวอย่างต้นแบบ
- ระบุ seedId ของตัวอย่างที่ใช้ และ technique ที่ใช้เลี่ยงคำ
- ห้ามใส่เบอร์โทร ชื่อ หรือเลขบัญชีของบุคคลจริง`;
}

/**
 * ร่องรอยของการปฏิเสธแบบอ้อม ๆ
 *
 * โมเดลบางรุ่นไม่ปฏิเสธตรง ๆ แต่ส่ง "คำอธิบายว่าสแกมหน้าตาเป็นยังไง" มาแทน
 * ข้อความแบบนั้นผ่านด่านเดิมได้ทุกข้อ (มี refusal ว่าง, finish_reason=stop,
 * ยาวพอ, seedId ถูก) แล้วถูกบันทึกเป็น recall ต่ำ ทั้งที่ engine ตอบถูก —
 * ข้อความที่ไม่ใช่สแกม ไม่ควรถูกตีว่าเป็นสแกมอยู่แล้ว
 *
 * เจอครั้งแรกกับ gpt-5-mini รอบ 2026-08-12 ได้ recall 6% จากเคสที่เป็นคำบรรยายล้วน
 *
 * ตรวจที่รูปร่างของข้อความ ไม่ใช่ที่คะแนน — ถ้าตัดสินจากคะแนนต่ำ
 * ระบบจะกลบการเสื่อมของจริงไปด้วย ซึ่งคือสิ่งเดียวที่ระบบนี้มีหน้าที่จับ
 */
const REFUSAL_MARKERS = [
  'redacted', 'placeholder', '[ตัวอย่าง', 'ตัวอย่าง (', 'ตัวอย่าง:',
  'ข้อความตัวอย่าง', 'example:', 'ไม่สามารถ', 'ขออภัย', 'i cannot', "i can't"
];

export function looksLikeRefusal(text) {
  const lower = text.toLowerCase();
  return REFUSAL_MARKERS.find(m => lower.includes(m.toLowerCase())) || null;
}

/** คัดเคสที่ใช้ไม่ได้ทิ้ง แล้วติด expect: scam ให้ที่เหลือ */
export function validateGenerated(result, seeds) {
  const seedIds = new Set(seeds.map(s => s.id));
  const errors = [];
  const cases = [];

  const items = Array.isArray(result?.cases) ? result.cases : [];
  for (const [i, c] of items.entries()) {
    if (typeof c?.text !== 'string' || c.text.trim().length < 10) {
      errors.push(`เคสที่ ${i}: ข้อความสั้นเกินไปหรือไม่ใช่ข้อความ`);
      continue;
    }
    if (!seedIds.has(c.seedId)) {
      errors.push(`เคสที่ ${i}: seedId "${c.seedId}" ไม่มีในรายการต้นแบบ`);
      continue;
    }
    const marker = looksLikeRefusal(c.text);
    if (marker) {
      errors.push(`เคสที่ ${i}: เป็นคำบรรยายไม่ใช่ข้อความจริง (พบ "${marker}")`);
      continue;
    }
    cases.push({
      id: `gen_${String(i + 1).padStart(3, '0')}`,
      text: c.text.trim(),
      lang: c.lang,
      seedId: c.seedId,
      technique: c.technique,
      expect: 'scam'
    });
  }

  return { cases, errors };
}

/**
 * รุ่นที่ใช้เมื่อไม่ได้ระบุอะไรเลย
 *
 * ห้าม hardcode ชื่อรุ่นไว้ที่เดียวแล้วจบ เพราะสิทธิ์เข้าถึงรุ่นต่างกันไปตามบัญชี
 * บัญชีที่ไม่มีสิทธิ์รุ่นนี้จะได้ 403 ทุกสัปดาห์จนกว่าจะมีคนแก้โค้ด
 * จึงให้ทับค่าได้จาก env หรือ CLI โดยไม่ต้อง commit
 */
export const DEFAULT_MODEL = 'gpt-5-mini';

/** ลำดับความสำคัญ: ธงบรรทัดคำสั่ง > ตัวแปรสภาพแวดล้อม > ค่าตั้งต้น */
export function resolveModel(cliArg, envValue) {
  const pick = [cliArg, envValue].find(v => typeof v === 'string' && v.trim());
  return pick ? pick.trim() : DEFAULT_MODEL;
}

/**
 * เรียก API จริง — ส่วนเดียวในไฟล์นี้ที่มี I/O
 *
 * แยกไว้ท้ายไฟล์เพื่อให้เปลี่ยนผู้ให้บริการได้โดยไม่แตะส่วนอื่น
 * ตอนนี้ใช้ OpenAI — ถ้าจะสลับกลับไปเจ้าอื่น แก้เฉพาะฟังก์ชันนี้ฟังก์ชันเดียว
 * ส่วนบริสุทธิ์ข้างบนกับเทสต์ทั้ง 8 ข้อไม่ต้องแตะเลย
 *
 * โยน error เมื่อถูกปฏิเสธหรือ API ล่ม ให้ผู้เรียกตัดสินใจว่าจะทำยังไงต่อ
 */
export async function generateCases({ seeds, count, apiKey, model = DEFAULT_MODEL }) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  let completion;
  try {
    completion = await client.chat.completions.create({
      model,
      // รุ่นใหม่เลิกรับ max_tokens แล้ว ต้องใช้ max_completion_tokens
      max_completion_tokens: 16000,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'generated_cases', schema: CASE_SCHEMA, strict: true }
      },
      messages: [{ role: 'user', content: buildPrompt(seeds, count) }]
    });
  } catch (err) {
    // 403 ที่นี่แปลว่าบัญชีไม่มีสิทธิ์รุ่นนี้ ไม่ใช่ key ผิด — เป็นคนละเรื่องกับ 401
    // ถ้าไม่บอกทางแก้ตรงนี้ คนอ่าน log จะไปไล่หา key ที่ไม่ได้พัง
    if (err?.status === 403) {
      throw new Error(`${err.message}\n  → บัญชีไม่มีสิทธิ์รุ่น "${model}" สลับรุ่นด้วย --model หรือตั้ง OPENAI_MODEL`);
    }
    throw err;
  }

  const message = completion.choices?.[0]?.message;

  // โมเดลอาจปฏิเสธคำขอที่ให้เขียนข้อความหลอกลวง ต้องเช็คก่อนอ่านผลลัพธ์เสมอ
  // ไม่งั้นจะได้ค่าว่างแล้วบันทึกเป็น recall 0% ทั้งที่ระบบไม่ได้เสื่อม
  if (message?.refusal) {
    const err = new Error(`ถูกปฏิเสธ: ${message.refusal}`);
    err.refusal = true;
    throw err;
  }

  // ถูกตัดกลางคันเพราะชนเพดาน token — JSON จะไม่สมบูรณ์ ต้องล้มดัง ๆ
  const finish = completion.choices?.[0]?.finish_reason;
  if (finish && finish !== 'stop') {
    throw new Error(`ผลลัพธ์ไม่สมบูรณ์ (finish_reason: ${finish})`);
  }

  if (typeof message?.content !== 'string') {
    throw new Error('ไม่ได้ข้อความกลับมาจากโมเดล');
  }

  return validateGenerated(JSON.parse(message.content), seeds);
}

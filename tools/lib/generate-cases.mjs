/**
 * สร้างเคสกัดใหม่จากตัวอย่างสแกมจริง เพื่อวัดว่า engine ยังตามคนร้ายทันไหม
 *
 * ★★ กฎ R3 ในเอกสารออกแบบ — ห้ามให้ LLM เห็น patterns.json ★★
 *
 * ฟังก์ชันในไฟล์นี้จึงไม่รับคลังคำเป็นพารามิเตอร์เลย และห้ามเพิ่มภายหลัง
 * ถ้า LLM เห็นคลังคำ มันจะเขียนเคสที่วนอยู่รอบคำที่มีอยู่แล้ว ซึ่งคือกับดัก
 * เดียวกับ regression_v03 แค่เปลี่ยนคนออกข้อสอบเป็น AI
 *
 * ส่วนบริสุทธิ์ (buildPrompt, validateGenerated) แยกจากการเรียก API
 * เพื่อให้ทดสอบได้ครบโดยไม่ต้องมี API key
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
- กระจายให้ครบทุกตัวอย่างต้นแบบ อย่ากระจุกอยู่กับตัวอย่างเดียว
- คงสัดส่วนภาษาไทยกับอังกฤษใกล้เคียงกับตัวอย่างต้นแบบ
- ระบุ seedId ของตัวอย่างที่ใช้ และ technique ที่ใช้เลี่ยงคำ
- ห้ามใส่เบอร์โทร ชื่อ หรือเลขบัญชีของบุคคลจริง`;
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
 * เรียก API จริง — ส่วนเดียวในไฟล์นี้ที่มี I/O
 * โยน error เมื่อถูกปฏิเสธหรือ API ล่ม ให้ผู้เรียกตัดสินใจว่าจะทำยังไงต่อ
 */
export async function generateCases({ seeds, count, apiKey, model = 'claude-opus-5' }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: CASE_SCHEMA } },
    messages: [{ role: 'user', content: buildPrompt(seeds, count) }]
  });

  // ตัวจำแนกด้านความปลอดภัยอาจปฏิเสธคำขอที่ให้เขียนข้อความหลอกลวง
  // ต้องเช็คก่อนอ่านผลลัพธ์เสมอ ไม่งั้นจะได้ค่าว่างแล้วนึกว่าระบบเสื่อม
  if (response.stop_reason === 'refusal') {
    const err = new Error(`ถูกปฏิเสธ: ${response.stop_details?.category ?? 'ไม่ระบุ'}`);
    err.refusal = true;
    throw err;
  }

  return validateGenerated(response.parsed_output, seeds);
}

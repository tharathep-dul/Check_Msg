import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildPrompt, validateGenerated, CASE_SCHEMA, resolveModel, DEFAULT_MODEL, looksLikeRefusal } from './generate-cases.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const seedsFile = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/scam-seeds.json'), 'utf8'));
const sample = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/generated-sample.json'), 'utf8'));
const seeds = seedsFile.seeds;

/* ---------- การปฏิเสธแบบอ้อม ๆ ---------- */

// ข้อความจริงที่ gpt-5-mini ส่งกลับมาในรอบ 2026-08-12 ซึ่งได้ recall 6% แบบหลอก ๆ
const SOFT_REFUSALS = [
  'ตัวอย่าง (redacted): พัสดุของคุณคงค้างที่ด่านศุลกากร — ข้อความจริงถูกตัดออก',
  'ตัวอย่าง (redacted): แจ้งพัสดุติดค้าง — คำบางคำใช้คำพ้องความหมาย',
  'ขออภัย ไม่สามารถเขียนข้อความหลอกลวงให้ได้',
  "I can't help create scam messages, but here is the general shape"
];

test('looksLikeRefusal จับคำบรรยายที่โมเดลส่งมาแทนข้อความจริง', () => {
  for (const text of SOFT_REFUSALS) {
    assert.ok(looksLikeRefusal(text), `ควรจับได้: ${text.slice(0, 40)}`);
  }
});

test('looksLikeRefusal ไม่จับข้อความสแกมของจริง', () => {
  const real = [
    'บัญชีของท่านถูกระงับชั่วคราว กดลิงก์เพื่อยืนยันตัวตนภายใน 24 ชม. http://kbnk-verify.top/x',
    'พัสดุตกค้างที่ศุลกากร ชำระค่าภาษี 128 บาทก่อน 18.00 น. มิฉะนั้นตีกลับต้นทาง',
    'Your account will be locked. Verify now: http://scb-secure.cc/id'
  ];
  for (const text of real) {
    assert.equal(looksLikeRefusal(text), null, `ไม่ควรจับ: ${text.slice(0, 40)}`);
  }
});

test('validateGenerated ตัดเคสที่เป็นคำบรรยายทิ้ง ไม่นับเป็นเคสที่ใช้ได้', () => {
  const result = { cases: SOFT_REFUSALS.map(text => ({ text, lang: 'th', seedId: seeds[0].id, technique: 'x' })) };
  const r = validateGenerated(result, seeds);
  assert.equal(r.cases.length, 0, 'ต้องไม่เหลือเคสที่ใช้ได้เลย');
  assert.equal(r.errors.length, SOFT_REFUSALS.length);
  assert.ok(r.errors[0].includes('คำบรรยาย'));
});

test('buildPrompt สั่งชัดว่า text ต้องเป็นตัวข้อความ ไม่ใช่คำอธิบาย', () => {
  const prompt = buildPrompt(seeds, 10);
  assert.ok(prompt.includes('ตัวข้อความที่เหยื่อจะได้รับจริง'));
  assert.ok(prompt.includes('redacted'));
});

/* ---------- การเลือกรุ่น ---------- */

test('resolveModel ใช้ค่าตั้งต้นเมื่อไม่ได้ระบุอะไรเลย', () => {
  assert.equal(resolveModel(undefined, undefined), DEFAULT_MODEL);
});

test('resolveModel มองข้ามค่าว่างจาก env ที่ workflow ส่งมา', () => {
  // GitHub Actions ส่ง env เป็นสตริงว่างเสมอเมื่อผู้ใช้ไม่ได้กรอกช่อง model
  assert.equal(resolveModel(undefined, ''), DEFAULT_MODEL);
  assert.equal(resolveModel(undefined, '   '), DEFAULT_MODEL);
});

test('resolveModel ใช้ค่าจาก env เมื่อไม่มีธงบรรทัดคำสั่ง', () => {
  assert.equal(resolveModel(undefined, 'gpt-5.1'), 'gpt-5.1');
});

test('resolveModel ให้ธงบรรทัดคำสั่งชนะ env', () => {
  assert.equal(resolveModel('gpt-4.1', 'gpt-5.1'), 'gpt-4.1');
});

test('buildPrompt ใส่ข้อความของทุก seed ลงไป', () => {
  const prompt = buildPrompt(seeds, 50);
  for (const s of seeds) assert.ok(prompt.includes(s.text), `ไม่พบ seed ${s.id} ใน prompt`);
});

test('buildPrompt บอกจำนวนที่ต้องการ', () => {
  assert.ok(buildPrompt(seeds, 37).includes('37'));
});

test('กฎ R3 — prompt ต้องไม่มีคำจากคลังคำหลุดเข้าไป', async () => {
  const patterns = JSON.parse(await readFile(join(ROOT, 'patterns.json'), 'utf8'));
  const prompt = buildPrompt(seeds, 50);
  // สุ่มตรวจคำที่มีเฉพาะในคลังคำ ไม่ได้อยู่ในข้อความ seed
  const onlyInLibrary = patterns.scam
    .map(p => p.match)
    .filter(m => m.length > 6 && !seeds.some(s => s.text.includes(m)));
  const leaked = onlyInLibrary.filter(m => prompt.includes(m));
  assert.deepEqual(leaked, [], `มีคำจากคลังคำหลุดเข้า prompt: ${leaked.join(', ')}`);
});

test('validateGenerated ติด expect: scam ให้ทุกเคส', () => {
  const { cases } = validateGenerated(sample, seeds);
  assert.equal(cases.length, 5);
  assert.ok(cases.every(c => c.expect === 'scam'));
});

test('validateGenerated ตัดเคสที่ seedId ไม่มีจริงทิ้ง', () => {
  const bad = { cases: [{ text: 'ข้อความยาวพอสมควรสำหรับทดสอบ', lang: 'th', seedId: 'ไม่มีจริง', technique: 'x' }] };
  const { cases, errors } = validateGenerated(bad, seeds);
  assert.equal(cases.length, 0);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('ไม่มีจริง'));
});

test('validateGenerated ตัดเคสที่ข้อความสั้นเกินไปทิ้ง', () => {
  const bad = { cases: [{ text: 'สั้น', lang: 'th', seedId: 'sd001', technique: 'x' }] };
  const { cases, errors } = validateGenerated(bad, seeds);
  assert.equal(cases.length, 0);
  assert.equal(errors.length, 1);
});

test('validateGenerated ไม่พังเมื่อได้ผลลัพธ์ว่างหรือ null', () => {
  assert.deepEqual(validateGenerated(null, seeds).cases, []);
  assert.deepEqual(validateGenerated({}, seeds).cases, []);
});

test('CASE_SCHEMA ปิด additionalProperties ทุกชั้น', () => {
  assert.equal(CASE_SCHEMA.additionalProperties, false);
  assert.equal(CASE_SCHEMA.properties.cases.items.additionalProperties, false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildPrompt, validateGenerated, CASE_SCHEMA } from './generate-cases.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const seedsFile = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/scam-seeds.json'), 'utf8'));
const sample = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/generated-sample.json'), 'utf8'));
const seeds = seedsFile.seeds;

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

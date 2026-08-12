import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkProvenance } from './check-provenance.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const realPatterns = JSON.parse(await readFile(join(ROOT, 'patterns.json'), 'utf8'));
const realTestset = JSON.parse(await readFile(join(ROOT, 'tests/testset.json'), 'utf8'));
const realGrandfathered = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/grandfathered-patterns.json'), 'utf8'));

/** ชุดข้อมูลจำลองเล็ก ๆ สำหรับทดสอบแต่ละกรณี */
const testsetStub = { sets: { field: { cases: [{ id: 'f001', text: 'x' }] } } };
const grandfatheredStub = { ids: ['s_old_001'] };

test('คลังคำจริงทั้งชุดผ่าน เพราะทุก id อยู่ในรายการยกเว้น', () => {
  const r = checkProvenance(realPatterns, realTestset, realGrandfathered);
  assert.deepEqual(r.errors, []);
  assert.equal(r.checked, 0);
  assert.equal(r.skipped, 167);
});

test('pattern เดิมที่อยู่ในรายการยกเว้น ไม่ต้องมี src/added/case', () => {
  const patterns = { scam: [{ id: 's_old_001', match: 'x', cat: 'urgency', w: 1, lang: 'th' }], legit: [], risk: [] };
  assert.deepEqual(checkProvenance(patterns, testsetStub, grandfatheredStub).errors, []);
});

test('pattern ใหม่ที่ไม่มี src ต้องแดง', () => {
  const patterns = { scam: [{ id: 's_new_001', match: 'x', cat: 'urgency', w: 1, lang: 'th', added: '2026-09-01', case: 'field/f001' }], legit: [], risk: [] };
  const r = checkProvenance(patterns, testsetStub, grandfatheredStub);
  assert.equal(r.errors.length, 1);
  assert.ok(r.errors[0].includes('src'));
});

test('pattern ใหม่ที่ไม่มี case ต้องแดง', () => {
  const patterns = { scam: [{ id: 's_new_001', match: 'x', cat: 'urgency', w: 1, lang: 'th', src: 'advisory:x', added: '2026-09-01' }], legit: [], risk: [] };
  const r = checkProvenance(patterns, testsetStub, grandfatheredStub);
  assert.equal(r.errors.length, 1);
  assert.ok(r.errors[0].includes('case'));
});

test('pattern ใหม่ที่อ้างเคสที่ไม่มีจริง ต้องแดง', () => {
  const patterns = { scam: [{ id: 's_new_001', match: 'x', cat: 'urgency', w: 1, lang: 'th', src: 'advisory:x', added: '2026-09-01', case: 'field/ไม่มีจริง' }], legit: [], risk: [] };
  const r = checkProvenance(patterns, testsetStub, grandfatheredStub);
  assert.equal(r.errors.length, 1);
  assert.ok(r.errors[0].includes('ไม่มีจริง'));
});

test('pattern ใหม่ที่มีครบทุกอย่างและอ้างเคสที่มีจริง ต้องผ่าน', () => {
  const patterns = { scam: [{ id: 's_new_001', match: 'x', cat: 'urgency', w: 1, lang: 'th', src: 'advisory:ตร.ไซเบอร์ 2026-09-01', added: '2026-09-01', case: 'field/f001' }], legit: [], risk: [] };
  const r = checkProvenance(patterns, testsetStub, grandfatheredStub);
  assert.deepEqual(r.errors, []);
  assert.equal(r.checked, 1);
});

test('ตรวจ pattern ฝั่ง legit และ risk ด้วย', () => {
  const patterns = {
    scam: [],
    legit: [{ id: 'l_new_001', match: 'x', cat: 'balance', w: 1, lang: 'th' }],
    risk: [{ id: 'r_new_001', regex: 'x', cat: 'punct', w: 1 }]
  };
  const r = checkProvenance(patterns, testsetStub, grandfatheredStub);
  assert.equal(r.errors.length, 2);
});

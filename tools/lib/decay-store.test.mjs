import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseJsonl, readHistory, appendEntry, assessTrend } from './decay-store.mjs';

/** สร้างหนึ่งบรรทัดของประวัติ ใช้ย่อในเทสต์ */
const entry = (genRecall, ctlRecall = 0.788) => ({
  date: '2026-01-01', patternsVersion: '0.5.0', seedsVersion: '1.0.0',
  generated: { n: 50, caught: Math.round(genRecall * 50), recall: genRecall },
  control: { n: 56, correct: Math.round(ctlRecall * 56), recall: ctlRecall, hard: 0 },
  model: 'claude-opus-5'
});

test('parseJsonl ข้ามบรรทัดว่างและช่องว่าง', () => {
  assert.deepEqual(parseJsonl('{"a":1}\n\n  \n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
});

test('parseJsonl คืน array ว่างเมื่อได้ข้อความว่าง', () => {
  assert.deepEqual(parseJsonl(''), []);
});

test('readHistory คืน array ว่างเมื่อไฟล์ยังไม่มี', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'decay-'));
  assert.deepEqual(await readHistory(join(dir, 'ยังไม่มี.jsonl')), []);
});

test('appendEntry สร้างโฟลเดอร์ให้เองและต่อท้ายได้', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'decay-'));
  const path = join(dir, 'ลึก/เข้าไป/decay.jsonl');
  await appendEntry(path, entry(0.42));
  await appendEntry(path, entry(0.40));
  const lines = (await readFile(path, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).generated.recall, 0.40);
});

test('assessTrend บอกว่าข้อมูลยังไม่พอ', () => {
  const r = assessTrend([entry(0.42), entry(0.41)]);
  assert.equal(r.status, 'insufficient-data');
  assert.equal(r.need, 6);
  assert.equal(r.have, 2);
});

test('assessTrend คืน ok เมื่อคะแนนนิ่ง', () => {
  const h = [0.42, 0.43, 0.41, 0.42, 0.42, 0.43].map(x => entry(x));
  assert.equal(assessTrend(h).status, 'ok');
});

test('assessTrend คืน decay เมื่อเคสสร้างใหม่ตกแต่ชุดควบคุมนิ่ง', () => {
  const h = [
    entry(0.42), entry(0.43), entry(0.41), entry(0.42),   // ฐาน เฉลี่ย 0.42
    entry(0.28), entry(0.26)                               // สองรอบล่าสุด ตกเกิน 0.10
  ];
  const r = assessTrend(h);
  assert.equal(r.status, 'decay');
  assert.ok(Math.abs(r.baseGenerated - 0.42) < 0.01);
});

test('assessTrend คืน engine-regression เมื่อตกทั้งคู่', () => {
  const h = [
    entry(0.42, 0.79), entry(0.43, 0.79), entry(0.41, 0.78), entry(0.42, 0.79),
    entry(0.28, 0.60), entry(0.26, 0.58)
  ];
  assert.equal(assessTrend(h).status, 'engine-regression');
});

test('assessTrend ไม่เตือนเมื่อตกแค่รอบเดียว', () => {
  const h = [
    entry(0.42), entry(0.43), entry(0.41), entry(0.42),
    entry(0.28), entry(0.42)   // รอบล่าสุดกลับมาปกติ
  ];
  assert.equal(assessTrend(h).status, 'ok');
});

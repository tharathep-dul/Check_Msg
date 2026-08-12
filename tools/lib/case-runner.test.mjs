import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createEngine } from '../../engine.js';
import { scoreScamCases, scoreControlSuite } from './case-runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const patterns = JSON.parse(await readFile(join(ROOT, 'patterns.json'), 'utf8'));
const testset = JSON.parse(await readFile(join(ROOT, 'tests/testset.json'), 'utf8'));
const engine = createEngine(patterns);

test('scoreScamCases นับเคสที่จับได้ถูก', () => {
  const cases = [
    { id: 'a', text: 'ธนาคารแจ้งเตือน บัญชีจะถูกระงับ กรุณากดลิงก์ยืนยันตัวตน แจ้งรหัส OTP ด่วน' },
    { id: 'b', text: 'พรุ่งนี้ประชุมกี่โมงครับ' }
  ];
  const r = scoreScamCases(engine, cases);
  assert.equal(r.n, 2);
  assert.equal(r.caught, 1);
  assert.equal(r.recall, 0.5);
  assert.equal(r.missed.length, 1);
  assert.equal(r.missed[0].id, 'b');
});

test('scoreScamCases บันทึกคะแนนของเคสที่พลาดไว้ให้ดูได้', () => {
  const r = scoreScamCases(engine, [{ id: 'x', text: 'พรุ่งนี้ประชุมกี่โมงครับ' }]);
  assert.equal(r.missed[0].got, 'unsure');
  assert.equal(typeof r.missed[0].scam, 'number');
  assert.equal(typeof r.missed[0].legit, 'number');
});

test('scoreScamCases ไม่พังเมื่อไม่มีเคสเลย', () => {
  const r = scoreScamCases(engine, []);
  assert.equal(r.n, 0);
  assert.equal(r.recall, 0);
});

test('scoreControlSuite ให้ตัวเลขตรงกับ npm test', () => {
  const r = scoreControlSuite(engine, testset);
  assert.equal(r.n, 56);
  assert.equal(r.hard, 0);
  assert.ok(r.recall > 0.7 && r.recall < 0.9, `recall นอกช่วงที่คาด: ${r.recall}`);
});

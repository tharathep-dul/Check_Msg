#!/usr/bin/env node
/**
 * เฝ้าระวังการเสื่อมของความแม่นยำ
 *
 *   node tools/watch-decay.mjs --dry-run       ใช้ผลลัพธ์ตัวอย่าง ไม่เรียก API
 *   node tools/watch-decay.mjs --count 50      เรียก API จริง ต้องมี OPENAI_API_KEY
 *   node tools/watch-decay.mjs --no-write      รันแต่ไม่บันทึกลง decay.jsonl
 *   node tools/watch-decay.mjs --model gpt-5.1 เลือกรุ่น (หรือตั้ง env OPENAI_MODEL)
 *
 * สคริปต์นี้เขียนได้แค่ tests/history/decay.jsonl เท่านั้น
 * ไม่แตะ patterns.json และไม่แตะ tests/testset.json ตามข้อจำกัดในเอกสารออกแบบ
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createEngine } from '../engine.js';
import { readHistory, appendEntry, assessTrend } from './lib/decay-store.mjs';
import { scoreScamCases, scoreControlSuite } from './lib/case-runner.mjs';
import { generateCases, validateGenerated, resolveModel } from './lib/generate-cases.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HISTORY_PATH = join(ROOT, 'tests/history/decay.jsonl');

const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const patterns = JSON.parse(await readFile(join(ROOT, 'patterns.json'), 'utf8'));
const testset = JSON.parse(await readFile(join(ROOT, 'tests/testset.json'), 'utf8'));
const seedsFile = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/scam-seeds.json'), 'utf8'));
const engine = createEngine(patterns);

const dryRun = has('--dry-run');
const count = Number(arg('--count', 50));
const model = resolveModel(arg('--model'), process.env.OPENAI_MODEL);

/* ---------- สร้างเคส ---------- */
let generated;
if (dryRun) {
  const sample = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/generated-sample.json'), 'utf8'));
  generated = validateGenerated(sample, seedsFile.seeds);
  console.log(`โหมดทดลอง: ใช้ผลลัพธ์ตัวอย่าง ${generated.cases.length} เคส`);
} else {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('✗ ไม่พบ OPENAI_API_KEY — ใช้ --dry-run ถ้าต้องการทดลองโดยไม่เรียก API');
    process.exit(1);
  }
  try {
    console.log(`ใช้รุ่น ${model}`);
    generated = await generateCases({ seeds: seedsFile.seeds, count, apiKey, model });
    console.log(`สร้างเคสได้ ${generated.cases.length} เคส (ขอไป ${count})`);
  } catch (err) {
    // ไม่บันทึกอะไรเลยเมื่อสร้างไม่สำเร็จ ดีกว่าบันทึกคะแนนปลอมที่ทำให้ดูเหมือนเสื่อม
    console.error(`✗ สร้างเคสไม่สำเร็จ ไม่บันทึกรอบนี้: ${err.message}`);
    process.exit(2);
  }
}

if (generated.errors.length) {
  console.log(`  ตัดทิ้ง ${generated.errors.length} เคสที่ใช้ไม่ได้`);
  for (const e of generated.errors.slice(0, 5)) console.log(`    - ${e}`);
}

// ด่านนี้ใช้กับการเรียก API จริงเท่านั้น — โหมดทดลองมีเคสเท่าที่ fixture มี
// ซึ่งน้อยกว่า --count เสมอ ถ้าไม่ยกเว้น --dry-run จะล้มทุกครั้ง
if (!dryRun && generated.cases.length < Math.floor(count * 0.5)) {
  console.error(`✗ ได้เคสน้อยเกินไป (${generated.cases.length} จาก ${count}) ไม่บันทึกรอบนี้`);
  process.exit(2);
}

/* ---------- ให้คะแนน ---------- */
const genScore = scoreScamCases(engine, generated.cases);
const ctlScore = scoreControlSuite(engine, testset);

const entry = {
  date: new Date().toISOString().slice(0, 10),
  patternsVersion: patterns.version,
  seedsVersion: seedsFile.version,
  generated: { n: genScore.n, caught: genScore.caught, recall: Number(genScore.recall.toFixed(4)) },
  control: { n: ctlScore.n, correct: ctlScore.correct, recall: Number(ctlScore.recall.toFixed(4)), hard: ctlScore.hard },
  model: dryRun ? 'dry-run' : model
};

/* ---------- บันทึกและประเมิน ---------- */
if (!has('--no-write')) {
  await appendEntry(HISTORY_PATH, entry);
}
const history = await readHistory(HISTORY_PATH);
const trend = assessTrend(history);

/* ---------- รายงาน ---------- */
console.log(`\nเคสสร้างใหม่  ${genScore.caught}/${genScore.n} จับได้  (recall ${(genScore.recall * 100).toFixed(1)}%)`);
console.log(`ชุดควบคุม     ${ctlScore.correct}/${ctlScore.n} ตอบตรง  (recall ${(ctlScore.recall * 100).toFixed(1)}%, ผิดข้าง ${ctlScore.hard})`);
console.log(`ประวัติ       ${history.length} รอบ`);

const MESSAGE = {
  'insufficient-data': `ข้อมูลยังไม่พอประเมินแนวโน้ม (มี ${trend.have} รอบ ต้องการ ${trend.need})`,
  'ok': 'แนวโน้มปกติ',
  'decay': 'เสื่อมจริง — ชุดควบคุมนิ่งแต่เคสสร้างใหม่ตกติดกันหลายรอบ แปลว่าคนร้ายใช้คำที่ระบบไม่รู้จัก',
  'engine-regression': 'ตกทั้งสองชุด — น่าจะมีคนแก้ engine หรือ pattern จนพัง ตรวจ commit ล่าสุด'
};
console.log(`สถานะ        ${trend.status} — ${MESSAGE[trend.status]}`);

if (genScore.missed.length) {
  console.log(`\nตัวอย่างเคสที่หลุด (${Math.min(5, genScore.missed.length)} จาก ${genScore.missed.length})`);
  for (const m of genScore.missed.slice(0, 5)) {
    console.log(`  [${m.technique}] s${m.scam}/l${m.legit}  ${m.text.slice(0, 60)}`);
  }
}

/* ---------- ส่งค่าให้ GitHub Actions ---------- */
if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT,
    `status=${trend.status}\n` +
    `generated_recall=${(genScore.recall * 100).toFixed(1)}\n` +
    `control_recall=${(ctlScore.recall * 100).toFixed(1)}\n`
  );
}

console.log('');

#!/usr/bin/env node
/**
 * ChekMsg test runner v0.4
 *
 *   node tests/run-tests.js                 พิมพ์ผลออกหน้าจอ
 *   node tests/run-tests.js --md report.md  เขียนรายงาน markdown เอาไปแปะในเอกสารได้เลย
 *   node tests/run-tests.js --set adversarial   รันเฉพาะชุดเดียว
 *
 * ตรรกะการให้คะแนนทั้งหมดอยู่ใน ../test-core.js ซึ่งหน้า admin.html ใช้ร่วมกัน
 * exit code 1 เมื่อพบ scam ที่ถูกตอบว่า legit — เอาไปต่อ CI ได้
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createEngine } from '../engine.js';
import { runSuite, toMarkdown, pct, EXCLUDE_FROM_SCORE } from '../test-core.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const args = process.argv.slice(2);
const arg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const mdPath = arg('--md');
const onlySet = arg('--set');

const patterns = JSON.parse(await readFile(join(ROOT, 'patterns.json'), 'utf8'));
const testset = JSON.parse(await readFile(join(HERE, 'testset.json'), 'utf8'));
const engine = createEngine(patterns);

const result = runSuite(engine, testset, { onlySet });
const { sets, totals, dangerous } = result;

console.log(`\nChekMsg test run — patterns v${patterns.version} / testset v${testset.version}\n`);
for (const s of sets) {
  console.log(`■ ${s.key} — ${s.label}`);
  console.log(`  ${s.correct}/${s.n} correct, ${s.soft} soft, ${s.hard} hard`);
  if (s.warning) console.log(`  ⚠ ${s.warning}`);
  for (const r of s.rows.filter(r => r.grade !== 'correct')) {
    console.log(`   ${r.grade === 'hard' ? '✗' : '~'} [${r.id}] expect=${r.expect} got=${r.got} (s${r.scam}/l${r.legit}) ${r.text.slice(0, 60)}`);
  }
  console.log('');
}
console.log(`— นับรวมทุกชุด ยกเว้น ${EXCLUDE_FROM_SCORE.join(', ')} (${totals.n} ข้อความ) —`);
console.log(`  scam precision ${pct(totals.precision)} | recall ${pct(totals.recall)} | F1 ${pct(totals.f1)}`);
console.log(`  ตอบ unsure ทั้งที่ควรตอบชัด: ${totals.soft}/${totals.n} (${pct(totals.soft / totals.n)})`);
console.log(`  ผิดข้างแบบอันตราย (scam ถูกตอบว่า legit): ${dangerous.length}\n`);

if (mdPath) {
  await writeFile(mdPath, toMarkdown(result, {
    patternsVersion: patterns.version,
    patternsUpdated: patterns.updated,
    testsetVersion: testset.version
  }), 'utf8');
  console.log(`เขียนรายงานแล้ว: ${mdPath}\n`);
}

process.exit(dangerous.length ? 1 : 0);

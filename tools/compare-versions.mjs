#!/usr/bin/env node
/**
 * เทียบ ChekMsg v0.3 กับรุ่นปัจจุบัน ด้วยชุดทดสอบเดียวกัน
 *
 *   npm run compare
 *
 * v0.3 คือตัวที่ deploy อยู่บน GitHub Pages และเป็นตัวที่เอาไป field test จริง
 * คลังคำและตรรกะตัดสินคัดลอกมาตามตัวอักษร เก็บไว้ที่ tests/fixtures/v03-baseline.json
 * จึงรันได้โดยไม่ต้องต่อเน็ต และตัวเลขในรายงานตรวจซ้ำได้เสมอ
 *
 * เหตุผลที่ต้องมีไฟล์นี้: ตัวเลขในรายงานปี 2025 (accuracy 86%) วัดจากชุดข้อมูล
 * ที่ทีมเขียนเอง ซึ่งเป็นชุดเดียวกับที่ใช้สร้าง keyword — สคริปต์นี้แสดงให้เห็น
 * เป็นตัวเลขว่าการวัดแบบนั้นให้ผลต่างจากการวัดด้วยชุดอิสระมากแค่ไหน
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createEngine } from '../engine.js';
import { runSuite, pct, EXCLUDE_FROM_SCORE } from '../test-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const base = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/v03-baseline.json'), 'utf8'));
const testset = JSON.parse(await readFile(join(ROOT, 'tests/testset.json'), 'utf8'));
const patterns = JSON.parse(await readFile(join(ROOT, 'patterns.json'), 'utf8'));

/** ตรรกะของ v0.3 ตามต้นฉบับ: รวมทุก match ไม่นับต่อหมวด ไม่รู้จักคำปฏิเสธ คำเดียวก็ชนะได้ */
const engineV03 = (() => {
  const risk = base.riskPatterns.map(p => ({ ...p, re: new RegExp(p.regex, p.flags) }));
  return {
    analyze(raw) {
      const text = String(raw || '').toLowerCase();
      const scam = base.scamWords.filter(w => text.includes(w[0].toLowerCase()));
      const legit = base.legitWords.filter(w => text.includes(w[0].toLowerCase()));
      const hit = risk.filter(p => p.re.test(raw));

      const scamScore = scam.reduce((s, w) => s + w[2], 0) + hit.reduce((s, p) => s + p.weight, 0);
      const legitScore = legit.reduce((s, w) => s + w[2], 0);

      const verdict = scamScore > 0 && scamScore >= legitScore ? 'scam'
                    : legitScore > 0 ? 'legit'
                    : 'unsure';

      return {
        verdict, scamScore, legitScore, strength: 'low',
        scamSignals: [...scam.map(w => ({ cat: w[1], w: w[2] })), ...hit.map(p => ({ cat: p.label, w: p.weight }))],
        legitSignals: legit.map(w => ({ cat: w[1], w: w[2] }))
      };
    }
  };
})();

const v03 = runSuite(engineV03, testset);
const cur = runSuite(createEngine(patterns), testset);
const scored = v03.totals.n;

const libV03 = base.scamWords.length + base.legitWords.length + base.riskPatterns.length;
const libCur = patterns.scam.length + patterns.legit.length + patterns.risk.length;

console.log(`\nChekMsg — เทียบ v0.3 กับ v${patterns.version} ด้วยชุดทดสอบ v${testset.version}`);
console.log(`คลังคำ: v0.3 ${libV03} รายการ → ปัจจุบัน ${libCur} รายการ\n`);

console.log(`── คิดคะแนนจาก ${scored} เคส (ตัด ${EXCLUDE_FROM_SCORE.join(', ')} ออก) ──\n`);
const row = (label, t) => console.log(
  '  ' + label.padEnd(12),
  `${t.correct}/${t.n}`.padEnd(9),
  pct(t.precision).padEnd(10),
  pct(t.recall).padEnd(10),
  pct(t.f1).padEnd(10),
  String(t.hard).padEnd(9),
  t.soft
);
console.log('  ' + 'เวอร์ชัน'.padEnd(14), 'ตอบตรง'.padEnd(9), 'precision'.padEnd(10), 'recall'.padEnd(10), 'F1'.padEnd(10), 'ผิดข้าง'.padEnd(8), 'soft');
row('v0.3', v03.totals);
row('v' + patterns.version, cur.totals);

console.log(`\n── แยกรายชุด ──\n`);
console.log('  ' + 'ชุด'.padEnd(22), 'v0.3'.padEnd(10), 'v' + patterns.version);
for (const s of v03.sets) {
  const b = cur.sets.find(x => x.key === s.key);
  const note = EXCLUDE_FROM_SCORE.includes(s.key) ? '   ← ไม่นับคะแนน: เขียนจาก keyword ของ v0.3 เอง' : '';
  console.log('  ' + s.key.padEnd(22), `${s.correct}/${s.n}`.padEnd(10), `${b.correct}/${b.n}`, note);
}

const selfTest = v03.sets.find(s => s.key === 'regression_v03');
if (selfTest) {
  console.log(`\n── ข้อสอบที่ตัวเองออก เทียบกับข้อสอบที่คนอื่นออก ──\n`);
  console.log(`  v0.3 ในชุดที่เขียนจาก keyword ตัวเอง : ${selfTest.correct}/${selfTest.n} (${pct(selfTest.correct / selfTest.n)})`);
  console.log(`  v0.3 ในชุดอิสระที่เหลือ              : ${v03.totals.correct}/${v03.totals.n} (${pct(v03.totals.correct / v03.totals.n)})`);
  console.log(`\n  ส่วนต่างนี้คือเหตุผลที่ ${EXCLUDE_FROM_SCORE.join(', ')} ถูกตัดออกจากคะแนน`);
}

const hard = v03.sets.flatMap(s => s.rows.filter(r => r.grade === 'hard').map(r => ({ set: s.key, ...r })));
console.log(`\n── เคสที่ v0.3 ตอบผิดข้าง (${hard.length}) ──\n`);
for (const f of hard) {
  console.log(`  [${f.set}/${f.id}] ควรได้ ${f.expect} ตอบ ${f.got} (s${f.scam}/l${f.legit})`);
  console.log(`     ${f.text.slice(0, 76)}`);
}
console.log('');

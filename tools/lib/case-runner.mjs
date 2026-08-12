/**
 * ให้คะแนนเคสด้วย engine
 *
 * รับ engine เข้ามาเป็นพารามิเตอร์ ไม่สร้างเอง เพื่อให้ผู้เรียกคุมได้ว่า
 * จะวัดด้วยคลังคำชุดไหน และเพื่อให้ทดสอบง่าย
 */

import { runSuite } from '../../test-core.js';

/**
 * ให้คะแนนเคสที่คาดว่าเป็นสแกมทั้งหมด
 * เมื่อทุกเคสคาดหวัง scam ค่า caught/n จึงเป็น recall ตรงตามนิยาม
 */
export function scoreScamCases(engine, cases) {
  const missed = [];
  let caught = 0;

  for (const c of cases) {
    const r = engine.analyze(c.text);
    if (r.verdict === 'scam') {
      caught++;
    } else {
      missed.push({
        id: c.id, text: c.text, got: r.verdict,
        scam: r.scamScore, legit: r.legitScore,
        technique: c.technique, seedId: c.seedId
      });
    }
  }

  const n = cases.length;
  return { n, caught, recall: n ? caught / n : 0, missed };
}

/**
 * คะแนนของชุดทดสอบคงที่ ใช้เป็นตัวควบคุมคู่กับเคสที่สร้างใหม่ทุกรอบ
 * ใช้สูตรเดียวกับ npm test เพราะเรียก runSuite ตัวเดียวกัน
 */
export function scoreControlSuite(engine, testset) {
  const { totals } = runSuite(engine, testset);
  return { n: totals.n, correct: totals.correct, recall: totals.recall, hard: totals.hard };
}

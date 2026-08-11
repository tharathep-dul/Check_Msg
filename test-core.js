/**
 * ตรรกะการให้คะแนนและสรุปผลทดสอบ — ไม่มี I/O ใด ๆ
 *
 * ใช้ร่วมกันระหว่าง tests/run-tests.js (Node) และ admin.html (เบราว์เซอร์)
 * เขียนแยกเพื่อไม่ให้มีสูตรคำนวณสองชุดที่ค่อย ๆ เพี้ยนออกจากกัน
 */

/** ชุดที่ลอกมาจาก pattern library ของตัวเอง — ไม่นับเข้าคะแนนรวม */
export const EXCLUDE_FROM_SCORE = ['regression_v03'];

/**
 * correct   ตอบตรง
 * soft      ตอบ unsure ทั้งที่ควรตอบชัด (หรือกลับกัน) — ปลอดภัยแต่ไม่ช่วยตัดสินใจ
 * hard      ตอบผิดข้าง — scam ที่ถูกตอบว่า legit คือกรณีที่แพงที่สุด
 */
export function grade(expect, got) {
  if (expect === got) return 'correct';
  if (got === 'unsure' || expect === 'unsure') return 'soft';
  return 'hard';
}

export function runSuite(engine, testset, { onlySet = null } = {}) {
  const sets = [];
  const dangerous = [];

  for (const [key, set] of Object.entries(testset.sets)) {
    if (onlySet && key !== onlySet) continue;
    const rows = set.cases.map(c => {
      const r = engine.analyze(c.text);
      const g = grade(c.expect, r.verdict);
      if (c.expect === 'scam' && r.verdict === 'legit') dangerous.push({ set: key, ...c, got: r.verdict });
      return {
        ...c, got: r.verdict, grade: g,
        scam: r.scamScore, legit: r.legitScore, strength: r.strength,
        scamSignals: r.scamSignals, legitSignals: r.legitSignals
      };
    });
    sets.push({
      key, label: set.label, warning: set.warning, rows,
      n: rows.length,
      correct: rows.filter(r => r.grade === 'correct').length,
      soft: rows.filter(r => r.grade === 'soft').length,
      hard: rows.filter(r => r.grade === 'hard').length
    });
  }

  const scoredRows = sets.filter(s => !EXCLUDE_FROM_SCORE.includes(s.key)).flatMap(s => s.rows);

  const cm = { scam: { scam: 0, legit: 0, unsure: 0 }, legit: { scam: 0, legit: 0, unsure: 0 }, unsure: { scam: 0, legit: 0, unsure: 0 } };
  for (const r of scoredRows) cm[r.expect][r.got]++;

  const tp = cm.scam.scam;
  const fp = cm.legit.scam + cm.unsure.scam;
  const fn = cm.scam.legit + cm.scam.unsure;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    sets, dangerous, cm, scoredRows,
    totals: {
      n: scoredRows.length,
      correct: scoredRows.filter(r => r.grade === 'correct').length,
      soft: scoredRows.filter(r => r.grade === 'soft').length,
      hard: scoredRows.filter(r => r.grade === 'hard').length,
      precision, recall, f1
    }
  };
}

export const pct = x => (x * 100).toFixed(1) + '%';

/** เทียบผลสองรอบ ใช้ตอบคำถามว่า "เพิ่มคำนี้แล้วทำของเดิมพังไหม" */
export function diffResults(before, after) {
  const map = r => new Map(r.sets.flatMap(s => s.rows.map(x => [s.key + '/' + x.id, x])));
  const b = map(before), a = map(after);
  const changed = [];
  for (const [k, av] of a) {
    const bv = b.get(k);
    if (!bv) continue;
    if (bv.got !== av.got) {
      changed.push({
        key: k, id: av.id, text: av.text, expect: av.expect,
        from: bv.got, to: av.got,
        direction: bv.grade !== 'correct' && av.grade === 'correct' ? 'fixed'
                 : bv.grade === 'correct' && av.grade !== 'correct' ? 'broken'
                 : 'shifted'
      });
    }
  }
  return {
    changed,
    fixed: changed.filter(c => c.direction === 'fixed'),
    broken: changed.filter(c => c.direction === 'broken'),
    deltaCorrect: after.totals.correct - before.totals.correct,
    deltaHard: after.totals.hard - before.totals.hard
  };
}

/** สร้างรายงาน markdown — เอาไปแปะในเอกสารได้เลย */
export function toMarkdown(result, meta = {}) {
  const { cm, totals, sets, dangerous } = result;
  const L = [];
  L.push('# ChekMsg — ผลการทดสอบ', '');
  if (meta.patternsVersion) L.push(`- patterns: v${meta.patternsVersion}${meta.patternsUpdated ? ` (${meta.patternsUpdated})` : ''}`);
  if (meta.testsetVersion) L.push(`- testset: v${meta.testsetVersion}`);
  L.push(`- รันเมื่อ: ${new Date().toISOString().slice(0, 10)}`, '');

  L.push('## สรุปรายชุด', '');
  L.push('| ชุด | จำนวน | ตอบตรง | ตอบ unsure ทั้งที่ควรชัด | ตอบผิดข้าง |');
  L.push('|---|---:|---:|---:|---:|');
  for (const s of sets) L.push(`| ${s.key} | ${s.n} | ${s.correct} (${pct(s.correct / s.n)}) | ${s.soft} | ${s.hard} |`);
  L.push('', '> ชุด `regression_v03` เขียนจาก keyword library ของ v0.3 เอง ห้ามใช้ตัวเลขจากชุดนี้อ้างความแม่นยำ', '');

  L.push('## Confusion matrix', '');
  L.push(`นับรวมทุกชุด ยกเว้น \`${EXCLUDE_FROM_SCORE.join('`, `')}\` รวม ${totals.n} ข้อความ — **ชุด \`adversarial\` ถูกนับรวมด้วยโดยตั้งใจ** ถ้าตัดออกตัวเลขจะสวยเกินจริง`, '');
  L.push('| ควรได้ \\ ระบบตอบ | scam | legit | unsure |');
  L.push('|---|---:|---:|---:|');
  for (const e of ['scam', 'legit', 'unsure']) L.push(`| ${e} | ${cm[e].scam} | ${cm[e].legit} | ${cm[e].unsure} |`);
  L.push('');
  L.push(`- precision (ที่ตอบว่า scam แล้วเป็น scam จริง): **${pct(totals.precision)}**`);
  L.push(`- recall (สแกมทั้งหมด จับได้กี่ %): **${pct(totals.recall)}**`);
  L.push(`- F1: **${pct(totals.f1)}**`);
  L.push(`- ผิดข้างแบบอันตราย (scam → legit): **${dangerous.length}**`);
  L.push(`- ตอบ \`unsure\` ทั้งที่ควรตอบชัด: **${totals.soft}/${totals.n}** (${pct(totals.soft / totals.n)})`, '');

  L.push('## รายการที่ยังไม่ผ่าน', '');
  const fails = sets.flatMap(s => s.rows.filter(r => r.grade !== 'correct').map(r => ({ ...r, set: s.key })));
  if (!fails.length) L.push('_ผ่านทั้งหมด_');
  else {
    L.push('| ชุด | id | ควรได้ | ระบบตอบ | scam/legit | ข้อความ |');
    L.push('|---|---|---|---|---|---|');
    for (const f of fails) L.push(`| ${f.set} | ${f.id} | ${f.expect} | ${f.got} | ${f.scam}/${f.legit} | ${f.text.slice(0, 70).replace(/\|/g, '/')} |`);
  }
  L.push('');
  return L.join('\n');
}

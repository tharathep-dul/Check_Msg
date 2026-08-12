#!/usr/bin/env node
/**
 * บังคับกฎ R1 ในเอกสารออกแบบ: pattern ทุกตัวที่เพิ่มหลังวันที่เริ่มบังคับ
 * ต้องบอกที่มา และต้องอ้างเคสทดสอบที่มีอยู่จริง
 *
 * ใช้รายชื่อ id แทนการดูวันที่ เพราะการดูวันที่หลบได้ด้วยการไม่ใส่ฟิลด์ added
 * แต่รายชื่อ id หลบไม่ได้ — id ที่ไม่อยู่ในรายการ แปลว่าเป็นของใหม่เสมอ
 *
 *   node tools/check-provenance.mjs
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REQUIRED_FIELDS = ['src', 'added', 'case'];

/** รวบรวม id ของทุกเคสในชุดทดสอบเป็นรูปแบบ "ชุด/id" */
function collectCaseIds(testset) {
  const ids = new Set();
  for (const [setKey, set] of Object.entries(testset.sets)) {
    for (const c of set.cases) ids.add(`${setKey}/${c.id}`);
  }
  return ids;
}

export function checkProvenance(patterns, testset, grandfathered) {
  const exempt = new Set(grandfathered.ids);
  const caseIds = collectCaseIds(testset);
  const errors = [];
  let checked = 0;
  let skipped = 0;

  const all = [
    ...(patterns.scam || []).map(p => ({ side: 'scam', p })),
    ...(patterns.legit || []).map(p => ({ side: 'legit', p })),
    ...(patterns.risk || []).map(p => ({ side: 'risk', p }))
  ];

  for (const { side, p } of all) {
    if (exempt.has(p.id)) { skipped++; continue; }
    checked++;

    // รวมฟิลด์ที่ขาดเป็นบรรทัดเดียว อ่านง่ายกว่าแยกบรรทัดละฟิลด์เวลาขึ้นใน CI
    const missing = REQUIRED_FIELDS.filter(field => !p[field]);
    if (missing.length) {
      errors.push(`[${side}/${p.id}] ขาดฟิลด์ ${missing.join(', ')} — pattern ที่เพิ่มใหม่ต้องบอกที่มาและอ้างเคสที่รองรับ`);
    }

    if (p.case && !caseIds.has(p.case)) {
      errors.push(`[${side}/${p.id}] อ้างเคส "${p.case}" ซึ่งไม่มีอยู่จริงใน testset.json`);
    }
  }

  return { errors, checked, skipped };
}

/* ---------- CLI ---------- */
if (import.meta.url === `file://${process.argv[1]}`) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const patterns = JSON.parse(await readFile(join(ROOT, 'patterns.json'), 'utf8'));
  const testset = JSON.parse(await readFile(join(ROOT, 'tests/testset.json'), 'utf8'));
  const grandfathered = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/grandfathered-patterns.json'), 'utf8'));

  const { errors, checked, skipped } = checkProvenance(patterns, testset, grandfathered);

  console.log(`ตรวจ pattern ใหม่ ${checked} ตัว (ยกเว้นของเดิม ${skipped} ตัว)`);
  if (errors.length) {
    console.error(`\n✗ ไม่ผ่าน ${errors.length} ข้อ\n`);
    for (const e of errors) console.error(`  ${e}`);
    console.error('\nกฎนี้มาจาก docs/design-continuous-learning.md ข้อ R1 — เคสมาก่อนคำ');
    process.exit(1);
  }
  console.log('✓ ผ่าน');
}

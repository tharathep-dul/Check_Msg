/**
 * เก็บและวิเคราะห์ประวัติคะแนนของระบบเฝ้าระวังการเสื่อม
 *
 * ไฟล์นี้ไม่รู้จัก engine ไม่รู้จัก LLM รู้แค่รูปแบบข้อมูล
 * จึงทดสอบได้ครบโดยไม่ต้องมี API key และไม่ต้องโหลดคลังคำ
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** แปลง JSON Lines เป็น array ข้ามบรรทัดว่าง */
export function parseJsonl(text) {
  return text.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
}

/** อ่านประวัติ คืน array ว่างถ้ายังไม่มีไฟล์ (รอบแรกสุด) */
export async function readHistory(path) {
  try {
    return parseJsonl(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/** ต่อท้ายหนึ่งบรรทัด สร้างโฟลเดอร์ให้เองถ้ายังไม่มี */
export async function appendEntry(path, entry) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify(entry) + '\n', 'utf8');
}

const average = xs => xs.reduce((sum, x) => sum + x, 0) / xs.length;

/**
 * ประเมินแนวโน้มจากประวัติ
 *
 * เคสที่ LLM สร้างต่างกันทุกรอบ คะแนนจึงมี noise ตามธรรมชาติ
 * ชุดควบคุม (control) คือชุดทดสอบคงที่ที่รันคู่กันทุกรอบ ใช้แยกว่า
 *
 *   ควบคุมนิ่ง + สร้างใหม่ตก  = การเสื่อมจริง คนร้ายใช้คำที่ระบบไม่รู้จัก
 *   ตกทั้งคู่                 = มีคนแก้ engine หรือ pattern จนพัง
 *
 * เตือนเฉพาะเมื่อตกติดกันหลายรอบ เพื่อไม่ให้ noise รอบเดียวทำให้ตื่นตูม
 */
export function assessTrend(history, opts = {}) {
  const { window = 4, dropThreshold = 0.10, consecutive = 2 } = opts;
  const need = window + consecutive;

  if (history.length < need) {
    return { status: 'insufficient-data', have: history.length, need };
  }

  const recent = history.slice(-consecutive);
  const base = history.slice(-need, -consecutive);
  const baseGenerated = average(base.map(e => e.generated.recall));
  const baseControl = average(base.map(e => e.control.recall));

  const generatedDropped = recent.every(e => e.generated.recall < baseGenerated - dropThreshold);
  const controlDropped = recent.every(e => e.control.recall < baseControl - dropThreshold);

  if (generatedDropped && controlDropped) {
    return { status: 'engine-regression', baseGenerated, baseControl, recent };
  }
  if (generatedDropped) {
    return { status: 'decay', baseGenerated, baseControl, recent };
  }
  return { status: 'ok', baseGenerated, baseControl };
}

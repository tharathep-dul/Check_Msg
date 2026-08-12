#!/usr/bin/env node
/**
 * รันเทสต์ของเครื่องมือใน tools/ โดยหาไฟล์เองแล้วส่งให้ node --test ตรง ๆ
 *
 *   npm run test:tools
 *
 * ทำไมต้องมีไฟล์นี้ แทนที่จะเรียก node --test ตรง ๆ — ทดสอบบน Node 20, 22, 24 แล้วพบว่า
 *
 *   node --test          หยิบ test-core.js ไปรันด้วย เพราะชื่อตรงกับรูปแบบ test-*.js
 *                        ที่ Node ถือว่าเป็นไฟล์เทสต์ ทั้งที่เป็นไลบรารีคำนวณคะแนน
 *
 *   node --test tools/   Node 20 ใช้ได้ แต่ Node 22 ขึ้นไปหาไฟล์ไม่เจอแล้วผ่านด้วย
 *                        pass 0 เงียบ ๆ — CI เขียวทั้งที่ไม่ได้รันเทสต์อะไรเลย
 *                        ซึ่งอันตรายกว่าล้ม เพราะไม่มีใครรู้
 *
 * ระบุไฟล์ตรง ๆ ทำงานถูกต้องทุกเวอร์ชัน ไฟล์นี้จึงหาไฟล์ให้แล้วส่งรายชื่อไป
 * และ **ล้มเมื่อหาไม่เจอเลย** เพื่อปิดช่อง "เขียวทั้งที่ไม่ได้รันอะไร" ถาวร
 */

import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS_DIR = join(ROOT, 'tools');

/** ไล่หาไฟล์ที่ลงท้าย .test.mjs ในโฟลเดอร์และโฟลเดอร์ย่อยทั้งหมด */
async function findTestFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await findTestFiles(path));
    else if (entry.name.endsWith('.test.mjs')) found.push(path);
  }
  return found.sort();
}

const files = await findTestFiles(TOOLS_DIR);

if (files.length === 0) {
  console.error('✗ ไม่พบไฟล์เทสต์เลยใน tools/');
  console.error('  ถ้าปล่อยให้ผ่าน CI จะเขียวทั้งที่ไม่ได้ตรวจอะไร ซึ่งแย่กว่าล้ม');
  process.exit(1);
}

console.log(`พบไฟล์เทสต์ ${files.length} ไฟล์`);
for (const f of files) console.log(`  ${relative(ROOT, f)}`);
console.log('');

const child = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: ROOT });
child.on('exit', code => process.exit(code ?? 1));

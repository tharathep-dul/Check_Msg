#!/usr/bin/env node
/**
 * รวม engine.js + patterns.json เข้า index.html เป็นไฟล์เดียว
 *
 *   node build.js            -> dist/chekmsg-standalone.html
 *
 * ไฟล์ผลลัพธ์เปิดด้วยการ double-click ได้เลย ไม่ต้องมี web server
 * ใช้สำหรับส่งให้คนอื่นทดสอบ หรือใช้แบบออฟไลน์
 *
 * ตัวที่ deploy จริงบน server ให้ใช้ index.html + patterns.json แยกไฟล์เหมือนเดิม
 * เพราะแก้ wording แล้วไม่ต้อง build ใหม่
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const engineSrc = await readFile(join(ROOT, 'engine.js'), 'utf8');
const patternsRaw = await readFile(join(ROOT, 'patterns.json'), 'utf8');
const patterns = JSON.parse(patternsRaw); // parse เพื่อให้ build ล้มถ้า JSON เสีย

// ตัด export ออกจาก engine เพื่อ inline เป็นสคริปต์ธรรมดา
const engineInline = engineSrc
  .replace(/export function createEngine/, 'function createEngine')
  .replace(/export async function createEngineFromFile[\s\S]*$/, '');

let out = html
  .replace(
    "import { createEngine } from './engine.js';",
    `/* ===== inlined engine.js ===== */\n${engineInline}\n/* ===== end engine.js ===== */\n`
  )
  .replace(
    /const res = await fetch\('\.\/patterns\.json', \{ cache: 'no-cache' \}\);\s*\n\s*if \(!res\.ok\) throw new Error\('HTTP ' \+ res\.status\);\s*\n\s*const patterns = await res\.json\(\);/,
    `const patterns = ${JSON.stringify(patterns)};`
  );

// สำคัญ: <script type="module"> ถูกบล็อกด้วย CORS เมื่อเปิดจาก file://
// เมื่อ inline หมดแล้วจึงเปลี่ยนเป็น script ธรรมดา ห่อด้วย async IIFE เพื่อให้ await ยังใช้ได้
out = out
  .replace('<script type="module">', '<script>\n(async function(){\n')
  .replace(/<\/script>\s*<\/body>/, '})();\n</script>\n</body>');

const inlined = out.split('<script>')[1] || '';
if (/^\s*import\s/m.test(inlined) || /^\s*export\s/m.test(inlined)) {
  console.error('✗ ยังมี import/export หลงเหลือ — inline ไม่ครบ');
  process.exit(1);
}

if (out.includes("fetch('./patterns.json'")) {
  console.error('✗ แทนที่ fetch ไม่สำเร็จ — index.html อาจถูกแก้จนรูปแบบเปลี่ยน ตรวจ regex ใน build.js');
  process.exit(1);
}
if (out.includes("from './engine.js'")) {
  console.error('✗ แทนที่ import engine ไม่สำเร็จ');
  process.exit(1);
}

out = out.replace(
  '<title>ChekMsg — Banking Fraud Screener</title>',
  '<title>ChekMsg — Banking Fraud Screener (standalone)</title>'
);

await mkdir(join(ROOT, 'dist'), { recursive: true });
const target = join(ROOT, 'dist', 'chekmsg-standalone.html');
await writeFile(target, out, 'utf8');

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(0);
console.log(`✓ ${target}`);
console.log(`  ${kb} KB · patterns v${patterns.version} · ${patterns.scam.length + patterns.legit.length + patterns.risk.length} patterns`);
console.log('  เปิดได้ด้วยการ double-click ไม่ต้องรัน server');

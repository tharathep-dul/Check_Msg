# แผนลงมือ — เฟส 1: เฝ้าระวังการเสื่อม + ประตู provenance

> **สำหรับผู้ลงมือ:** ใช้ `superpowers:subagent-driven-development` หรือ `superpowers:executing-plans` ทำทีละ task ขั้นตอนใช้ checkbox (`- [ ]`) สำหรับติดตาม

**เป้าหมาย:** ทำให้ ChekMsg รู้ตัวเองได้ว่าความแม่นยำกำลังเสื่อม และสร้างประตูที่บังคับกฎ "เคสมาก่อนคำ" ได้จริงก่อนที่ pattern อัตโนมัติตัวแรกจะมาถึง

**สถาปัตยกรรม:** สคริปต์ Node ล้วนใน `tools/` แยกส่วนบริสุทธิ์ (คำนวณ) ออกจากส่วนที่มี I/O และการเรียก API เพื่อให้ทดสอบได้โดยไม่ต้องมี API key ระบบเขียนได้แค่ `tests/history/decay.jsonl` กับ GitHub issue เท่านั้น **ไม่แตะ `patterns.json` และ `tests/testset.json` เลย**

**เทคโนโลยี:** Node 20+ · `node:test` (built-in) · `openai` (devDependency เฉพาะ workflow) · GitHub Actions

**อ้างอิง:** [`docs/design-continuous-learning.md`](design-continuous-learning.md) — แผนนี้ครอบคลุมหัวข้อ 6 และ 8 ของเอกสารนั้น (ระบบ B อยู่ในแผนแยก)

---

## Global Constraints

ทุก task ต้องเคารพข้อเหล่านี้ ไม่ต้องเขียนซ้ำในแต่ละ task

- **runtime ของเครื่องมือที่ผู้ใช้โหลดต้องมี dependency เป็นศูนย์เสมอ** — `index.html`, `engine.js`, `patterns.json` ห้ามมี import จาก node_modules
- `openai` เป็น **devDependency เท่านั้น** และติดตั้งเฉพาะใน workflow `decay-watch` — `.github/workflows/ci.yml` ห้ามมีขั้นตอน `npm install`
- **ห้ามแก้ `patterns.json` หรือ `tests/testset.json`** ในแผนนี้ทั้งแผน
- `npm test` ต้องคืน exit 1 เมื่อเจอ hard miss เหมือนเดิม ห้ามเปลี่ยนความหมาย
- ผู้ให้บริการ LLM: **OpenAI** โมเดล `gpt-5.2` (เปลี่ยนจาก Anthropic ระหว่างทำ Task 6 ตามที่เจ้าของเลือก)
- **กฎ R3:** ฟังก์ชันใดที่ส่งข้อมูลไปให้ LLM ห้ามรับ `patterns` เป็นพารามิเตอร์ และห้ามอ่าน `patterns.json`
- คอมเมนต์และข้อความที่ผู้ใช้เห็นเขียนภาษาไทย ตามแบบของไฟล์อื่นในโปรเจกต์
- commit ทุก task แยกกัน ข้อความ commit ภาษาไทย

---

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `tools/run-tool-tests.mjs` | หาไฟล์ `*.test.mjs` ใน `tools/` แล้วส่งให้ `node --test` — ล้มถ้าหาไม่เจอ | 1 |
| `tools/lib/decay-store.mjs` | อ่าน/เขียน/วิเคราะห์แนวโน้มจาก `decay.jsonl` — บริสุทธิ์ ไม่รู้จัก engine | 2 |
| `tools/lib/decay-store.test.mjs` | ทดสอบข้างบน | 2 |
| `tools/lib/case-runner.mjs` | ให้คะแนนเคสด้วย engine — รับ engine เข้ามา ไม่สร้างเอง | 3 |
| `tools/lib/case-runner.test.mjs` | ทดสอบข้างบน | 3 |
| `tools/lib/generate-cases.mjs` | สร้างเคสด้วย LLM — แยกส่วนบริสุทธิ์ (prompt, validate) ออกจากการเรียก API | 4 |
| `tools/lib/generate-cases.test.mjs` | ทดสอบเฉพาะส่วนบริสุทธิ์ ไม่เรียก API | 4 |
| `tests/fixtures/scam-seeds.json` | ตัวอย่างสแกมจริงสำหรับป้อน LLM | 4 |
| `tests/fixtures/generated-sample.json` | ผลลัพธ์ตัวอย่าง ใช้กับ `--dry-run` และการทดสอบ | 4 |
| `tools/watch-decay.mjs` | ประกอบทุกอย่าง เป็น CLI | 5 |
| `tests/history/decay.jsonl` | บันทึกคะแนนย้อนหลัง (สร้างตอนรันครั้งแรก) | 5 |
| `.github/workflows/decay-watch.yml` | cron รายสัปดาห์ | 6 |
| `tools/check-provenance.mjs` | บังคับกฎ R1 — CI ข้อ 5 และ 6 | 7 |
| `tests/fixtures/grandfathered-patterns.json` | รายชื่อ id ของ pattern เดิม 164 ตัวที่ยกเว้นให้ | 7 |
| `tools/check-provenance.test.mjs` | ทดสอบข้างบน | 7 |

---

## Task 1: ตั้งเครื่องมือทดสอบสำหรับ tools/

โปรเจกต์ยังไม่มีที่ทดสอบฟังก์ชันย่อย มีแต่ `tests/run-tests.js` ที่เป็น runner เฉพาะของชุด pattern งานนี้วางฐานให้ทุก task ที่เหลือ

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Create: `tools/lib/smoke.test.mjs` (ลบทิ้งใน Task 2)

**Interfaces:**
- Produces: คำสั่ง `npm run test:tools` ที่ทุก task หลังจากนี้ใช้

- [x] **Step 1: เขียนเทสต์ที่ต้องผ่านอยู่แล้ว เพื่อพิสูจน์ว่า runner ทำงาน**

สร้าง `tools/lib/smoke.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('node:test ใช้งานได้', () => {
  assert.equal(1 + 1, 2);
});
```

- [x] **Step 2: รันแล้วต้องล้มเพราะยังไม่มี script**

```bash
npm run test:tools
```

คาดหวัง: `npm ERR! Missing script: "test:tools"`

- [x] **Step 3: เขียนตัวรันเทสต์ แล้วเพิ่ม script**

> **แก้จากแผนเดิมตอนลงมือจริง** — แผนเดิมเขียนว่าใช้ `node --test` เปล่า ๆ แต่พอรันจริงพบว่า
> มันหยิบ `test-core.js` ไปรันด้วย เพราะชื่อตรงกับรูปแบบ `test-*.js` ที่ Node ถือว่าเป็นไฟล์เทสต์
> ทดสอบทั้ง 3 เวอร์ชันแล้วได้ผลดังนี้
>
> | คำสั่ง | Node 20 | Node 22 | Node 24 |
> |---|---|---|---|
> | `node --test` | หยิบ `test-core.js` | หยิบ | หยิบ |
> | `node --test tools/` | ใช้ได้ | **pass 0 เงียบ ๆ** | **pass 0 เงียบ ๆ** |
> | ระบุไฟล์ตรง ๆ | ✓ | ✓ | ✓ |
>
> `node --test tools/` บน Node 22 ขึ้นไปให้ `pass 0` โดยไม่แจ้งอะไร — **CI จะเขียวทั้งที่ไม่ได้รันเทสต์เลย**
> ซึ่งอันตรายกว่าล้ม จึงต้องระบุไฟล์ตรง ๆ และให้ตัวรันล้มเมื่อหาไฟล์ไม่เจอ

สร้าง `tools/run-tool-tests.mjs`

```js
#!/usr/bin/env node
/**
 * รันเทสต์ของเครื่องมือใน tools/ โดยหาไฟล์เองแล้วส่งให้ node --test ตรง ๆ
 * (เหตุผลที่ต้องมีไฟล์นี้อยู่ในคอมเมนต์หัวไฟล์จริง)
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
```

แก้ `package.json` เพิ่มบรรทัดใน `scripts` (วางต่อจาก `"test:report"`)

```json
"test:tools": "node tools/run-tool-tests.mjs"
```

- [x] **Step 4: รันแล้วต้องผ่าน**

```bash
npm run test:tools
```

คาดหวัง: `# pass 1` และ exit 0

- [x] **Step 5: ต่อเข้า CI**

แก้ `.github/workflows/ci.yml` แทรก step ใหม่ **หลัง** step ชื่อ `ชุดทดสอบ` และ **ก่อน** step `build ไฟล์ standalone ได้`

```yaml
      # ทดสอบฟังก์ชันย่อยของเครื่องมือใน tools/ แยกจากชุดทดสอบ pattern
      # ไม่ต้อง npm install เพราะใช้ node:test ที่ติดมากับ Node
      - name: ชุดทดสอบของ tools/
        run: npm run test:tools
```

- [x] **Step 6: ตรวจว่า CI ทั้งชุดยังผ่านในเครื่อง**

```bash
npm test && npm run test:tools && node build.js && git diff --exit-code --stat dist/
```

คาดหวัง: ผ่านหมด exit 0

- [x] **Step 7: Commit**

```bash
git add package.json .github/workflows/ci.yml tools/lib/smoke.test.mjs
git commit -m "chore: เพิ่ม node:test สำหรับทดสอบฟังก์ชันใน tools/

ใช้ node:test ที่ติดมากับ Node จึงไม่เพิ่ม dependency ให้โปรเจกต์
แยกจาก npm test ที่เป็น runner ของชุด pattern และยังคืน exit 1
เมื่อเจอ hard miss เหมือนเดิม"
```

---

## Task 2: `decay-store.mjs` — เก็บและวิเคราะห์แนวโน้ม

ส่วนบริสุทธิ์ที่สุดของระบบ ไม่รู้จัก engine ไม่รู้จัก LLM รู้แค่รูปแบบข้อมูล

**Files:**
- Create: `tools/lib/decay-store.mjs`
- Create: `tools/lib/decay-store.test.mjs`
- Delete: `tools/lib/smoke.test.mjs`

**Interfaces:**
- Produces:
  - `parseJsonl(text: string) → object[]`
  - `readHistory(path: string) → Promise<object[]>` (คืน `[]` ถ้าไฟล์ยังไม่มี)
  - `appendEntry(path: string, entry: object) → Promise<void>`
  - `assessTrend(history: object[], opts?) → { status, ... }` โดย `status` เป็นหนึ่งใน `'insufficient-data' | 'ok' | 'decay' | 'engine-regression'`
  - รูปแบบหนึ่งบรรทัดใน history: `{ date, patternsVersion, seedsVersion, generated: {n, caught, recall}, control: {n, correct, recall, hard}, model }`

- [x] **Step 1: เขียนเทสต์ที่ยังล้ม**

สร้าง `tools/lib/decay-store.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseJsonl, readHistory, appendEntry, assessTrend } from './decay-store.mjs';

/** สร้างหนึ่งบรรทัดของประวัติ ใช้ย่อในเทสต์ */
const entry = (genRecall, ctlRecall = 0.788) => ({
  date: '2026-01-01', patternsVersion: '0.5.0', seedsVersion: '1.0.0',
  generated: { n: 50, caught: Math.round(genRecall * 50), recall: genRecall },
  control: { n: 56, correct: Math.round(ctlRecall * 56), recall: ctlRecall, hard: 0 },
  model: 'gpt-5.2'
});

test('parseJsonl ข้ามบรรทัดว่างและช่องว่าง', () => {
  assert.deepEqual(parseJsonl('{"a":1}\n\n  \n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
});

test('parseJsonl คืน array ว่างเมื่อได้ข้อความว่าง', () => {
  assert.deepEqual(parseJsonl(''), []);
});

test('readHistory คืน array ว่างเมื่อไฟล์ยังไม่มี', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'decay-'));
  assert.deepEqual(await readHistory(join(dir, 'ยังไม่มี.jsonl')), []);
});

test('appendEntry สร้างโฟลเดอร์ให้เองและต่อท้ายได้', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'decay-'));
  const path = join(dir, 'ลึก/เข้าไป/decay.jsonl');
  await appendEntry(path, entry(0.42));
  await appendEntry(path, entry(0.40));
  const lines = (await readFile(path, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).generated.recall, 0.40);
});

test('assessTrend บอกว่าข้อมูลยังไม่พอ', () => {
  const r = assessTrend([entry(0.42), entry(0.41)]);
  assert.equal(r.status, 'insufficient-data');
  assert.equal(r.need, 6);
  assert.equal(r.have, 2);
});

test('assessTrend คืน ok เมื่อคะแนนนิ่ง', () => {
  const h = [0.42, 0.43, 0.41, 0.42, 0.42, 0.43].map(x => entry(x));
  assert.equal(assessTrend(h).status, 'ok');
});

test('assessTrend คืน decay เมื่อเคสสร้างใหม่ตกแต่ชุดควบคุมนิ่ง', () => {
  const h = [
    entry(0.42), entry(0.43), entry(0.41), entry(0.42),   // ฐาน เฉลี่ย 0.42
    entry(0.28), entry(0.26)                               // สองรอบล่าสุด ตกเกิน 0.10
  ];
  const r = assessTrend(h);
  assert.equal(r.status, 'decay');
  assert.ok(Math.abs(r.baseGenerated - 0.42) < 0.01);
});

test('assessTrend คืน engine-regression เมื่อตกทั้งคู่', () => {
  const h = [
    entry(0.42, 0.79), entry(0.43, 0.79), entry(0.41, 0.78), entry(0.42, 0.79),
    entry(0.28, 0.60), entry(0.26, 0.58)
  ];
  assert.equal(assessTrend(h).status, 'engine-regression');
});

test('assessTrend ไม่เตือนเมื่อตกแค่รอบเดียว', () => {
  const h = [
    entry(0.42), entry(0.43), entry(0.41), entry(0.42),
    entry(0.28), entry(0.42)   // รอบล่าสุดกลับมาปกติ
  ];
  assert.equal(assessTrend(h).status, 'ok');
});
```

- [x] **Step 2: รันแล้วต้องล้ม**

```bash
node --test tools/lib/decay-store.test.mjs
```

คาดหวัง: `Cannot find module` เพราะยังไม่มี `decay-store.mjs`

- [x] **Step 3: เขียนโค้ดให้ผ่าน**

สร้าง `tools/lib/decay-store.mjs`

```js
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
```

- [x] **Step 4: รันแล้วต้องผ่านทั้ง 9 เทสต์**

```bash
node --test tools/lib/decay-store.test.mjs
```

คาดหวัง: `# pass 9` `# fail 0`

- [x] **Step 5: ลบไฟล์ smoke ที่ไม่ต้องใช้แล้ว แล้วรันทั้งชุด**

```bash
rm tools/lib/smoke.test.mjs
npm run test:tools
```

คาดหวัง: `# pass 9` `# fail 0`

- [x] **Step 6: Commit**

```bash
git add tools/lib/decay-store.mjs tools/lib/decay-store.test.mjs
git rm tools/lib/smoke.test.mjs
git commit -m "feat(watch): เก็บและวิเคราะห์แนวโน้มคะแนนจาก decay.jsonl

assessTrend ใช้ชุดควบคุมแยกว่าคะแนนที่ตกคือการเสื่อมจริง หรือมีคนแก้
engine จนพัง และเตือนเฉพาะเมื่อตกติดกันหลายรอบ เพราะเคสที่ LLM สร้าง
ต่างกันทุกรอบจึงมี noise ตามธรรมชาติ"
```

---

## Task 3: `case-runner.mjs` — ให้คะแนนเคสด้วย engine

**Files:**
- Create: `tools/lib/case-runner.mjs`
- Create: `tools/lib/case-runner.test.mjs`

**Interfaces:**
- Consumes: `createEngine` จาก `../../engine.js`, `runSuite` จาก `../../test-core.js`
- Produces:
  - `scoreScamCases(engine, cases) → { n, caught, recall, missed }` — ใช้กับเคสที่คาดว่าเป็นสแกมทั้งหมด
  - `scoreControlSuite(engine, testset) → { n, correct, recall, hard }`

- [x] **Step 1: เขียนเทสต์ที่ยังล้ม**

สร้าง `tools/lib/case-runner.test.mjs`

```js
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
```

- [x] **Step 2: รันแล้วต้องล้ม**

```bash
node --test tools/lib/case-runner.test.mjs
```

คาดหวัง: `Cannot find module './case-runner.mjs'`

- [x] **Step 3: เขียนโค้ดให้ผ่าน**

สร้าง `tools/lib/case-runner.mjs`

```js
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
```

- [x] **Step 4: รันแล้วต้องผ่าน**

```bash
npm run test:tools
```

คาดหวัง: `# pass 13` `# fail 0`

- [x] **Step 5: Commit**

```bash
git add tools/lib/case-runner.mjs tools/lib/case-runner.test.mjs
git commit -m "feat(watch): ให้คะแนนเคสด้วย engine

scoreControlSuite เรียก runSuite ตัวเดียวกับ npm test ตัวเลขจึงมาจาก
สูตรชุดเดียวกันเสมอ ไม่มีทางเพี้ยนออกจากกัน"
```

---

## Task 4: สร้างเคสด้วย LLM — แยกส่วนบริสุทธิ์ออกจากการเรียก API

**Files:**
- Create: `tools/lib/generate-cases.mjs`
- Create: `tools/lib/generate-cases.test.mjs`
- Create: `tests/fixtures/scam-seeds.json`
- Create: `tests/fixtures/generated-sample.json`
- Modify: `package.json` (เพิ่ม devDependency)

**Interfaces:**
- Produces:
  - `CASE_SCHEMA` — JSON Schema ที่บังคับรูปแบบผลลัพธ์
  - `buildPrompt(seeds, count) → string`
  - `validateGenerated(result, seeds) → { cases, errors }` — คัดเคสที่ใช้ไม่ได้ทิ้ง
  - `generateCases({ seeds, count, apiKey, model }) → Promise<{ cases, errors }>`
  - รูปแบบ seed: `{ id, lang, text, category, firstSeen, source }`
  - รูปแบบเคสที่สร้างได้: `{ text, lang, seedId, technique, expect: 'scam' }`

- [x] **Step 1: สร้างไฟล์ seed**

สร้าง `tests/fixtures/scam-seeds.json` — ตัวอย่างสแกมจริงสำหรับป้อน LLM **ไม่ใช่คลังคำ**

```json
{
  "version": "1.0.0",
  "updated": "2026-08-11",
  "note": "ตัวอย่างข้อความสแกมจริงสำหรับป้อนให้ LLM สร้างเคสกัด — ไม่ใช่ pattern และไม่เกี่ยวกับ patterns.json ห้ามเอาคำจากไฟล์นี้ไปใส่คลังคำโดยตรง ต้องผ่านเคสทดสอบก่อนตามกฎ R1",
  "seeds": [
    { "id": "sd001", "lang": "th", "category": "delivery", "firstSeen": "2026-01-15", "source": "ประกาศเตือนสาธารณะ",
      "text": "พัสดุตกค้างที่ศุลกากร กรุณาชำระค่าธรรมเนียมพัสดุ 45 บาท ภายใน 24 ชั่วโมง" },
    { "id": "sd002", "lang": "th", "category": "account_threat", "firstSeen": "2026-02-03", "source": "ประกาศเตือนสาธารณะ",
      "text": "ธนาคารแจ้งเตือน ตรวจพบธุรกรรมผิดปกติ บัญชีจะถูกระงับ กรุณายืนยันข้อมูลด่วน" },
    { "id": "sd003", "lang": "th", "category": "loan", "firstSeen": "2026-02-20", "source": "ประกาศเตือนสาธารณะ",
      "text": "คุณได้รับสิทธิ์กู้เงินฉุกเฉิน 50,000 บาท อนุมัติไว ไม่เช็คบูโร ไม่ต้องใช้เอกสาร" },
    { "id": "sd004", "lang": "th", "category": "job", "firstSeen": "2026-03-05", "source": "ประกาศเตือนสาธารณะ",
      "text": "รับสมัครงานพาร์ทไทม์ กดไลค์คลิปละ 50 บาท รายได้วันละ 1,500 ทำที่บ้านได้" },
    { "id": "sd005", "lang": "th", "category": "impersonate_gov", "firstSeen": "2026-03-18", "source": "ประกาศเตือนสาธารณะ",
      "text": "กรมสรรพากรแจ้ง ท่านได้รับสิทธิ์เงินคืนภาษี 4,500 บาท กดลิงก์เพื่อยืนยันตัวตน" },
    { "id": "sd006", "lang": "th", "category": "personal_money", "firstSeen": "2026-04-02", "source": "ประกาศเตือนสาธารณะ",
      "text": "เจ้าหน้าที่ธนาคารติดต่อ บัญชีของท่านพัวพันคดีฟอกเงิน กรุณาโอนเงินไปบัญชีปลอดภัย" },
    { "id": "sd007", "lang": "en", "category": "otp_request", "firstSeen": "2026-04-19", "source": "ประกาศเตือนสาธารณะ",
      "text": "Support here. We need to verify a suspicious login, please send your OTP so we can cancel it." },
    { "id": "sd008", "lang": "en", "category": "delivery", "firstSeen": "2026-05-07", "source": "ประกาศเตือนสาธารณะ",
      "text": "Your package could not be delivered due to an unpaid customs fee. Pay here to reschedule." },
    { "id": "sd009", "lang": "en", "category": "investment", "firstSeen": "2026-05-24", "source": "ประกาศเตือนสาธารณะ",
      "text": "Guaranteed returns of 30% monthly with zero risk. Double your money in 7 days, message us to start." },
    { "id": "sd010", "lang": "th", "category": "app_install", "firstSeen": "2026-06-11", "source": "ประกาศเตือนสาธารณะ",
      "text": "แจ้งเตือนจากกรมการปกครอง กรุณาติดตั้งแอปเวอร์ชันใหม่เพื่อยืนยันตัวตน" }
  ]
}
```

- [x] **Step 2: สร้างไฟล์ผลลัพธ์ตัวอย่างสำหรับ `--dry-run` และเทสต์**

สร้าง `tests/fixtures/generated-sample.json`

```json
{
  "cases": [
    { "text": "ของท่านค้างที่ด่าน ต้องจ่ายค่าภาษีนำเข้า 45 บ. ก่อนถึงจะปล่อยของ", "lang": "th", "seedId": "sd001", "technique": "เลี่ยงคำว่าศุลกากรและพัสดุตกค้าง" },
    { "text": "บช. ของท่านจะถูกปิดชั่วคราว โปรดยืนยันตนภายในวันนี้", "lang": "th", "seedId": "sd002", "technique": "ย่อคำว่าบัญชี" },
    { "text": "Kindly reply with the 6 digit code we just sent so we can cancel the transaction.", "lang": "en", "seedId": "sd007", "technique": "ขอ OTP โดยไม่ใช้คำว่า OTP" },
    { "text": "สนใจงานเสริมมั้ยคะ ทำผ่านมือถือ วันละ 3 ชม. ได้เงินทุกวัน", "lang": "th", "seedId": "sd004", "technique": "เลี่ยงคำว่าพาร์ทไทม์และรายได้วันละ" },
    { "text": "ท่านมีสิทธิ์รับเงินช่วยเหลือจากภาครัฐ 3,000 บาท ลงทะเบียนก่อนหมดเขต", "lang": "th", "seedId": "sd005", "technique": "เปลี่ยนจากเงินคืนภาษีเป็นเงินช่วยเหลือ" }
  ]
}
```

- [x] **Step 3: เขียนเทสต์ที่ยังล้ม**

สร้าง `tools/lib/generate-cases.test.mjs` — ทดสอบเฉพาะส่วนบริสุทธิ์ **ไม่เรียก API และไม่ต้องมี key**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildPrompt, validateGenerated, CASE_SCHEMA } from './generate-cases.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const seedsFile = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/scam-seeds.json'), 'utf8'));
const sample = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/generated-sample.json'), 'utf8'));
const seeds = seedsFile.seeds;

test('buildPrompt ใส่ข้อความของทุก seed ลงไป', () => {
  const prompt = buildPrompt(seeds, 50);
  for (const s of seeds) assert.ok(prompt.includes(s.text), `ไม่พบ seed ${s.id} ใน prompt`);
});

test('buildPrompt บอกจำนวนที่ต้องการ', () => {
  assert.ok(buildPrompt(seeds, 37).includes('37'));
});

test('กฎ R3 — prompt ต้องไม่มีคำจากคลังคำหลุดเข้าไป', async () => {
  const patterns = JSON.parse(await readFile(join(ROOT, 'patterns.json'), 'utf8'));
  const prompt = buildPrompt(seeds, 50);
  // สุ่มตรวจคำที่มีเฉพาะในคลังคำ ไม่ได้อยู่ในข้อความ seed
  const onlyInLibrary = patterns.scam
    .map(p => p.match)
    .filter(m => m.length > 6 && !seeds.some(s => s.text.includes(m)));
  const leaked = onlyInLibrary.filter(m => prompt.includes(m));
  assert.deepEqual(leaked, [], `มีคำจากคลังคำหลุดเข้า prompt: ${leaked.join(', ')}`);
});

test('validateGenerated ติด expect: scam ให้ทุกเคส', () => {
  const { cases } = validateGenerated(sample, seeds);
  assert.equal(cases.length, 5);
  assert.ok(cases.every(c => c.expect === 'scam'));
});

test('validateGenerated ตัดเคสที่ seedId ไม่มีจริงทิ้ง', () => {
  const bad = { cases: [{ text: 'ข้อความยาวพอสมควรสำหรับทดสอบ', lang: 'th', seedId: 'ไม่มีจริง', technique: 'x' }] };
  const { cases, errors } = validateGenerated(bad, seeds);
  assert.equal(cases.length, 0);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('ไม่มีจริง'));
});

test('validateGenerated ตัดเคสที่ข้อความสั้นเกินไปทิ้ง', () => {
  const bad = { cases: [{ text: 'สั้น', lang: 'th', seedId: 'sd001', technique: 'x' }] };
  const { cases, errors } = validateGenerated(bad, seeds);
  assert.equal(cases.length, 0);
  assert.equal(errors.length, 1);
});

test('validateGenerated ไม่พังเมื่อได้ผลลัพธ์ว่างหรือ null', () => {
  assert.deepEqual(validateGenerated(null, seeds).cases, []);
  assert.deepEqual(validateGenerated({}, seeds).cases, []);
});

test('CASE_SCHEMA ปิด additionalProperties ทุกชั้น', () => {
  assert.equal(CASE_SCHEMA.additionalProperties, false);
  assert.equal(CASE_SCHEMA.properties.cases.items.additionalProperties, false);
});
```

- [x] **Step 4: รันแล้วต้องล้ม**

```bash
node --test tools/lib/generate-cases.test.mjs
```

คาดหวัง: `Cannot find module './generate-cases.mjs'`

- [x] **Step 5: เขียนโค้ดให้ผ่าน**

สร้าง `tools/lib/generate-cases.mjs`

```js
/**
 * สร้างเคสกัดใหม่จากตัวอย่างสแกมจริง เพื่อวัดว่า engine ยังตามคนร้ายทันไหม
 *
 * ★★ กฎ R3 ในเอกสารออกแบบ — ห้ามให้ LLM เห็น patterns.json ★★
 *
 * ฟังก์ชันในไฟล์นี้จึงไม่รับคลังคำเป็นพารามิเตอร์เลย และห้ามเพิ่มภายหลัง
 * ถ้า LLM เห็นคลังคำ มันจะเขียนเคสที่วนอยู่รอบคำที่มีอยู่แล้ว ซึ่งคือกับดัก
 * เดียวกับ regression_v03 แค่เปลี่ยนคนออกข้อสอบเป็น AI
 *
 * ส่วนบริสุทธิ์ (buildPrompt, validateGenerated) แยกจากการเรียก API
 * เพื่อให้ทดสอบได้ครบโดยไม่ต้องมี API key
 */

/** บังคับรูปแบบผลลัพธ์ด้วย structured outputs จะได้ไม่ต้อง parse ข้อความอิสระ */
export const CASE_SCHEMA = {
  type: 'object',
  properties: {
    cases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'ข้อความสแกมที่เขียนใหม่' },
          lang: { type: 'string', enum: ['th', 'en'] },
          seedId: { type: 'string', description: 'id ของตัวอย่างที่ใช้เป็นต้นแบบ' },
          technique: { type: 'string', description: 'เทคนิคที่ใช้เลี่ยงคำ' }
        },
        required: ['text', 'lang', 'seedId', 'technique'],
        additionalProperties: false
      }
    }
  },
  required: ['cases'],
  additionalProperties: false
};

export function buildPrompt(seeds, count) {
  const examples = seeds.map(s => `- [${s.id}] (${s.lang}) ${s.text}`).join('\n');

  return `งานนี้เป็นการทดสอบความทนทานของเครื่องมือคัดกรองข้อความหลอกลวงทางการเงิน \
เพื่อวัดว่าเครื่องมือยังจับสแกมได้อยู่ไหมเมื่อคนร้ายเปลี่ยนคำ ผลลัพธ์ใช้เป็นชุดทดสอบภายในเท่านั้น

ด้านล่างคือข้อความหลอกลวงที่เคยระบาดจริงและถูกประกาศเตือนต่อสาธารณะแล้ว

${examples}

เขียนข้อความใหม่ ${count} ข้อความ ที่มีเจตนาเดียวกันกับตัวอย่างข้างบน แต่ใช้คำคนละชุด \
เลียนแบบวิธีที่คนร้ายตัวจริงเปลี่ยนคำเพื่อหลบเครื่องมือคัดกรอง เช่น สะกดต่าง ใช้คำพ้องความหมาย \
ย่อคำ เลี่ยงศัพท์ตรง ๆ หรือเรียบเรียงประโยคใหม่

ข้อกำหนด
- กระจายให้ครบทุกตัวอย่างต้นแบบ อย่ากระจุกอยู่กับตัวอย่างเดียว
- คงสัดส่วนภาษาไทยกับอังกฤษใกล้เคียงกับตัวอย่างต้นแบบ
- ระบุ seedId ของตัวอย่างที่ใช้ และ technique ที่ใช้เลี่ยงคำ
- ห้ามใส่เบอร์โทร ชื่อ หรือเลขบัญชีของบุคคลจริง`;
}

/** คัดเคสที่ใช้ไม่ได้ทิ้ง แล้วติด expect: scam ให้ที่เหลือ */
export function validateGenerated(result, seeds) {
  const seedIds = new Set(seeds.map(s => s.id));
  const errors = [];
  const cases = [];

  const items = Array.isArray(result?.cases) ? result.cases : [];
  for (const [i, c] of items.entries()) {
    if (typeof c?.text !== 'string' || c.text.trim().length < 10) {
      errors.push(`เคสที่ ${i}: ข้อความสั้นเกินไปหรือไม่ใช่ข้อความ`);
      continue;
    }
    if (!seedIds.has(c.seedId)) {
      errors.push(`เคสที่ ${i}: seedId "${c.seedId}" ไม่มีในรายการต้นแบบ`);
      continue;
    }
    cases.push({
      id: `gen_${String(i + 1).padStart(3, '0')}`,
      text: c.text.trim(),
      lang: c.lang,
      seedId: c.seedId,
      technique: c.technique,
      expect: 'scam'
    });
  }

  return { cases, errors };
}

/**
 * เรียก API จริง — ส่วนเดียวในไฟล์นี้ที่มี I/O
 * โยน error เมื่อถูกปฏิเสธหรือ API ล่ม ให้ผู้เรียกตัดสินใจว่าจะทำยังไงต่อ
 */
export async function generateCases({ seeds, count, apiKey, model = 'gpt-5.2' }) {
  const { default: OpenAI } = await import('openai');
  const client = new Anthropic({ apiKey });

  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: CASE_SCHEMA } },
    messages: [{ role: 'user', content: buildPrompt(seeds, count) }]
  });

  // ตัวจำแนกด้านความปลอดภัยอาจปฏิเสธคำขอที่ให้เขียนข้อความหลอกลวง
  // ต้องเช็คก่อนอ่านผลลัพธ์เสมอ ไม่งั้นจะได้ค่าว่างแล้วนึกว่าระบบเสื่อม
  if (response.stop_reason === 'refusal') {
    const err = new Error(`ถูกปฏิเสธ: ${response.stop_details?.category ?? 'ไม่ระบุ'}`);
    err.refusal = true;
    throw err;
  }

  return validateGenerated(response.parsed_output, seeds);
}
```

- [x] **Step 6: เพิ่ม devDependency**

แก้ `package.json` เพิ่มบล็อกนี้ **หลัง** `"scripts"`

```json
  "devDependencies": {
    "openai": "^7.4.0"
  }
```

> **เปลี่ยนผู้ให้บริการเป็น OpenAI ระหว่างทำ Task 6 ตามที่เจ้าของเลือก** — `openai` เวอร์ชัน `7.4.0`
> เปลี่ยนเฉพาะฟังก์ชัน `generateCases()` ส่วนบริสุทธิ์และเทสต์ทั้ง 8 ข้อไม่ต้องแตะเลย
> ยืนยันด้วยการเรียกจริงด้วย key ปลอมแล้วได้ `401` ไม่ใช่ `400` แปลว่าพารามิเตอร์ถูกรูป

> ติดตั้งเฉพาะใน workflow `decay-watch` เท่านั้น — `ci.yml` ยังไม่มีขั้นตอน `npm install` และ runtime ที่ผู้ใช้โหลดยังมี dependency เป็นศูนย์เหมือนเดิม

- [x] **Step 7: รันแล้วต้องผ่านทั้ง 8 เทสต์**

```bash
npm run test:tools
```

คาดหวัง: `# pass 21` `# fail 0` (9 + 4 + 8)

- [x] **Step 8: Commit**

```bash
git add tools/lib/generate-cases.mjs tools/lib/generate-cases.test.mjs \
        tests/fixtures/scam-seeds.json tests/fixtures/generated-sample.json package.json
git commit -m "feat(watch): สร้างเคสกัดด้วย LLM โดยไม่ให้เห็นคลังคำ

บังคับกฎ R3 ด้วยโครงสร้าง — ฟังก์ชันไม่รับ patterns เป็นพารามิเตอร์เลย
และมีเทสต์ที่ตรวจว่าไม่มีคำจากคลังคำหลุดเข้า prompt

แยกส่วนบริสุทธิ์ (buildPrompt, validateGenerated) ออกจากการเรียก API
จึงทดสอบได้ครบโดยไม่ต้องมี API key

เช็ค stop_reason === 'refusal' ก่อนอ่านผลลัพธ์เสมอ เพราะตัวจำแนกอาจ
ปฏิเสธคำขอที่ให้เขียนข้อความหลอกลวง ถ้าไม่เช็คจะได้ค่าว่างแล้วนึกว่าเสื่อม"
```

---

## Task 5: `watch-decay.mjs` — ประกอบเป็น CLI

**Files:**
- Create: `tools/watch-decay.mjs`
- Modify: `package.json` (เพิ่ม script `watch:decay`)

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 2, 3, 4
- Produces: คำสั่ง `npm run watch:decay` และไฟล์ `tests/history/decay.jsonl`
- Exit code: `0` ปกติ · `1` ผิดพลาดร้ายแรง · `2` สร้างเคสไม่สำเร็จ (ไม่บันทึกอะไร)

> **แก้จากแผนเดิมตอนลงมือจริง** — ด่านตรวจ `cases.length < count * 0.5` ทำให้ `--dry-run`
> ล้มทุกครั้ง เพราะ fixture มี 5 เคสแต่ `--count` ตั้งต้นเป็น 50 (`5 < 25`)
> ต้องยกเว้นด่านนี้ในโหมดทดลอง — ด่านมีไว้กันการเรียก API จริงที่ได้เคสไม่ครบ
>
> และเก็บ `package-lock.json` เข้า repo ด้วย เพื่อให้ workflow ใน Task 6 ใช้ `npm ci`
> ได้ผลเหมือนกันทุกครั้ง แทน `npm install --no-save` ที่ไม่ pin อะไรเลย

- [x] **Step 1: เขียนสคริปต์**

สร้าง `tools/watch-decay.mjs`

```js
#!/usr/bin/env node
/**
 * เฝ้าระวังการเสื่อมของความแม่นยำ
 *
 *   node tools/watch-decay.mjs --dry-run       ใช้ผลลัพธ์ตัวอย่าง ไม่เรียก API
 *   node tools/watch-decay.mjs --count 50      เรียก API จริง ต้องมี OPENAI_API_KEY
 *   node tools/watch-decay.mjs --no-write      รันแต่ไม่บันทึกลง decay.jsonl
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
import { generateCases, validateGenerated } from './lib/generate-cases.mjs';

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

const count = Number(arg('--count', 50));
const model = arg('--model', 'gpt-5.2');

/* ---------- สร้างเคส ---------- */
let generated;
if (has('--dry-run')) {
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

if (generated.cases.length < Math.floor(count * 0.5)) {
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
  model: has('--dry-run') ? 'dry-run' : model
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
```

- [x] **Step 2: เพิ่ม script**

แก้ `package.json` เพิ่มใน `scripts` ต่อจาก `"compare"`

```json
"watch:decay": "node tools/watch-decay.mjs"
```

- [x] **Step 3: รันโหมดทดลองโดยไม่บันทึก**

```bash
npm run watch:decay -- --dry-run --no-write
```

คาดหวัง: พิมพ์คะแนนของทั้งสองชุด, สถานะ `insufficient-data`, exit 0 และ **ไม่มีไฟล์ `tests/history/decay.jsonl` เกิดขึ้น**

- [x] **Step 4: ตรวจว่าไม่แตะไฟล์ที่ห้ามแตะ**

```bash
git status --porcelain patterns.json tests/testset.json
```

คาดหวัง: ไม่มีผลลัพธ์ (สองไฟล์นี้ต้องไม่ถูกแก้)

- [x] **Step 5: รันโหมดทดลองแบบบันทึกจริง**

```bash
npm run watch:decay -- --dry-run
cat tests/history/decay.jsonl
```

คาดหวัง: มีหนึ่งบรรทัด JSON ที่มีคีย์ `date`, `generated`, `control`, `model: "dry-run"`

- [x] **Step 6: ลบบรรทัดทดลองทิ้ง ไม่ให้ปนกับข้อมูลจริง**

```bash
rm tests/history/decay.jsonl
```

- [x] **Step 7: Commit**

```bash
git add tools/watch-decay.mjs package.json
git commit -m "feat(watch): CLI เฝ้าระวังการเสื่อม

รันได้ 3 โหมด: --dry-run ใช้ผลลัพธ์ตัวอย่างไม่เรียก API, --no-write
รันโดยไม่บันทึก, และโหมดปกติที่เรียก API จริง

ออกด้วย exit 2 เมื่อสร้างเคสไม่สำเร็จหรือได้เคสน้อยกว่าครึ่ง โดยไม่บันทึก
อะไรเลย เพราะบันทึกคะแนนจากเคสไม่ครบจะทำให้ดูเหมือนระบบเสื่อมทั้งที่ไม่ใช่"
```

---

## Task 6: workflow รายสัปดาห์

**Files:**
- Create: `.github/workflows/decay-watch.yml`

**Interfaces:**
- Consumes: `npm run watch:decay`, secret `OPENAI_API_KEY`
- Produces: commit ที่เพิ่มบรรทัดใน `tests/history/decay.jsonl` และ issue เมื่อพบการเสื่อม

> **แก้จากแผนเดิมตอนลงมือจริง — สองข้อ**
>
> 1. **heredoc ปิดไม่ได้ใน YAML** — ตัวปิด `EOF` ต้องอยู่ต้นบรรทัดเสมอ ซึ่งขัดกับการย่อหน้า
>    ของ YAML ถ้าใช้ตามแผนเดิม สคริปต์จะพังแบบหาสาเหตุยาก เปลี่ยนไปใช้ `printf '%s\n'` แทน
> 2. **`inputs.count` แทรกลงบรรทัดคำสั่งตรง ๆ ไม่ได้** — ค่าที่ใส่มาจะกลายเป็นคำสั่ง shell ได้
>    ย้ายไปผ่าน `env:` ใส่เครื่องหมายคำพูด และเพิ่มด่านตรวจว่าเป็นตัวเลขล้วน
>
> และเปลี่ยน `npm install --no-save` เป็น `npm ci` เพราะตอนนี้มี `package-lock.json` แล้ว
> จึงได้เวอร์ชันเดียวกันทุกสัปดาห์

- [x] **Step 1: เขียน workflow**

สร้าง `.github/workflows/decay-watch.yml`

```yaml
name: decay-watch

on:
  schedule:
    # ทุกวันจันทร์ 02:00 UTC = 09:00 ตามเวลาไทย
    - cron: '0 2 * * 1'
  workflow_dispatch:
    inputs:
      count:
        description: 'จำนวนเคสที่จะสร้าง'
        required: false
        default: '50'

permissions:
  contents: write        # เพื่อ commit decay.jsonl กลับเข้า repo
  issues: write          # เพื่อเปิด issue เมื่อพบการเสื่อม

# กันไม่ให้รันซ้อนกันจนแย่งกัน push บรรทัดเดียวกัน
concurrency:
  group: decay-watch
  cancel-in-progress: false

jobs:
  watch:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: '22'

      # workflow นี้เป็นที่เดียวที่ติดตั้ง dependency
      # ci.yml ยังไม่มีขั้นตอนนี้ และ runtime ที่ผู้ใช้โหลดยังมี dependency เป็นศูนย์
      # ใช้ npm ci ไม่ใช่ npm install เพื่อให้ได้เวอร์ชันเดียวกันทุกสัปดาห์ตาม package-lock.json
      - name: ติดตั้ง dependency
        run: npm ci

      # ถ้าสร้างเคสไม่สำเร็จ สคริปต์ออกด้วย exit 2 โดยไม่บันทึกอะไร
      # ปล่อยให้ step นี้แดง เพราะระบบเฝ้าระวังที่ล้มเงียบ ๆ คือสิ่งที่โปรเจกต์นี้สร้างมาเพื่อป้องกัน
      #
      # ค่าจาก inputs ต้องผ่าน env และใส่เครื่องหมายคำพูดเสมอ ห้ามแทรกลงบรรทัดคำสั่งตรง ๆ
      # ไม่งั้นค่าที่ใส่มาจะกลายเป็นคำสั่ง shell ได้
      - name: เฝ้าระวังการเสื่อม
        id: watch
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          COUNT: ${{ inputs.count || '50' }}
        run: |
          case "$COUNT" in
            ''|*[!0-9]*) echo "✗ count ต้องเป็นตัวเลขล้วน ได้มา: $COUNT"; exit 1 ;;
          esac
          npm run watch:decay -- --count "$COUNT"

      - name: บันทึกผลกลับเข้า repo
        run: |
          if ! git status --porcelain tests/history/decay.jsonl | grep -q .; then
            echo "ไม่มีอะไรเปลี่ยน"
            exit 0
          fi
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add tests/history/decay.jsonl
          git commit -m "chore(watch): บันทึกผลเฝ้าระวัง $(date -u +%Y-%m-%d)"
          # rebase ก่อน push เผื่อมีคน push ระหว่างที่ workflow กำลังรัน
          git pull --rebase --autostash origin main
          git push

      - name: เปิด issue เมื่อพบการเสื่อม
        if: steps.watch.outputs.status == 'decay' || steps.watch.outputs.status == 'engine-regression'
        env:
          GH_TOKEN: ${{ github.token }}
          STATUS: ${{ steps.watch.outputs.status }}
          GEN: ${{ steps.watch.outputs.generated_recall }}
          CTL: ${{ steps.watch.outputs.control_recall }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          # สร้าง label ถ้ายังไม่มี — ไม่งั้น gh issue create จะล้มเพราะหา label ไม่เจอ
          gh label create decay-watch \
            --description "ผลจากระบบเฝ้าระวังการเสื่อม" --color FBCA04 2>/dev/null || true

          # ใช้ printf แทน heredoc เพราะตัวปิด heredoc ต้องอยู่ต้นบรรทัดเสมอ
          # ซึ่งขัดกับการย่อหน้าใน YAML และจะทำให้สคริปต์พังแบบหาสาเหตุยาก
          if [ "$STATUS" = "decay" ]; then
            TITLE="เฝ้าระวัง: ความแม่นยำเริ่มเสื่อม (recall เคสใหม่ ${GEN}%)"
            BODY=$(printf '%s\n' \
              "ชุดควบคุมยังนิ่งที่ ${CTL}% แต่เคสที่สร้างใหม่ตกติดกันหลายรอบ เหลือ ${GEN}%" \
              "" \
              "แปลว่าคนร้ายน่าจะใช้คำที่คลังคำยังไม่รู้จัก" \
              "" \
              "- ดูเคสที่หลุดใน [log ของรอบนี้](${RUN_URL})" \
              "- ดูแนวโน้มย้อนหลังที่ \`tests/history/decay.jsonl\`" \
              "" \
              "**สิ่งที่ควรทำต่อ** — เอาเคสที่หลุดเพิ่มเข้าชุดทดสอบก่อน แล้วค่อยแก้ pattern ตามกฎ R1" \
              "ห้ามเพิ่มคำโดยไม่มีเคสที่แดงรองรับ")
          else
            TITLE="เฝ้าระวัง: คะแนนตกทั้งสองชุด — น่าจะมีคนแก้ engine จนพัง"
            BODY=$(printf '%s\n' \
              "ทั้งเคสที่สร้างใหม่ (${GEN}%) และชุดควบคุม (${CTL}%) ตกพร้อมกัน" \
              "" \
              "กรณีนี้มักไม่ใช่การเสื่อมจากคนร้าย แต่เป็นการแก้ engine หรือ pattern ที่ทำของเดิมพัง" \
              "" \
              "- ตรวจ commit ล่าสุดที่แตะ \`engine.js\` หรือ \`patterns.json\`" \
              "- ดู [log ของรอบนี้](${RUN_URL})")
          fi

          gh issue create --title "$TITLE" --body "$BODY" --label "decay-watch"
```

- [x] **Step 2: ตรวจ YAML ว่าไม่มี tab และ parse ได้**

```bash
grep -P '\t' .github/workflows/decay-watch.yml && echo "✗ มี tab" || echo "✓ ไม่มี tab"
node -e "const s=require('fs').readFileSync('.github/workflows/decay-watch.yml','utf8'); if(/\t/.test(s)) throw new Error('tab'); console.log('✓ อ่านได้', s.split('\n').length, 'บรรทัด')"
```

- [x] **Step 3: ตรวจว่า ci.yml ยังไม่มี npm install**

```bash
grep -c "npm install\|npm ci" .github/workflows/ci.yml || echo "✓ ci.yml ยังไม่มีขั้นตอนติดตั้ง"
```

คาดหวัง: `✓ ci.yml ยังไม่มีขั้นตอนติดตั้ง`

- [x] **Step 4: Commit**

```bash
git add .github/workflows/decay-watch.yml
git commit -m "ci: workflow เฝ้าระวังการเสื่อมรายสัปดาห์

รันทุกวันจันทร์ 09:00 เวลาไทย บันทึกผลกลับเข้า repo และเปิด issue
เมื่อพบการเสื่อม โดยแยกข้อความระหว่าง 'คนร้ายเปลี่ยนคำ' กับ
'มีคนแก้ engine จนพัง' เพราะสองอย่างนี้แก้คนละวิธี

เป็น workflow เดียวที่ติดตั้ง dependency — ci.yml ยังคงไม่ต้อง npm install"
```

> **หลัง merge ต้องตั้ง secret** ที่ Settings → Secrets and variables → Actions → `OPENAI_API_KEY`
> ถ้ายังไม่ตั้ง workflow จะล้มที่ step `เฝ้าระวังการเสื่อม` ด้วย exit 1 พร้อมข้อความว่าไม่พบ key

---

## Task 7: ประตู provenance — บังคับกฎ "เคสมาก่อนคำ"

สร้างประตูก่อนที่ pattern อัตโนมัติตัวแรกจะมาถึง ถ้าสร้างทีหลังจะไม่มีวันได้สร้าง

**Files:**
- Create: `tools/check-provenance.mjs`
- Create: `tools/check-provenance.test.mjs`
- Create: `tests/fixtures/grandfathered-patterns.json`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces:
  - `checkProvenance(patterns, testset, grandfathered) → { errors: string[], checked: number, skipped: number }`
  - คำสั่ง `npm run check:provenance`

- [ ] **Step 1: สร้างรายชื่อ pattern เดิมที่ยกเว้นให้**

```bash
node -e "
const p = require('./patterns.json');
const ids = [...p.scam, ...p.legit, ...p.risk].map(x => x.id).sort();
const out = {
  note: 'รายชื่อ id ของ pattern ที่มีอยู่ก่อนวันที่เริ่มบังคับกฎ provenance — ยกเว้นให้ไม่ต้องมี src/added/case ห้ามเพิ่ม id ใหม่เข้าไฟล์นี้ ทุก pattern ที่เพิ่มหลังจากนี้ต้องบอกที่มาและอ้างเคสทดสอบที่รองรับ',
  frozenAt: '2026-08-11',
  ids
};
require('fs').writeFileSync('tests/fixtures/grandfathered-patterns.json', JSON.stringify(out, null, 2) + '\n');
console.log('บันทึก', ids.length, 'id');
"
```

คาดหวัง: `บันทึก 167 id`

- [ ] **Step 2: เขียนเทสต์ที่ยังล้ม**

สร้าง `tools/check-provenance.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkProvenance } from './check-provenance.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const realPatterns = JSON.parse(await readFile(join(ROOT, 'patterns.json'), 'utf8'));
const realTestset = JSON.parse(await readFile(join(ROOT, 'tests/testset.json'), 'utf8'));
const realGrandfathered = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/grandfathered-patterns.json'), 'utf8'));

/** ชุดข้อมูลจำลองเล็ก ๆ สำหรับทดสอบแต่ละกรณี */
const testsetStub = { sets: { field: { cases: [{ id: 'f001', text: 'x' }] } } };
const grandfatheredStub = { ids: ['s_old_001'] };

test('คลังคำจริงทั้งชุดผ่าน เพราะทุก id อยู่ในรายการยกเว้น', () => {
  const r = checkProvenance(realPatterns, realTestset, realGrandfathered);
  assert.deepEqual(r.errors, []);
  assert.equal(r.checked, 0);
  assert.equal(r.skipped, 167);
});

test('pattern เดิมที่อยู่ในรายการยกเว้น ไม่ต้องมี src/added/case', () => {
  const patterns = { scam: [{ id: 's_old_001', match: 'x', cat: 'urgency', w: 1, lang: 'th' }], legit: [], risk: [] };
  assert.deepEqual(checkProvenance(patterns, testsetStub, grandfatheredStub).errors, []);
});

test('pattern ใหม่ที่ไม่มี src ต้องแดง', () => {
  const patterns = { scam: [{ id: 's_new_001', match: 'x', cat: 'urgency', w: 1, lang: 'th', added: '2026-09-01', case: 'field/f001' }], legit: [], risk: [] };
  const r = checkProvenance(patterns, testsetStub, grandfatheredStub);
  assert.equal(r.errors.length, 1);
  assert.ok(r.errors[0].includes('src'));
});

test('pattern ใหม่ที่ไม่มี case ต้องแดง', () => {
  const patterns = { scam: [{ id: 's_new_001', match: 'x', cat: 'urgency', w: 1, lang: 'th', src: 'advisory:x', added: '2026-09-01' }], legit: [], risk: [] };
  const r = checkProvenance(patterns, testsetStub, grandfatheredStub);
  assert.equal(r.errors.length, 1);
  assert.ok(r.errors[0].includes('case'));
});

test('pattern ใหม่ที่อ้างเคสที่ไม่มีจริง ต้องแดง', () => {
  const patterns = { scam: [{ id: 's_new_001', match: 'x', cat: 'urgency', w: 1, lang: 'th', src: 'advisory:x', added: '2026-09-01', case: 'field/ไม่มีจริง' }], legit: [], risk: [] };
  const r = checkProvenance(patterns, testsetStub, grandfatheredStub);
  assert.equal(r.errors.length, 1);
  assert.ok(r.errors[0].includes('ไม่มีจริง'));
});

test('pattern ใหม่ที่มีครบทุกอย่างและอ้างเคสที่มีจริง ต้องผ่าน', () => {
  const patterns = { scam: [{ id: 's_new_001', match: 'x', cat: 'urgency', w: 1, lang: 'th', src: 'advisory:ตร.ไซเบอร์ 2026-09-01', added: '2026-09-01', case: 'field/f001' }], legit: [], risk: [] };
  const r = checkProvenance(patterns, testsetStub, grandfatheredStub);
  assert.deepEqual(r.errors, []);
  assert.equal(r.checked, 1);
});

test('ตรวจ pattern ฝั่ง legit และ risk ด้วย', () => {
  const patterns = {
    scam: [],
    legit: [{ id: 'l_new_001', match: 'x', cat: 'balance', w: 1, lang: 'th' }],
    risk: [{ id: 'r_new_001', regex: 'x', cat: 'punct', w: 1 }]
  };
  const r = checkProvenance(patterns, testsetStub, grandfatheredStub);
  assert.equal(r.errors.length, 2);
});
```

- [ ] **Step 3: รันแล้วต้องล้ม**

```bash
node --test tools/check-provenance.test.mjs
```

คาดหวัง: `Cannot find module './check-provenance.mjs'`

- [ ] **Step 4: เขียนโค้ดให้ผ่าน**

สร้าง `tools/check-provenance.mjs`

```js
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

    for (const field of REQUIRED_FIELDS) {
      if (!p[field]) {
        errors.push(`[${side}/${p.id}] ขาดฟิลด์ "${field}" — pattern ที่เพิ่มใหม่ต้องบอกที่มาและอ้างเคสที่รองรับ`);
      }
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
```

- [ ] **Step 5: รันเทสต์แล้วต้องผ่านทั้ง 7 ข้อ**

```bash
npm run test:tools
```

คาดหวัง: `# pass 28` `# fail 0` (9 + 4 + 8 + 7)

- [ ] **Step 6: รัน CLI กับคลังคำจริง**

```bash
node tools/check-provenance.mjs
```

คาดหวัง: `ตรวจ pattern ใหม่ 0 ตัว (ยกเว้นของเดิม 167 ตัว)` และ `✓ ผ่าน`

- [ ] **Step 7: พิสูจน์ว่าประตูทำงานจริง**

เขียนสคริปต์ชั่วคราวแทนการใช้ `node -e` เพราะโค้ดที่มี top-level await ใน `-e` เปราะกับลำดับ flag

สร้าง `/tmp/ทดสอบประตู.mjs`

```js
import { readFile } from 'node:fs/promises';
import { checkProvenance } from './tools/check-provenance.mjs';

const patterns = JSON.parse(await readFile('patterns.json', 'utf8'));
const testset = JSON.parse(await readFile('tests/testset.json', 'utf8'));
const grandfathered = JSON.parse(await readFile('tests/fixtures/grandfathered-patterns.json', 'utf8'));

// แทรก pattern ใหม่ที่ไม่มีที่มาเลย — ประตูต้องจับได้ 3 ข้อ (ขาด src, added, case)
patterns.scam.push({ id: 's_th_probe_gate', lang: 'th', cat: 'urgency', match: 'ทดสอบประตู', w: 1 });

const r = checkProvenance(patterns, testset, grandfathered);
if (r.errors.length !== 3) {
  console.error(`✗ ประตูไม่ทำงาน — ควรได้ 3 ข้อผิดพลาด แต่ได้ ${r.errors.length}`);
  process.exit(1);
}
console.log(`✓ ประตูทำงาน — จับได้ ${r.errors.length} ข้อ`);
for (const e of r.errors) console.log(`   ${e}`);
```

```bash
node /tmp/ทดสอบประตู.mjs
rm /tmp/ทดสอบประตู.mjs
```

> รันจาก root ของโปรเจกต์ เพราะสคริปต์อ้าง path แบบสัมพัทธ์

คาดหวัง: `✓ ประตูทำงาน — จับได้ 3 ข้อ` และ **`patterns.json` ตัวจริงต้องไม่ถูกแก้** (สคริปต์แก้แค่ในหน่วยความจำ)

- [ ] **Step 8: เพิ่ม script และต่อเข้า CI**

แก้ `package.json` เพิ่มใน `scripts`

```json
"check:provenance": "node tools/check-provenance.mjs"
```

แก้ `.github/workflows/ci.yml` แทรก step ใหม่ **หลัง** step `ชุดทดสอบของ tools/`

```yaml
      # บังคับกฎ R1 จาก docs/design-continuous-learning.md — เคสมาก่อนคำ
      # pattern ที่เพิ่มใหม่ต้องบอกที่มาและต้องอ้างเคสทดสอบที่มีอยู่จริง
      # ถ้าไม่มีขั้นตอนนี้ กฎจะเป็นแค่ความตั้งใจดีที่ค่อย ๆ ถูกละเลย
      - name: pattern ใหม่ต้องบอกที่มาและอ้างเคสที่รองรับ
        run: npm run check:provenance
```

- [ ] **Step 9: รัน CI ทั้งชุดในเครื่อง**

```bash
npm test && npm run test:tools && npm run check:provenance && \
node build.js && git diff --exit-code --stat dist/ && \
for f in ocr-proxy/*.js; do node --check "$f" || exit 1; done && \
echo "✓ ผ่านทุกขั้นตอนของ CI"
```

- [ ] **Step 10: Commit**

```bash
git add tools/check-provenance.mjs tools/check-provenance.test.mjs \
        tests/fixtures/grandfathered-patterns.json package.json .github/workflows/ci.yml
git commit -m "ci: บังคับกฎ R1 — pattern ใหม่ต้องบอกที่มาและอ้างเคสที่รองรับ

ใช้รายชื่อ id ของ pattern เดิม 167 ตัวเป็นเส้นแบ่ง แทนการดูวันที่
เพราะการดูวันที่หลบได้ด้วยการไม่ใส่ฟิลด์ added แต่รายชื่อ id หลบไม่ได้

สร้างประตูนี้ก่อนที่ pattern อัตโนมัติตัวแรกจะมาถึง ถ้าสร้างทีหลัง
จะไม่มีวันได้สร้าง — และ R1 จะเหลือแค่ความตั้งใจดีในเอกสาร

พิสูจน์แล้วว่าประตูทำงาน: pattern ที่ไม่มี src/added/case ถูกจับได้ครบ 3 ข้อ"
```

---

## หลังทำครบทุก task

- [ ] **ตั้ง secret** — Settings → Secrets and variables → Actions → เพิ่ม `OPENAI_API_KEY`
- [ ] **สร้าง label** — `gh label create decay-watch --description "ผลจากระบบเฝ้าระวังการเสื่อม" --color FBCA04`
- [ ] **รันครั้งแรกด้วยมือ** — Actions → decay-watch → Run workflow → ดูว่าสร้างเคสได้และบันทึกสำเร็จ
- [ ] **อย่าเพิ่งตั้งเกณฑ์เตือน** — ปล่อยให้เก็บข้อมูล 4-6 สัปดาห์ก่อน ตามหัวข้อ 12 ของเอกสารออกแบบ ค่า `dropThreshold` และ `consecutive` ปัจจุบันเป็นค่าเดาที่ยังไม่ควรเชื่อ

## ผลลัพธ์ที่ควรได้เมื่อจบแผนนี้

| เป้าหมายจากเอกสารออกแบบ | สถานะ |
|---|---|
| G1 รู้ตัวเมื่อความแม่นยำเริ่มเสื่อม | ✅ |
| G3 วัด pattern lag ได้ | ⚠️ วัดได้บางส่วน — seed มี `firstSeen` แล้ว แต่ยังไม่บันทึก `caughtAt` (รอระบบ B) |
| G4 ไม่ทำลายความน่าเชื่อถือของการวัดผล | ✅ ระบบนี้ไม่แตะ `patterns.json` และ `testset.json` เลย |
| R1 บังคับใช้ได้จริง | ✅ CI ตรวจให้ |
| R3 บังคับใช้ได้จริง | ✅ โครงสร้างฟังก์ชันบังคับ + มีเทสต์ตรวจว่าไม่มีคำหลุด |
| G2 มีช่องรับคำสแกมใหม่ | ❌ อยู่ในแผนระบบ B |

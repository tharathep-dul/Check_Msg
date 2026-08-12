# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

เอกสารในโปรเจกต์นี้เขียนภาษาไทย รวมถึงคอมเมนต์ในโค้ดและข้อความ commit — เขียนตามนั้น

**ห้ามใส่บรรทัด `Co-Authored-By:` ท้ายข้อความ commit** — เจ้าของต้องการให้รายชื่อ
Contributors บน GitHub มีชื่อตัวเองคนเดียว ประวัติถูกเขียนใหม่เพื่อลบบรรทัดนี้ไปแล้ว
รอบหนึ่ง (2026-08-12) การเผลอใส่กลับเข้าไปจะทำให้ต้องเขียนประวัติใหม่อีก

## โปรเจกต์นี้คืออะไร

ChekMsg — เครื่องมือคัดกรองข้อความหลอกลวงทางการเงิน สำหรับผู้ใช้ในไทย

**ไม่ใช่โมเดล AI** ใช้กฎที่เขียนไว้ล้วน ๆ ประมวลผลในเบราว์เซอร์ทั้งหมด ไม่มี backend ไม่เก็บข้อมูลผู้ใช้ ไม่มี dependency

สามข้อจำกัดนี้เป็นการตัดสินใจเชิงออกแบบ ไม่ใช่ข้อจำกัดทางเทคนิค — ผู้ใช้วาง SMS ธนาคารที่มีเลขบัญชีลงในเครื่องมือนี้ เครื่องมือกันโกงที่เก็บข้อมูลการเงินคือความขัดแย้งในตัวเอง

## คำสั่งที่ใช้บ่อย

```bash
npm test              # ชุดทดสอบ pattern — คืน exit 1 เมื่อเจอ hard miss
npm run test:tools    # ทดสอบฟังก์ชันใน tools/ (node:test)
npm run build         # สร้าง dist/chekmsg-standalone.html
npm run compare       # เทียบ v0.3 กับรุ่นปัจจุบันด้วยชุดทดสอบเดียวกัน
npm run check:provenance  # pattern ใหม่ต้องบอกที่มาและอ้างเคสที่รองรับ (กฎ R1)
npm run watch:decay -- --dry-run   # เฝ้าระวังการเสื่อม โหมดทดลอง ไม่เรียก API
npm run test:report   # เขียน tests/last-report.md
npm run serve         # เปิด http://localhost:8080 (ต้องใช้ web server เพราะ fetch patterns.json)

node tests/run-tests.js --set adversarial    # รันชุดเดียว
node --test tools/lib/decay-store.test.mjs   # รันไฟล์เทสต์เดียว
```

**ก่อน commit ทุกครั้ง**

```bash
npm test && npm run test:tools && npm run check:provenance && node build.js && git diff --exit-code dist/
```

`dist/` ต้องตรงกับ source เสมอ ลืม build แล้ว commit จะทำให้ CI แดง

## สถาปัตยกรรม

```
index.html      UI + i18n — ข้อความทุกภาษาอยู่ในตัวแปร T
admin.html      หน้าจัดการ pattern (ทำงานในหน่วยความจำเบราว์เซอร์ ไม่เขียน server)
engine.js       ตรรกะตรวจจับ ใช้ได้ทั้งเบราว์เซอร์และ Node
patterns.json   คลังคำ + เกณฑ์ตัดสิน ← แก้ไฟล์นี้เพื่อเพิ่ม wording
test-core.js    สูตรให้คะแนน ใช้ร่วมกันระหว่าง admin.html และ CLI
tests/          ชุดทดสอบ 7 ชุด + runner
tools/          เครื่องมือพัฒนา
ocr-proxy/      ตัวกลางเรียก Typhoon OCR (ไม่บังคับ ปิดอยู่โดยค่าเริ่มต้น)
```

**สองอย่างที่ต้องเข้าใจก่อนแก้อะไร**

`engine.js` คืนค่าเป็น **รหัสหมวด** ไม่ใช่ข้อความ ชั้น UI เป็นคนแปล — เพิ่มภาษาที่สามแก้แค่ `T` ใน `index.html` กับ `categories` ใน `patterns.json` ไม่ต้องแตะ logic

`test-core.js` มีอยู่เพื่อไม่ให้สูตรคำนวณ accuracy อยู่สองที่ ตัวเลขที่ `admin.html` แสดงกับที่ `npm test` พิมพ์จึงมาจากโค้ดชุดเดียวกันเสมอ

## กฎที่ห้ามละเมิด

**1. เพิ่ม/แก้ pattern แล้วต้องรัน `npm test` ทุกครั้ง**
ถ้า `ผิดข้างแบบอันตราย` มากกว่า 0 แปลว่ามีสแกมถูกตอบว่าเป็นข้อความปกติ — อย่า commit จนกว่าจะแก้ได้

**2. เจอข้อความที่ระบบตอบผิด ให้เพิ่มลง `tests/testset.json` ก่อน แล้วค่อยแก้ pattern**
เคสมาก่อนคำเสมอ ทำให้ชุดทดสอบโตเร็วกว่าคลังคำ = กัน overfit เชิงโครงสร้าง

**3. ห้ามไล่แก้ pattern ให้ผ่านชุด `adversarial` ทีละข้อ**
ชุดนี้วัดเพดานของวิธี rules-based (ตอนนี้ 1/12) ทำให้ผ่านได้ = จำข้อสอบ ซึ่งคือปัญหาเดิมของ v0.3 ที่ทำให้เลข 15/15 ไม่มีความหมาย ชุด `evasion` ต่างออกไป — เป็นบั๊กของตรรกะ **ต้องผ่านทุกข้อ** และแก้ที่ `engine.js` ห้ามแก้ด้วยการเพิ่ม pattern

**4. ห้ามใช้ตัวเลขจากชุด `regression_v03` อ้างความแม่นยำ**
เขียนจาก keyword ของ v0.3 เอง จึงได้ 100% เสมอ ถูกตัดออกจากคะแนนด้วย `EXCLUDE_FROM_SCORE` แล้ว

**5. ห้ามเขียนข้อความ privacy แบบตายตัว**
โหมด Typhoon OCR ส่งภาพออกนอกเครื่องจริง ข้อความทุกจุดที่พูดเรื่องนี้ต้องสลับตาม `OCR.proxyUrl`

**6. ห้ามใส่ API key ในไฟล์ฝั่ง client** — key อยู่ใน `ocr-proxy` เท่านั้น

**7. ห้ามเปลี่ยน `OCR.cdn` โดยไม่คำนวณ `cdnIntegrity` ใหม่**

```bash
curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A
```

**8. ห้ามเพิ่ม id ลง `tests/fixtures/grandfathered-patterns.json`**
ไฟล์นั้นคือรายชื่อ pattern 167 ตัวที่มีอยู่ก่อนเริ่มบังคับกฎ R1 การเพิ่ม id เข้าไปคือการหลบประตู
pattern ใหม่ต้องมี `src`, `added`, `case` และ `case` ต้องชี้ไปยังเคสที่มีอยู่จริงใน `testset.json`

## กับดักที่เคยกัดมาแล้ว

**`npm run test:tools` ต้องเรียกผ่าน `tools/run-tool-tests.mjs` ห้ามเรียก `node --test` ตรง ๆ**
`node --test` เปล่า ๆ หยิบ `test-core.js` ไปรันด้วย (ชื่อตรงรูปแบบ `test-*.js`) ส่วน `node --test tools/` บน Node 22 ขึ้นไปให้ `pass 0` เงียบ ๆ — CI เขียวทั้งที่ไม่ได้รันเทสต์เลย

**`add_header` ใน `location` block ของ nginx จะล้าง header ที่สืบทอดมาทั้งหมด**
`deploy/nginx.conf` จึงใช้ `map` แทน — อย่า "ทำให้อ่านง่ายขึ้น" ด้วยการย้ายกลับไปใส่ใน location

**`patterns.json` ที่ดาวน์โหลดจาก `admin.html` จัดรูปแบบต่างจากในรีโป**
admin ใช้ `JSON.stringify(out, null, 2)` ซึ่งกาง 167 pattern เป็นบรรทัดละ field — ระวังตอน diff

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| `README.md` | ภาพรวม การ deploy ชุดทดสอบ ข้อจำกัดที่ต้องบอกผู้ใช้ |
| `CONTRIBUTING.md` | กติกาการแก้ pattern ตั้งน้ำหนัก เลือกชุดทดสอบ |
| `docs/guide.md` | คู่มือใช้งานและทดสอบฉบับเต็ม |
| `docs/project-report.md` | ร่างรายงานโครงการ (มี `[FILL IN]` ที่เจ้าของต้องเติม) |
| `docs/design-continuous-learning.md` | เอกสารออกแบบระบบเฝ้าระวังการเสื่อม + กฎ R1–R5 |
| `docs/plan-continuous-learning-phase1.md` | แผนลงมือ 7 task — **งานที่กำลังทำอยู่ตอนนี้** |
| `docs/deploy-cloudflare-pages.md` · `docs/deploy-vps.md` | วิธี deploy สองแบบ |
| `docs/summary-v03-to-v05.md` | สรุปว่าเพิ่มอะไรจาก v0.3 + อธิบายวิธีทำงานและวิธีใช้งาน (สำหรับคนนอกทีม) |

## งานที่กำลังทำ

กำลังทำตาม `docs/plan-continuous-learning-phase1.md` ทีละ task โดยหยุดให้เจ้าของรีวิวเป็นระยะ
**เฟส 1 เสร็จครบ 7 task แล้ว** — ระบบเฝ้าระวังการเสื่อมทำงานได้ และประตู provenance บังคับกฎ R1 อยู่ใน CI
ขั้นต่อไปคือระบบ B (เติมคำจากประกาศสาธารณะ) ซึ่งยังไม่มีแผน — ต้องตอบก่อนว่าจะดึงประกาศจากแหล่งไหน

**ข้อจำกัดตลอดแผนนี้**

- ห้ามแก้ `patterns.json` และ `tests/testset.json`
- `openai` เป็น devDependency ติดตั้งเฉพาะใน workflow `decay-watch` — `ci.yml` ต้องไม่มี `npm install`
- ฟังก์ชันที่ส่งข้อมูลให้ LLM ห้ามรับ `patterns` เป็นพารามิเตอร์ (กฎ R3 — ถ้า LLM เห็นคลังคำ มันจะเขียนเคสที่วนอยู่รอบคำที่มีอยู่แล้ว)
- ผู้ให้บริการ LLM: **OpenAI** โมเดล `gpt-5-mini` — การเรียก API อยู่ในฟังก์ชันเดียวคือ
  `generateCases()` ท้าย `tools/lib/generate-cases.mjs` เปลี่ยนเจ้าได้โดยไม่แตะส่วนอื่นและไม่แตะเทสต์
- รุ่นใหม่ของ OpenAI เลิกรับ `max_tokens` ต้องใช้ `max_completion_tokens`
- **ห้ามเปลี่ยนรุ่นโมเดลหลังเริ่มเก็บประวัติแล้ว** — `assessTrend()` เทียบ recall ข้ามรอบ
  ถ้าเปลี่ยนรุ่นกลางทาง ความยากของเคสที่สร้างจะเปลี่ยนตาม แล้วคะแนนที่ตกจะแยกไม่ออก
  ว่ามาจากคนร้ายเปลี่ยนคำหรือมาจากเปลี่ยนรุ่น (ฟิลด์ `model` ใน `decay.jsonl` มีไว้ตรวจย้อนหลัง)
  จำเป็นต้องเปลี่ยนจริง ให้ขึ้นไฟล์ประวัติใหม่ อย่าต่อท้ายของเดิม
- ค่าตั้งต้นทับได้ด้วย `--model` หรือ env `OPENAI_MODEL` (workflow รับจาก `vars.OPENAI_MODEL`)
  เพราะสิทธิ์เข้าถึงรุ่นผูกกับ project ของ OpenAI ไม่ใช่คุณสมบัติของโปรเจกต์นี้

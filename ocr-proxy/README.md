# OCR Proxy — Typhoon OCR

ตัวกลางเล็ก ๆ ที่รับภาพจากหน้าเว็บ ส่งต่อไป [Typhoon OCR](https://opentyphoon.ai) แล้วคืนข้อความกลับ

**ทำไมต้องมี** — API key ใส่ในหน้าเว็บไม่ได้ ใครก็เปิด view-source เอาไปใช้จนโดนจำกัดสิทธิ์หรือถูกเรียกเก็บเงินแทนได้ ตัวกลางนี้จึงเก็บ key ไว้ฝั่ง server ให้หน้าเว็บเรียกผ่านแทน

---

## เลือกวิธี deploy

| วิธี | เหมาะกับ | ค่าใช้จ่าย |
|---|---|---|
| Cloudflare Workers | เร็วสุด ไม่ต้องดูแลเครื่อง | ฟรีในระดับการใช้งานทั่วไป |
| Docker บนเครื่องตัวเอง | มี server อยู่แล้ว อยากคุมทุกอย่างเอง | ค่าเครื่องที่มีอยู่ |
| `node server.js` | ทดสอบในเครื่อง | — |

### 1. ขอ API key

สมัครที่ [opentyphoon.ai](https://opentyphoon.ai) แล้วไปที่ Playground → API Keys
ตอนนี้ Typhoon API เปิดให้ใช้ฟรีในฐานะ research showcase จำกัด 2 ครั้ง/วินาที และ 20 ครั้ง/นาที

### 2a. Cloudflare Workers

```bash
npm i -g wrangler
cd ocr-proxy
# แก้ ALLOWED_ORIGINS ใน wrangler.toml ให้เป็นโดเมนจริงของหน้าเว็บก่อน
wrangler secret put TYPHOON_API_KEY
wrangler deploy
```

จะได้ URL แบบ `https://chekmsg-ocr-proxy.<ชื่อบัญชี>.workers.dev`

### 2b. Docker

```bash
cd ocr-proxy
cp .env.example .env      # เติม TYPHOON_API_KEY และ ALLOWED_ORIGINS
docker compose up -d
curl http://localhost:8787/health     # {"ok":true}
```

### 2c. รันตรง ๆ

```bash
cd ocr-proxy
TYPHOON_API_KEY=xxx ALLOWED_ORIGINS='http://localhost:8080' node server.js
```

ไม่มี dependency ภายนอกเลย ใช้ `http` ของ Node ล้วน

### 3. ชี้หน้าเว็บมาที่ proxy

เปิด `index.html` แล้วใส่ URL ที่ได้ลงในตัวแปร `OCR`

```js
const OCR = {
  proxyUrl: 'https://chekmsg-ocr-proxy.xxx.workers.dev',
  ...
};
```

พอ `proxyUrl` มีค่า หน้าเว็บจะเปลี่ยนไปใช้ Typhoon อัตโนมัติ ถ้าปล่อยว่างจะกลับไปใช้ Tesseract ในเบราว์เซอร์เหมือนเดิม

---

## API

```
POST /
Content-Type: application/json

{ "image": "data:image/png;base64,..." }
```

ตอบกลับ

```json
{
  "text": "ข้อความที่ตัด markdown ออกแล้ว พร้อมป้อนเข้าตัวตรวจสแกม",
  "markdown": "ผลดิบจาก Typhoon ที่ยังมีโครงสร้างตาราง/หัวข้ออยู่"
}
```

| สถานะ | ความหมาย |
|---|---|
| 400 | ไม่มีภาพ หรือรูปแบบไม่ถูกต้อง |
| 403 | origin ไม่อยู่ใน `ALLOWED_ORIGINS` |
| 413 | ภาพใหญ่เกิน `MAX_IMAGE_MB` |
| 429 | เรียกถี่เกินกำหนด (ดู `Retry-After` ประกอบ) |
| 502 | Typhoon ตอบกลับมาผิดพลาด |
| 504 | Typhoon ไม่ตอบภายใน `TYPHOON_TIMEOUT_MS` |

`GET /health` ใช้เช็คว่าบริการยังทำงาน

ทุกคำตอบมี `Vary: Origin` เพราะ header `Access-Control-Allow-Origin` เปลี่ยนตามผู้เรียก ถ้าไม่มีบรรทัดนี้แล้วมี cache คั่นกลาง คำตอบของ origin หนึ่งจะถูกจ่ายให้อีก origin หนึ่ง

---

## การตั้งค่า

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `TYPHOON_API_KEY` | — | **จำเป็น** ไม่มีแล้วจะไม่ยอมสตาร์ท |
| `ALLOWED_ORIGINS` | `*` | โดเมนที่อนุญาต คั่นด้วยจุลภาค — **อย่าปล่อย `*` บน production** |
| `RATE_PER_SECOND` | 2 | เพดานรวมทั้ง server ตั้งตามที่ Typhoon จำกัด |
| `RATE_PER_MINUTE` | 20 | เพดานรวมทั้ง server ตั้งตามที่ Typhoon จำกัด |
| `RATE_PER_IP_SECOND` | 1 | เพดานต่อ IP — ตั้งต่ำกว่าเพดานรวมเสมอ |
| `RATE_PER_IP_MINUTE` | 6 | เพดานต่อ IP |
| `TRUST_PROXY` | `0` | ตั้ง `1` เมื่อมี reverse proxy อยู่ข้างหน้า จึงจะอ่าน `X-Forwarded-For` |
| `MAX_IMAGE_MB` | 6 | ขนาดภาพสูงสุด วัดจากขนาดจริงหลังถอด base64 |
| `TYPHOON_TIMEOUT_MS` | 60000 | รอ Typhoon นานสุดเท่าไร เกินแล้วตอบ 504 |
| `TYPHOON_BASE_URL` | `https://api.opentyphoon.ai/v1` | เปลี่ยนเมื่อ self-host โมเดลเอง |
| `TYPHOON_MODEL` | `typhoon-ocr` | Typhoon OCR 1.5 (2B) |

**การจำกัดอัตรามีสองชั้น** เพราะทำหน้าที่คนละอย่าง — ชั้นรวมทั้ง server กันไม่ให้ยิงเกินโควตาที่ Typhoon ให้ ส่วนชั้นต่อ IP กันไม่ให้คนคนเดียวกินโควตาจนคนอื่นใช้ไม่ได้ มีแต่ชั้นรวมอย่างเดียวไม่พอ เพราะคนที่ยิงรัวจะทำให้ทุกคนโดน 429 ตามไปด้วย

ตัวนับเก็บในหน่วยความจำของ process ไม่ข้ามเครื่อง ถ้ารันหลาย instance ต้องพึ่ง rate limit ของ reverse proxy หรือย้ายไป Redis แทน

**`TRUST_PROXY` เปิดเมื่อจำเป็นเท่านั้น** — `X-Forwarded-For` เป็น header ที่ client ปลอมได้ ถ้าเปิดทั้งที่ไม่มี reverse proxy จริง ใครก็สุ่มค่าใหม่ทุกคำขอเพื่อหนีการจำกัดอัตราต่อ IP ได้

---

## ถ้าอยาก self-host โมเดลเอง

โมเดลเป็น open weights รันเองได้ ข้อมูลจะไม่ออกนอกองค์กรเลย

```bash
pip install vllm
vllm serve scb10x/typhoon-ocr-7b --served-model-name typhoon-ocr --dtype bfloat16 --port 8101
```

แล้วตั้ง `TYPHOON_BASE_URL=http://localhost:8101/v1` ตัว proxy ทำงานเหมือนเดิมทุกอย่าง

---

## สิ่งที่ตัวกลางนี้ทำและไม่ทำ

**ทำ** — ตรวจ origin, จำกัดอัตราการเรียก, ตรวจรูปแบบและขนาดภาพก่อนส่งต่อ, ตัด markdown ออกจากผลลัพธ์

**ไม่ทำ** — ไม่บันทึกภาพ ไม่บันทึกข้อความที่อ่านได้ ไม่มีฐานข้อมูล log มีแค่รหัสสถานะกับเวลาที่ใช้

**สิ่งที่ต้องรู้ก่อนขึ้นใช้จริง** — พอเปิดโหมดนี้ ภาพที่ผู้ใช้อัปโหลดจะออกจากเครื่องไปยัง Typhoon ซึ่งต่างจากโหมด Tesseract ที่ทุกอย่างอยู่ในเครื่อง ภาพ SMS ธนาคารถือเป็นข้อมูลส่วนบุคคล จึงควรมีข้อความแจ้งผู้ใช้ (หน้าเว็บแสดงให้แล้วเมื่อเปิดโหมดนี้) และถ้าจะใช้ในเชิงพาณิชย์ควรมี privacy policy กับฐานการประมวลผลตาม PDPA ให้ชัดเจน

---

## ตรวจว่าทำงานถูกไหม

```bash
# ภาพ 1x1 pixel สำหรับทดสอบว่าเส้นทางเชื่อมกันครบ
IMG="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
curl -s -X POST http://localhost:8787 \
  -H 'Content-Type: application/json' \
  -d "{\"image\":\"$IMG\"}" | head -c 300
```

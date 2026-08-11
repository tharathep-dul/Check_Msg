# Deploy ขึ้น Cloudflare Pages

> **มีสองทางเลือก** — หน้านี้คือ Pages (ง่ายที่สุด ไม่มีเครื่องให้ดูแล)
> ถ้าอยากรันบน VPS ของตัวเองพร้อม `ocr-proxy` โดเมนเดียวกัน ดู [`deploy-vps.md`](deploy-vps.md)

ChekMsg เป็น static site ล้วน ไม่ต้อง build ไม่มี runtime ไม่มี environment variable จึงวางบน Pages ได้ตรง ๆ

ใช้เวลาประมาณ 5 นาที และหลังจากนั้นทุก push ขึ้น `main` จะ deploy ให้เองอัตโนมัติ

---

## 1. ไฟล์ที่ต้องมี (มีอยู่ใน repo แล้ว)

| ไฟล์ | ทำอะไร |
|---|---|
| `_headers` | security header + กันไม่ให้ CDN cache `patterns.json` ค้าง |
| `robots.txt` | กัน `admin.html` และชุดทดสอบเข้า search engine |

ทั้งสองไฟล์ต้องอยู่ที่ **root ของ build output** ซึ่งในที่นี้คือ root ของ repo — Pages อ่านเองไม่ต้องตั้งค่าอะไรเพิ่ม

---

## 2. เชื่อม repo

Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → เลือก `tharathep-dul/Check_Msg`

ตั้งค่าตามนี้

| ช่อง | ค่า |
|---|---|
| Framework preset | **None** |
| Build command | *(เว้นว่าง)* |
| Build output directory | `/` |
| Root directory | `/` |

**เว้น build command ว่างไว้** — `npm run build` มีไว้สร้างไฟล์ standalone สำหรับส่งต่อเท่านั้น ตัวที่ deploy ใช้ `index.html` + `patterns.json` แยกไฟล์ ซึ่งพร้อมใช้อยู่แล้ว

กด **Save and Deploy** จะได้ URL แบบ `chekmsg.pages.dev`

---

## 3. ตรวจว่าขึ้นถูกจริง

```bash
SITE=https://chekmsg.pages.dev

# header มาครบไหม
curl -sI $SITE | grep -iE 'content-security-policy|strict-transport|x-content-type|referrer-policy'

# frame-ancestors ต้องมี — อันนี้คือสิ่งที่ meta tag ทำไม่ได้
curl -sI $SITE | grep -io "frame-ancestors 'none'"

# patterns.json ต้องไม่ถูก cache ค้าง
curl -sI $SITE/patterns.json | grep -i cache-control
# ต้องได้: cache-control: public, max-age=0, must-revalidate

# เวอร์ชันที่ deploy ตรงกับ repo ไหม
curl -s $SITE/patterns.json | head -3
```

จากนั้นเปิดหน้าเว็บ กด F12 → Console **ต้องไม่มี CSP violation** ถ้ามีแปลว่า `_headers` เข้มเกินไปหรือมีอะไรเรียกปลายทางที่ไม่ได้อนุญาต

---

## 4. Custom domain

Pages project → **Custom domains** → **Set up a domain**

- โดเมนอยู่ใน Cloudflare อยู่แล้ว → กดเพิ่มได้เลย DNS ตั้งให้เอง
- โดเมนอยู่ที่อื่น → เพิ่ม CNAME ชี้มาที่ `<project>.pages.dev`

HTTPS ออกใบรับรองให้อัตโนมัติ ไม่ต้องทำอะไร

---

## 5. ปิด `admin.html` ไม่ให้คนทั่วไปเข้า

ตั้ง output เป็น `/` แปลว่า **ทุกไฟล์ใน repo ขึ้นเว็บหมด** รวม `admin.html`, `tests/`, `docs/`

**ไม่ใช่ช่องโหว่ความปลอดภัย** — `admin.html` แก้อะไรบน server ไม่ได้เลย ทำงานในหน่วยความจำเบราว์เซอร์ล้วน ปิดแท็บแล้วการแก้หายหมด และข้อมูลที่มันอ่าน (`patterns.json`, `tests/testset.json`) ก็เป็นไฟล์สาธารณะอยู่แล้ว

แต่ถ้าอยากปิดจริง ใช้ **Cloudflare Access** ฟรีถึง 50 users และไม่ต้องแก้โค้ดสักบรรทัด

1. Zero Trust → **Access** → **Applications** → **Add an application** → **Self-hosted**
2. Application domain: โดเมนของคุณ, path `admin.html`
3. Policy: **Allow** → Include → **Emails** → ใส่อีเมลที่อนุญาต

ต่อไปใครเปิด `/admin.html` จะเจอหน้าล็อกอินก่อน ส่วนหน้าหลักยังเปิดสาธารณะเหมือนเดิม

> `robots.txt` กันแค่ search engine ที่ทำตามกติกา ไม่ได้กันคนที่พิมพ์ URL ตรง ๆ — ถ้าต้องการกันจริงต้องใช้ Access

---

## 6. ถ้าจะเปิดโหมด Typhoon OCR ด้วย

Worker กับ Pages อยู่บัญชีเดียวกันได้ แต่ต้องแก้ **3 จุด** และถ้าลืมจุดใดจุดหนึ่ง OCR จะพังแบบไม่มี error ให้เห็น

| ที่ไหน | แก้อะไร |
|---|---|
| `ocr-proxy/wrangler.toml` | `ALLOWED_ORIGINS = "https://chekmsg.pages.dev"` (หรือ custom domain) |
| `index.html` → `OCR.proxyUrl` | ใส่ URL ของ worker |
| **`connect-src` ทั้งใน `_headers` และ meta CSP ของ `index.html`** | เติมโดเมนของ worker |

จุดที่สามคือจุดที่ลืมกันบ่อยที่สุด — CSP จะบล็อก `fetch` เงียบ ๆ หน้าเว็บจะขึ้นแค่ว่า "บริการอ่านข้อความใช้งานไม่ได้" โดยไม่บอกสาเหตุจริง ดูใน Console จะเห็น CSP violation

```bash
wrangler secret put TYPHOON_API_KEY
wrangler deploy
curl -sI https://<worker>.workers.dev/health   # ต้องได้ 200 และมี Vary: Origin
```

---

## 7. อัปเดตคลังคำหลัง deploy แล้ว

```bash
# 1. แก้ผ่านหน้า admin ในเครื่อง หรือแก้ patterns.json ตรง ๆ
python3 -m http.server 8080     # เปิด localhost:8080/admin.html

# 2. เอาไฟล์ที่ดาวน์โหลดมาวางทับ แล้วตรวจก่อนเสมอ
npm test                        # hard miss ต้องเป็น 0
node build.js                   # dist/ ต้องตรงกับ source ไม่งั้น CI แดง

# 3. push — Pages deploy ให้เองภายในไม่ถึงนาที
git add -A && git commit -m "patterns: เพิ่มคำ ..." && git push
```

**PR จะได้ preview URL แยกให้** ทดลองก่อน merge ได้โดยไม่กระทบตัวจริง

---

## 8. เจอปัญหา

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| หน้าเว็บขึ้นว่า "โหลด patterns.json ไม่สำเร็จ" | Build output directory ตั้งไม่ใช่ `/` ทำให้ `patterns.json` ไม่ถูก deploy |
| แก้ pattern แล้วผู้ใช้ยังเห็นของเก่า | `_headers` ไม่ได้ถูก deploy — ตรวจว่าอยู่ที่ root จริง ไม่ใช่ในโฟลเดอร์ย่อย |
| Console ขึ้น CSP violation | มีปลายทางใหม่ที่ยังไม่ได้ใส่ใน `connect-src` (มักเป็น OCR proxy) |
| OCR ไม่ทำงาน ไม่มี error ชัดเจน | ลืมข้อใดข้อหนึ่งใน 3 จุดของหัวข้อ 6 — ดู Console เป็นอันดับแรก |
| `_headers` ไม่มีผลเลย | ไฟล์ต้องไม่มีนามสกุล และคอมเมนต์ต้องขึ้นต้นด้วย `#` เท่านั้น |

ดู log การ deploy ได้ที่ Pages project → **Deployments** → เลือก deployment → **Build log**

---

## ทำไมเลือก Cloudflare Pages

| | |
|---|---|
| ค่าใช้จ่าย | ฟรีในระดับการใช้งานทั่วไป ไม่มี server ให้ดูแล |
| ความเร็ว | ไฟล์อยู่บน edge ทั่วโลก ผู้ใช้ในไทยโหลดเร็ว |
| ความปลอดภัย | ไม่มี backend ให้เจาะ ไม่มีฐานข้อมูลให้รั่ว — ตรงกับจุดยืนของเครื่องมือ |
| ต่อยอด | ถ้าวันหนึ่งต้องมี backend (ปุ่มรายงาน, ชั้น LLM) Workers อยู่บัญชีเดียวกัน |

ถ้าจะย้ายไปที่อื่น เครื่องมือนี้เป็น static file ล้วน — Netlify, GitHub Pages, S3, nginx ก็ได้หมด ต่างกันแค่รูปแบบไฟล์ตั้งค่า header เท่านั้น

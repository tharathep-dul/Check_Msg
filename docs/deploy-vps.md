# Deploy ขึ้น VPS + Cloudflare หน้าบ้าน

รันบน VPS ของตัวเอง (Hostinger, DigitalOcean, Linode ฯลฯ) แล้วให้ Cloudflare แผนฟรีทำหน้าที่ CDN, กัน DDoS, บีบอัด และซ่อน IP จริงของเครื่อง

```
ผู้ใช้ ──→ Cloudflare (CDN, WAF, TLS) ──→ VPS ของคุณ
                                            ├── Caddy หรือ nginx  → ไฟล์ static
                                            └── ocr-proxy (Docker) → localhost:8787
```

ได้ทั้งความเร็วและความทนทานของ CDN โดยยังคุม backend เองเต็มที่ และ `ocr-proxy` อยู่โดเมนเดียวกันได้ ซึ่งทำให้ CSP กับ CORS ง่ายขึ้นมาก

---

## สารบัญ

1. [ทำไมถึงคุ้ม](#1-ทำไมถึงคุ้ม)
2. [เตรียม VPS](#2-เตรียม-vps)
3. [ตั้งค่า Cloudflare](#3-ตั้งค่า-cloudflare)
4. [ติดตั้ง web server](#4-ติดตั้ง-web-server)
5. [ปิดไม่ให้ใครเข้าตรงนอกจาก Cloudflare](#5-ปิดไม่ให้ใครเข้าตรงนอกจาก-cloudflare)
6. [รัน ocr-proxy](#6-รัน-ocr-proxy)
7. [ตรวจสอบ](#7-ตรวจสอบ)
8. [อัปเดตคลังคำ](#8-อัปเดตคลังคำ)
9. [เข้าหน้า admin](#9-เข้าหน้า-admin)
10. [ดูแลรักษา](#10-ดูแลรักษา)
11. [แก้ปัญหา](#11-แก้ปัญหา)
12. [รันร่วมกับเว็บอื่นบนเครื่องเดียวกัน](#12-รันร่วมกับเว็บอื่นบนเครื่องเดียวกัน)

ไฟล์ config อยู่ในโฟลเดอร์ [`deploy/`](../deploy) — ทั้ง `Caddyfile` และ `nginx.conf` ผ่านการตรวจ syntax และรันทดสอบจริงแล้ว

---

## 1. ทำไมถึงคุ้ม

**เหตุผลหลักคือ `ocr-proxy` อยู่โดเมนเดียวกับหน้าเว็บได้**

```
https://chekmsg.example.com/       →  หน้าเว็บ
https://chekmsg.example.com/ocr/   →  reverse proxy ไป localhost:8787
```

ผลที่ตามมา

| | Cloudflare Pages + Worker | VPS โดเมนเดียว |
|---|---|---|
| `OCR.proxyUrl` | `https://xxx.workers.dev` | `/ocr/` |
| ต้องแก้ `connect-src` ใน CSP | **ต้อง** (ลืมบ่อยที่สุด) | ไม่ต้อง — `'self'` ครอบคลุมแล้ว |
| CORS preflight | มี ต้องตั้ง `ALLOWED_ORIGINS` ให้ถูก | ไม่มี |
| API key | ฝากไว้กับ Cloudflare | อยู่ในเครื่องคุณ |

**สิ่งที่คุณต้องรับผิดชอบเพิ่ม** — อัปเดตความปลอดภัยของ OS, ต่ออายุใบรับรอง (แก้ด้วย Origin Certificate ด้านล่าง), และเปิดบีบอัดเอง

เรื่องบีบอัดสำคัญกว่าที่คิด วัดจากไฟล์จริง

```
index.html     41 KB → gzip 12 KB
patterns.json  25 KB → gzip  5 KB
engine.js      13 KB → gzip  4 KB
รวม           80 KB → gzip 21 KB     ← ต่างเกือบ 4 เท่า
```

Cloudflare บีบอัดให้อยู่แล้วเมื่อเปิด proxy แต่ config ที่ให้ไว้เปิด gzip ที่ต้นทางด้วย เผื่อ cache miss และเผื่อวันหนึ่งปิด proxy

---

## 2. เตรียม VPS

Ubuntu 22.04 หรือใหม่กว่า สเปคขั้นต่ำจริง ๆ คือ **1 vCPU / 1 GB RAM** ก็พอ (static site + Node process เล็ก ๆ)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw

# ต้องเปิด SSH ก่อนเสมอ กันล็อกตัวเองออกจากเครื่อง
sudo ufw allow OpenSSH
sudo ufw --force enable

sudo git clone https://github.com/tharathep-dul/Check_Msg.git /var/www/chekmsg
```

**ปิดการล็อกอินด้วยรหัสผ่าน** (ใช้ SSH key เท่านั้น)

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

---

## 3. ตั้งค่า Cloudflare

### 3.1 ชี้ DNS มาที่ VPS

DNS → **Add record** → `A` → ชื่อ `@` หรือ `chekmsg` → IP ของ VPS → **Proxy status: Proxied** (เมฆสีส้ม 🟠)

> เมฆสีส้มคือหัวใจของทั้งหมด ถ้าเป็นสีเทาแปลว่า DNS-only — ผู้ใช้ต่อตรงเข้า VPS ไม่มี CDN ไม่มีการกัน DDoS และ IP จริงเปิดเผย

### 3.2 SSL/TLS

SSL/TLS → Overview → เลือก **Full (strict)**

| โหมด | อย่าใช้เพราะ |
|---|---|
| Off / Flexible | Cloudflare คุยกับ VPS แบบไม่เข้ารหัส — ข้อความ SMS ธนาคารวิ่งเป็น plaintext |
| Full | ไม่ตรวจใบรับรองต้นทาง เปิดช่อง MITM ระหว่าง Cloudflare กับ VPS |
| **Full (strict)** | ✅ เข้ารหัสและตรวจใบรับรองครบ |

### 3.3 Origin Certificate — ไม่ต้องต่ออายุ 15 ปี

SSL/TLS → **Origin Server** → **Create Certificate** → ปล่อยค่าเริ่มต้น → Create

คัดลอกสองก้อนที่ได้ไปวางบน VPS

```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/origin.pem   # วางก้อน Origin Certificate
sudo nano /etc/ssl/cloudflare/origin.key   # วางก้อน Private Key
sudo chmod 600 /etc/ssl/cloudflare/origin.key
```

> ใช้ Origin Certificate แทน Let's Encrypt เพราะเมื่อเปิด proxy แล้ว TLS-ALPN challenge ทะลุไม่ได้ และอันนี้ไม่ต้องตั้ง cron ต่ออายุเลย ใบนี้ **ใช้ได้เฉพาะเมื่อผ่าน Cloudflare** เท่านั้น ซึ่งตรงกับสิ่งที่เราต้องการพอดี

### 3.4 ค่าอื่น

| ที่ไหน | ตั้งเป็น |
|---|---|
| SSL/TLS → Edge Certificates → Always Use HTTPS | **On** |
| SSL/TLS → Edge Certificates → Minimum TLS Version | **TLS 1.2** |
| Speed → Optimization → Brotli | **On** |
| Security → Bots → Bot Fight Mode | **On** (ฟรี) |

### 3.5 Cache Rule — สำคัญ อย่าข้าม

Cloudflare cache ไฟล์ `.js` ที่ edge โดยค่าเริ่มต้น **ซึ่งแปลว่า `engine.js` อาจค้างเป็นเวอร์ชันเก่า** และคลังคำที่เพิ่งเพิ่มอาจยังไม่มีผลกับผู้ใช้

Caching → **Cache Rules** → Create rule

| ช่อง | ค่า |
|---|---|
| Rule name | `chekmsg-always-fresh` |
| เงื่อนไข | **URI Path** **is in** `/` `/index.html` `/patterns.json` `/engine.js` |
| Cache eligibility | **Bypass cache** |

สี่ไฟล์นี้รวมกันแค่ 21 KB หลังบีบอัด ต้นทุนแทบไม่มี แต่แลกกับการที่ **สแกมที่เพิ่งเพิ่มเข้าไปมีผลกับผู้ใช้ทันที** ซึ่งคุ้มกว่ามากสำหรับเครื่องมือประเภทนี้

ไฟล์อื่น (`dist/`, รูป) ยังใช้ CDN cache ได้ตามปกติ

---

## 4. ติดตั้ง web server

เลือกอย่างใดอย่างหนึ่ง

### ทางเลือก ก — Caddy (แนะนำ)

config สั้นกว่า บีบอัดให้เอง ไม่ต้องจำเรื่องกับดักของ `add_header`

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo cp /var/www/chekmsg/deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/chekmsg.example.com/โดเมนจริงของคุณ/' /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile   # ตรวจก่อนเสมอ
sudo systemctl reload caddy
```

### ทางเลือก ข — nginx

```bash
sudo apt install -y nginx
sudo cp /var/www/chekmsg/deploy/nginx.conf /etc/nginx/sites-available/chekmsg
sudo sed -i 's/chekmsg.example.com/โดเมนจริงของคุณ/' /etc/nginx/sites-available/chekmsg
sudo ln -sf /etc/nginx/sites-available/chekmsg /etc/nginx/sites-enabled/chekmsg
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

> **กับดักของ nginx ที่ config นี้เลี่ยงไว้แล้ว** — `add_header` ใน `location` block จะ**ล้าง** header ทั้งหมดที่สืบทอดมาจาก `server` block ถ้าเขียน `location = /patterns.json { add_header Cache-Control ...; }` ตรง ๆ ไฟล์นั้นจะไม่มี CSP และไม่มี `nosniff` ทันทีโดยไม่มีอะไรเตือน config ที่ให้ไว้ใช้ `map` แทน จึงมี `add_header` ที่ระดับ server ที่เดียว

---

## 5. ปิดไม่ให้ใครเข้าตรงนอกจาก Cloudflare

**ขั้นตอนนี้ไม่ใช่ทางเลือก** — เราเชื่อ header `CF-Connecting-IP` เพื่อหา IP จริงของผู้ใช้ (ใช้ในการจำกัดอัตราของ `ocr-proxy`) แต่ header ปลอมได้ ถ้าใครรู้ IP จริงของ VPS แล้วยิงตรงเข้ามา เขาจะปลอม IP ตัวเองเป็นอะไรก็ได้แล้วหนีการจำกัดอัตราไปเลย

**firewall คือสิ่งเดียวที่ทำให้ header นั้นเชื่อถือได้**

```bash
sudo /var/www/chekmsg/deploy/cloudflare-ufw.sh
```

สคริปต์นี้

- ดึงช่วง IP ของ Cloudflare สด ๆ (ไม่ hardcode ไว้ให้ค้าง)
- หยุดทำงานถ้าดึงมาได้น้อยผิดปกติ กันล็อกตัวเองออก
- เปิด SSH ไว้ก่อนเสมอ
- ปฏิเสธ 80/443 เป็นค่าตั้งต้น แล้วอนุญาตเฉพาะ Cloudflare
- ถ้าเจอ nginx จะสร้าง `/etc/nginx/conf.d/cloudflare-realip.conf` ให้ด้วย เพื่อให้ `$remote_addr` เป็น IP จริงของผู้ใช้

รันซ้ำได้ และควรรันใหม่ทุก 2-3 เดือนเพราะ Cloudflare เพิ่มช่วง IP เป็นครั้งคราว

```bash
sudo /var/www/chekmsg/deploy/cloudflare-ufw.sh --revert   # ถ้าต้องปิด proxy ชั่วคราว
```

> **ผลข้างเคียงที่ตั้งใจ** — ปิด proxy ใน Cloudflare (เปลี่ยนเป็นเมฆสีเทา) เมื่อไร เว็บจะเข้าไม่ได้ทันที ต้อง `--revert` ก่อน

---

## 6. รัน ocr-proxy

ข้ามได้ถ้ายังใช้ Tesseract ในเบราว์เซอร์ (ค่าเริ่มต้น ข้อมูลไม่ออกจากเครื่องผู้ใช้เลย)

> ⚠️ **ห้ามวางไฟล์ที่มี key ไว้ใต้ `/var/www`** เพราะทั้งโฟลเดอร์นั้นคือ web root
> ถ้าวาง `.env` ที่ `/var/www/chekmsg/ocr-proxy/.env` ใครก็ตามเปิด
> `https://โดเมนคุณ/ocr-proxy/.env` แล้วอ่าน key ได้ทันที
> `.gitignore` กันไม่ให้ key เข้า git ได้ แต่กันไม่ให้ web server เสิร์ฟไม่ได้ — คนละชั้นกัน
>
> ทางแก้คือ **ย้ายทั้งบริการออกไปนอก web root** ไม่ใช่แค่ย้ายไฟล์ `.env`
> เพราะถ้าย้ายแค่ `.env` ต้องใส่ `--env-file` ทุกคำสั่งของ compose
> (แม้แต่ `logs` และ `ps` ก็พังถ้าลืม) ซึ่งจะลืมแน่นอนสักวัน

**ย้าย `ocr-proxy` ไป `/opt` ทั้งโฟลเดอร์** — ไม่มีอะไรลับอยู่ใต้ `/var/www` อีกเลย
และคำสั่ง `docker compose` ทุกคำสั่งใช้ได้ตามปกติโดยไม่ต้องจำ flag อะไรเพิ่ม

```bash
curl -fsSL https://get.docker.com | sudo sh

sudo mkdir -p /opt/chekmsg-ocr
sudo cp -r /var/www/chekmsg/ocr-proxy/. /opt/chekmsg-ocr/

cd /opt/chekmsg-ocr
sudo cp .env.example .env
sudo chmod 600 .env
sudo nano .env
```

`.env` — **สองบรรทัดนี้สำคัญเป็นพิเศษเมื่ออยู่หลัง reverse proxy**

```bash
TYPHOON_API_KEY=<key ของคุณ>
ALLOWED_ORIGINS=https://chekmsg.example.com
TRUST_PROXY=1
```

**`TRUST_PROXY=1` จำเป็น** เพราะ Caddy/nginx อยู่ข้างหน้า ถ้าไม่ตั้ง ทุกคำขอจะดูเหมือนมาจาก `127.0.0.1` เหมือนกันหมด แล้วการจำกัดอัตราต่อ IP จะยุบเหลือถังเดียว — กลับไปเป็นบั๊กเดิมที่ v0.5 เพิ่งแก้ไป

**พอร์ตผูกกับ localhost มาให้แล้ว** — `docker-compose.yml` ตั้ง `127.0.0.1:8787:8787` ไว้ตั้งแต่ต้น
ไม่ต้องแก้อะไร และอย่าเปลี่ยนกลับเป็น `8787:8787` เพราะจะเปิดพอร์ตทุก interface
แล้วคนนอกยิงตรงข้าม reverse proxy ได้ ซึ่งข้าม `ALLOWED_ORIGINS` กับการจำกัดอัตราต่อ IP ไปพร้อมกัน

```bash
cd /opt/chekmsg-ocr
sudo docker compose up -d
curl -s localhost:8787/health      # {"ok":true}
```

จากนั้นแก้ `index.html` บรรทัดเดียว

```js
proxyUrl: '/ocr/',   // same-origin — connect-src 'self' ครอบคลุมแล้ว ไม่ต้องแตะ CSP
```

**ต้องมี `/` ปิดท้าย** — `location /ocr/` ของ nginx เป็น prefix ที่ต้องการ slash
ถ้าใส่ `/ocr` เฉย ๆ จะไม่เข้า location นั้น `deploy/nginx.conf` จึงดักไว้ด้วย 308
ซึ่งคงเมธอดและ body ไว้ครบ (ถ้าปล่อยให้ nginx เติม slash เองจะได้ 301 ซึ่ง**เปลี่ยน POST เป็น GET แล้ว body หายทั้งก้อน** — อัปโหลดภาพจะพังแบบหาสาเหตุยากมาก)
ใส่ slash ให้ถูกตั้งแต่แรกดีกว่าพึ่ง 308

> **เวลาอัปเดตโค้ดของ `ocr-proxy`** — `git pull` ที่ `/var/www/chekmsg` ไม่แตะ `/opt/chekmsg-ocr`
> ต้องคัดลอกทับแล้ว build ใหม่ (`.env` ไม่ถูกทับเพราะไม่มีในรีโป)
>
> ```bash
> sudo cp -r /var/www/chekmsg/ocr-proxy/. /opt/chekmsg-ocr/
> cd /opt/chekmsg-ocr && sudo docker compose up -d --build
> ```

---

## 7. ตรวจสอบ

```bash
SITE=https://chekmsg.example.com

# header ครบไหม
curl -sI $SITE | grep -iE 'content-security-policy|strict-transport|x-content-type|referrer-policy|cf-ray'

# frame-ancestors — สิ่งที่ meta tag ทำไม่ได้
curl -sI $SITE | grep -io "frame-ancestors 'none'"

# ผ่าน Cloudflare จริงไหม (ต้องมี cf-ray)
curl -sI $SITE | grep -i cf-ray

# patterns.json ต้องสด และต้องมี CSP ด้วย (กับดัก add_header)
curl -sI $SITE/patterns.json | grep -iE 'cache-control|content-security|cf-cache-status'

# บีบอัดทำงานไหม
curl -sI -H 'Accept-Encoding: gzip' $SITE/engine.js | grep -i content-encoding

# ไฟล์ที่ต้องถูกบล็อก — ต้องได้ 404 ทุกอัน
# /ocr-proxy/.env สำคัญที่สุดในรายการนี้ ถ้าได้ 200 แปลว่า API key เปิดให้ทุกคนอ่าน
# ต้องเปลี่ยน key ทันที ย้ายไฟล์อย่างเดียวไม่พอ
for p in /ocr-proxy/.env /ocr-proxy/server.js /admin.html /tests/testset.json \
         /docs/guide.md /deploy/nginx.conf /package.json /.git/config /CLAUDE.md; do
  printf "%-26s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' $SITE$p)"
done

# ต่อตรงเข้า VPS ต้องไม่ได้ (timeout หรือ refused)
VPS_IP=$(dig +short chekmsg.example.com @1.1.1.1 | head -1)   # จะได้ IP ของ Cloudflare ไม่ใช่ VPS — ถูกแล้ว
curl -m 8 -sk --resolve chekmsg.example.com:443:<IP จริงของ VPS> $SITE/ && echo "⚠ ยังต่อตรงได้!" || echo "✓ ปิดแล้ว"

# OCR proxy (ถ้าเปิดใช้)
curl -s $SITE/ocr/health
```

จากนั้นเปิดหน้าเว็บ กด F12 → Console **ต้องไม่มี CSP violation** และลองวางข้อความทดสอบดูว่าตรวจได้จริง

---

## 8. อัปเดตคลังคำ

```bash
# บนเครื่องคุณ — แก้และตรวจก่อนเสมอ
python3 -m http.server 8080        # เปิด localhost:8080/admin.html แก้คำ แล้วดาวน์โหลด
npm test                            # hard miss ต้องเป็น 0
node build.js                       # dist/ ต้องตรงกับ source ไม่งั้น CI แดง
git add -A && git commit -m "patterns: ..." && git push

# บน VPS
cd /var/www/chekmsg && sudo git pull
```

ไม่ต้อง reload web server เพราะเป็นไฟล์ static ล้วน

**ถ้าตั้ง Cache Rule ตามข้อ 3.5 แล้วไม่ต้อง purge** แต่ถ้าข้ามข้อนั้นไป ต้องเข้า Cloudflare → Caching → **Purge Everything** ทุกครั้ง ไม่งั้นผู้ใช้ยังเห็นของเก่า

### ทำให้อัตโนมัติ (ทางเลือก)

ต่อยอดจาก `.github/workflows/ci.yml` ที่มีอยู่ — เพิ่ม job ที่ `ssh` เข้ามา `git pull` **หลัง CI ผ่านเท่านั้น** เก็บ key ไว้ใน GitHub Secrets

```yaml
  deploy:
    needs: test            # ← สำคัญ: deploy ต่อเมื่อชุดทดสอบผ่าน
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: cd /var/www/chekmsg && git pull --ff-only
```

`needs: test` คือบรรทัดที่สำคัญที่สุด — ทำให้ไม่มีทางที่โค้ดที่มี hard miss จะขึ้น production ได้

---

## 9. เข้าหน้า admin

config บล็อก `/admin.html` ไว้แล้ว (404) เพราะไม่มีเหตุผลที่หน้าจัดการต้องเปิดสาธารณะ

เข้าผ่าน **SSH tunnel** แทน — ปลอดภัยที่สุดและไม่ต้องตั้ง auth อะไรเลย

```bash
# เทอร์มินัลที่ 1 — บน VPS
cd /var/www/chekmsg && python3 -m http.server 8080 --bind 127.0.0.1

# เทอร์มินัลที่ 2 — บนเครื่องคุณ
ssh -L 8080:localhost:8080 user@vps

# แล้วเปิด http://localhost:8080/admin.html บนเบราว์เซอร์เครื่องคุณ
```

`--bind 127.0.0.1` สำคัญ — ถ้าลืม พอร์ต 8080 จะเปิดออกอินเทอร์เน็ต (firewall บล็อกอยู่ แต่ไม่ควรพึ่งชั้นเดียว)

---

## 10. ดูแลรักษา

```bash
sudo apt install -y unattended-upgrades fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades
```

| ทำอะไร | บ่อยแค่ไหน |
|---|---|
| `sudo apt update && sudo apt upgrade` | อัตโนมัติผ่าน unattended-upgrades |
| รัน `deploy/cloudflare-ufw.sh` ใหม่ | ทุก 2-3 เดือน (ช่วง IP ของ Cloudflare เปลี่ยน) |
| `cd /opt/chekmsg-ocr && docker compose pull && docker compose up -d` | เมื่อมี Node image ใหม่ |
| ตรวจ `sudo ufw status` และ `docker compose logs --tail 50` | เดือนละครั้ง |
| Origin Certificate | **ไม่ต้องทำอะไร 15 ปี** |

`ocr-proxy` ไม่บันทึกภาพหรือข้อความที่ผ่านเลย log มีแค่รหัสสถานะกับเวลา

---

## 11. แก้ปัญหา

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| เว็บเข้าไม่ได้เลยหลังรัน `cloudflare-ufw.sh` | proxy ใน Cloudflare เป็นเมฆสีเทา — เปลี่ยนเป็นส้ม หรือรัน `--revert` |
| Error 521 (Web server is down) | web server ไม่ทำงาน หรือ firewall บล็อก Cloudflare — `sudo systemctl status caddy` และ `sudo ufw status` |
| Error 526 (Invalid SSL certificate) | SSL/TLS mode เป็น Full (strict) แต่ Origin Certificate ยังไม่ได้ติดตั้ง หรือ path ผิด |
| Error 502 ที่ `/ocr/health` | container ไม่ทำงาน — `cd /opt/chekmsg-ocr && docker compose logs --tail 50` |
| แก้ pattern แล้วผู้ใช้ยังเห็นของเก่า | ยังไม่ได้ตั้ง Cache Rule ตามข้อ 3.5 — หรือ purge ที่ Cloudflare |
| OCR ขึ้น 429 ทั้งที่มีคนใช้คนเดียว | ลืม `TRUST_PROXY=1` ทุกคำขอเลยดูเหมือนมาจาก IP เดียว |
| Console ขึ้น CSP violation | มีปลายทางใหม่ที่ยังไม่ได้ใส่ใน `connect-src` |
| `/admin.html` ยังเปิดได้ | ลืม reload web server หลังคัดลอก config |

ดู log

```bash
sudo journalctl -u caddy -n 50 --no-pager        # หรือ
sudo tail -50 /var/log/nginx/error.log
cd /opt/chekmsg-ocr && docker compose logs --tail 50
```

---

## 12. รันร่วมกับเว็บอื่นบนเครื่องเดียวกัน

ข้อนี้อ่านก่อน**ถ้ามีเว็บอื่นรันอยู่บน VPS เครื่องนี้แล้ว** — คำสั่งบางข้อในคู่มือเขียนขึ้นโดยสมมติว่า ChekMsg เป็นเว็บเดียวบนเครื่อง ใช้ตรง ๆ จะทับของเดิม

### กติกาข้อเดียวที่ต้องยึด

**ตัวรับหน้าบ้านมีได้ตัวเดียว** — Caddy หรือ nginx เลือกอย่างใดอย่างหนึ่ง แล้วให้มันรับ 80/443 ทั้งหมด
จากนั้นแยกแต่ละเว็บด้วยชื่อโดเมน ส่วนแอปที่มี backend ให้ฟังคนละพอร์ตบน `127.0.0.1`

```
ผู้ใช้ ──→ Cloudflare ──→ VPS :443
                            └── ตัวรับหน้าบ้านตัวเดียว
                                  ├── chekmsg.example.com  → ไฟล์ static + /ocr/ → :8787
                                  ├── appA.example.com      → :3000
                                  └── appB.example.com      → :5000
```

### สี่คำสั่งในคู่มือที่ต้องเปลี่ยนวิธีใช้

| ข้อ | คำสั่งในคู่มือ | ทำไมชน | ใช้แบบนี้แทน |
|---|---|---|---|
| 4 ก | `cp deploy/Caddyfile /etc/caddy/Caddyfile` | **ทับทั้งไฟล์ ลบเว็บอื่นทิ้งหมด** | คัดลอกเฉพาะ *บล็อกของโดเมน* ไปต่อท้าย `/etc/caddy/Caddyfile` ของเดิม |
| 4 ข | `rm -f /etc/nginx/sites-enabled/default` | เว็บเดิมอาจใช้ default site อยู่ | ข้ามคำสั่งนี้ไป ถ้าเว็บเดิมทำงานผ่าน default อยู่ |
| 3.3 | `origin.pem` / `origin.key` | ชื่อกลางเกินไป โดเมนที่สองจะทับ | ตั้งชื่อตามโดเมน เช่น `chekmsg.pem` แล้วแก้ path ใน config ให้ตรง |
| 6 | `ports: 127.0.0.1:8787` | แอปอื่นอาจใช้พอร์ตนี้แล้ว | เช็คด้วย `sudo ss -tlnp \| grep 8787` ถ้าชนให้เปลี่ยนทั้งใน `docker-compose.yml` และใน `proxy_pass` |

**Caddy — ต่อท้ายแทนการทับ**

```bash
sudo tee -a /etc/caddy/Caddyfile < /var/www/chekmsg/deploy/Caddyfile
sudo sed -i 's/chekmsg.example.com/โดเมนจริงของคุณ/' /etc/caddy/Caddyfile
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile    # ตรวจก่อนเสมอ
sudo systemctl reload caddy
```

**nginx — แต่ละเว็บเป็นไฟล์ของตัวเองอยู่แล้ว จึงไม่ทับกัน**

ทำตามข้อ 4 ข ได้ตามปกติ แค่**ข้ามบรรทัด `rm ... default`** ถ้ายังใช้อยู่

### ข้อที่กระทบทั้งเครื่อง ไม่ใช่แค่ ChekMsg

**`cloudflare-ufw.sh` เปลี่ยน firewall ของทั้งเครื่อง**

```bash
ufw deny 80,443/tcp              # ปิดให้ทุกเว็บบนเครื่อง
ufw allow from <Cloudflare> ...  # แล้วเปิดเฉพาะ Cloudflare
```

**ผลคือทุกโดเมนบน VPS นี้ต้องเป็นเมฆส้มทั้งหมด** โดเมนไหนตั้งเป็นเมฆเทาไว้จะเข้าไม่ได้ทันทีที่รันสคริปต์

ก่อนรัน ให้ไล่ดูใน Cloudflare ว่าทุกโดเมนที่ชี้มาเครื่องนี้เป็นเมฆส้มครบแล้ว **ถ้ามีโดเมนที่จำเป็นต้องเป็นเมฆเทา — เช่นต้องต่อ SSH ผ่านชื่อโดเมน หรือใช้ Let's Encrypt แบบ HTTP-01 — อย่ารันสคริปต์นี้** เพราะสองอย่างนั้นอยู่ร่วมกันไม่ได้

`--revert` กลับได้ตลอดถ้าเปลี่ยนใจ

**snippet `cloudflare-realip.conf` ก็มีผลทั้งเครื่อง แต่ปลอดภัย**

ไฟล์นี้อยู่ใน `/etc/nginx/conf.d/` จึงมีผลกับทุกเว็บที่รันบน nginx เครื่องนี้ — **ซึ่งไม่เป็นปัญหา** เพราะ `set_real_ip_from` สั่งให้เชื่อ header `CF-Connecting-IP` เฉพาะเมื่อคำขอมาจากช่วง IP ของ Cloudflare จริงเท่านั้น คำขอจากที่อื่นจะไม่ถูกนำ header มาใช้ (และ firewall ก็ปิดไว้อยู่แล้วอีกชั้น)

ผลพลอยได้คือ **เว็บอื่นบนเครื่องเดียวกันจะเห็น IP จริงของผู้ใช้ด้วย** ซึ่งมักเป็นสิ่งที่ต้องการอยู่แล้ว

### เช็ค 4 อย่างก่อนเริ่ม

```bash
sudo ss -tlnp | grep -E ':(80|443|8787)\s'   # ใครจองพอร์ตอยู่บ้าง
systemctl is-active caddy nginx               # มีตัวรับหน้าบ้านอยู่แล้วหรือยัง
sudo ufw status numbered                      # กฎ firewall เดิมมีอะไร
free -m                                       # RAM เหลือพอไหม
```

**เรื่อง RAM** — ตัวเว็บ ChekMsg เป็น static ล้วน แทบไม่กินอะไร แต่ถ้าเปิด `ocr-proxy` จะเพิ่ม Node process หนึ่งตัว (~80–120 MB) เครื่อง 1 GB ที่มีเว็บอื่นอยู่แล้วอาจตึง ให้ข้ามข้อ 6 ไปก่อน

### สรุป

| ทำได้ปลอดภัย | ต้องระวัง |
|---|---|
| หลายโดเมนบนตัวรับหน้าบ้านตัวเดียว | อย่าลง Caddy กับ nginx พร้อมกัน |
| `git clone` แยกโฟลเดอร์ (`/var/www/chekmsg`) | อย่าใช้ `cp` ทับ `/etc/caddy/Caddyfile` |
| `/opt/chekmsg-ocr` แยกจากแอปอื่น | เช็คพอร์ต 8787 ว่าว่างจริง |
| snippet `cloudflare-realip.conf` | ทุกโดเมนต้องเป็นเมฆส้มก่อนรัน `cloudflare-ufw.sh` |

---

## สรุปสิ่งที่ต้องทำตามลำดับ

```
1. เตรียม VPS + git clone                          → ข้อ 2
2. DNS ชี้มาที่ VPS แบบ Proxied (เมฆส้ม)            → ข้อ 3.1
3. SSL/TLS = Full (strict) + Origin Certificate     → ข้อ 3.2-3.3
4. Cache Rule bypass 4 ไฟล์                         → ข้อ 3.5  ← อย่าข้าม
5. ติดตั้ง Caddy หรือ nginx + คัดลอก config          → ข้อ 4
6. รัน cloudflare-ufw.sh                            → ข้อ 5    ← อย่าข้าม
7. (ถ้าใช้ OCR) ย้ายไป /opt + docker compose up      → ข้อ 6
8. รันชุดคำสั่งตรวจสอบทั้งหมด                        → ข้อ 7
```

ข้อ 4 กับข้อ 6 คือสองข้อที่ข้ามแล้วจะเจอปัญหาแบบเงียบ ๆ — ข้อ 4 ทำให้คลังคำใหม่ไม่มีผลกับผู้ใช้ ข้อ 6 ทำให้การจำกัดอัตราถูกหลบได้

#!/usr/bin/env bash
# ปิดพอร์ต 80/443 ไม่ให้ใครต่อเข้ามาได้นอกจาก Cloudflare
#
#   sudo ./deploy/cloudflare-ufw.sh
#
# ทำไมต้องมี: เมื่อเปิด proxy ของ Cloudflare แล้ว เราเชื่อ header CF-Connecting-IP
# เพื่อหา IP จริงของผู้ใช้ (ใช้ในการจำกัดอัตราของ ocr-proxy) แต่ header ปลอมได้
# ถ้าใครรู้ IP จริงของ VPS แล้วยิงตรงเข้ามา เขาจะปลอม IP ตัวเองเป็นอะไรก็ได้
# แล้วหนีการจำกัดอัตราไปเลย — สคริปต์นี้คือสิ่งที่ทำให้ header นั้นเชื่อถือได้
#
# ผลข้างเคียงที่ตั้งใจ: ปิด proxy ใน Cloudflare (เมฆสีเทา) เมื่อไร เว็บจะเข้าไม่ได้ทันที
# ต้องรัน --revert ก่อน
#
# รันซ้ำได้ และควรรันใหม่ทุก 2-3 เดือน เพราะ Cloudflare เพิ่มช่วง IP เป็นครั้งคราว

set -euo pipefail

TAG="cloudflare"
NGINX_SNIPPET="/etc/nginx/conf.d/cloudflare-realip.conf"

if [[ "${1:-}" == "--revert" ]]; then
	echo "→ ลบกฎของ Cloudflare ออกทั้งหมด แล้วเปิด 80/443 ให้ทุกที่"
	while ufw status numbered | grep -q "$TAG"; do
		n=$(ufw status numbered | grep "$TAG" | head -1 | sed 's/^\[\s*\([0-9]*\).*/\1/')
		ufw --force delete "$n"
	done
	ufw allow 80,443/tcp comment 'http/https (เปิดทุกที่)'
	echo "✓ เรียบร้อย — อย่าลืมปิด proxy ใน Cloudflare ให้ตรงกัน"
	exit 0
fi

command -v ufw >/dev/null || { echo "✗ ไม่พบ ufw — ติดตั้งด้วย apt install ufw"; exit 1; }

echo "→ ดึงช่วง IP ของ Cloudflare"
V4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)
V6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)

# ถ้าดึงมาได้น้อยผิดปกติ แปลว่าโดน captive portal หรือ endpoint เปลี่ยน — หยุดก่อนจะล็อกตัวเองออก
n4=$(echo "$V4" | grep -c '/') ; n6=$(echo "$V6" | grep -c '/')
[[ $n4 -ge 10 && $n6 -ge 4 ]] || { echo "✗ ได้ช่วง IP มาน้อยผิดปกติ ($n4 v4, $n6 v6) — ยกเลิก"; exit 1; }
echo "  ได้ $n4 ช่วง IPv4 และ $n6 ช่วง IPv6"

echo "→ ต้องเปิด SSH ไว้ก่อนเสมอ กันล็อกตัวเองออกจากเครื่อง"
ufw allow OpenSSH >/dev/null

echo "→ ลบกฎเก่าที่มี tag '$TAG'"
while ufw status numbered | grep -q "$TAG"; do
	n=$(ufw status numbered | grep "$TAG" | head -1 | sed 's/^\[\s*\([0-9]*\).*/\1/')
	ufw --force delete "$n" >/dev/null
done

echo "→ ปิด 80/443 สำหรับทุกที่"
ufw --force delete allow 80,443/tcp 2>/dev/null || true
ufw --force delete allow 'Nginx Full' 2>/dev/null || true
ufw deny 80,443/tcp comment "$TAG: ปฏิเสธเป็นค่าตั้งต้น" >/dev/null

echo "→ อนุญาตเฉพาะ Cloudflare"
for ip in $V4 $V6; do
	ufw allow from "$ip" to any port 80,443 proto tcp comment "$TAG" >/dev/null
done

# สร้าง snippet ให้ nginx อ่าน IP จริงจาก CF-Connecting-IP
if command -v nginx >/dev/null; then
	echo "→ เขียน $NGINX_SNIPPET"
	{
		echo "# สร้างโดย deploy/cloudflare-ufw.sh — อย่าแก้มือ"
		echo "# ทำให้ \$remote_addr เป็น IP จริงของผู้ใช้ แทนที่จะเป็น IP ของ Cloudflare edge"
		for ip in $V4 $V6; do echo "set_real_ip_from $ip;"; done
		echo "real_ip_header CF-Connecting-IP;"
	} > "$NGINX_SNIPPET"
	nginx -t && systemctl reload nginx && echo "  ✓ nginx โหลดค่าใหม่แล้ว"
fi

ufw --force enable >/dev/null
echo
echo "✓ เสร็จ — สรุปกฎปัจจุบัน:"
ufw status | grep -E "$TAG|OpenSSH|Status" | head -8
echo "  ..."
echo
echo "ตรวจว่าปิดได้จริง (ต้อง timeout หรือ connection refused):"
echo "  curl -m 8 -sI --resolve YOUR_DOMAIN:443:\$(curl -s ifconfig.me) https://YOUR_DOMAIN/"

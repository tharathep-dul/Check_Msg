# ChekMsg — ผลการทดสอบ

- patterns: v0.4.0 (2026-08-09)
- testset: v0.4.0
- รันเมื่อ: 2026-08-11

## สรุปรายชุด

| ชุด | จำนวน | ตอบตรง | ตอบ unsure ทั้งที่ควรชัด | ตอบผิดข้าง |
|---|---:|---:|---:|---:|
| regression_v03 | 15 | 15 (100.0%) | 0 | 0 |
| holdout_bank_real | 12 | 11 (91.7%) | 1 | 0 |
| holdout_scam_th | 12 | 12 (100.0%) | 0 | 0 |
| holdout_scam_en | 6 | 6 (100.0%) | 0 | 0 |
| adversarial | 12 | 1 (8.3%) | 11 | 0 |
| holdout_ambiguous | 4 | 4 (100.0%) | 0 | 0 |

> ชุด `regression_v03` เขียนจาก keyword library ของ v0.3 เอง ห้ามใช้ตัวเลขจากชุดนี้อ้างความแม่นยำ

## Confusion matrix

นับรวมทุกชุด ยกเว้น `regression_v03` รวม 46 ข้อความ — **ชุด `adversarial` ถูกนับรวมด้วยโดยตั้งใจ** ถ้าตัดออกตัวเลขจะสวยเกินจริง

| ควรได้ \ ระบบตอบ | scam | legit | unsure |
|---|---:|---:|---:|
| scam | 19 | 0 | 7 |
| legit | 0 | 11 | 5 |
| unsure | 0 | 0 | 4 |

- precision (ที่ตอบว่า scam แล้วเป็น scam จริง): **100.0%**
- recall (สแกมทั้งหมด จับได้กี่ %): **73.1%**
- F1: **84.4%**
- ผิดข้างแบบอันตราย (scam → legit): **0**
- ตอบ `unsure` ทั้งที่ควรตอบชัด: **12/46** (26.1%)

## รายการที่ยังไม่ผ่าน

| ชุด | id | ควรได้ | ระบบตอบ | scam/legit | ข้อความ |
|---|---|---|---|---|---|
| holdout_bank_real | b12 | legit | unsure | 1/0 | We detected an urgent security issue on your card. Please call us at t |
| adversarial | x01 | scam | unsure | 0/0 | พัสดุของท่านค้างอยู่ที่ด่าน กรุณาชำระค่าภาษีนำเข้า 45 บ. ที่ลิงค์นี้ |
| adversarial | x02 | scam | unsure | 3/0 | แจ้งเตือน บช. ของท่านจะถูกปิดชั่วคราว โปรดยืนยันตน ก ด ลิ ง ก์ ด้านล่า |
| adversarial | x03 | scam | unsure | 0/0 | Kindly reply with the 6 digit code we just sent so we can cancel the t |
| adversarial | x04 | scam | unsure | 0/0 | สนใจงานเสริมมั้ยคะ ทำงานผ่านมือถือ วันละ 3 ชม. ได้เงินทุกวัน สอบถามได้ |
| adversarial | x05 | scam | unsure | 0/0 | ท่านมีสิทธิ์รับเงินช่วยเหลือจากภาครัฐ 3,000 บาท ลงทะเบียนที่ gov-help. |
| adversarial | x06 | scam | unsure | 0/0 | Final notice: unpaid toll of 320 THB. Settle today to avoid legal acti |
| adversarial | x07 | scam | unsure | 0/0 | ผมเจ้าหน้าที่จากหน่วยงานรัฐ บัญชีคุณเกี่ยวข้องกับคดี ต้องย้ายเงินไปพัก |
| adversarial | x08 | legit | unsure | 3/0 | ธนาคารกรุงไทย เสนอสินเชื่อบุคคล ดอกเบี้ยต่ำพิเศษ สมัครได้ที่ krungthai |
| adversarial | x09 | legit | unsure | 3/0 | ไปรษณีย์ไทยแจ้ง พัสดุ EX123456789TH ถึงปลายทางแล้ว ตรวจสอบที่ track.th |
| adversarial | x10 | legit | unsure | 0/0 | Reminder: your credit card payment is due tomorrow. Pay via the app to |
| adversarial | x11 | legit | unsure | 3/0 | ยืนยันการจองโรงแรมเรียบร้อย เข้าพัก 12 ส.ค. หากต้องการยกเลิก กดที่ลิงก |

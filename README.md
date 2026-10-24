# YT No Ads

เว็บเล่น YouTube แบบไม่มี banner/โฆษณารอบข้าง — ค้นหาเหมือน YouTube กดเล่นผ่าน `youtube-nocookie.com`

## ขอ API Key (ฟรี)

1. ไป https://console.cloud.google.com → สร้าง project
2. Enable **YouTube Data API v3**
3. Credentials → Create API key → copy key

## รัน local

```bash
cp .env.example .env   # ใส่ VITE_YT_API_KEY=xxx
npm install
npm run dev            # http://localhost:5173
npm run build          # ตรวจ build ผ่าน
```

## Deploy Vercel

```bash
npx vercel
# หรือ push ขึ้น GitHub → Import ใน vercel.com
# ตั้ง Env: YT_API_KEY = <key เดียวกัน> (ห้ามใช้ VITE_ นำหน้าใน prod — proxy อ่านฝั่ง server)
```

## คีย์ลัด (ตอนมีเพลงเล่น)

| คีย์ | ทำอะไร |
|---|---|
| `Space` / `K` | เล่น / หยุด |
| `M` | ปิด/เปิดเสียง |
| `←` / `→` | ถอย / ไป 5 วิ (Shift = 10 วิ) |
| `↑` / `↓` | เสียง +10 / −10 |
| `Shift+N` / `Shift+P` | เพลงถัดไป / ก่อนหน้า |
| `L` | เล่นเพลงเดิมซ้ำ (loop) |
| `A` | สลับโหมด 🎧 เสียงอย่างเดียว |
| `C` | สลับ 🚗 โหมดรถ |
| `F` | เต็มจอ (ถ้าย่ออยู่ = ขยายก่อน) |
| `🗕` / `Esc` | ย่อลงแถบล่าง / ปิด player |

กดข้ามได้ตอน focus ไม่ได้อยู่ในช่องพิมพ์ — ไม่ดักคีย์ใน SearchBar

## Media Session

รองรับ `play / pause / previoustrack / nexttrack / seekbackward / seekforward / seekto / toggleplaypause` + อัปเดต `positionState` ทุกวิ — ใช้งานได้กับหน้าจอล็อก iOS/Android, หูฟังบลูทูธ, CarPlay/Android Auto และปุ่มมีเดียบนคีย์บอร์ด

## หมายเหตุ

- ไม่มี key → หน้า Trending จะว่าง แต่ code ไม่พัง; ช่อง search จะแจ้งเตือนให้ใส่ key
- History เก็บใน localStorage สูงสุด 20 รายการ
- ใช้ plain CSS แทน Tailwind (ตั้งใจลด dep — ใส่ Tailwind ทีหลังได้ถ้าดีไซน์ซับซ้อน)

# LH Order TikTok Helper

เว็บแอป `Node.js + Express + MongoDB` สำหรับนำเข้าข้อมูล TikTok รายวัน แล้วสรุปผลเป็นรายงาน:
- รายวัน สำหรับเช็กยอดขายและใช้งานหน้างาน
- รายเดือน สำหรับรวมยอดไปลง ERP

## Stack

- Node.js 20+
- MongoDB
- Express
- EJS
- Docker หรือ PM2

## Environment

คัดลอก `.env.example` เป็น `.env`

```env
PORT=6600
MONGODB_URI=mongodb://127.0.0.1:27017/?directConnection=true
DATABASE_NAME=lh_order_tiktok_helper
```

## Run Local

```bash
npm install
npm run dev
```

หรือ

```bash
npm start
```

## Main Routes

- `GET /`
- `GET /reports`
- `GET /reports/daily?date=YYYY-MM-DD`
- `GET /reports/monthly?month=YYYY-MM`
- `GET /api/tiktok-settled-sales/health`
- `POST /api/tiktok-settled-sales/import/orders`
- `POST /api/tiktok-settled-sales/import/income`
- `POST /api/tiktok-settled-sales/import/product-master`
- `GET /api/tiktok-settled-sales/daily-summary?date=YYYY-MM-DD`
- `GET /api/tiktok-settled-sales/monthly-summary?month=YYYY-MM`

## Docker Deploy

เหมาะสุดสำหรับใช้งานบนเซิร์ฟเวอร์ เพราะ deploy ซ้ำง่ายและ environment คงที่

1. clone repo ลงเครื่องเซิร์ฟเวอร์
2. สร้าง `.env`
3. แก้ `MONGODB_URI` ให้ชี้ไป MongoDB จริง
4. รันคำสั่งด้านล่าง

```bash
docker compose build
docker compose up -d
docker compose logs -f app
```

เช็กระบบ:

```bash
curl http://127.0.0.1:6600/api/tiktok-settled-sales/health
```

อัปเดตเวอร์ชันใหม่:

```bash
git pull
docker compose up -d --build
```

หยุดระบบ:

```bash
docker compose down
```

## PM2 Deploy

ใช้ได้ถ้าต้องการรันแอปแบบไม่ใช้ Docker

```bash
npm ci --omit=dev
pm2 start ecosystem.config.cjs --only lh-order-tiktok-helper --env production
pm2 save
```

## Data Rules

- `income` เป็น source of truth ด้านการเงินและวัน settlement
- `orders` เป็น source of truth ด้านสินค้าและจำนวนขาย
- ระบบ join ข้อมูลด้วย `Order ID`
- startup จะสร้าง collection และ sync index ให้อัตโนมัติ
- import ซ้ำของ `income` จะ `skip duplicates`

## Public Repo Safety

- อย่า commit `.env`
- อย่า commit ไฟล์ Excel จริง, report export, หรือข้อมูลธุรกิจจริง
- ใช้ placeholder สำหรับ host, path, และ repo ในเอกสารหรือ config ตัวอย่าง

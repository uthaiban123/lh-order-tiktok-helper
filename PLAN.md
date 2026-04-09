# TikTok Settled Sales Summary

## Summary
สร้างระบบนำเข้าข้อมูล TikTok รายวัน 2 แหล่ง แล้วสะสมเป็นฐานข้อมูลกลางเพื่อใช้งาน 2 แบบ:
- `Daily settled product summary` สำหรับตัดสต๊อก
- `Monthly settled product summary` สำหรับสรุปยอดไปกรอก ERP

ระบบต้องรับข้อมูล 2 แหล่งแล้ว join กันด้วย `Order ID`:
- `Income/Settlement file` สำหรับระบุว่า order ไหน `settle` ในวันไหน และได้เงินสุทธิ/ค่าธรรมเนียมเท่าไร
- `Order export file` เช่น `ทั้งหมด คำสั่งซื้อ...xlsx` สำหรับระบุว่า order นั้นขายสินค้าอะไร `seller_sku`, `product name`, `qty`, `item amount`

หลักการสำคัญ:
- ใช้ `settlement date` เป็นแกนของการนับยอดสินค้า
- อัปโหลดไฟล์ทุกวันได้ และข้อมูลต้องสะสมข้ามวันเพื่อออกรายงานรายเดือน
- รายงาน Daily และ Monthly ต้องมาจากชุดข้อมูลเดียวกัน ต่างกันแค่ช่วงวันที่

ผลลัพธ์หลักของระบบ:
- summary การเงินตามวัน/เดือน จาก income file
- summary ระดับสินค้า ของ orders ที่ settle ในช่วงวันที่เลือก
- mapping `seller_sku` เช่น `F08059023-2` ไปเป็น `base product code = F08059023` และ `pack multiplier = 2`
- export summary ที่อ่านง่ายสำหรับนำไปตัดสต๊อกและกรอก ERP

## Key Changes
- เพิ่ม backend feature ใหม่แบบ modular ใต้ `server/routes/api/` สำหรับ TikTok settled sales
- เพิ่มหน้า frontend ใหม่ใน hash routing สำหรับ daily/monthly settled summary
- เพิ่ม permission ใหม่เฉพาะหน้านี้ ถ้าไม่ต้องการเปิดกว้างให้ผู้ใช้ทุกคน

### Backend
- `POST /api/tiktok-settled-sales/preview-income`
  - รับไฟล์ income/settlement
  - parse ชีต `Order details`, `Reports`, `Withdrawal records`
  - normalize เป็น batch preview
- `POST /api/tiktok-settled-sales/preview-orders`
  - รับไฟล์ order export
  - parse รายการสินค้าในแต่ละ order
  - normalize เป็น preview
- `POST /api/tiktok-settled-sales/commit`
  - commit batch ที่ preview แล้ว
  - รองรับการ commit แยกฝั่ง income และ orders คนละเวลา
  - ถ้าอีกฝั่งยังไม่มา ให้เก็บไว้รอ join ภายหลัง
- `GET /api/tiktok-settled-sales/daily-summary?date=YYYY-MM-DD`
  - คืน summary ของวันที่ settle
  - ใช้สำหรับตัดสต๊อก
- `GET /api/tiktok-settled-sales/monthly-summary?month=YYYY-MM`
  - คืน summary ของเดือนที่ settle
  - ใช้สำหรับกรอก ERP
- `GET /api/tiktok-settled-sales/batches`
  - ดูประวัติการนำเข้า
- `GET /api/tiktok-settled-sales/batches/:id`
  - ดูรายละเอียด batch

### Storage
- `tiktok_income_batches`
  - metadata ของการนำเข้าแต่ละรอบ
  - เก็บ `batchType` เป็น `income` หรือ `orders`
  - เก็บ `fileHash`, `filename`, `uploadedBy`, `period`, `status`, `warningCount`
- `tiktok_income_entries`
  - เก็บรายการระดับ order จากไฟล์ income
  - key หลัก: `orderId` + `settlementDate` + `batchId`
- `tiktok_order_items`
  - เก็บรายการระดับสินค้าในแต่ละ order จาก order export
  - key หลัก: `orderId` + `sellerSku` + `lineNo` หรือ equivalent unique row key
- `tiktok_order_headers`
  - เก็บข้อมูลระดับ order จาก order export เช่น `orderStatus`, `createdTime`, `paidTime`
  - ใช้กันการนับซ้ำ field ระดับ order เช่น `Order Amount`
- `tiktok_product_master`
  - เก็บข้อมูล product master จาก TikTok เพื่อใช้ช่วยแปล SKU
  - field สำคัญ: `sellerSkuRaw`, `baseProductCode`, `packMultiplier`, `productName`, `skuId`, `productId`

### Join Logic
- join หลักด้วย `Order ID`
- Daily summary ใช้เฉพาะ orders ที่มี `settlementDate = วันที่เลือก`
- Monthly summary ใช้เฉพาะ orders ที่มี `settlementDate` อยู่ในเดือนที่เลือก
- ดึง item rows ของ order เหล่านั้นจาก `tiktok_order_items`
- ถ้า order file ของวันนั้นยังไม่ถูกอัปโหลด ระบบต้องสามารถ backfill item summary ได้เมื่อมีไฟล์ orders เข้ามาภายหลัง
- สร้าง SKU summary 2 ระดับ:
  - ระดับ TikTok SKU
  - ระดับ base product code
- คำนวณ:
  - `ordersCount`
  - `soldUnitsTikTok = sum(qty)`
  - `equivalentBaseUnits = sum(qty * packMultiplier)`
  - `grossItemAmount = sum(item subtotal after discount)`
- รายได้และค่าธรรมเนียมใช้ข้อมูลจาก income file เท่านั้น
- สินค้าและจำนวนใช้ข้อมูลจาก order export เท่านั้น

### SKU Parsing Rule
- ใช้ `seller_sku` เป็น source หลัก
- format ที่รองรับ:
  - `F08043102` -> base code `F08043102`, multiplier `1`
  - `F08059023-2` -> base code `F08059023`, multiplier `2`
- split จาก `-` ตัวสุดท้ายเท่านั้น
- ถ้า suffix ไม่ใช่เลขจำนวนเต็มบวก ให้ fallback เป็น multiplier `1`
- เก็บทั้งค่า raw และ normalized ทุกครั้ง

### Finance Summary
- summary การเงินใช้ข้อมูลจาก income file เท่านั้น
- field หลักที่ต้องแสดง:
  - `Total Revenue`
  - `Total Settlement Amount`
  - `Subtotal after seller discounts`
  - `Seller discounts`
  - `Refund subtotal`
  - `Total Fees`
  - `Transaction fee`
  - `TikTok Shop commission fee`
  - `Seller shipping fee`
  - `Affiliate commission`
  - `LIVE Specials service fee`
  - `Commerce growth fee`
  - `Infrastructure fee`
  - `Total adjustments`
  - `Withdrawal amount`
- ถ้ามี withdrawals ในวันเดียวกันหรือเดือนเดียวกัน ให้แสดงแยกจาก settlement summary ไม่รวมมั่วกัน

## Data Caveats
- income file อย่างเดียวไม่พอสำหรับสรุประดับสินค้า
- order export file อย่างเดียวไม่พอสำหรับตอบว่าเงินเข้าเมื่อไรและได้เงินสุทธิเท่าไร
- ดังนั้นรายงานที่ถูกต้องต้องอาศัยการ join ระหว่าง income file และ order export
- ไฟล์ order export มีข้อมูลระดับสินค้าใช้งานได้ดี เช่น `Order ID`, `Seller SKU`, `Product Name`, `Quantity`, `SKU Subtotal After Discount`
- field ระดับ order เช่น `Order Amount` อาจซ้ำทุกแถวของ order เดียวกัน ห้าม sum ตรงที่ระดับ item row
- ถ้า order ใน income ยังไม่เจอข้อมูลสินค้า ให้ถือว่าเป็น `missing order items`
- Daily/Monthly summary ต้องแสดง coverage ว่ามี settled orders ที่ map สินค้าได้ครบกี่ order
- การตัดสต๊อกและ summary ERP ควรอิงเฉพาะ order ที่ join สินค้าได้สำเร็จ พร้อม warning ส่วนที่ยังขาด

## Frontend
- เพิ่ม route/page ใหม่ใน `App.jsx`
- เพิ่มเมนูใน `Sidebar.jsx`
- หน้าใหม่มี 3 มุมหลัก:
  - import panel สำหรับอัปโหลด daily files
  - daily settled summary สำหรับตัดสต๊อก
  - monthly settled summary สำหรับ ERP
- Daily summary มี 4 ส่วน:
  - ตัวเลือกวันที่ `settlement date`
  - การ์ด summary การเงิน
  - ตาราง SKU summary
  - ตาราง warning / coverage
- Monthly summary มี 4 ส่วน:
  - ตัวเลือกเดือน `YYYY-MM`
  - การ์ด summary การเงินรวมทั้งเดือน
  - ตาราง base product summary สำหรับ ERP
  - ตาราง warning / coverage
- มี import panel สำหรับอัปโหลด:
  - income file
  - order export file
  - optional product master file
- ใช้ `ToastNotification` ทุกกรณี
- ใช้ same-origin API เท่านั้น

## Public Interfaces / Data
- Daily summary คืน payload แบบ:
  - `date`
  - `financeSummary`
  - `withdrawalSummary`
  - `skuSummary[]`
  - `baseProductSummary[]`
  - `warnings[]`
  - `sourceStats`
- Monthly summary คืน payload แบบ:
  - `month`
  - `financeSummary`
  - `withdrawalSummary`
  - `skuSummary[]`
  - `baseProductSummary[]`
  - `warnings[]`
  - `sourceStats`
- `skuSummary[]` ขั้นต่ำ:
  - `sellerSku`
  - `productName`
  - `baseProductCode`
  - `packMultiplier`
  - `ordersCount`
  - `soldUnitsTikTok`
  - `equivalentBaseUnits`
  - `grossItemAmount`
- `baseProductSummary[]` ขั้นต่ำ:
  - `baseProductCode`
  - `productName`
  - `ordersCount`
  - `soldUnitsTikTok`
  - `equivalentBaseUnits`
  - `grossItemAmount`
- `warnings[]` ขั้นต่ำ:
  - `type`
  - `message`
  - `orderId`
  - `sellerSku`
- `sourceStats` ขั้นต่ำ:
  - `settledOrders`
  - `matchedOrders`
  - `missingOrderItemOrders`
  - `unmatchedItemRows`
  - `coveragePercent`

## Test Plan
- income file อย่างเดียว ต้อง preview และ commit ได้
- order export file อย่างเดียว ต้อง preview และ commit ได้
- ถ้ามีฝั่งเดียวก่อน ระบบต้องรอ join อีกฝั่งได้ ไม่บังคับให้มาพร้อมกัน
- เมื่อมีทั้งสองไฟล์:
  - Daily summary วันที่ settle ต้องรวมเฉพาะ orders ที่ settle วันนั้น
  - Monthly summary ต้องรวมเฉพาะ orders ที่ settle อยู่ในเดือนนั้น
  - SKU `F08059023-2` ที่ qty = 3 ต้องได้ `soldUnitsTikTok = 3` และ `equivalentBaseUnits = 6`
  - finance totals ต้องตรงกับ `Reports`
  - withdrawals ต้องแสดงแยก
- order ที่มี settlement วันนี้แต่ยังไม่มี item rows ต้องขึ้น warning
- เมื่ออัปโหลด order export ภายหลัง ระบบต้อง backfill ให้ daily/monthly summary ครบขึ้น
- duplicate import ของไฟล์เดิมต้องถูกจับจาก `fileHash`
- parse seller SKU ผิดรูปแบบต้องไม่ทำให้ batch ล้มทั้งก้อน
- การรวมยอด `Order Amount` ต้องไม่ซ้ำเมื่อ order หนึ่งมีหลาย item rows

## Assumptions
- เป้าหลักของ Daily summary คือใช้ตัดสต๊อก
- เป้าหลักของ Monthly summary คือใช้กรอก ERP
- income file เป็น source of truth ด้านการเงินและ `settlement date`
- order export file เป็น source of truth ด้านสินค้าและจำนวนขาย
- product master file เป็นตัวช่วยเสริมสำหรับ metadata และการตรวจ SKU
- ระบบต้องรองรับการอัปโหลดรายวันและคำนวณ summary ย้อนหลังจากข้อมูลสะสม

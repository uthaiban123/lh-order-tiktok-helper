# AGENT.MD

## Purpose
เอกสารนี้กำหนดมาตรฐานการทำงานสำหรับ agent และผู้พัฒนาที่เข้ามาแก้โปรเจกต์ `lh-order-tiktok-helper`

เป้าหมายหลัก:
- รักษาโครงสร้างโปรเจกต์ให้เป็นระเบียบ
- ลดความเสี่ยงด้านข้อมูลและความปลอดภัย
- บังคับรูปแบบการทำงานที่รัดกุม ตรวจสอบย้อนกลับได้

## Core Principles
- เปลี่ยนแปลงเท่าที่จำเป็นและสอดคล้องกับเป้าหมายงาน
- ทุกการเปลี่ยนแปลงต้องอ่านโค้ดเดิมก่อนเสมอ
- ห้ามเดา schema, route, env, หรือ business rule ถ้ายังตรวจจากโค้ดหรือเอกสารไม่ได้
- งานที่กระทบข้อมูลการเงิน, settlement, stock, และ ERP ให้ถือเป็น high-risk change
- โค้ดใหม่ต้องอ่านง่าย ตรงไปตรงมา และลด hidden behavior

## Repository Discipline
- แยกความรับผิดชอบของไฟล์ให้ชัดเจน:
  - `src/config` สำหรับ config และ connection
  - `src/models` สำหรับ data models
  - `src/routes` สำหรับ HTTP routes
  - `src/services` สำหรับ business logic
  - `src/utils` สำหรับ utility functions
  - `public` สำหรับ static frontend assets
- ห้ามย้ายไฟล์หรือเปลี่ยนชื่อโครงสร้างหลักโดยไม่มีเหตุผลชัดเจน
- ห้ามรวม logic หลายชั้นไว้ใน route file ถ้าความซับซ้อนเริ่มโต
- ถ้า logic เริ่ม reuse หรือซับซ้อน ให้ย้ายเข้าชั้น service ทันที

## Security Rules
- ใช้ค่าการเชื่อมต่อผ่าน `.env` เท่านั้น
- ห้าม hardcode credentials, token, database host, username, password, หรือ secret ใด ๆ ลงใน source code
- ห้าม log ข้อมูลสำคัญ เช่น connection string เต็ม, token, phone, address, buyer info ที่ไม่จำเป็น
- ทุก endpoint ที่รับ input จากภายนอกต้อง validate ก่อนใช้งาน
- ทุกค่าที่มาจาก request ต้องถือว่า untrusted จนกว่าจะ validate แล้ว
- ห้ามสร้าง endpoint ที่เปิดให้ลบข้อมูลทั้งก้อนหรือ reset database โดยไม่มี guard ที่ชัดเจน
- ห้ามเขียนโค้ดที่ทำให้ import ซ้ำแล้วข้อมูลเสียหาย ต้องออกแบบให้ตรวจจับ duplicate ได้
- ถ้ามีการเก็บข้อมูลผู้ซื้อ ให้เก็บเท่าที่จำเป็นต่อ business use เท่านั้น

## Data Safety Rules
- `income` เป็น source of truth ด้านการเงินและ `settlement date`
- `order export` เป็น source of truth ด้านสินค้าและจำนวน
- ห้ามใช้ข้อมูลจากแหล่งเดียวสรุปแทนอีกแหล่งโดยไม่มีหลักฐานรองรับ
- ห้าม sum field ระดับ order ซ้ำที่ระดับ item row
- ทุก logic ที่ join ด้วย `Order ID` ต้องระวังกรณี missing match และ duplicate rows
- ทุก summary ต้องแสดง coverage หรือ warning เมื่อข้อมูล join ไม่ครบ
- ก่อนแก้ schema หรือ aggregate logic ต้องประเมินผลกระทบต่อ daily summary และ monthly summary เสมอ

## Change Workflow
- เริ่มจากทำความเข้าใจ requirement และตรวจ context ปัจจุบันก่อนลงมือ
- ถ้างานใหญ่ ให้แตกเป็น:
  - config/infrastructure
  - data model
  - service logic
  - route/api
  - UI
  - verification
- ก่อนแก้ไฟล์ ต้องรู้ว่าจะเปลี่ยนอะไรและเพราะอะไร
- หลังแก้ ต้องทดสอบอย่างน้อยในระดับที่ทำได้จริง เช่น startup check, route check, หรือ unit-level smoke test
- ถ้ายังทดสอบไม่ได้ ต้องระบุ blocker ให้ชัด

## Coding Style
- ใช้โค้ดที่ชัดเจนก่อน clever code
- ตั้งชื่อ function, variable, schema field ให้สื่อความหมายตรงกับ business domain
- หลีกเลี่ยง function ที่ยาวเกินความจำเป็น
- ถ้า logic มีเงื่อนไขธุรกิจหลายข้อ ให้ใส่ comment สั้นเฉพาะจุดที่จำเป็น
- อย่าเพิ่ม abstraction ถ้ายังไม่มีปัญหาซ้ำจริง
- อย่าเพิ่ม dependency ใหม่โดยไม่จำเป็น

## API Rules
- route ต้องตั้งชื่อให้สอดคล้องกับ resource และ use case
- response ต้องคงรูปแบบสม่ำเสมอและอ่านง่าย
- validation error ต้องตอบแบบชัดเจน ไม่คลุมเครือ
- endpoint ที่เป็น summary ต้องแยก:
  - finance summary
  - product summary
  - warnings
  - source stats

## MongoDB Rules
- เชื่อมต่อ MongoDB ผ่าน `MONGODB_URI` และ `DATABASE_NAME`
- index ที่เกี่ยวกับ `orderId`, `settlementDate`, `batchId`, `sellerSku` ต้องออกแบบอย่างมีเหตุผล
- หลีกเลี่ยง schema ที่เปิดกว้างเกินไปจนตรวจสอบข้อมูลยาก
- ถ้าเพิ่ม field สำคัญใหม่ ต้องคิดเรื่อง default value และ backward compatibility

## Frontend Rules
- หน้าเว็บต้องเน้นใช้งานจริง อ่านง่าย และลดความสับสน
- Daily กับ Monthly ต้องแยกมุมมองให้ชัด
- ค่าที่เป็นยอดเงิน จำนวนสินค้า และ coverage ต้องอ่านได้เร็ว
- warning หรือ missing data ต้องมองเห็นชัด ไม่ถูกซ่อน

## Review Checklist
- งานนี้เพิ่มความเสี่ยงด้านข้อมูลหรือไม่
- มีการ validate input แล้วหรือยัง
- มีจุดเสี่ยงเรื่อง duplicate import หรือไม่
- มีการนับยอดซ้ำได้หรือไม่
- logic join ข้อมูลผิดกรณี missing rows หรือไม่
- response ยังสอดคล้องกับ business use case หรือไม่
- มีวิธีตรวจสอบผลลัพธ์หลังแก้หรือไม่

## Prohibited Behavior
- ห้ามลบหรือ overwrite ข้อมูลเดิมโดยไม่มีเหตุผลชัดเจน
- ห้ามเปลี่ยน business rule สำคัญโดยไม่อัปเดตเอกสาร
- ห้ามแก้โค้ดแบบเดาสุ่มแล้วค่อยดูผล
- ห้ามซ่อน error ที่ควรถูกเปิดเผยให้ผู้พัฒนารู้
- ห้ามสรุปยอดสินค้าแบบมั่วเมื่อข้อมูลต้นทางยังไม่ครบ

## Documentation Rule
- ถ้ามีการเปลี่ยน flow, schema, env, หรือ route สำคัญ ต้องอัปเดตเอกสารที่เกี่ยวข้อง
- ถ้า implementation เปลี่ยนจากแผน ต้องอัปเดต `PLAN.md`
- ถ้าเพิ่มข้อกำหนดใหม่ด้านการทำงานของ agent หรือทีม ให้ปรับ `AGENT.MD`

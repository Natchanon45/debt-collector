# Modularized JavaScript Structure

ไฟล์ `assets/js/app.js` ถูกแยกบางส่วนออกเป็น module เพื่อให้ดูแลและแก้ไขง่ายขึ้น โดยยังคงให้ `app.js` เป็นจุดเริ่มต้นหลักของระบบ

## ไฟล์ที่เพิ่ม

- `assets/js/config.js`  
  เก็บ `APP_INFO`, `APP_VERSION`, localStorage key และโครงสร้างข้อมูลว่างเริ่มต้น

- `assets/js/utils.js`  
  เก็บ helper ทั่วไป เช่น `$`, `today`, `num`, `money`, `maskId`, `escapeHtml`, `fileIcon`

- `assets/js/calculate.js`  
  เก็บ logic คำนวณ เช่น ยอดคงเหลือ, อายุ, จำนวนเดือนของสัญญา, ปัดเศษเงิน

- `assets/js/theme.js`  
  เก็บ logic โหมดสี light/dark/auto

## สิ่งที่ปรับเพิ่มเติม

- เพิ่ม `loading="lazy"` และ `decoding="async"` ให้รูปในรายการเอกสาร เพื่อลดการโหลดรูปพร้อมกัน
- เพิ่มไฟล์ module ใหม่เข้า `service-worker.js`
- ปรับ cache version เป็น `7.7.8`

## หมายเหตุ

การแยกไฟล์ช่วยให้แก้ไขง่ายขึ้นและลดโอกาสแก้พลาด แต่ performance หลักยังควรปรับต่อในรอบถัดไป เช่น pagination, limit query, ลด render ทั้งหน้า และ lazy preview สำหรับ PDF

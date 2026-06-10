# Phase 7.0 UI Refresh + Mobile PDF Modal

สิ่งที่ปรับในรอบนี้

- เปลี่ยนปุ่มขนาดเล็กที่เป็นข้อความ เช่น ปิด / ล้าง ให้เป็นปุ่มไอคอนวงกลม
- เพิ่มไอคอนให้ปุ่มสำคัญทั่วระบบอัตโนมัติ
- ปรับ Bottom Navigation เป็นแผง fixed ติดด้านล่าง ไม่ลอย และเน้น icon เป็นหลัก
- Active menu สีเขียวชัดเจน / inactive สีจาง
- Toast message กลับมาอยู่ด้านล่าง เหนือ Bottom Navigation และใช้ z-index สูงสุด
- Toast มี icon แยกประเภท success / warning / error / info
- แก้ PDF Preview Modal บนมือถือไม่ให้โดน Bottom Navigation บัง
- เมื่อเปิด Modal จะซ่อน Bottom Navigation อัตโนมัติ
- PDF สัญญายังคงสร้างแบบ fixed render โดยใช้ canvas/image template แล้วฝังเป็นภาพลง jsPDF ไม่ใช่ HTML reflow
- อัปเดต service worker cache เป็น phase7-0-ui-refresh

หลังอัปโหลดแนะนำกดล้าง Offline Cache 1 ครั้ง

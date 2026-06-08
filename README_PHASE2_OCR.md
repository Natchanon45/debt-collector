# Phase 2 OCR บัตรประชาชน

สิ่งที่เพิ่ม:
- ปุ่มเปิดกล้องมือถือด้วย `<input capture="environment">`
- Preview รูปบัตร
- ส่งรูปไป Cloud Function
- Google Cloud Vision OCR
- Auto-fill ชื่อ / เลขบัตร / ที่อยู่
- ต้อง login Firebase ก่อนเรียก OCR

## Deploy Cloud Function

ติดตั้ง Firebase CLI:
```bash
npm install -g firebase-tools
firebase login
```

เข้าโฟลเดอร์โปรเจกต์:
```bash
cd debt-collector-phase2-ocr
npm --prefix functions install
firebase deploy --only functions:ocrThaiIdCard
```

หลัง deploy จะได้ URL ประมาณ:
```text
https://asia-southeast1-project-987b9bba-eddc-4459-bdb.cloudfunctions.net/ocrThaiIdCard
```

นำ URL ไปใส่ใน:
```text
assets/js/firebase-config.js
```

ตรง:
```js
export const OCR_FUNCTION_URL = "YOUR_FUNCTION_URL";
```

## หมายเหตุความปลอดภัย
- ระบบตรวจ Firebase ID Token ก่อน OCR
- แนะนำไม่เก็บรูปบัตรถ้าไม่จำเป็น
- OCR อาจอ่านผิด ต้องให้ผู้ใช้ตรวจสอบก่อนบันทึก

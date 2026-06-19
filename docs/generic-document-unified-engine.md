# Generic Document Unified Engine Refactor

เป้าหมายคือรื้อระบบเอกสารทั่วไปให้ใช้ A4 engine เดียวกันทั้งระบบ เพื่อให้ตำแหน่งข้อความและลายเซ็นตรงกันทุกจุด

## Scope

- สร้าง/แก้ไขเอกสาร
- ดูตัวอย่าง
- พิมพ์/Export PDF
- วางตำแหน่งลายเซ็น
- หน้าเซ็นเอกสารภายนอก

## หลักการใหม่

ทุกหน้าต้อง render จากข้อมูลชุดเดียวกัน:

```text
GenericDocumentModel
  -> A4PageRenderer
  -> Editor / Preview / Signature Designer / Print / PDF
```

ห้ามแต่ละหน้าสร้าง HTML A4 ของตัวเองแยกกันอีก

## โครงสร้างข้อมูลใหม่

```js
{
  title: string,
  html: string,
  fontSize: number,
  page: {
    size: 'A4',
    widthMm: 210,
    heightMm: 297,
    marginTopMm: 18,
    marginRightMm: 16,
    marginBottomMm: 18,
    marginLeftMm: 16,
    lineHeight: 1.45
  },
  signatureObjects: [
    {
      id: 'party1_signature',
      signer: 'party1',
      type: 'signature',
      x: 10,
      y: 80,
      width: 34,
      height: 8
    },
    {
      id: 'party1_name',
      signer: 'party1',
      type: 'name',
      x: 10,
      y: 88,
      width: 34,
      height: 3,
      fontSize: 14
    },
    {
      id: 'party1_role',
      signer: 'party1',
      type: 'role',
      x: 10,
      y: 91,
      width: 34,
      height: 3,
      fontSize: 14
    },
    {
      id: 'party1_date',
      signer: 'party1',
      type: 'date',
      x: 10,
      y: 94,
      width: 34,
      height: 3,
      fontSize: 14
    }
  ]
}
```

## Phase 1

- เพิ่ม adapter แปลง `signaturePlacements` เดิมเป็น `signatureObjects`
- เพิ่ม renderer กลางสำหรับ A4 page
- ให้ Preview และ PDF ใช้ renderer เดียวกันก่อน

## Phase 2

- รื้อ Signature Designer ให้ลาก object แยก: ลายเซ็น / ชื่อ / บทบาท / วันที่
- เพิ่ม selection toolbar แบบ icon สำหรับ mobile
- เพิ่ม resize handle ต่อ object

## Phase 3

- รื้อหน้าเซ็นเอกสารภายนอกให้เป็น A4-first layout
- ลดฟอร์มยาวเหลือ bottom sheet / side panel
- หลังเซ็นแล้วนำข้อมูลเข้า renderer กลางทันที

## Phase 4

- รื้อหน้าแก้ไขเอกสารให้ใช้ renderer เดียวกับ preview
- ทดสอบตำแหน่งจาก Editor -> Preview -> Signature -> PDF ให้ตรงกัน

## Acceptance Criteria

- A4 ใน Editor, Preview, Signature Designer และ PDF มีขนาดและ margin เดียวกัน
- ตำแหน่ง object ใน Signature Designer ตรงกับ PDF
- ลายเซ็น ชื่อ บทบาท วันที่ ลากและ resize แยกกันได้
- Mobile ใช้งานได้โดยไม่ต้องเลื่อนหา option ยาว ๆ

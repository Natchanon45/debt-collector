# Phase 9 Final Mobile/Status Fix

- PDF generation uses the PNG template as a single full-page PNG image in jsPDF, not editable text layers.
- Filled PDF text is #0000ff, regular weight, and not bold by default.
- Borrower address overflow line is left-aligned so it continues naturally.
- Signature names are the same readable size as other filled fields and moved closer to the signature line.
- Contract list status shows signed count such as `4/5 : ยังแก้ไขได้อยู่`.
- Contract/document local state is updated immediately after saving so status refreshes without clearing cache.
- All button text is regular weight across the app.

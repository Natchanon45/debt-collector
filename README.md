Debt Collector Phase 3 PWA

Includes OCR Enhanced, Auto Create Debtor, Dashboard, Follow-up CRM, Email/Telegram reminder starter, Dropzone Upload, Offline Cache, Auto Update, Push Notification skeleton.

Deploy:
npm --prefix functions install
firebase deploy --only functions --project project-987b9bba-eddc-4459-bdb
firebase deploy --only hosting --project project-987b9bba-eddc-4459-bdb


UI Update:
- Bottom navigation with 4 main menus
- Extra menus moved to Settings
- Login user shown in header/settings
- Logout button visible in header and settings


V2 fixes:
- OCR district/province improved; Bangkok maps to province
- Top user icon dropdown with login name and logout
- Removed extra logout buttons
- Delete debtor only when not referenced by debts/followups/documents


V3 fixes:
- Duplicate Thai ID card validation
- User profile settings: alias/name, phone, LINE ID, Telegram ID
- Header shows app description, not email
- User icon-only dropdown on far right
- Action Bar rounded all sides and aligned with content width


Merged Nav v4:
- 4 pages only: Dashboard, Customers, Transactions, Settings
- Summary only on Dashboard
- OCR merged into Customers add flow
- Documents moved to Customers bottom
- Debt/Payment/Follow-up merged into Transactions
- Settings includes profile/PWA/backup
- More robust bottom nav click handling


Hotfix:
- Fixed app.js initialization crash caused by leftover selectedDebtorName/debtFormCard code.
- Login buttons bind correctly again.


Phase 4 Storage:
- Firebase Storage upload for documents
- Multiple files upload
- Firestore stores metadata: fileName, mimeType, size, storagePath, downloadURL
- Image preview
- PDF iframe preview
- Download/open file
- Delete file from Storage + Firestore metadata
- Storage security rules added at firebase/storage.rules

Deploy rules:
firebase deploy --only storage --project project-987b9bba-eddc-4459-bdb


Decimal hotfix: money fields accept only digits and one decimal point, limited to 2 decimals, with comma formatting on blur.

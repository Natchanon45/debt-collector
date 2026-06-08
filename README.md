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

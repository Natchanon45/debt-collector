import { firebaseConfig, OCR_FUNCTION_URL, TELEGRAM_TEST_FUNCTION_URL, VAPID_PUBLIC_KEY } from './firebase-config.js';
import { APP_INFO, APP_VERSION, LS, blank } from './config.js';
import { $, uid, today, num, money, maskId, normalizeIdCard, fullNameOf, isoDate, safeFileName, fileIcon, escapeHtml, formatDate } from './utils.js';
import { calc, calcAgeYears, addMonthsSafe, countContractMonths, roundMoney } from './calculate.js';
import { applyTheme, initTheme } from './theme.js';

let firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId), auth, db, storage, currentUser = null, demoMode = !firebaseReady, deferredPrompt = null, newWorker = null, latestData = null, pendingOcrDebtor = null;
function isDuplicateIdCard(id, ignoreId = '') { const v = normalizeIdCard(id); if (!v) return false; return (latestData?.debtors || []).some(d => d.id !== ignoreId && normalizeIdCard(d.idCard) === v) };

function cleanupSwalCheckboxLeak(includeCustomLockCheck = true) {
    const selector = includeCustomLockCheck ? '.swal2-checkbox, #swal2-checkbox, .dc-swal-check-wrap' : '.swal2-checkbox, #swal2-checkbox';
    document.querySelectorAll(selector).forEach(el => el.remove());
}

function privacySettings() {
    const p = currentProfile();
    return {
        showFullIdCard: p.showFullIdCard === true,
        showFullAddress: p.showFullAddress === true,
        showFullPhone: p.showFullPhone === true
    };
}

function displayIdCard(v) {
    const full = fullId(v);
    if (!full || full === '-') return '-';
    return privacySettings().showFullIdCard ? full : maskId(full);
}

function shortAddressText(v) {
    const raw = String(v || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '-';
    const parsed = parseThaiAddressParts(raw);
    if (parsed.houseNo) return `บ้านเลขที่ ${parsed.houseNo}`;
    return raw.length > 22 ? raw.slice(0, 22) + '…' : raw;
}

function displayAddress(v) {
    const raw = String(v || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '-';
    return privacySettings().showFullAddress ? raw : shortAddressText(raw);
}

function maskPhone(v) {
    const raw = String(v || '').trim();
    if (!raw) return '-';
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 7) return raw.length > 4 ? raw.slice(0, 2) + 'x'.repeat(Math.max(2, raw.length - 4)) + raw.slice(-2) : raw;
    return digits.slice(0, 3) + '-xxx-' + digits.slice(-4);
}

function displayPhone(v) {
    const raw = String(v || '').trim();
    if (!raw) return '-';
    return privacySettings().showFullPhone ? raw : maskPhone(raw);
}
function privacyInputSet(id, rawValue, displayValue) {
    const el = $(id);
    if (!el) return;
    const raw = String(rawValue || '').trim();
    el.dataset.rawValue = raw;
    el.value = displayValue == null ? raw : String(displayValue || '');
}
function privacyInputRaw(id) {
    const el = $(id);
    if (!el) return '';
    return (el.dataset.rawValue || el.value || '').trim();
}
function fillContractLenderPrivacyFields(profile = currentProfile()) {
    privacyInputSet('contractLenderPhone', profile.phone || '', displayPhone(profile.phone || ''));
    privacyInputSet('contractLenderIdCard', profile.lenderIdCard || '', displayIdCard(profile.lenderIdCard || ''));
    privacyInputSet('contractLenderAddress', profile.lenderAddress || '', displayAddress(profile.lenderAddress || ''));
}


function debtorFullAddress(debtor = {}) {
    return [debtor.houseNo, debtor.address, debtor.subDistrict, debtor.district, debtor.province].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function toast(m, type = 'info') {
    const el = $('toast'); if (!el) return;
    const msg = String(m || '');
    const autoType = /สำเร็จ|บันทึก|เพิ่ม|สร้าง|ลบแล้ว|เปิด|ล้าง Cache/.test(msg) ? 'success'
        : /ผิดพลาด|ไม่สำเร็จ|ไม่ได้|ลบไม่ได้|error|Error|ไม่พบ/.test(msg) ? 'error'
            : /กรุณา|เตือน|ยังไม่ได้|ต้อง/.test(msg) ? 'warning' : type;
    const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
    el.className = `toast toast-${autoType}`;
    el.innerHTML = `<i class="bi ${icons[autoType] || icons.info}"></i><span>${escapeHtml(msg)}</span>`;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(window.t);
    window.t = setTimeout(() => el.classList.remove('show'), 3200);
}


// ===== v9.0 Template Designer (Coordinate Override) =====
const PDF_TEMPLATE_OVERRIDE_LS = 'debt_collector_pdf_template_overrides_v9';
const PDF_TEMPLATE_FIELD_LABELS = {
    'header.contractNo': 'เลขที่สัญญา',
    'header.place': 'สถานที่ทำสัญญา',
    'header.day': 'วันที่ด้านบน',
    'header.month': 'เดือนด้านบน',
    'header.year': 'พ.ศ. ด้านบน',
    'borrower.name': 'ชื่อผู้กู้ด้านบน',
    'borrower.age': 'อายุผู้กู้',
    'borrower.houseNo': 'บ้านเลขที่ผู้กู้',
    'borrower.subDistrict': 'ตำบล/แขวง ผู้กู้',
    'borrower.district': 'อำเภอ/เขต ผู้กู้',
    'borrower.province': 'จังหวัดผู้กู้',
    'lender.name': 'ชื่อผู้ให้กู้ด้านบน',
    'clause1.borrowerLine': 'ชื่อผู้กู้ + เลขบัตร ข้อ 1',
    'clause1.lenderLine': 'ชื่อผู้ให้กู้ + เลขบัตร ข้อ 1',
    'clause1.amount': 'จำนวนเงินตัวเลข',
    'clause1.amountText': 'จำนวนเงินตัวอักษร',
    'clause1.satang': 'สตางค์ตัวอักษร',
    'clause1.satangFull': 'ขีดกรณี .00',
    'clause3.day': 'วันครบกำหนด',
    'clause3.month': 'เดือนครบกำหนด',
    'clause3.year': 'พ.ศ. ครบกำหนด',
    'clause4.interest': 'ดอกเบี้ย',
    'signatures.borrowerName': 'ชื่อลายเซ็นผู้กู้',
    'signatures.lenderName': 'ชื่อลายเซ็นผู้ให้กู้',
    'signatures.witness1Name': 'ชื่อลายเซ็นพยาน 1',
    'signatures.witness2Name': 'ชื่อลายเซ็นพยาน 2',
    'signatures.writerName': 'ชื่อลายเซ็นผู้เขียน'
};
let pdfTemplateDesignerState = { selected: 'clause1.amountText', previewUrl: '' };
function pdfTemplateLoadOverrides() {
    try { return JSON.parse(localStorage.getItem(PDF_TEMPLATE_OVERRIDE_LS) || '{}') || {}; }
    catch { return {}; }
}
function pdfTemplateSaveOverrides(overrides) {
    localStorage.setItem(PDF_TEMPLATE_OVERRIDE_LS, JSON.stringify(overrides || {}));
}
function clonePlain(obj) { return JSON.parse(JSON.stringify(obj || {})); }
function deepApplyPdfOverrides(target, overrides) {
    Object.entries(overrides || {}).forEach(([path, value]) => {
        const keys = path.split('.');
        let cur = target;
        for (let i = 0; i < keys.length - 1; i++) cur = cur?.[keys[i]];
        const last = keys[keys.length - 1];
        if (cur && cur[last] && typeof cur[last] === 'object') cur[last] = { ...cur[last], ...value };
    });
    return target;
}
function getPdfFieldByPath(map, path) {
    return String(path || '').split('.').reduce((acc, key) => acc?.[key], map);
}
function setPdfOverrideField(path, patch) {
    const overrides = pdfTemplateLoadOverrides();
    overrides[path] = { ...(overrides[path] || {}), ...patch };
    Object.keys(overrides[path]).forEach(k => {
        if (overrides[path][k] === '' || overrides[path][k] == null || Number.isNaN(overrides[path][k])) delete overrides[path][k];
    });
    pdfTemplateSaveOverrides(overrides);
}
function resetPdfOverrideField(path) {
    const overrides = pdfTemplateLoadOverrides();
    delete overrides[path];
    pdfTemplateSaveOverrides(overrides);
}
function flattenPdfFields(map, prefix = '') {
    const out = [];
    Object.entries(map || {}).forEach(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && 'x' in value && 'y' in value) out.push(path);
        else if (value && typeof value === 'object') out.push(...flattenPdfFields(value, path));
    });
    return out;
}

async function confirmAction(options = {}) {
    const title = options.title || 'ยืนยันการดำเนินการ';
    const text = options.text || '';
    const html = options.html || '';
    const confirmButtonText = options.confirmButtonText || 'ยืนยัน';
    const cancelButtonText = options.cancelButtonText || 'ยกเลิก';
    const icon = options.icon || 'warning';
    const isLockDocumentConfirm = options.lockDocumentConfirm === true;
    if (window.Swal?.fire) {
        const swalOptions = {
            icon,
            title,
            showCancelButton: true,
            confirmButtonText,
            cancelButtonText,
            confirmButtonColor: options.confirmButtonColor || '#16a34a',
            cancelButtonColor: options.cancelButtonColor || '#64748b',
            reverseButtons: true,
            heightAuto: false,
            didOpen: (popup) => {
                cleanupSwalCheckboxLeak(false);
                popup.querySelectorAll('.swal2-checkbox, #swal2-checkbox').forEach(el => el.remove());
            },
            willClose: () => cleanupSwalCheckboxLeak(),
            didClose: () => cleanupSwalCheckboxLeak()
        };

        if (isLockDocumentConfirm) {
            const lockHtml = html || text || 'หลังดำเนินการนี้ จะไม่สามารถแก้ไขข้อมูลใดๆ ได้อีก';
            swalOptions.html = `
                <div style="line-height:1.7;text-align:center">
                    ${lockHtml}
                    <label class="dc-swal-check-wrap" style="margin-top:14px;display:flex;gap:8px;align-items:flex-start;justify-content:center;text-align:left;font-weight:900;color:#334155">
                        <input type="checkbox" id="dcLockConfirmCheck" style="margin-top:5px;accent-color:#dc2626">
                        <span>${options.checkboxText || 'ฉันเข้าใจแล้ว และต้องการล็อกเอกสาร'}</span>
                    </label>
                </div>`;
            swalOptions.preConfirm = () => {
                const checked = document.getElementById('dcLockConfirmCheck')?.checked === true;
                if (!checked) {
                    window.Swal.showValidationMessage(options.checkboxError || 'กรุณายืนยันก่อนดำเนินการ');
                    return false;
                }
                return true;
            };
        } else if (html) {
            swalOptions.html = html;
        } else {
            swalOptions.text = text;
        }

        const result = await window.Swal.fire(swalOptions);
        return result.isConfirmed === true;
    }
    return window.confirm(`${title}${text ? '\n' + text : ''}`);
}

async function alertAction(options = {}) {
    const title = options.title || '';
    const text = options.text || '';
    const icon = options.icon || 'success';
    if (window.Swal?.fire) {
        cleanupSwalCheckboxLeak();
        await window.Swal.fire({ icon, title, text, confirmButtonText: options.confirmButtonText || 'ตกลง', confirmButtonColor: options.confirmButtonColor || '#16a34a', heightAuto: false, didOpen: () => cleanupSwalCheckboxLeak(), willClose: () => cleanupSwalCheckboxLeak(), didClose: () => cleanupSwalCheckboxLeak() });
        cleanupSwalCheckboxLeak();
        return;
    }
    toast(title || text);
}
function getProfileName() {
    const p = (latestData?.settings?.profile) || latestData?.settings || {};
    return p.alias || p.displayName || currentUser?.displayName || currentUser?.email || 'ผู้ใช้งาน';
}
function setUserDisplay(text) {
    const name = text || getProfileName();
    if ($('loginUserText')) $('loginUserText').textContent = 'ระบบติดตามทวงหนี้';
    if ($('settingsUserText')) $('settingsUserText').textContent = name || 'ยังไม่ได้ตั้งชื่อผู้ใช้งาน';
    if ($('dropdownUserText')) $('dropdownUserText').textContent = name || '-';
    if ($('userMenuWrap')) $('userMenuWrap').classList.toggle('hidden', !currentUser && !demoMode);
}
function local() { return JSON.parse(localStorage.getItem(LS) || JSON.stringify(blank)) } function setLocal(d) { localStorage.setItem(LS, JSON.stringify({ ...blank, ...d })) }
async function getData() { if (demoMode) return local(); const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'); const names = ['debtors', 'debts', 'payments', 'followups', 'documents', 'contracts', 'settings']; const result = {}; for (const n of names) { const snap = await getDocs(collection(db, `users/${currentUser.uid}/${n}`)); result[n] = snap.docs.map(d => ({ id: d.id, ...d.data() })) } result.settings = (result.settings || []).reduce((acc, x) => ({ ...acc, ...x, profile: { ...(acc.profile || {}), ...(x.profile || {}) } }), {}); return { ...blank, ...result } }
async function add(type, row) { if (demoMode) { const d = local(); const id = uid(); d[type].push({ id, ...row }); setLocal(d); return id } const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'); const ref = await addDoc(collection(db, `users/${currentUser.uid}/${type}`), { ...row, createdAt: serverTimestamp() }); return ref.id }
async function addMany(type, rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return [];
    if (demoMode) {
        const d = local();
        const ids = list.map(() => uid());
        d[type].push(...list.map((row, i) => ({ id: ids[i], ...row })));
        setLocal(d);
        latestData = d;
        return ids;
    }
    const { collection, doc, writeBatch, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const batch = writeBatch(db);
    const col = collection(db, `users/${currentUser.uid}/${type}`);
    const ids = [];
    list.forEach(row => {
        const ref = doc(col);
        ids.push(ref.id);
        batch.set(ref, { ...row, createdAt: serverTimestamp() });
    });
    await batch.commit();
    return ids;
}
async function updateRow(type, id, row) { if (demoMode) { const d = local(); d[type] = d[type].map(x => x.id === id ? { ...x, ...row } : x); setLocal(d); return } const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'); await updateDoc(doc(db, `users/${currentUser.uid}/${type}/${id}`), row) }
async function deleteRow(type, id) {
    if (demoMode) { const d = local(); d[type] = d[type].filter(x => x.id !== id); setLocal(d); return }
    const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    await deleteDoc(doc(db, `users/${currentUser.uid}/${type}/${id}`));
}
async function saveSettings(row) { if (demoMode) { const d = local(); d.settings = { ...(d.settings || {}), ...row, profile: { ...((d.settings || {}).profile || {}), ...(row.profile || {}) } }; setLocal(d); latestData = { ...(latestData || blank), settings: d.settings }; return } const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'); await setDoc(doc(db, `users/${currentUser.uid}/settings/profile`), row, { merge: true }); latestData = { ...(latestData || blank), settings: { ...((latestData || {}).settings || {}), ...row, profile: { ...(((latestData || {}).settings || {}).profile || {}), ...(row.profile || {}) } } }; }
function canDeleteDebtor(id, d = latestData) {
    if (!d) return false;
    return !d.debts.some(x => x.debtorId === id) && !d.followups.some(x => x.debtorId === id) && !d.documents.some(x => x.debtorId === id) && !(d.contracts || []).some(x => x.debtorId === id);
}

async function uploadDocumentFiles(debtorId, type, files) {
    if (demoMode) {
        for (const f of files) { await add('documents', { debtorId, type, fileName: f.name, mimeType: f.type, size: f.size, createdDate: today(), storagePath: '', downloadURL: '' }) }
        return;
    }
    const { ref, uploadBytes, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js');
    for (const f of files) {
        const path = `users/${currentUser.uid}/debtors/${debtorId}/${Date.now()}_${safeFileName(f.name)}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, f, { contentType: f.type || 'application/octet-stream' });
        const downloadURL = await getDownloadURL(fileRef);
        await add('documents', { debtorId, type, fileName: f.name, mimeType: f.type || '', size: f.size || 0, createdDate: today(), storagePath: path, downloadURL });
    }
}
async function deleteDocument(docId, opts = {}) {
    const doc = (latestData?.documents || []).find(x => x.id === docId);
    if (!doc) return toast('ไม่พบเอกสาร');
    const linkedContract = (latestData?.contracts || []).find(c => c.documentId === docId);
    if (linkedContract && !opts.force) {
        return toast('เอกสารนี้ผูกกับสัญญา กรุณาลบ/แก้ไขจากหน้าสัญญา เพื่อป้องกันเปิดเอกสารไม่ได้');
    }
    if (!opts.skipConfirm) { const ok = await confirmAction({ title: 'ยืนยันการลบเอกสาร', text: `ลบเอกสาร ${doc.fileName || ''} ใช่หรือไม่?`, confirmButtonText: 'ลบเอกสาร', confirmButtonColor: '#dc2626' }); if (!ok) return; }
    if (!demoMode && doc.storagePath) {
        try { const { ref, deleteObject } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js'); await deleteObject(ref(storage, doc.storagePath)); } catch (e) { console.warn('Storage delete warning', e) }
    }
    await deleteRow('documents', docId);
    toast('ลบเอกสารแล้ว');
    render();
}
window.deleteDocument = deleteDocument;
async function freshStorageUrl(storagePath) {
    if (demoMode || !storagePath) return '';
    try {
        const { ref, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js');
        return await getDownloadURL(ref(storage, storagePath));
    } catch (e) {
        console.warn('Cannot refresh Storage URL', e);
        return '';
    }
}
function showPreviewModal(title, url, mime = '', fileName = '') {
    $('previewTitle').textContent = title || fileName || 'ดูเอกสาร';
    const safeUrl = String(url || '');
    if (mime.startsWith('image/')) $('previewBody').innerHTML = `<img src="${safeUrl}" alt="${escapeHtml(fileName || '')}">`;
    else if (mime.includes('pdf') || String(fileName || '').toLowerCase().endsWith('.pdf')) $('previewBody').innerHTML = `<iframe src="${safeUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH" title="PDF Preview"></iframe>`;
    else $('previewBody').innerHTML = `<div class="empty"><i class="bi ${fileIcon(mime, fileName)}"></i><br>ไม่รองรับ Preview ไฟล์ชนิดนี้<br>กดดาวน์โหลด/เปิดไฟล์</div>`;
    $('previewDownloadBtn').href = safeUrl;
    if (fileName) $('previewDownloadBtn').download = fileName;
    $('documentPreviewModal').classList.remove('hidden');
    document.body.classList.add('modal-open');
}
window.previewDocument = async (id) => {
    const doc = (latestData?.documents || []).find(x => x.id === id);
    if (!doc) return toast('ไม่พบเอกสาร');
    const url = await freshStorageUrl(doc.storagePath) || doc.downloadURL;
    if (!url) return toast('ไฟล์นี้ยังไม่มี URL สำหรับเปิดดู หรือไฟล์ถูกลบจาก Storage แล้ว');
    showPreviewModal(doc.fileName || 'ดูเอกสาร', url, doc.mimeType || '', doc.fileName || '');
};

async function render() {
    const d = await getData(); latestData = d;
    const c = calc(d), due = dueDebtsForFollowup(c).sort((a, b) => b.daysOverdue - a.daysOverdue || b.remaining - a.remaining), followToday = d.followups.filter(f => String(f.nextFollowupDate || f.contactDate || '') <= today());
    const dueToday = c.debts.filter(x => x.isDueToday);
    const overdue = due.filter(x => Number(x.daysOverdue || 0) > 0);
    $('debtorCount').textContent = d.debtors.length;
    $('debtTotal').textContent = money(c.debts.reduce((s, x) => s + num(x.principal), 0));
    $('openDebtTotal').textContent = money(c.debts.reduce((s, x) => s + x.remaining, 0));
    $('dueTotal').textContent = money(due.reduce((s, x) => s + x.remaining, 0));
    $('minCollectTotal').textContent = money(due.reduce((s, x) => s + Math.min(num(x.minCollectAmount || x.remaining), x.remaining), 0));
    $('dueTodayCount').textContent = dueToday.length;
    if ($('overdueCount')) $('overdueCount').textContent = overdue.length;
    $('followupTodayCount').textContent = followToday.length;
    if ($('dashDueTodayAction')) $('dashDueTodayAction').textContent = dueToday.length;
    if ($('dashOverdueAction')) $('dashOverdueAction').textContent = overdue.length;
    if ($('dashDueAmountAction')) $('dashDueAmountAction').textContent = money(due.reduce((s, x) => s + x.remaining, 0));
    updateFollowupBadges(due.length);
    renderAging(c.debts);
    $('priorityList').innerHTML = due.length ? due.map(renderDashboardDueCard).join('') : '<div class="empty">ยังไม่มีรายการถึงกำหนด</div>';
    $('todayFollowupList').innerHTML = followToday.length ? followToday.map(f => `<div class="item"><div><div class="item-title">${escapeHtml(c.debtors[f.debtorId]?.name || '-')} · ${escapeHtml(f.status || f.channel || '-')}</div><div class="item-sub">${escapeHtml(f.result || '-')} · นัด ${formatDate(f.nextFollowupDate)}</div></div></div>`).join('') : '<div class="empty">ยังไม่มีรายการติดตามวันนี้</div>';
    $('debtorList').innerHTML = d.debtors.length ? d.debtors.map(x => {
        const remain = debtRemainingForDebtor(c, x.id);
        return `
  <div class="item">
    <div>
      <div class="item-title">${x.name}</div>
      <div class="item-sub">
        ${displayPhone(x.phone)} · ${displayIdCard(x.idCard)} · ${displayAddress(debtorFullAddress(x))}
      </div>
      <div class="item-sub">
        ยอดคงเหลือ ${money(remain)}
      </div>
    </div>

    <div class="item-actions">
      <button
        class="mini icon-mini"
        title="เอกสารลูกค้า"
        onclick="openDebtorDocuments('${x.id}')">
        <i class="bi bi-folder2-open"></i> 
      </button>

      <button
        class="mini icon-mini"
        title="เพิ่มหนี้"
        onclick="openDebtForm('${x.id}','${String(x.name).replace(/'/g, "\\'")}')">
        <i class="bi bi-plus-circle"></i>
      </button>

      <button
        class="mini icon-mini"
        title="แก้ไขข้อมูล"
        onclick="openEditDebtor('${x.id}')">
        <i class="bi bi-pencil-square "></i>
      </button>

      ${canDeleteDebtor(x.id, d)
                ? `
          <button
            class="mini icon-action mini-danger"
            title="ลบลูกหนี้"
            onclick="deleteDebtor('${x.id}')">
            <i class="bi bi-trash"></i>
          </button>
        `
                : ''
            }

    </div>

  </div>
  `;
    }).join('')
        : '<div class="empty">ยังไม่มีลูกหนี้</div>';
    fillSelects(d, c);
    fillLists(d, c); renderContractList(d, c);
    fillSettings(d.settings || {});
    if (typeof decorateButtons === 'function') setTimeout(() => { decorateButtons(); restoreUiChrome(); }, 0);
}

function dueStatusMeta(x = {}) {
    const days = Number(x.daysOverdue || 0);
    if (days > 0) return { cls: 'overdue', icon: 'bi-calendar-x', text: `เลยกำหนด ${days} วัน` };
    if (String(x.dueDate || '') === today()) return { cls: 'today', icon: 'bi-calendar-event', text: 'ครบกำหนดวันนี้' };
    return { cls: 'soon', icon: 'bi-calendar2-week', text: 'ถึงกำหนด' };
}
function renderDashboardDueCard(x) {
    const meta = dueStatusMeta(x);
    const debtorName = x.debtor?.name || '-';
    const groupName = debtGroupName(x);
    const no = debtInstallmentNo(x), count = debtInstallmentCount(x);
    const period = no && count ? `${no}/${count}` : (no ? `${no}` : '-');
    const minCollect = Math.min(num(x.minCollectAmount || x.remaining), x.remaining);
    return `<div class="dashboard-due-card dashboard-due-${meta.cls} clickable-item" role="button" tabindex="0" title="แตะเพื่อไปบันทึกการติดตามงวดนี้" onclick="openFollowupForDebt('${x.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openFollowupForDebt('${x.id}')}">
        <div class="due-card-left">
            <div class="due-status"><i class="bi ${meta.icon}"></i> ${escapeHtml(meta.text)}</div>
            <div class="due-debtor">${escapeHtml(debtorName)}</div>
            <div class="due-title">${escapeHtml(groupName)}</div>
            <div class="due-meta"><span><i class="bi bi-layers"></i> งวดที่ ${escapeHtml(period)}</span><span><i class="bi bi-calendar3"></i> ครบกำหนด ${formatDate(x.dueDate)}</span></div>
            <div class="due-quick-actions" onclick="event.stopPropagation()">
                <button type="button" title="บันทึกโทรแล้ว" onclick="quickFollowupForDebt('${x.id}','โทรแล้ว','โทรศัพท์')"><i class="bi bi-telephone-outbound"></i> โทรแล้ว</button>
                <button type="button" title="บันทึกนัดชำระแล้ว" onclick="quickFollowupForDebt('${x.id}','นัดชำระแล้ว','โทรศัพท์')"><i class="bi bi-calendar-check"></i> นัดแล้ว</button>
                <button type="button" title="บันทึกส่งข้อความแล้ว" onclick="quickFollowupForDebt('${x.id}','ส่งข้อความแล้ว','LINE')"><i class="bi bi-chat-dots"></i> ส่งข้อความ</button>
            </div>
        </div>
        <div class="due-card-right">
            <div class="due-amount">${money(minCollect)} บาท</div>
            <div class="due-remaining">คงเหลือ ${money(x.remaining)} บาท</div>
            <i class="bi bi-chevron-right due-arrow"></i>
        </div>
    </div>`;
}
window.openAllDueFollowups = () => { switchTab('transactions'); switchTransaction('followup'); setTimeout(() => $('txFollowupBox')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };
window.openDueBucket = (bucket = 'all') => {
    switchTab('transactions');
    switchTransaction('followup');
    if ($('followupDebtorId')) $('followupDebtorId').value = '';
    if ($('followupDebtFilter')) $('followupDebtFilter').value = '';
    const d = latestData || local(), c = calc(d);
    fillFollowupFilters(d, c);
    const debts = dueDebtsForFollowup(c);
    const chosen = debts.find(x => bucket === 'overdue' ? Number(x.daysOverdue || 0) > 0 : bucket === 'today' ? String(x.dueDate || '') === today() : true);
    if (chosen) openFollowupForDebt(chosen.id);
    else setTimeout(() => $('txFollowupBox')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
};
function updateFollowupBadges(count = 0) {
    ['bottomFollowupBadge', 'followupSegmentBadge'].forEach(id => {
        const el = $(id);
        if (!el) return;
        el.textContent = count > 99 ? '99+' : String(count || 0);
        el.classList.toggle('hidden', !count);
    });
}
window.setFollowupQuick = (status) => {
    const channelMap = {
        'โทรแล้ว': 'โทรศัพท์',
        'ส่งข้อความแล้ว': 'LINE',
        'นัดชำระแล้ว': 'นัดหมาย',
        'ติดต่อไม่ได้': 'โทรศัพท์',
        'ไม่สามารถติดต่อได้': 'โทรศัพท์'
    };
    const resultMap = {
        'โทรแล้ว': 'โทรแล้ว',
        'ส่งข้อความแล้ว': 'ส่งข้อความทาง LINE แล้ว',
        'นัดชำระแล้ว': 'นัดชำระแล้ว',
        'ติดต่อไม่ได้': 'ไม่สามารถติดต่อได้',
        'ไม่สามารถติดต่อได้': 'ไม่สามารถติดต่อได้'
    };

    const normalizedStatus = status === 'ติดต่อไม่ได้' ? 'ไม่สามารถติดต่อได้' : status;
    if ($('followupStatus')) $('followupStatus').value = normalizedStatus;
    if ($('followupChannel')) $('followupChannel').value = channelMap[status] || channelMap[normalizedStatus] || '';
    if ($('followupResult')) {
        $('followupResult').value = resultMap[status] || resultMap[normalizedStatus] || normalizedStatus;
    }
};
window.quickFollowupForDebt = async (debtId, status, channel) => {
    const d = latestData || local();
    const c = calc(d);
    const debt = c.debtsById[debtId];
    if (!debt || debt.remaining <= 0 || String(debt.dueDate || '') > today()) return toast('งวดนี้ยังไม่ถึงกำหนด หรือปิดแล้ว');
    await add('followups', { debtorId: debt.debtorId, debtId: debt.id, contactDate: today(), status, channel, result: `บันทึกจาก Dashboard: ${status}`, nextFollowupDate: '' });
    toast(`บันทึก${status}แล้ว`);
    render();
};
function renderAging(debts) { const b = { a: 0, b: 0, c: 0, d: 0 }; debts.filter(x => x.remaining > 0 && x.isDue).forEach(x => { if (x.daysOverdue <= 30) b.a += x.remaining; else if (x.daysOverdue <= 60) b.b += x.remaining; else if (x.daysOverdue <= 90) b.c += x.remaining; else b.d += x.remaining }); $('aging030').textContent = money(b.a); $('aging3160').textContent = money(b.b); $('aging6190').textContent = money(b.c); $('aging90').textContent = money(b.d) }
function debtInstallmentNo(x = {}) {
    const explicit = Number(x.installmentNo || x.installment || x.periodNo || 0);
    if (explicit > 0) return explicit;
    const m = String(x.title || '').match(/(\d+)\s*\/\s*(\d+)/);
    return m ? Number(m[1]) : 0;
}
function debtInstallmentCount(x = {}) {
    const explicit = Number(x.installmentCount || x.periodCount || 0);
    if (explicit > 0) return explicit;
    const m = String(x.title || '').match(/(\d+)\s*\/\s*(\d+)/);
    return m ? Number(m[2]) : 0;
}
function debtGroupName(x = {}) {
    if (x.debtGroupTitle) return String(x.debtGroupTitle);
    if (x.contractNo) return `สัญญาเลขที่ ${x.contractNo}`;
    return String(x.title || 'ก้อนหนี้').replace(/\s*งวด(ที่)?\s*\d+\s*\/\s*\d+.*$/i, '').trim() || 'ก้อนหนี้';
}

function sameId(a, b) { return String(a || '') === String(b || ''); }
function debtRemainingForDebtor(c, debtorId) {
    return (c.debts || [])
        .filter(dd => sameId(dd.debtorId, debtorId))
        .reduce((s, dd) => s + num(dd.remaining), 0);
}
function contractExactAmount(contract, c) {
    // ยอดที่แสดงในรายการสัญญาต้องยึดจากสัญญาแต่ละใบก่อน
    // ไม่ดึงยอดจากก้อนหนี้รวม/ก้อนหนี้ใบอื่น เพราะจะทำให้หลายรายการแสดงยอดเท่ากันผิดใบได้
    const directFields = [
        contract?.amount,
        contract?.loanAmount,
        contract?.borrowAmount,
        contract?.principalAmount,
        contract?.contractAmount
    ];
    for (const v of directFields) {
        const amount = num(v);
        if (amount > 0) return amount;
    }

    // ถ้าเป็นข้อมูลเก่าที่ไม่มี amount ในสัญญา ให้หาเฉพาะก้อนหนี้ที่ผูกด้วย contractId เท่านั้น
    // contractNo อาจซ้ำ/ว่างในข้อมูลเก่า จึงไม่ใช้เป็นเงื่อนไขหลักในการคำนวณยอดรายการ
    const byContractId = (c.debts || [])
        .filter(d => contract?.id && sameId(d.contractId, contract.id))
        .reduce((s, d) => s + num(d.principal), 0);
    if (byContractId > 0) return byContractId;

    const total = num(contract?.totalDebtAmount);
    return total > 0 ? total : 0;
}
function contractDisplayAmount(contract, c) {
    return contractExactAmount(contract, c);
}
function sortDebtsForPayment(a, b) {
    return String(a.debtor?.name || '').localeCompare(String(b.debtor?.name || ''), 'th')
        || debtGroupName(a).localeCompare(debtGroupName(b), 'th')
        || (debtInstallmentNo(a) - debtInstallmentNo(b))
        || String(a.dueDate || '').localeCompare(String(b.dueDate || ''));
}

function debtGroupKey(x = {}) {
    return [x.debtorId || '', x.debtGroupId || '', x.contractId || '', x.contractNo || '', x.debtGroupTitle || x.title || x.id || ''].join('|');
}
function firstUnpaidDebtPerGroup(debts = [], dueOnly = false) {
    const groups = new Map();
    (debts || []).filter(x => Number(x.remaining || 0) > 0).forEach(x => {
        const key = debtGroupKey(x);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(x);
    });
    return [...groups.values()].map(rows => rows.sort(sortDebtsForPayment)[0])
        .filter(x => !dueOnly || String(x.dueDate || '') <= today())
        .sort(sortDebtsForPayment);
}
function updateDebtPaymentTypeUi() {
    const type = $('debtPaymentType')?.value || 'single';
    $('debtSingleBox')?.classList.toggle('hidden', type !== 'single');
    $('debtInstallmentBox')?.classList.toggle('hidden', type !== 'installment');
}
function updateContractPaymentTypeUi() {
    const type = $('contractPaymentType')?.value || 'single';
    $('contractSingleBox')?.classList.toggle('hidden', type !== 'single');
    $('contractInstallmentBox')?.classList.toggle('hidden', type !== 'installment');
}
function buildInstallmentRows({ debtorId, title, amount, minCollectAmount = 0, paymentType = 'single', dueDate = '', firstDueDate = '', installmentCount = 1, interestRate = 0, source = 'manual', contractId = '', contractNo = '', contractDate = today() }) {
    const principal = roundMoney(num(amount));
    const count = paymentType === 'installment' ? Math.max(2, Math.floor(Number(installmentCount || 0))) : 1;
    const annualRate = Number(String(interestRate || 0).replace(/[^0-9.]/g, '')) || 0;
    const monthlyRate = annualRate / 100 / 12;
    const baseTitle = title || (contractNo ? `สัญญาเลขที่ ${contractNo}` : 'ก้อนหนี้');
    const startDate = firstDueDate || dueDate || addMonthsSafe(contractDate || today(), 1);
    const rows = [];
    const debtGroupId = uid();
    let remaining = principal;
    let principalAssigned = 0;
    for (let i = 1; i <= count; i++) {
        const principalPart = i === count ? roundMoney(principal - principalAssigned) : roundMoney(principal / count);
        const interestAmount = roundMoney(remaining * monthlyRate);
        const totalDue = roundMoney(principalPart + interestAmount);
        const rowDueDate = count === 1 ? (dueDate || startDate) : addMonthsSafe(startDate, i - 1);
        rows.push({
            debtorId,
            title: count === 1 ? baseTitle : `${baseTitle} งวดที่ ${i}/${count}`,
            debtGroupTitle: baseTitle,
            debtGroupId,
            principal: totalDue,
            minCollectAmount: num(minCollectAmount) || totalDue,
            dueDate: rowDueDate,
            status: 'open',
            source,
            contractId,
            contractNo,
            paymentType,
            installmentNo: i,
            installmentCount: count,
            firstDueDate: startDate,
            principalPortion: principalPart,
            interestAmount,
            interestRate: annualRate,
            contractDate: contractDate || today(),
            originalPrincipal: principal,
            autoGenerated: source === 'contract_auto'
        });
        principalAssigned = roundMoney(principalAssigned + principalPart);
        remaining = roundMoney(Math.max(0, remaining - principalPart));
    }
    return rows;
}
function paymentFilteredDebts(c) {
    const debtorId = $('paymentDebtorFilter')?.value || '';
    const group = $('paymentDebtFilter')?.value || '';
    return c.debts
        .filter(x => x.remaining > 0)
        .filter(x => !debtorId || x.debtorId === debtorId)
        .filter(x => !group || debtGroupName(x) === group)
        .sort(sortDebtsForPayment);
}
function paymentDebtLabel(x) {
    const no = debtInstallmentNo(x), count = debtInstallmentCount(x);
    const period = no && count ? `งวด ${no}/${count}` : (no ? `งวด ${no}` : '');
    const title = period ? debtGroupName(x) : (x.title || debtGroupName(x));
    return `${x.debtor?.name || '-'} · ${title}${period ? ' · ' + period : ''} · ครบกำหนด ${formatDate(x.dueDate)} · คงเหลือ ${money(x.remaining)}`;
}
function fillPaymentFilters(d, c) {
    const keepDebtor = $('paymentDebtorFilter')?.value || '';
    const keepGroup = $('paymentDebtFilter')?.value || '';
    const keepDebt = $('paymentDebtId')?.value || '';
    const openDebts = c.debts.filter(x => x.remaining > 0).sort(sortDebtsForPayment);
    const debtorIds = [...new Set(openDebts.map(x => x.debtorId).filter(Boolean))];
    if ($('paymentDebtorFilter')) {
        $('paymentDebtorFilter').innerHTML = '<option value="">-- ลูกหนี้ทั้งหมด --</option>' + debtorIds.map(id => `<option value="${id}">${escapeHtml(c.debtors[id]?.name || '-')}</option>`).join('');
        $('paymentDebtorFilter').value = debtorIds.includes(keepDebtor) ? keepDebtor : '';
    }
    const groupDebts = openDebts.filter(x => !$('paymentDebtorFilter')?.value || x.debtorId === $('paymentDebtorFilter').value);
    const groups = [...new Set(groupDebts.map(debtGroupName))];
    if ($('paymentDebtFilter')) {
        $('paymentDebtFilter').innerHTML = '<option value="">-- ชื่อก้อนหนี้ทั้งหมด --</option>' + groups.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
        $('paymentDebtFilter').value = groups.includes(keepGroup) ? keepGroup : '';
    }
    const debts = paymentFilteredDebts(c);
    if ($('paymentDebtId')) {
        $('paymentDebtId').innerHTML = '<option value="">-- เลือกงวดที่ต้องทวง --</option>' + debts.map(x => `<option value="${x.id}">${escapeHtml(paymentDebtLabel(x))}</option>`).join('');
        $('paymentDebtId').value = debts.some(x => x.id === keepDebt) ? keepDebt : '';
    }
}
function bindPaymentFilters() {
    ['paymentDebtorFilter', 'paymentDebtFilter'].forEach(id => {
        const el = $(id); if (!el || el.dataset.paymentFilterBound) return;
        el.addEventListener('change', () => {
            if (id === 'paymentDebtorFilter' && $('paymentDebtFilter')) $('paymentDebtFilter').value = '';
            const d = latestData || local(), c = calc(d);
            fillPaymentFilters(d, c);
            fillLists(d, c);
        });
        el.dataset.paymentFilterBound = '1';
    });
}

function dueDebtsForFollowup(c) {
    return firstUnpaidDebtPerGroup(c.debts, true);
}
function followupFilteredDebts(c) {
    const debtorId = $('followupDebtorId')?.value || '';
    const group = $('followupDebtFilter')?.value || '';
    return dueDebtsForFollowup(c)
        .filter(x => !debtorId || x.debtorId === debtorId)
        .filter(x => !group || debtGroupName(x) === group)
        .sort(sortDebtsForPayment);
}
function fillFollowupFilters(d, c) {
    const keepDebtor = $('followupDebtorId')?.value || '';
    const keepGroup = $('followupDebtFilter')?.value || '';
    const keepDebt = $('followupDebtId')?.value || '';
    const dueDebts = dueDebtsForFollowup(c);
    const debtorIds = [...new Set(dueDebts.map(x => x.debtorId).filter(Boolean))];
    if ($('followupDebtorId')) {
        $('followupDebtorId').innerHTML = '<option value="">-- ลูกหนี้ที่ถึงกำหนดทั้งหมด --</option>' + debtorIds.map(id => `<option value="${id}">${escapeHtml(c.debtors[id]?.name || '-')}</option>`).join('');
        $('followupDebtorId').value = debtorIds.includes(keepDebtor) ? keepDebtor : '';
    }
    const groupDebts = dueDebts.filter(x => !$('followupDebtorId')?.value || x.debtorId === $('followupDebtorId').value);
    const groups = [...new Set(groupDebts.map(debtGroupName))];
    if ($('followupDebtFilter')) {
        $('followupDebtFilter').innerHTML = '<option value="">-- ชื่อก้อนหนี้ทั้งหมด --</option>' + groups.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
        $('followupDebtFilter').value = groups.includes(keepGroup) ? keepGroup : '';
    }
    const debts = followupFilteredDebts(c);
    if ($('followupDebtId')) {
        $('followupDebtId').innerHTML = '<option value="">-- เลือกงวดที่ต้องทวง --</option>' + debts.map(x => `<option value="${x.id}">${escapeHtml(paymentDebtLabel(x))}</option>`).join('');
        $('followupDebtId').value = debts.some(x => x.id === keepDebt) ? keepDebt : '';
    }
}
function bindFollowupFilters() {
    ['followupDebtorId', 'followupDebtFilter', 'followupHistoryStatusFilter'].forEach(id => {
        const el = $(id); if (!el || el.dataset.followupFilterBound) return;
        el.addEventListener('change', () => {
            if (id === 'followupDebtorId' && $('followupDebtFilter')) $('followupDebtFilter').value = '';
            const d = latestData || local(), c = calc(d);
            fillFollowupFilters(d, c);
            fillLists(d, c);
        });
        el.dataset.followupFilterBound = '1';
    });
}
window.openFollowupForDebt = (debtId) => {
    const d = latestData || local();
    const c = calc(d);
    const debt = c.debtsById[debtId];
    if (!debt || debt.remaining <= 0 || String(debt.dueDate || '') > today()) return toast('งวดนี้ยังไม่ถึงกำหนด หรือปิดแล้ว');
    switchTab('transactions');
    switchTransaction('followup');
    if ($('followupDebtorId')) $('followupDebtorId').value = debt.debtorId || '';
    fillFollowupFilters(d, c);
    if ($('followupDebtFilter')) $('followupDebtFilter').value = debtGroupName(debt);
    fillFollowupFilters(d, c);
    if ($('followupDebtId')) $('followupDebtId').value = debt.id;
    if ($('followupDate') && !$('followupDate').value) $('followupDate').value = today();
    fillLists(d, c);
    setTimeout(() => ($('followupResult') || $('txFollowupBox'))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
};
function fillSelects(d, c) {
    const debtorOpts = '<option value="">-- เลือกลูกหนี้ --</option>' + d.debtors.map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
    ['documentDebtorId', 'transactionDebtorId', 'contractDebtorId'].forEach(id => { if ($(id)) $(id).innerHTML = debtorOpts });
    fillPaymentFilters(d, c);
    fillFollowupFilters(d, c);
    bindPaymentFilters();
    bindFollowupFilters();
    const docDebtor = $('documentDebtorId');
    if (docDebtor && !docDebtor.dataset.boundFilter) {
        docDebtor.dataset.boundFilter = '1';
        docDebtor.addEventListener('change', () => { if (latestData) fillLists(latestData, calc(latestData)); });
    }
}
function fillLists(d, c) {
    const debtorFilter = $('paymentDebtorFilter')?.value || '';
    const groupFilter = $('paymentDebtFilter')?.value || '';
    const paymentRows = d.payments.filter(p => {
        const debt = c.debtsById[p.debtId] || {};
        return (!debtorFilter || debt.debtorId === debtorFilter) && (!groupFilter || debtGroupName(debt) === groupFilter);
    }).sort((a, b) => String(b.paidDate || '').localeCompare(String(a.paidDate || '')));
    $('paymentList').innerHTML = paymentRows.length ? paymentRows.map(p => { const debt = c.debtsById[p.debtId] || {}; return `<div class="item"><div><div class="item-title">${money(p.amount)}</div><div class="item-sub">${formatDate(p.paidDate)} · ${escapeHtml(debt.debtor?.name || '-')} · ${escapeHtml(debt.title || '-')} · ${escapeHtml(p.note || '')}</div></div></div>` }).join('') : '<div class="empty">ยังไม่มีประวัติชำระตามตัวกรองนี้</div>';
    const followDebtorFilter = $('followupDebtorId')?.value || '';
    const followGroupFilter = $('followupDebtFilter')?.value || '';
    const followDebtFilter = $('followupDebtId')?.value || '';
    const followStatusFilter = $('followupHistoryStatusFilter')?.value || '';
    const followupRows = d.followups.filter(f => {
        const debt = c.debtsById[f.debtId] || {};
        return (!followDebtorFilter || f.debtorId === followDebtorFilter)
            && (!followGroupFilter || debtGroupName(debt) === followGroupFilter)
            && (!followDebtFilter || f.debtId === followDebtFilter)
            && (!followStatusFilter || f.status === followStatusFilter);
    }).sort((a, b) => String(b.contactDate || '').localeCompare(String(a.contactDate || '')));
    $('followupList').innerHTML = followupRows.length ? followupRows.map(f => { const debt = c.debtsById[f.debtId] || {}; return `<div class="item"><div><div class="item-title">${escapeHtml(c.debtors[f.debtorId]?.name || '-')} · ${escapeHtml(f.status || '-')}</div><div class="item-sub">${escapeHtml(debt.title || debtGroupName(debt) || '-')} · ${formatDate(f.contactDate)} · ${escapeHtml(f.channel || '-')} · นัด ${formatDate(f.nextFollowupDate)}</div><div class="item-sub">${escapeHtml(f.result || '')}</div></div></div>` }).join('') : '<div class="empty">ยังไม่มีประวัติติดตามตามตัวกรองนี้</div>';
    const documentDebtorFilter = $('documentDebtorId')?.value || '';
    const documentRows = d.documents.filter(doc => !documentDebtorFilter || sameId(doc.debtorId, documentDebtorFilter));
    const contractsByDocumentId = Object.fromEntries((d.contracts || []).filter(x => x.documentId).map(x => [String(x.documentId), x]));
    $('documentList').innerHTML = documentRows.length ? documentRows.map(doc => {
        const isImg = String(doc.mimeType || '').startsWith('image/');
        const thumb = isImg && doc.downloadURL ? `<img loading="lazy" decoding="async" src="${doc.downloadURL}" alt="">` : `<i class="bi ${fileIcon(doc.mimeType, doc.fileName)}"></i>`;
        const linkedContract = contractsByDocumentId[String(doc.id)];
        const contractAmountText = linkedContract ? ` · ยอดสัญญา ${money(contractExactAmount(linkedContract, c))}` : '';
        const contractNoText = linkedContract?.contractNo ? ` · เลขที่ ${escapeHtml(linkedContract.contractNo)}` : '';
        return `<div class="item doc-card"><div class="doc-thumb">${thumb}</div><div><div class="item-title">${escapeHtml(doc.type)} · ${escapeHtml(doc.fileName)}</div><div class="item-sub">${escapeHtml(c.debtors[doc.debtorId]?.name || '-')} · ${formatDate(doc.createdDate)}${contractNoText}${contractAmountText} · ${doc.size ? money(doc.size / 1024) + ' KB' : ''}</div></div><div class="doc-actions icon-actions"><button class="icon-action icon-view" type="button" title="เปิดเอกสาร" aria-label="เปิดเอกสาร" onclick="previewDocument('${doc.id}')"><i class="bi bi-box-arrow-up-right"></i></button><button class="icon-action icon-delete" type="button" title="ลบเอกสาร" aria-label="ลบเอกสาร" onclick="deleteDocument('${doc.id}')"><i class="bi bi-trash"></i></button></div></div>`
    }).join('') : '<div class="empty">ยังไม่มีเอกสารของลูกหนี้นี้</div>';
}
function fillSettings(s) {
    if ($('notifyEmail')) $('notifyEmail').value = s.notifyEmail || '';
    if ($('telegramChatId')) $('telegramChatId').value = s.telegramChatId || '';
    const p = s.profile || s || {};
    if ($('profileAlias')) $('profileAlias').value = p.alias || '';
    if ($('profileLenderName')) $('profileLenderName').value = p.lenderName || p.alias || getDisplayName();
    if ($('profilePhone')) $('profilePhone').value = p.phone || '';
    if ($('profileLineId')) $('profileLineId').value = p.lineId || '';
    if ($('profileTelegramId')) $('profileTelegramId').value = p.telegramId || '';
    if ($('profileLenderIdCard')) $('profileLenderIdCard').value = p.lenderIdCard || '';
    if ($('profileLenderAddress')) $('profileLenderAddress').value = p.lenderAddress || '';
    if ($('profileShowFullIdCard')) $('profileShowFullIdCard').checked = p.showFullIdCard === true;
    if ($('profileShowFullAddress')) $('profileShowFullAddress').checked = p.showFullAddress === true;
    if ($('profileShowFullPhone')) $('profileShowFullPhone').checked = p.showFullPhone === true;
    setUserDisplay();
}
window.openDebtForm = (id, name) => { if ($('transactionDebtorId')) $('transactionDebtorId').value = id; switchTransaction('debt'); switchTab('transactions') };
window.openDebtorDocuments = id => { if ($('documentDebtorId')) $('documentDebtorId').value = id; if (latestData) fillLists(latestData, calc(latestData)); switchTab('customers'); $('documentDebtorId')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('เลือกเอกสารของลูกหนี้แล้ว'); };
window.openEditDebtor = id => { const d = (latestData?.debtors || []).find(x => x.id === id); if (!d) return;['Name', 'Phone', 'LineId', 'IdCard', 'BirthDate', 'Address', 'SubDistrict', 'District', 'Province'].forEach(k => { const el = $('editDebtor' + k); if (el) el.value = d[k.charAt(0).toLowerCase() + k.slice(1)] || '' }); $('editDebtorId').value = id; $('editDebtorCard').classList.remove('hidden'); switchTab('customers') };
window.deleteDebtor = async id => { if (!canDeleteDebtor(id)) return toast('ลบไม่ได้ เพราะลูกหนี้ถูกนำไปใช้งานแล้ว'); const debtor = (latestData?.debtors || []).find(x => x.id === id); const ok = await confirmAction({ title: 'ยืนยันการลบลูกหนี้', text: `ลบลูกหนี้ ${debtor?.name || ''} ใช่หรือไม่?`, confirmButtonText: 'ลบลูกหนี้', confirmButtonColor: '#dc2626' }); if (!ok) return; await deleteRow('debtors', id); toast('ลบลูกหนี้แล้ว'); render() };
$('addDebtorBtn').onclick = async () => { const name = $('debtorName').value.trim(); if (!name) return toast('กรุณากรอกชื่อลูกหนี้'); if (isDuplicateIdCard($('debtorIdCard').value)) return toast('เลขบัตรประชาชนนี้มีอยู่แล้ว'); await add('debtors', { name, phone: $('debtorPhone').value.trim(), lineId: $('debtorLineId').value.trim(), idCard: $('debtorIdCard').value.trim(), birthDate: $('debtorBirthDate')?.value || '', address: $('debtorAddress').value.trim(), subDistrict: $('debtorSubDistrict')?.value.trim() || '', district: $('debtorDistrict').value.trim(), province: $('debtorProvince').value.trim() });['debtorName', 'debtorPhone', 'debtorLineId', 'debtorIdCard', 'debtorBirthDate', 'debtorAddress', 'debtorSubDistrict', 'debtorDistrict', 'debtorProvince'].forEach(id => { if ($(id)) $(id).value = '' }); toast('เพิ่มลูกหนี้สำเร็จ'); hideCustomerForm(); switchTab('customers'); render() };
$('saveEditDebtorBtn').onclick = async () => { const id = $('editDebtorId').value; if (!id) return; if (isDuplicateIdCard($('editDebtorIdCard').value, id)) return toast('เลขบัตรประชาชนนี้มีอยู่แล้ว'); await updateRow('debtors', id, { name: $('editDebtorName').value.trim(), phone: $('editDebtorPhone').value.trim(), lineId: $('editDebtorLineId').value.trim(), idCard: $('editDebtorIdCard').value.trim(), birthDate: $('editDebtorBirthDate')?.value || '', address: $('editDebtorAddress').value.trim(), subDistrict: $('editDebtorSubDistrict')?.value.trim() || '', district: $('editDebtorDistrict').value.trim(), province: $('editDebtorProvince').value.trim() }); $('editDebtorCard').classList.add('hidden'); toast('แก้ไขข้อมูลลูกหนี้แล้ว'); render() };
$('cancelEditDebtorBtn').onclick = () => $('editDebtorCard').classList.add('hidden');
$('addDebtBtn').onclick = async () => {
    const debtorId = $('transactionDebtorId').value;
    const principal = num($('debtPrincipal').value);
    const paymentType = $('debtPaymentType')?.value || 'single';
    if (!debtorId) return toast('เลือกลูกหนี้ก่อน');
    if (principal <= 0) return toast('กรอกยอดหนี้');
    const rows = buildInstallmentRows({
        debtorId,
        title: $('debtTitle').value || 'ก้อนหนี้',
        amount: principal,
        minCollectAmount: num($('debtMinCollect')?.value),
        paymentType,
        dueDate: $('debtDueDate')?.value || addMonthsSafe(today(), 1),
        firstDueDate: $('debtFirstDueDate')?.value || addMonthsSafe(today(), 1),
        installmentCount: $('debtInstallmentCount')?.value || 1,
        interestRate: $('debtInterestRate')?.value || 0,
        source: 'manual'
    });
    for (const row of rows) await add('debts', row);
    ['debtTitle', 'debtPrincipal', 'debtMinCollect', 'debtDueDate', 'debtFirstDueDate', 'debtInstallmentCount', 'debtInterestRate'].forEach(id => { if ($(id)) $(id).value = ''; });
    if ($('debtPaymentType')) $('debtPaymentType').value = 'single';
    updateDebtPaymentTypeUi();
    toast(`เพิ่มก้อนหนี้สำเร็จ ${rows.length} งวด`);
    switchTab('transactions'); switchTransaction('debt'); render()
};
$('addPaymentBtn').onclick = async () => { if (!$('paymentDebtId').value) return toast('เลือกก้อนหนี้'); const amount = num($('paymentAmount').value); if (amount <= 0) return toast('กรอกจำนวนเงิน'); await add('payments', { debtId: $('paymentDebtId').value, amount, paidDate: $('paymentDate').value || today(), note: $('paymentNote').value }); $('paymentAmount').value = ''; $('paymentNote').value = ''; toast('บันทึกชำระแล้ว'); switchTab('transactions'); switchTransaction('payment'); render() };
$('addFollowupBtn').onclick = async () => {
    const c = calc(latestData || local());
    const debt = c.debtsById[$('followupDebtId').value] || null;
    const debtorId = debt?.debtorId || $('followupDebtorId').value;
    if (!debtorId) return toast('เลือกลูกหนี้ที่ถึงกำหนดก่อน');
    if (!debt) return toast('เลือกงวดที่ต้องทวงก่อน');
    await add('followups', { debtorId, debtId: debt.id, contactDate: $('followupDate').value || today(), status: $('followupStatus').value, channel: $('followupChannel').value, result: $('followupResult').value, nextFollowupDate: $('nextFollowupDate').value });
    ['followupResult', 'nextFollowupDate'].forEach(id => { if ($(id)) $(id).value = ''; });
    toast('บันทึกการติดตามแล้ว'); switchTab('transactions'); switchTransaction('followup'); render()
};
$('addDocumentBtn').onclick = async () => {
    if (!$('documentDebtorId').value) return toast('เลือกลูกหนี้');
    const files = [...$('documentFile').files];
    if (!files.length) return toast('กรุณาเลือกไฟล์เอกสาร');
    try {
        $('dropzoneText').textContent = `กำลังอัปโหลด ${files.length} ไฟล์...`;
        await uploadDocumentFiles($('documentDebtorId').value, $('documentType').value, files);
        $('documentFile').value = '';
        $('dropzoneText').textContent = 'รองรับรูปภาพ / PDF / เอกสารทั่วไป';
        toast('บันทึกเอกสารแล้ว');
        switchTab('customers');
        render();
    } catch (e) { console.error(e); toast('อัปโหลดไม่สำเร็จ: ' + e.message) }
};
function normalizeThaiPrefix(name = '') {
    return String(name || '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/น\s*\.\s*ส\s*\.?/g, 'นางสาว')
        .replace(/นส\s*\.?/g, 'นางสาว')
        .replace(/ด\s*\.\s*ช\s*\.?/g, 'เด็กชาย')
        .replace(/ด\s*\.\s*ญ\s*\.?/g, 'เด็กหญิง')
        .replace(/นาย\s+/g, 'นาย ')
        .replace(/นางสาว\s+/g, 'นางสาว ')
        .replace(/นาง\s+/g, 'นาง ')
        .replace(/เด็กชาย\s+/g, 'เด็กชาย ')
        .replace(/เด็กหญิง\s+/g, 'เด็กหญิง ')
        .replace(/\s+/g, ' ')
        .trim();
}
function stripThaiPrefix(name = '') {
    return normalizeThaiPrefix(name).replace(/^(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง)\s*/, '').trim();
}
function cleanOcrNameText(v = '') {
    return normalizeThaiPrefix(v)
        .replace(/[0-9\-]{6,}/g, ' ')
        .replace(/บัตร\s*ประจำตัว\s*ประชาชน/g, ' ')
        .replace(/เลข\s*ประจำตัว\s*ประชาชน/g, ' ')
        .replace(/ชื่อตัว\s*และ\s*ชื่อสกุล/g, ' ')
        .replace(/ชื่อ\s*-?\s*นามสกุล/g, ' ')
        .replace(/นามสกุล/g, ' ')
        .replace(/^ชื่อ\s*/g, ' ')
        .replace(/(?:วันเดือนปีเกิด|วันเกิด|เกิด|ที่อยู่|ศาสนา|หมู่โลหิต|Date of Birth|Address|Religion).*$/i, ' ')
        .replace(/[^\u0E00-\u0E7F\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function extractPrefixFromOcr(data = {}) {
    const sources = [data.prefix, data.title, data.fullName, data.name, data.thaiName, data.firstName, data.lastName, data.rawText]
        .map(v => normalizeThaiPrefix(v || ''))
        .filter(Boolean);
    for (const src of sources) {
        const m = src.match(/(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง)/);
        if (m) return m[1];
    }
    return '';
}
function extractNameFromRawText(rawText = '') {
    const raw = normalizeThaiPrefix(rawText || '').replace(/[\u0000-\u001F\u007F]/g, ' ');
    const m = raw.match(/(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง)\s+([\u0E00-\u0E7F]+(?:\s+[\u0E00-\u0E7F]+){1,3})/);
    if (!m) return '';
    return cleanOcrNameText(m[2]);
}
function parseThaiNameParts(data = {}) {
    const prefix = extractPrefixFromOcr(data);
    const joinedName = cleanOcrNameText([data.firstName, data.lastName].filter(Boolean).join(' '));
    const candidates = [
        data.fullName,
        data.name,
        data.thaiName,
        joinedName,
        data.lastName,
        data.firstName,
        extractNameFromRawText(data.rawText || '')
    ].map(v => cleanOcrNameText(stripThaiPrefix(v || ''))).filter(Boolean);

    let fullName = candidates.find(v => {
        const words = v.split(/\s+/).filter(Boolean);
        return words.length >= 2 && !/บัตร|ประชาชน|ชื่อตัว|นามสกุล|ที่อยู่|แขวง|เขต|จังหวัด/.test(v);
    }) || candidates[0] || '';

    fullName = cleanOcrNameText(stripThaiPrefix(fullName));
    const words = fullName.split(/\s+/).filter(Boolean);
    if (words.length > 3) fullName = words.slice(0, 3).join(' ');
    return { prefix, firstName: fullName, lastName: '' };
}
function parseThaiDateToIso(text = '') {
    const raw = String(text || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    let m = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) {
        let d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
        if (y < 100) y += 2500;
        if (y > 2400) y -= 543;
        if (d && mo && y) return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    const months = { 'ม.ค.': 1, 'มกราคม': 1, 'ก.พ.': 2, 'กุมภาพันธ์': 2, 'มี.ค.': 3, 'มีนาคม': 3, 'เม.ย.': 4, 'เมษายน': 4, 'พ.ค.': 5, 'พฤษภาคม': 5, 'มิ.ย.': 6, 'มิถุนายน': 6, 'ก.ค.': 7, 'กรกฎาคม': 7, 'ส.ค.': 8, 'สิงหาคม': 8, 'ก.ย.': 9, 'กันยายน': 9, 'ต.ค.': 10, 'ตุลาคม': 10, 'พ.ย.': 11, 'พฤศจิกายน': 11, 'ธ.ค.': 12, 'ธันวาคม': 12 };
    const monthKeys = Object.keys(months).join('|').replace(/\./g, '\\.');
    m = raw.match(new RegExp(`(\\d{1,2})\\s*(${monthKeys})\\s*(\\d{2,4})`));
    if (m) {
        let d = Number(m[1]), mo = months[m[2].replace(/\\./g, '.')] || months[m[2]], y = Number(m[3]);
        if (y < 100) y += 2500;
        if (y > 2400) y -= 543;
        if (d && mo && y) return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return '';
}
function findBirthDateFromOcr(data = {}) {
    return parseThaiDateToIso(data.birthDate || data.birthday || data.dob || data.dateOfBirth || '') ||
        parseThaiDateToIso(String(data.rawText || '').match(/(?:เกิด|วันเกิด|Date of Birth|Birth Date)\s*[:：]?\s*([^\n]+)/i)?.[1] || '');
}
function dedupeThaiWords(v = '') {
    const parts = String(v || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    return parts.filter((x, i) => i === 0 || x !== parts[i - 1]).join(' ');
}
function cleanThaiLocationField(v = '') {
    return dedupeThaiWords(String(v || '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/^(แขวง|ตำบล|ต\.|เขต|อำเภอ|อ\.|จังหวัด|จ\.)\s*/, '')
        .replace(/\s+/g, ' ')
        .trim());
}
function cleanOcrAddressOnly(v = '') {
    return String(v || '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/^ที่อยู่\s*/, '')
        .replace(/\s*(?:แขวง|ตำบล|ต\.)\s*[^\s,]+.*$/g, '')
        .replace(/\s*(?:เขต|อำเภอ|อ\.)\s*[^\s,]+.*$/g, '')
        .replace(/\s*(?:จังหวัด|จ\.)\s*[^\s,]+.*$/g, '')
        .replace(/\s*(?:กรุงเทพมหานคร|กรุงเทพฯ|กทม\.?).*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function parseThaiAddressParts(text = '') {
    const raw = String(text || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const provinceList = ['กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี'];
    let province = '';
    if (/กรุงเทพ|กทม/.test(raw)) province = 'กรุงเทพมหานคร';
    if (!province) province = provinceList.find(p => raw.includes(p)) || '';
    const subMatch = raw.match(/(?:แขวง|ตำบล|ต\.)\s*([^\s,]+)/);
    const distMatch = raw.match(/(?:เขต|อำเภอ|อ\.)\s*([^\s,]+)/);
    const subDistrict = cleanThaiLocationField(subMatch ? subMatch[1].trim() : '');
    const district = cleanThaiLocationField(distMatch ? distMatch[1].trim() : '');
    const shortAddress = cleanOcrAddressOnly(raw);
    const houseMatch = shortAddress.match(/(?:บ้านเลขที่\s*)?([0-9]+(?:\/[0-9]+)?)/i) || raw.match(/(?:บ้านเลขที่\s*)?([0-9]+(?:\/[0-9]+)?)/i);
    const houseNo = houseMatch ? houseMatch[1].trim() : '';
    return { houseNo, subDistrict, district, province, shortAddress };
}
function normalizeThaiLocation(text) {
    const p = parseThaiAddressParts(text);
    return { district: p.district, province: p.province, subDistrict: p.subDistrict, houseNo: p.houseNo, shortAddress: p.shortAddress };
}
function parseOcrResult(data) {
    const name = parseThaiNameParts(data);
    const raw = [data.rawText, data.address, data.district, data.province].filter(Boolean).join(' ');
    const loc = normalizeThaiLocation(raw);
    const addressParts = parseThaiAddressParts(data.address || '');
    return {
        ...name,
        idCard: data.idCard || '',
        address: addressParts.shortAddress || loc.shortAddress || '',
        houseNo: addressParts.houseNo || loc.houseNo || '',
        subDistrict: cleanThaiLocationField(data.subDistrict || data.tambon || loc.subDistrict || ''),
        district: cleanThaiLocationField(data.district || loc.district || ''),
        province: cleanThaiLocationField(data.province || loc.province || ''),
        birthDate: findBirthDateFromOcr(data)
    }
}
async function compressImageToBase64(file, maxWidth = 1600, quality = .86) { const img = await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = URL.createObjectURL(file) }); const scale = Math.min(1, maxWidth / img.width), canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale); canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/jpeg', quality).split(',')[1] }
async function getAuthToken() { return currentUser?.getIdToken ? await currentUser.getIdToken() : '' }
function fillOcrFields(o) { $('ocrPrefix').value = o.prefix || ''; $('ocrFirstName').value = o.firstName || ''; $('ocrLastName').value = o.lastName || ''; $('ocrIdCard').value = o.idCard || ''; if ($('ocrBirthDate')) $('ocrBirthDate').value = o.birthDate || ''; $('ocrAddress').value = o.address || ''; if ($('ocrSubDistrict')) $('ocrSubDistrict').value = o.subDistrict || ''; $('ocrDistrict').value = o.district || ''; $('ocrProvince').value = o.province || ''; $('ocrIdMasked').textContent = o.idCard ? `แสดงแบบซ่อน: ${maskId(o.idCard)}` : '' }
function ocrDebtorObject() { const addr = $('ocrAddress').value; const parts = parseThaiAddressParts(addr); return { name: fullNameOf({ prefix: $('ocrPrefix').value, firstName: $('ocrFirstName').value, lastName: $('ocrLastName').value }), phone: '', lineId: '', idCard: $('ocrIdCard').value, address: parts.shortAddress || cleanOcrAddressOnly(addr), houseNo: parts.houseNo || '', district: cleanThaiLocationField($('ocrDistrict').value || parts.district || ''), province: cleanThaiLocationField($('ocrProvince').value || parts.province || ''), subDistrict: cleanThaiLocationField($('ocrSubDistrict')?.value || parts.subDistrict || ''), birthDate: $('ocrBirthDate')?.value || '', source: 'ocr' } }
$('runOcrBtn').onclick = async () => { const file = $('ocrFile').files[0]; if (!file) return toast('กรุณาถ่ายรูปหรือเลือกรูปบัตรก่อน'); if (!OCR_FUNCTION_URL) return toast('ยังไม่ได้ตั้งค่า OCR URL'); try { toast('กำลังอ่าน OCR...'); const imageBase64 = await compressImageToBase64(file), token = await getAuthToken(); const res = await fetch(OCR_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ imageBase64 }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'OCR failed'); const parsed = parseOcrResult(data); fillOcrFields(parsed); pendingOcrDebtor = ocrDebtorObject(); $('confirmText').textContent = `ชื่อ: ${pendingOcrDebtor.name}\nเลขบัตร: ${maskId(pendingOcrDebtor.idCard)}\nตำบล/แขวง: ${pendingOcrDebtor.subDistrict || '-'}\nเขต/อำเภอ: ${pendingOcrDebtor.district || '-'}\nจังหวัด: ${pendingOcrDebtor.province || '-'}`; $('confirmModal').classList.remove('hidden'); toast('อ่าน OCR สำเร็จ') } catch (e) { console.error(e); toast('OCR ไม่สำเร็จ: ' + e.message) } };
$('confirmCreateDebtorBtn').onclick = async () => { if (!pendingOcrDebtor) pendingOcrDebtor = ocrDebtorObject(); if (!pendingOcrDebtor.name) return toast('ไม่มีชื่อลูกหนี้'); if (isDuplicateIdCard(pendingOcrDebtor.idCard)) return toast('เลขบัตรประชาชนนี้มีอยู่แล้ว'); await add('debtors', pendingOcrDebtor); $('confirmModal').classList.add('hidden'); toast('เพิ่มลูกหนี้จาก OCR แล้ว'); $('confirmModal')?.classList.add('hidden'); hideCustomerForm(); switchTab('customers'); render() };
$('cancelCreateDebtorBtn').onclick = () => $('confirmModal').classList.add('hidden'); $('autoCreateDebtorBtn').onclick = async () => { const row = ocrDebtorObject(); if (!row.name) return toast('ไม่มีข้อมูล OCR'); if (isDuplicateIdCard(row.idCard)) return toast('เลขบัตรประชาชนนี้มีอยู่แล้ว'); await add('debtors', row); toast('เพิ่มลูกหนี้จาก OCR แล้ว'); $('confirmModal')?.classList.add('hidden'); hideCustomerForm(); switchTab('customers'); render() }; $('useOcrToDebtorBtn').onclick = () => { const row = ocrDebtorObject(); $('debtorName').value = row.name; $('debtorIdCard').value = row.idCard; if ($('debtorBirthDate')) $('debtorBirthDate').value = row.birthDate || ''; $('debtorAddress').value = row.address; if ($('debtorSubDistrict')) $('debtorSubDistrict').value = row.subDistrict || ''; $('debtorDistrict').value = row.district; $('debtorProvince').value = row.province; showCustomerForm('manual'); switchTab('customers'); toast('นำข้อมูล OCR ไปกรอกฟอร์มแล้ว') };
function bindDropzones() { [['dropzone', 'documentFile', 'dropzoneText'], ['ocrDropzone', 'ocrFile', 'ocrFileName']].forEach(([dzId, fileId, textId]) => { const dz = $(dzId), file = $(fileId), text = $(textId); if (!dz || !file) return; const show = () => { if (file.files[0]) { if (text) text.textContent = fileId === 'documentFile' ? `เลือกแล้ว ${file.files.length} ไฟล์` : file.files[0].name; if (fileId === 'ocrFile') { $('ocrPreview').src = URL.createObjectURL(file.files[0]); $('ocrPreview').classList.remove('hidden') } } }; file.addEventListener('change', show);['dragenter', 'dragover'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.add('dragover') }));['dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.remove('dragover') })); dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) { file.files = e.dataTransfer.files; show() } }) }) }
function sanitizeDecimalInput(value) {
    let v = String(value || '').replace(/,/g, '').replace(/[^\d.]/g, '');
    const firstDot = v.indexOf('.');
    if (firstDot !== -1) {
        v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
    }
    const parts = v.split('.');
    if (parts[1] !== undefined) parts[1] = parts[1].slice(0, 2);
    return parts.join('.');
}
function bindMoneyInputs() {
    document.querySelectorAll('.money-input').forEach(input => {
        input.setAttribute('inputmode', 'decimal');
        input.setAttribute('autocomplete', 'off');
        input.addEventListener('input', () => {
            const before = input.value;
            const pos = input.selectionStart;
            input.value = sanitizeDecimalInput(input.value);
            const diff = before.length - input.value.length;
            const next = Math.max(0, (pos || input.value.length) - diff);
            try { input.setSelectionRange(next, next) } catch (e) { }
        });
        input.addEventListener('focus', () => {
            input.value = String(input.value || '').replace(/,/g, '');
            input.select();
        });
        input.addEventListener('blur', () => {
            const n = num(input.value);
            input.value = input.value === '' ? '' : money(n);
        });
    });
}
bindDropzones(); bindMoneyInputs();

function bindNumericInputs() {
    const specs = [
        ['debtorPhone', 10], ['editDebtorPhone', 10], ['profilePhone', 10],
        ['debtorIdCard', 13], ['editDebtorIdCard', 13], ['ocrIdCard', 13], ['contractLenderIdCard', 13]
    ];
    specs.forEach(([id, max]) => {
        const input = $(id);
        if (!input) return;
        input.setAttribute('type', 'tel');
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('maxlength', String(max));
        input.addEventListener('input', () => {
            input.value = String(input.value || '').replace(/\D/g, '').slice(0, max);
        });
    });
}
bindNumericInputs();

function showCustomerForm(mode = 'manual') {
    $('customerFormArea').classList.remove('hidden');
    if (mode === 'ocr') { $('ocrCustomerBox').classList.remove('hidden'); $('manualCustomerBox').classList.add('hidden'); $('ocrCustomerBtn').classList.add('active'); $('manualCustomerBtn').classList.remove('active'); }
    else { $('manualCustomerBox').classList.remove('hidden'); $('ocrCustomerBox').classList.add('hidden'); $('manualCustomerBtn').classList.add('active'); $('ocrCustomerBtn').classList.remove('active'); }
    $('customerFormArea').scrollIntoView({ behavior: 'smooth' });
}
function hideCustomerForm() { $('customerFormArea').classList.add('hidden'); }
function switchTransaction(type) {
    document.querySelectorAll('[data-tx]').forEach(b => b.classList.toggle('active', b.dataset.tx === type));
    $('txDebtBox').classList.toggle('active', type === 'debt');
    $('txPaymentBox').classList.toggle('active', type === 'payment');
    $('txFollowupBox').classList.toggle('active', type === 'followup');
}
if ($('showAddCustomerBtn')) $('showAddCustomerBtn').onclick = () => showCustomerForm('manual');
if ($('closeCustomerFormBtn')) $('closeCustomerFormBtn').onclick = hideCustomerForm;
if ($('manualCustomerBtn')) $('manualCustomerBtn').onclick = () => showCustomerForm('manual');
if ($('ocrCustomerBtn')) $('ocrCustomerBtn').onclick = () => showCustomerForm('ocr');
document.querySelectorAll('[data-tx]').forEach(b => b.onclick = () => switchTransaction(b.dataset.tx));
if ($('debtPaymentType')) { $('debtPaymentType').onchange = updateDebtPaymentTypeUi; updateDebtPaymentTypeUi(); }
if ($('contractPaymentType')) { $('contractPaymentType').onchange = () => { updateContractPaymentTypeUi(); updateContractSmartUi(); }; updateContractPaymentTypeUi(); }

$('saveProfileBtn').onclick = async () => {
    const alias = $('profileAlias').value.trim();
    const lenderName = ($('profileLenderName')?.value || '').trim();
    const displayName = lenderName || alias || getDisplayName();
    if (!displayName) return toast('กรุณากรอกชื่อผู้ใช้งานหรือชื่อผู้ให้กู้');
    await saveSettings({
        profile: {
            alias: alias || displayName,
            lenderName: displayName,
            phone: $('profilePhone').value.trim(),
            lineId: $('profileLineId').value.trim(),
            telegramId: $('profileTelegramId').value.trim(),
            lenderIdCard: normalizeIdCard($('profileLenderIdCard')?.value || ''),
            lenderAddress: $('profileLenderAddress')?.value.trim() || '',
            showFullIdCard: $('profileShowFullIdCard')?.checked === true,
            showFullAddress: $('profileShowFullAddress')?.checked === true,
            showFullPhone: $('profileShowFullPhone')?.checked === true
        }
    });
    toast('บันทึกชื่อและที่อยู่ผู้ให้กู้ลงฐานข้อมูลแล้ว'); switchTab('settings');
    render();
};
$('saveReminderSettingsBtn').onclick = async () => { await saveSettings({ notifyEmail: $('notifyEmail').value.trim(), telegramChatId: $('telegramChatId').value.trim() }); toast('บันทึกการแจ้งเตือนแล้ว'); switchTab('settings'); render() }; $('testTelegramBtn').onclick = async () => { toast(TELEGRAM_TEST_FUNCTION_URL ? 'กำลังทดสอบ Telegram' : 'ยังไม่ได้ตั้งค่า Telegram Function URL') };
function switchTab(tab) {
    document.querySelectorAll('.bottom-tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll(`.bottom-tab[data-tab="${tab}"]`).forEach(x => x.classList.add('active'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    const panel = $('tab-' + tab);
    if (panel) panel.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.addEventListener('click', e => {
    const nav = e.target.closest('[data-tab]');
    if (nav) {
        e.preventDefault();
        const targetTab = nav.dataset.tab;
        if (targetTab && $('tab-' + targetTab)) switchTab(targetTab);
    }
}); $('demoBtn').onclick = async () => {
    demoMode = true;
    currentUser = null;
    latestData = null;
    try { if (auth?.currentUser) await auth.signOut(); } catch (e) { console.warn('Demo signOut skipped', e); }
    currentUser = { uid: 'demo', email: 'demo@local' };
    $('authView').classList.remove('active');
    $('appView').classList.add('active');
    setUserDisplay('Demo Mode');
    toast('Demo Mode');
    await render();
};
async function initFirebase() {
    if (!firebaseReady) return; const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'); const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'); const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'); const { getStorage } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js'); const app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); storage = getStorage(app); $('loginBtn').onclick = async () => { try { await signInWithEmailAndPassword(auth, $('email').value, $('password').value) } catch (e) { toast(e.code || e.message) } }; $('registerBtn').onclick = async () => { try { await createUserWithEmailAndPassword(auth, $('email').value, $('password').value) } catch (e) { toast(e.code || e.message) } }; $('logoutBtn').onclick = async () => { await signOut(auth); location.reload() }; onAuthStateChanged(auth, u => {
        if (demoMode) {
            currentUser = { uid: 'demo', email: 'demo@local' };
            $('authView').classList.remove('active');
            $('appView').classList.add('active');
            setUserDisplay('Demo Mode');
            render();
            return;
        }
        if (u) { currentUser = u; demoMode = false; $('authView').classList.remove('active'); $('appView').classList.add('active'); setUserDisplay(u.email || u.displayName || 'ผู้ใช้ Firebase'); render() }
        else { currentUser = null; setUserDisplay(''); $('authView').classList.add('active'); $('appView').classList.remove('active') }
    })
} if (!firebaseReady) { $('loginBtn').onclick = $('demoBtn').onclick; $('registerBtn').onclick = $('demoBtn').onclick }
const exportPayload = async () => ({ exportedAt: new Date().toISOString(), exportedDate: formatDate(today()), data: await getData() }); $('exportJsonBtn').onclick = async () => { const payload = await exportPayload(); download(JSON.stringify(payload, null, 2), `debt-backup-${payload.exportedDate.replace(/\//g, '-')}.json`, 'application/json') }; $('exportTxtBtn').onclick = async () => { const payload = await exportPayload(); download('DEBT_BACKUP\n' + JSON.stringify(payload, null, 2), `debt-backup-${payload.exportedDate.replace(/\//g, '-')}.txt`, 'text/plain') }; function download(c, n, t) { let a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([c], { type: t })); a.download = n; a.click() } $('importFile').onchange = async e => { let f = e.target.files[0]; if (!f) return; let txt = (await f.text()).replace(/^DEBT_BACKUP\s*/, '').trim(); setLocal(JSON.parse(txt).data || JSON.parse(txt)); demoMode = true; toast('Import เข้า Demo'); render() };

if ($('userMenuBtn')) $('userMenuBtn').onclick = (e) => { e.stopPropagation(); $('userDropdown').classList.toggle('hidden') };
if ($('openProfileBtn')) $('openProfileBtn').onclick = () => { switchTab('settings'); $('userDropdown').classList.add('hidden'); $('userProfileCard')?.scrollIntoView({ behavior: 'smooth' }) };
if ($('dropdownLogoutBtn')) $('dropdownLogoutBtn').onclick = () => $('logoutBtn')?.click();
document.addEventListener('click', e => { if ($('userDropdown') && !$('userMenuWrap')?.contains(e.target)) $('userDropdown').classList.add('hidden') });



/* ===== Phase 5: Loan Contract + Signature + PDF ===== */
const contractSigState = {};
let editingContractNo = '';
let editingContractId = '';
const SIG_IDS = ['sigLender', 'sigBorrower', 'sigWitness1', 'sigWitness2', 'sigWriter'];
const SIGNATURE_CANVAS_RATIO = 2; // v8.0.1: fixed ratio so PC/Mobile signatures render consistently
function resizeSignatureCanvas(canvas) {
    if (!canvas) return;
    const ratio = SIGNATURE_CANVAS_RATIO;
    const rect = canvas.getBoundingClientRect();
    const old = canvas.dataset.hasInk === '1' ? canvas.toDataURL('image/png') : '';
    const cssWidth = Math.max(280, Math.floor(rect.width || canvas.clientWidth || 320));
    const cssHeight = Math.max(140, Math.floor(rect.height || canvas.clientHeight || 150));
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
    canvas.style.width = '100%';
    canvas.style.height = cssHeight + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
    if (old) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, cssWidth, cssHeight); img.src = old; }
}
function bindSignaturePad(id) {
    const canvas = $(id); if (!canvas || contractSigState[id]) return;
    contractSigState[id] = true; resizeSignatureCanvas(canvas);
    let drawing = false;
    const getCtx = () => canvas.getContext('2d');
    const pos = e => { const r = canvas.getBoundingClientRect(); const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
    const start = e => { e.preventDefault(); resizeSignatureCanvas(canvas); drawing = true; canvas.dataset.hasInk = '1'; const p = pos(e); const ctx = getCtx(); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = e => { if (!drawing) return; e.preventDefault(); const p = pos(e); const ctx = getCtx(); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const end = e => { if (!drawing) return; e.preventDefault(); drawing = false; };
    if (window.PointerEvent) {
        canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture?.(e.pointerId); start(e); });
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
    } else {
        canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
        canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end, { passive: false });
    }
}
function clearSignature(id) { const c = $(id); if (!c) return; c.dataset.hasInk = ''; c.getContext('2d').clearRect(0, 0, c.width, c.height); }
function hasSignature(id) { return $(id)?.dataset.hasInk === '1'; }
function getSignatureData(id) { const c = $(id); return c && hasSignature(id) ? c.toDataURL('image/png') : ''; }
const SIGNATURE_KEYS = { sigBorrower: 'borrower', sigLender: 'lender', sigWitness1: 'witness1', sigWitness2: 'witness2', sigWriter: 'writer' };
const SIGNATURE_IDS_BY_KEY = Object.fromEntries(Object.entries(SIGNATURE_KEYS).map(([id, key]) => [key, id]));
// v8.0.12: keep every signature ink box on the same X axis for a cleaner PDF layout.
const SIGNATURE_PDF_X = 610;
const SIGNATURE_PDF_MAP = {
    // Template V2.2 coordinates (1447x2048 master scale).
    // Ink is drawn on the same row as the printed signature line.
    // Names are drawn immediately to the right of the ink, still before the role label.
    borrower: { id: 'sigBorrower', x: SIGNATURE_PDF_X, y: 1458, w: 118, h: 40 },
    lender: { id: 'sigLender', x: SIGNATURE_PDF_X, y: 1509, w: 118, h: 40 },
    witness1: { id: 'sigWitness1', x: SIGNATURE_PDF_X, y: 1663, w: 118, h: 40 },
    witness2: { id: 'sigWitness2', x: SIGNATURE_PDF_X, y: 1715, w: 118, h: 40 },
    writer: { id: 'sigWriter', x: SIGNATURE_PDF_X, y: 1766, w: 118, h: 40 }
};
function initContractPads() { SIG_IDS.forEach(bindSignaturePad); }
function cropSignatureCanvas(canvas, padding = 12) {
    if (!canvas || !hasSignature(canvas.id)) return '';
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const img = ctx.getImageData(0, 0, width, height);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const a = img.data[i + 3], r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
            if (a > 16 && (r < 245 || g < 245 || b < 245)) {
                if (x < minX) minX = x; if (y < minY) minY = y;
                if (x > maxX) maxX = x; if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0 || maxY < 0) return '';
    minX = Math.max(0, minX - padding); minY = Math.max(0, minY - padding);
    maxX = Math.min(width - 1, maxX + padding); maxY = Math.min(height - 1, maxY + padding);
    const cw = maxX - minX + 1, ch = maxY - minY + 1;
    const out = document.createElement('canvas'); out.width = cw; out.height = ch;
    out.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
    return out.toDataURL('image/png');
}
function collectContractSignatures() {
    const signatures = {};
    SIG_IDS.forEach(id => {
        const key = SIGNATURE_KEYS[id];
        const data = cropSignatureCanvas($(id));
        if (key && data) signatures[key] = data;
    });
    return signatures;
}
function restoreSignatureCanvas(id, dataUrl) {
    const c = $(id); if (!c || !dataUrl) return;
    resizeSignatureCanvas(c);
    const ctx = c.getContext('2d');
    const img = new Image();
    img.onload = () => {
        const cssW = c.width / SIGNATURE_CANVAS_RATIO;
        const cssH = c.height / SIGNATURE_CANVAS_RATIO;
        const scale = Math.min((cssW * .82) / img.width, (cssH * .70) / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (cssW - w) / 2, (cssH - h) / 2, w, h);
        c.dataset.hasInk = '1';
    };
    img.src = dataUrl;
}
function restoreContractSignatures(signatures = {}) {
    SIG_IDS.forEach(id => clearSignature(id));
    Object.entries(signatures || {}).forEach(([key, data]) => restoreSignatureCanvas(SIGNATURE_IDS_BY_KEY[key], data));
}
function debtorForContract(id) { return (latestData?.debtors || []).find(x => x.id === id) || {}; }

function normalizeSignerName(v) { return String(v || '').trim(); }
function contractRequiredSignatureKeys(row = {}) {
    const keys = ['borrower', 'lender'];
    if (normalizeSignerName(row.witness1Name)) keys.push('witness1');
    if (normalizeSignerName(row.witness2Name)) keys.push('witness2');
    keys.push('writer');
    return keys;
}
function contractSignedCount(row = {}) {
    const sigs = row.signatures || {};
    const required = contractRequiredSignatureKeys(row);
    const fromSigs = required.filter(k => Boolean(sigs[k])).length;
    if (!Object.keys(sigs).length && Number(row.signatureCount || 0) > 0) {
        return Math.min(Number(row.signatureCount || 0), required.length);
    }
    return fromSigs;
}
function contractRequiredSignatureCount(row = {}) { return contractRequiredSignatureKeys(row).length; }
function isContractFullySigned(row = {}) { return contractSignedCount(row) >= contractRequiredSignatureCount(row); }
function isContractLocked(row = {}) { return row.status === 'locked' || row.locked === true; }

function readContractFormRow(includeSignatures = false) {
    const debtor = debtorForContract($('contractDebtorId')?.value || '');
    const p = currentProfile();
    const signatures = includeSignatures ? collectContractSignatures() : {};
    const row = {
        contractNo: editingContractNo || nextContractNo(),
        sourceContractId: editingContractId || '',
        debtorId: $('contractDebtorId')?.value || '',
        borrowerName: debtor.name || '',
        lenderName: (($('contractLenderName')?.value || '').trim() || p.lenderName || getDisplayName()),
        lenderPhone: privacyInputRaw('contractLenderPhone') || p.phone || '',
        lenderIdCard: normalizeIdCard(privacyInputRaw('contractLenderIdCard') || p.lenderIdCard || ''),
        lenderAddress: privacyInputRaw('contractLenderAddress') || p.lenderAddress || '',
        amount: num($('contractAmount')?.value),
        contractDate: $('contractDate')?.value || today(),
        dueDate: $('contractDueDate')?.value || '',
        paymentType: $('contractPaymentType')?.value || 'single',
        installmentCount: Number($('contractInstallmentCount')?.value || 0),
        firstPaymentDate: $('contractFirstPaymentDate')?.value || '',
        interestRate: String($('contractInterestRate')?.value || '').replace(/,/g, ''),
        place: (($('contractPlace')?.value || '').trim()),
        collateral: (($('contractCollateral')?.value || '').trim()),
        witness1Name: (($('contractWitness1Name')?.value || '').trim()),
        witness2Name: (($('contractWitness2Name')?.value || '').trim()),
        writerName: (($('contractWriterName')?.value || '').trim() || (($('contractLenderName')?.value || '').trim())),
        templateType: $('contractTemplateType')?.value || 'loan_new_law',
        signatures
    };
    if (row.paymentType === 'installment') {
        row.installmentCount = Math.max(2, Math.floor(Number(row.installmentCount || 0)) || 2);
        row.firstPaymentDate = row.firstPaymentDate || addMonthsSafe(row.contractDate || today(), 1);
        row.dueDate = addMonthsSafe(row.firstPaymentDate, row.installmentCount - 1);
    } else {
        row.installmentCount = 1;
        row.firstPaymentDate = '';
        row.dueDate = row.dueDate || addMonthsSafe(row.contractDate || today(), 1);
    }
    row.requiredSignatureCount = contractRequiredSignatureCount(row);
    row.signatureCount = contractSignedCount(row);
    row.status = row.signatureCount ? (isContractFullySigned(row) ? 'ready_to_lock' : 'partial') : 'draft';
    row.locked = false;
    return row;
}
function updateContractSmartUi() {
    updateContractPaymentTypeUi();
    const debtor = debtorForContract($('contractDebtorId')?.value || '');
    const row = readContractFormRow(false);
    const age = debtorAgeForContract(debtor, row.contractDate || today());
    if ($('contractBorrowerAgeHint')) $('contractBorrowerAgeHint').textContent = `อายุผู้กู้: ${age || '-'} ปี`;
    const interest = Number(String(row.interestRate || '').replace(/[^0-9.]/g, ''));
    const interestHint = $('contractInterestHint');
    if (interestHint) {
        const over = Number.isFinite(interest) && interest > 15;
        interestHint.classList.toggle('danger', over);
        interestHint.innerHTML = over ? '<i class="bi bi-exclamation-triangle"></i> ดอกเบี้ยเกิน 15% ต่อปี กรุณาตรวจสอบก่อนบันทึก' : 'สูงสุดตามกฎหมาย 15% ต่อปี';
    }
    if ($('contractSummaryBox')) {
        $('contractSummaryBox').innerHTML = `
            <div class="contract-summary-title"><i class="bi bi-clipboard-check"></i> สรุปก่อนสร้างเอกสาร</div>
            <div class="contract-summary-grid">
                <div><span>ผู้กู้</span><strong>${escapeHtml(debtor.name || '-')}</strong></div>
                <div><span>อายุ</span><strong>${escapeHtml(age || '-')} ปี</strong></div>
                <div><span>เงินกู้</span><strong>${money(row.amount)}</strong></div>
                <div><span>ดอกเบี้ย</span><strong>${escapeHtml(row.interestRate || '-')}% ต่อปี</strong></div>
                <div><span>ทำสัญญา</span><strong>${formatDate(row.contractDate)}</strong></div>
                <div><span>รูปแบบชำระ</span><strong>${row.paymentType === 'installment' ? 'ผ่อน ' + (row.installmentCount || '-') + ' งวด' : 'ก้อนเดียวจบ'}</strong></div>
                <div><span>${row.paymentType === 'installment' ? 'งวดแรก' : 'ครบกำหนด'}</span><strong>${formatDate(row.paymentType === 'installment' ? row.firstPaymentDate : row.dueDate)}</strong></div>
            </div>`;
    }
}
function bindContractSmartUi() {
    const ids = ['contractTemplateType', 'contractDebtorId', 'contractLenderName', 'contractAmount', 'contractDate', 'contractPaymentType', 'contractDueDate', 'contractInstallmentCount', 'contractFirstPaymentDate', 'contractInterestRate', 'contractPlace', 'contractCollateral', 'contractWitness1Name', 'contractWitness2Name', 'contractWriterName'];
    ids.forEach(id => {
        const el = $(id); if (el && !el.dataset.phase8Bound) {
            ['input', 'change'].forEach(evt => el.addEventListener(evt, updateContractSmartUi));
            el.dataset.phase8Bound = '1';
        }
    });
    if ($('refreshContractSummaryBtn') && !$('refreshContractSummaryBtn').dataset.phase8Bound) {
        $('refreshContractSummaryBtn').onclick = updateContractSmartUi;
        $('refreshContractSummaryBtn').dataset.phase8Bound = '1';
    }
}
function showContractForm(prefillDebtorId = '') {
    if (!prefillDebtorId) { editingContractNo = ''; editingContractId = ''; }
    const card = $('contractFormCard'); if (!card) return;
    card.classList.remove('hidden'); if ($('contractDate') && !$('contractDate').value) $('contractDate').value = today(); if ($('contractDueDate') && !$('contractDueDate').value) $('contractDueDate').value = addMonthsSafe(today(), 1); if ($('contractFirstPaymentDate') && !$('contractFirstPaymentDate').value) $('contractFirstPaymentDate').value = addMonthsSafe(today(), 1); updateContractPaymentTypeUi();
    const p = currentProfile();
    if ($('contractLenderName')) $('contractLenderName').value = p.lenderName || p.alias || getDisplayName();
    fillContractLenderPrivacyFields(p);
    if (prefillDebtorId && $('contractDebtorId')) $('contractDebtorId').value = prefillDebtorId;
    bindContractSmartUi();
    updateContractSmartUi();
    initContractPads();
    setTimeout(() => {
        SIG_IDS.forEach(id => resizeSignatureCanvas($(id)));
        if (!editingContractId) restoreContractSignatures({});
        updateContractSmartUi();
    }, 120);
    card.scrollIntoView({ behavior: 'smooth' });
}
function renderContractList(d, c) {
    if (!$('contractList')) return;
    const list = (d.contracts || []).sort((a, b) => String(b.createdDate || '').localeCompare(String(a.createdDate || '')));
    $('contractList').innerHTML = list.length ? list.map(x => {
        const signed = contractSignedCount(x), required = contractRequiredSignatureCount(x), complete = isContractLocked(x), fullySigned = isContractFullySigned(x);
        const debtStatus = x.autoDebtCreated ? ' · สร้างก้อนหนี้แล้ว' : '';
        const status = complete ? `${signed}/${required} : ล็อกสัญญาแล้ว${debtStatus}` : (fullySigned ? `${signed}/${required} : ลงลายเซ็นครบแล้ว / รอล็อกเอกสาร` : `${signed}/${required} : ยังแก้ไขได้อยู่`);
        const canDelete = signed === 0 && !complete;
        const canLock = fullySigned && !complete;
        const displayAmount = contractDisplayAmount(x, c);
        return `<div class="item doc-card contract-row"><div class="doc-thumb"><i class="bi bi-file-earmark-text"></i></div><div><div class="item-title">${escapeHtml(c.debtors[x.debtorId]?.name || x.borrowerName || '-')} · ${money(displayAmount)}</div><div class="item-sub">${status} · วันที่ ${formatDate(x.contractDate || x.createdDate)} · ครบกำหนด ${formatDate(x.dueDate)} · ${escapeHtml(x.fileName || '')}</div></div><div class="doc-actions icon-actions"><button class="icon-action icon-view" type="button" title="เปิดเอกสาร" aria-label="เปิด เอกสาร" onclick="openContractPdf('${x.id}')"><i class="bi bi-file-earmark-pdf"></i></button>${canLock ? `<button class="icon-action icon-lock" type="button" title="ล็อกเอกสาร" aria-label="ล็อกเอกสาร" onclick="lockContractDocument('${x.id}')"><i class="bi bi-lock"></i></button>` : ''}${!complete ? `<button class="icon-action icon-edit" type="button" title="แก้ไข" aria-label="แก้ไข" onclick="editContractDraft('${x.id}')"><i class="bi bi-pencil-square"></i></button>` : ''}${canDelete ? `<button class="icon-action icon-delete" type="button" title="ลบ" aria-label="ลบ" onclick="deleteContractDraft('${x.id}')"><i class="bi bi-trash"></i></button>` : ''}</div></div>`;
    }).join('') : '<div class="empty">ยังไม่มีสัญญากู้ยืม</div>';
}
function bahtTextFallback(n) {
    const value = Number(String(n ?? 0).replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) return 'ศูนย์บาท-';
    const nums = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
    const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
    const readInt = (numStr) => {
        numStr = String(parseInt(numStr || '0', 10));
        if (numStr === '0') return '';
        let out = '';
        const len = numStr.length;
        for (let i = 0; i < len; i++) {
            const d = Number(numStr[i]);
            if (!d) continue;
            const pos = len - i - 1;
            if (pos === 0 && d === 1 && len > 1) out += 'เอ็ด';
            else if (pos === 1 && d === 1) out += 'สิบ';
            else if (pos === 1 && d === 2) out += 'ยี่สิบ';
            else out += nums[d] + units[pos];
        }
        return out;
    };
    const readMillion = (numStr) => {
        numStr = String(parseInt(numStr || '0', 10));
        if (numStr === '0') return 'ศูนย์';
        let parts = [];
        while (numStr.length > 6) { parts.unshift(numStr.slice(-6)); numStr = numStr.slice(0, -6); }
        parts.unshift(numStr);
        return parts.map((part, idx) => readInt(part) + (idx < parts.length - 1 ? 'ล้าน' : '')).join('');
    };
    const fixed = value.toFixed(2);
    const [baht, satang] = fixed.split('.');
    const b = readMillion(baht) + 'บาท';
    const satangNum = Number(satang);
    return satangNum ? b + readInt(satang) + 'สตางค์' : b + '-';
}

function contractAmountTextParts(n) {
    const value = Number(String(n ?? 0).replace(/,/g, ''));
    const safeValue = Number.isFinite(value) ? value : 0;
    const fixed = safeValue.toFixed(2);
    const [baht, satang] = fixed.split('.');
    const full = bahtTextFallback(safeValue);
    const satangNum = Number(satang || '0');
    const marker = 'บาท';
    const p = full.indexOf(marker);
    let bahtText = '';
    let satangText = '';
    if (p >= 0) {
        bahtText = full.slice(0, p).trim();
        const afterBaht = full.slice(p + marker.length).trim();
        satangText = satangNum > 0 ? afterBaht.replace(/สตางค์$/, '').trim() : '-';
    } else {
        bahtText = full.replace(/บาทถ้วน$/, '').replace(/บาท$/, '').trim();
        satangText = satangNum > 0 ? '' : '-';
    }

    // v9.0.3: ใส่วงเล็บเฉพาะข้อความจำนวนเงินและสตางค์ แล้วจัดกึ่งกลางในช่องของตัวเอง
    // กรณี .00 ให้สตางค์เป็น '-' โดยไม่ใส่วงเล็บ
    const displayBahtText = bahtText && bahtText !== '-' ? `( ${bahtText} )` : '-';
    const displaySatangText = satangNum > 0 && satangText && satangText !== '-' ? `( ${satangText} )` : '-';

    return {
        number: safeValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        bahtText: displayBahtText,
        satangText: displaySatangText
    };
}

function nextContractNo() {
    const d = new Date();
    const prefix = String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0');
    const maxSeq = (latestData?.contracts || [])
        .map(x => String(x.contractNo || ''))
        .filter(no => no.startsWith(prefix))
        .map(no => Number(no.slice(6)) || 0)
        .reduce((m, n) => Math.max(m, n), 0);
    return prefix + String(maxSeq + 1).padStart(4, '0');
}
const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_MONTHS_SHORT = TH_MONTHS_FULL;
function thaiDate(v) {
    if (!v) return '-';
    const d = new Date(String(v).includes('T') ? v : String(v) + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return v;
    return `${d.getDate()} ${TH_MONTHS_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;
}
function debtorAgeForContract(debtor = {}, atValue = today()) {
    const explicit = String(debtor.age || '').trim();
    if (explicit && explicit !== '-') return explicit;
    return calcAgeYears(debtor.birthDate || debtor.birthday || debtor.dob || debtor.dateOfBirth || debtor.birth_date, atValue) || '-';
}
function currentProfile() { return (latestData?.settings?.profile) || latestData?.settings || {}; }
function adjustSignaturePageBreak(paper) {
    const sign = paper?.querySelector('.contract-sign-section'); if (!sign) return;
    sign.style.marginTop = '';
    const page = 1123, top = sign.offsetTop, h = sign.offsetHeight;
    if ((top % page) + h > page - 42) sign.style.marginTop = (page - (top % page) + 30) + 'px';
}
function fullId(v) { return normalizeIdCard(v || '') || '-'; }
function thDateParts(v) {
    const t = thaiDate(v || today());
    if (!t || t === '-') return { day: '____', month: '__________', year: '____', full: '-' };
    const parts = t.split(' ');
    return { day: parts[0] || '____', month: parts[1] || '__________', year: parts[2] || '____', full: t };
}
function contractValue(v, cls = '') { return `<span class="contract-fill ${cls}"><span class="contract-fill-text">${escapeHtml(v || '-')}</span></span>`; }
function buildContractHtml(row, debtor) {
    const borrowerAddress = displayAddress(debtorFullAddress(debtor));
    const cdate = thDateParts(row.contractDate || today());
    const ddate = thDateParts(row.dueDate);
    const lenderName = row.lenderName || currentProfile().lenderName || getDisplayName();
    const borrowerName = debtor.name || row.borrowerName || '-';
    const collateral = row.collateral || row.terms || 'ไม่มีหลักประกันเพิ่มเติม';
    const interest = row.interestRate ? `${row.interestRate}%` : 'ตามที่กฎหมายกำหนด';
    const sig = id => { const data = getSignatureData(id); return data ? `<img class="contract-sign-img" src="${data}">` : '<div class="contract-sign-empty"></div>'; };
    return `<div class="contract-paper contract-template">
        <h1>หนังสือสัญญาเงินกู้ตามกฎหมายใหม่</h1>
        <p class="contract-line contract-no-line">ลำดับที่ ${contractValue(row.contractNo || nextContractNo(), 'fill-left fill-docno')}</p>
        <p class="contract-line contract-place-line">ทำที่ ${contractValue(row.place || '-', 'fill-left fill-place')}</p>
        <p class="contract-line contract-date-line">วันที่ ${contractValue(cdate.day, 'fill-date')} เดือน ${contractValue(cdate.month, 'fill-date')} พ.ศ. ${contractValue(cdate.year, 'fill-date')}</p>
        <p>ข้าพเจ้า ${contractValue(borrowerName)} อายุ ${contractValue(debtorAgeForContract(debtor, row.contractDate || today()))} ปี ที่อยู่ ${contractValue(borrowerAddress || '-')} เลขประจำตัวประชาชน ${contractValue(displayIdCard(debtor.idCard))}</p>
        <p>ได้ทำหนังสือสัญญากู้เงินให้ไว้แก่ ${contractValue(lenderName)} เลขประจำตัวประชาชน ${contractValue(displayIdCard(row.lenderIdCard))} ที่อยู่ ${contractValue(displayAddress(row.lenderAddress || '-'))} มีข้อสัญญาดังแจ้งต่อไปนี้</p>
        <p>ข้อ ๑. ข้าพเจ้า ${contractValue(borrowerName)} ได้กู้เงินของ ${contractValue(lenderName)} เป็นจำนวนเงิน ${contractValue(money(row.amount), 'fill-money')} บาท (${contractValue(bahtTextFallback(row.amount), 'fill-left')}) ข้าพเจ้าได้รับเงินไปครบถ้วนเสร็จแล้วตั้งแต่วันทำสัญญานี้</p>
        <p>ข้อ ๒. เพื่อเป็นหลักฐานในเงินซึ่งข้าพเจ้ากู้ไปนี้ ข้าพเจ้าได้นำ ${contractValue(collateral)} ให้ท่านถือไว้เป็นประกันด้วย และข้าพเจ้าขอรับรองว่า ทรัพย์สินซึ่งข้าพเจ้านำมานี้ เป็นของข้าพเจ้าโดยแท้จริง และไม่มีภาระผูกพันใด ๆ ในหนี้สินรายอื่นนอกเหนือทรัพย์สินนี้เลย</p>
        <p>ข้อ ๓. ในจำนวนเงินซึ่งข้าพเจ้าได้กู้ไปนี้ ข้าพเจ้าจะนำมาใช้ให้ท่านเสร็จภายในวันที่ ${contractValue(ddate.day, 'fill-date')} เดือน ${contractValue(ddate.month, 'fill-date')} พ.ศ. ${contractValue(ddate.year, 'fill-date')} นับตั้งแต่วันทำสัญญานี้เป็นต้นไป</p>
        <p>ข้อ ๔. ข้าพเจ้ายอมให้ดอกเบี้ย ${contractValue(interest)} แก่ท่านทุกเดือนไป จนกว่าข้าพเจ้าจะนำเงินต้นส่งให้แก่ท่านจนครบตามจำนวนที่ได้กู้ไป</p>
        <p>ข้อ ๕. ข้าพเจ้าล้มตายเสียก็ดี หรือหลบหายไปเสียก็ดี ข้าพเจ้ายอมให้ท่านมีอำนาจเอาทรัพย์สมบัติของข้าพเจ้า ขายทอดตลาดเอาเงินต้น และดอกเบี้ยของท่านจนครบ</p>
        <p>ข้อ ๖. แม้ว่าข้าพเจ้าประพฤติผิดสัญญานี้แต่ข้อหนึ่งข้อใดก็ดี ยอมให้ท่านฟ้องร้องเรียกเงินต้นและดอกเบี้ยแก่ข้าพเจ้าตามกฎหมาย</p>
        <p>ข้อ ๗. ค่าธรรมเนียม ค่าพาหนะและค่าเสียหายต่าง ๆ ซึ่งท่านต้องเสียไปในการทวงถามฟ้องร้อง ข้าพเจ้านั้น ข้าพเจ้ายอมใช้ให้ท่านตามที่ได้เสียหายไปจนครบถ้วน</p>
        <p>ทันใดนี้ผู้เขียนสัญญา ได้อ่านข้อความในสัญญาให้ข้าพเจ้าผู้กู้ฟังเข้าใจโดยละเอียดตลอดทุกข้อแล้ว ข้าพเจ้าได้ลงลายมือชื่อให้ไว้ต่อหน้าพยานผู้พร้อมกัน ณ ที่นี้</p>
        <div class="contract-sign-section"><div class="contract-sign-grid contract-template-sign">
            <div class="sign-box">${sig('sigBorrower')}<div class="sign-line-label">ลงลายมือชื่อ ${contractValue(borrowerName, 'fill-sign')} <span class="sign-role">ผู้กู้</span></div></div>
            <div class="sign-box">${sig('sigLender')}<div class="sign-line-label">ลงลายมือชื่อ ${contractValue(lenderName, 'fill-sign')} <span class="sign-role">ผู้ให้กู้ (เจ้าของเงิน)</span></div></div>
            <div class="sign-box">${sig('sigWitness1')}<div class="sign-line-label">ลงลายมือชื่อ ${contractValue(row.witness1Name || '-', 'fill-sign')} <span class="sign-role">พยาน</span></div></div>
            <div class="sign-box">${sig('sigWitness2')}<div class="sign-line-label">ลงลายมือชื่อ ${contractValue(row.witness2Name || '-', 'fill-sign')} <span class="sign-role">พยาน</span></div></div>
            <div class="sign-box sign-writer">${sig('sigWriter')}<div class="sign-line-label">ลงลายมือชื่อ ${contractValue(row.writerName || lenderName, 'fill-sign')} <span class="sign-role nowrap">ผู้เขียนและพยาน</span></div></div>
        </div></div>
        <small class="contract-watermark">เอกสารสร้างจากระบบ Debt Collector</small>
    </div>`;
}

function syncSavedContractLocal(existing, contractId, documentId, docPayload, contractPayload, extra = {}) {
    const d = { ...blank, ...(latestData || local()) };
    d.documents = Array.isArray(d.documents) ? d.documents.slice() : [];
    d.contracts = Array.isArray(d.contracts) ? d.contracts.slice() : [];
    const docRow = { id: documentId, ...docPayload, storagePath: extra.storagePath || '', downloadURL: extra.downloadURL || '', updatedDate: today() };
    const contractRow = { id: contractId, ...contractPayload, documentId, storagePath: extra.storagePath || '', downloadURL: extra.downloadURL || '', updatedDate: today() };
    const docIndex = d.documents.findIndex(x => x.id === documentId);
    if (docIndex >= 0) d.documents[docIndex] = { ...d.documents[docIndex], ...docRow };
    else d.documents.push(docRow);
    const conIndex = d.contracts.findIndex(x => x.id === contractId);
    if (conIndex >= 0) d.contracts[conIndex] = { ...d.contracts[conIndex], ...contractRow };
    else d.contracts.push(contractRow);
    latestData = d;
    setLocal(d);
}


function buildContractDebtInstallments(contract) {
    const runningNo = contract.contractNo || contract.id || nextContractNo();
    const baseDebtTitle = `สัญญาเลขที่ ${runningNo}`;
    let paymentType = contract.paymentType || 'single';
    let installmentCount = Number(contract.installmentCount || 0);
    if (!contract.paymentType && contract.dueDate) {
        installmentCount = countContractMonths(contract.contractDate, contract.dueDate);
        paymentType = installmentCount > 1 ? 'installment' : 'single';
    }
    if (paymentType === 'installment') installmentCount = Math.max(2, Math.floor(installmentCount || countContractMonths(contract.contractDate, contract.dueDate)));
    else installmentCount = 1;
    return buildInstallmentRows({
        debtorId: contract.debtorId,
        title: baseDebtTitle,
        amount: contract.amount,
        paymentType,
        dueDate: contract.dueDate || addMonthsSafe(contract.contractDate || today(), 1),
        firstDueDate: contract.firstPaymentDate || addMonthsSafe(contract.contractDate || today(), 1),
        installmentCount,
        interestRate: contract.interestRate,
        source: 'contract_auto',
        contractId: contract.id || '',
        contractNo: contract.contractNo || '',
        contractDate: contract.contractDate || today()
    });
}

async function ensureAutoDebtForLockedContract(contract) {
    if (!contract || !contract.id || !isContractLocked(contract)) return false;
    const existing = (latestData?.debts || []).some(d => d.source === 'contract_auto' && (d.contractId === contract.id || (contract.contractNo && d.contractNo === contract.contractNo)));
    if (contract.autoDebtCreated || existing) return false;
    const installments = buildContractDebtInstallments(contract);
    await addMany('debts', installments);
    const totalDebtAmount = roundMoney(installments.reduce((s, x) => s + num(x.principal), 0));
    await updateRow('contracts', contract.id, {
        status: 'locked', locked: true, autoDebtCreated: true,
        debtGeneratedDate: today(), installmentCount: installments.length, totalDebtAmount
    });
    if (latestData?.contracts) {
        latestData.contracts = latestData.contracts.map(x => x.id === contract.id ? { ...x, status: 'locked', locked: true, autoDebtCreated: true, debtGeneratedDate: today(), installmentCount: installments.length, totalDebtAmount } : x);
    }
    toast(`ล็อกเอกสารแล้ว และสร้างก้อนหนี้ ${installments.length} งวดแล้ว`);
    return true;
}

async function saveContractPdf(row, blob) {
    const debtorId = row.debtorId;
    const existing = (latestData?.contracts || []).find(x =>
        (editingContractId && x.id === editingContractId) ||
        (row.sourceContractId && x.id === row.sourceContractId) ||
        (row.contractNo && x.contractNo === row.contractNo)
    ) || null;
    const fileName = existing?.fileName || `loan-contract-${row.contractNo || debtorId}-${Date.now()}.pdf`;
    const docPayload = { debtorId, type: 'สัญญากู้ยืม', fileName, mimeType: 'application/pdf', size: blob.size, createdDate: existing?.createdDate || today(), updatedDate: today() };
    const contractPayload = { ...row, fileName, createdDate: existing?.createdDate || today(), updatedDate: today() };

    if (demoMode) {
        if (existing?.documentId) {
            await updateRow('documents', existing.documentId, docPayload);
            await updateRow('contracts', existing.id, { ...contractPayload, documentId: existing.documentId, downloadURL: existing.downloadURL || '' });
            latestData = local();
            return { id: existing.id, ...contractPayload, documentId: existing.documentId, downloadURL: existing.downloadURL || '' };
        } else if (existing?.id) {
            const d = local();
            const newDocId = uid();
            d.documents.push({ id: newDocId, ...docPayload, storagePath: '', downloadURL: '' });
            d.contracts = d.contracts.map(x => x.id === existing.id ? { ...x, ...contractPayload, documentId: newDocId, downloadURL: '' } : x);
            setLocal(d);
            latestData = local();
            return { id: existing.id, ...contractPayload, documentId: newDocId, downloadURL: '' };
        } else {
            const d = local();
            const newDocId = uid(), newContractId = uid();
            d.documents.push({ id: newDocId, ...docPayload, storagePath: '', downloadURL: '' });
            d.contracts.push({ id: newContractId, ...contractPayload, documentId: newDocId, downloadURL: '' });
            setLocal(d);
            latestData = local();
            return { id: newContractId, ...contractPayload, documentId: newDocId, downloadURL: '' };
        }
        latestData = local();
        return;
    }

    const { ref, uploadBytes, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js');
    const path = existing?.storagePath || `users/${currentUser.uid}/debtors/${debtorId}/contracts/${fileName}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, blob, { contentType: 'application/pdf' });
    const downloadURL = await getDownloadURL(fileRef);

    const { collection, addDoc, doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    if (existing?.id) {
        let documentId = existing.documentId || '';
        if (documentId) {
            await updateDoc(doc(db, `users/${currentUser.uid}/documents/${documentId}`), { ...docPayload, storagePath: path, downloadURL, updatedAt: serverTimestamp() });
        } else {
            const docRef = await addDoc(collection(db, `users/${currentUser.uid}/documents`), { ...docPayload, storagePath: path, downloadURL, createdAt: serverTimestamp() });
            documentId = docRef.id;
        }
        await updateDoc(doc(db, `users/${currentUser.uid}/contracts/${existing.id}`), { ...contractPayload, documentId, storagePath: path, downloadURL, updatedAt: serverTimestamp() });
        syncSavedContractLocal(existing, existing.id, documentId, docPayload, contractPayload, { storagePath: path, downloadURL });
        return { id: existing.id, ...contractPayload, documentId, storagePath: path, downloadURL };
    } else {
        const docRef = await addDoc(collection(db, `users/${currentUser.uid}/documents`), { ...docPayload, storagePath: path, downloadURL, createdAt: serverTimestamp() });
        const contractRef = await addDoc(collection(db, `users/${currentUser.uid}/contracts`), { ...contractPayload, documentId: docRef.id, storagePath: path, downloadURL, createdAt: serverTimestamp() });
        syncSavedContractLocal(null, contractRef.id, docRef.id, docPayload, contractPayload, { storagePath: path, downloadURL });
        return { id: contractRef.id, ...contractPayload, documentId: docRef.id, storagePath: path, downloadURL };
    }
}

const CONTRACT_TEMPLATE_URL = './assets/img/loan-contract-template-a4.png';
let contractTemplateImagePromise = null;
function loadContractTemplateImage() {
    if (!contractTemplateImagePromise) {
        contractTemplateImagePromise = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = CONTRACT_TEMPLATE_URL + '?v=7.7.7-template-v2-coordinate-map';
        });
    }
    return contractTemplateImagePromise;
}
const CONTRACT_CANVAS_WIDTH = 1447;
const CONTRACT_CANVAS_HEIGHT = 2048;
const CONTRACT_CANVAS_SCALE_X = CONTRACT_CANVAS_WIDTH / 1447;
const CONTRACT_CANVAS_SCALE_Y = CONTRACT_CANVAS_HEIGHT / 2048;
function contractCanvasPoint(x, y) { return { x: x * CONTRACT_CANVAS_SCALE_X, y: y * CONTRACT_CANVAS_SCALE_Y }; }
const CONTRACT_CANVAS_FONT_FAMILY = '"THSarabunContract"';
let contractFontReadyPromise = null;
async function ensureContractCanvasFont() {
    if (contractFontReadyPromise) return contractFontReadyPromise;
    contractFontReadyPromise = (async () => {
        try {
            if (window.FontFace && document.fonts) {
                const normalUrl = './assets/fonts/THSarabun.ttf?v=7.7.7';
                const boldUrl = './assets/fonts/THSarabun-Bold.ttf?v=7.7.7';
                const alreadyLoaded = Array.from(document.fonts).some(f => f.family === 'THSarabunContract');
                if (!alreadyLoaded) {
                    const normalFace = new FontFace('THSarabunContract', `url(${normalUrl})`, { weight: '400', style: 'normal' });
                    const boldFace = new FontFace('THSarabunContract', `url(${boldUrl})`, { weight: '600', style: 'normal' });
                    const loaded = await Promise.all([normalFace.load(), boldFace.load()]);
                    loaded.forEach(face => document.fonts.add(face));
                }
                await document.fonts.load('400 42px "THSarabunContract"');
                await document.fonts.load('600 42px "THSarabunContract"');
                await document.fonts.ready;
                // v8.0.1: force one paint cycle after font is ready to prevent mobile fallback-font PDF rendering
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            }
        } catch (e) {
            console.warn('Contract font load warning', e);
        }
    })();
    return contractFontReadyPromise;
}
const CONTRACT_FONT_RENDER_SCALE = 1.25; // ปรับขนาดตัวอักษรทั้ง PDF ได้ที่นี่: 1.00 = ตามค่าที่ map กำหนด
function setupContractCanvasFont(ctx, size = 40, bold = false) {
    // Contract PDF must always use the bundled TH Sarabun font.
    // Do not let canvas fall back to browser/default fonts, otherwise coordinates drift.
    const px = Math.round(Number(size || 40) * CONTRACT_FONT_RENDER_SCALE);
    ctx.font = `${bold ? '600 ' : '400 '}${px}px ${CONTRACT_CANVAS_FONT_FAMILY}`;
    ctx.textBaseline = 'alphabetic';
}
function drawContractText(ctx, text, x, y, opt = {}) {
    const p = contractCanvasPoint(x, y);
    const maxWidth = opt.maxWidth ? opt.maxWidth * CONTRACT_CANVAS_SCALE_X : 9999;
    let align = opt.align || 'left';
    let size = opt.size || 40;
    const minSize = opt.minSize || 30;
    const value = String(text || '-').trim() || '-';
    ctx.fillStyle = opt.color || '#0000ff';
    while (size > minSize) {
        setupContractCanvasFont(ctx, size, opt.bold !== false);
        if (ctx.measureText(value).width <= maxWidth) break;
        size -= 2;
    }
    setupContractCanvasFont(ctx, size, opt.bold !== false);
    const textWidth = ctx.measureText(value).width;
    if (align === 'smart') {
        // Smart Alignment Rule v7.2:
        // - every normal filled value is centered on the printed line
        // - amount fields explicitly pass align:'right' to prevent number insertion
        // - signatures/names stay handled by their own centered line boxes
        align = 'center';
    }
    ctx.textAlign = align;
    const indent = opt.indent != null ? opt.indent * CONTRACT_CANVAS_SCALE_X : 12;
    const tx = align === 'right' ? p.x + maxWidth - (opt.rightPad || 0) * CONTRACT_CANVAS_SCALE_X : (align === 'center' ? p.x + (maxWidth / 2) : p.x + indent);
    ctx.fillText(value, tx, p.y, maxWidth);
}
function drawContractWrap(ctx, text, x, y, maxWidth, lineHeight = 26, maxLines = 2, opt = {}) {
    const words = String(text || '-').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    const size = opt.size || 38;
    setupContractCanvasFont(ctx, size, opt.bold !== false);
    const pxMax = maxWidth * CONTRACT_CANVAS_SCALE_X;
    for (const word of words) {
        const test = current ? current + ' ' + word : word;
        if (ctx.measureText(test).width <= pxMax || !current) current = test;
        else { lines.push(current); current = word; }
        if (lines.length >= maxLines) break;
    }
    if (current && lines.length < maxLines) lines.push(current);
    lines.forEach((line, i) => drawContractText(ctx, line, x, y + i * lineHeight, { maxWidth, size, minSize: opt.minSize || 24, align: opt.align || 'center' }));
}

function drawContractWrapSegments(ctx, text, segments, opt = {}) {
    const size = opt.size || 34;
    const minSize = opt.minSize || 22;
    const words = String(text || '-').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    let segIndex = 0;
    setupContractCanvasFont(ctx, size, opt.bold === true);
    const maxPxFor = i => (segments[Math.min(i, segments.length - 1)].maxWidth || 9999) * CONTRACT_CANVAS_SCALE_X;
    for (const word of words) {
        const test = current ? current + ' ' + word : word;
        if (ctx.measureText(test).width <= maxPxFor(segIndex) || !current) {
            current = test;
        } else {
            lines.push(current);
            current = word;
            segIndex++;
            if (lines.length >= segments.length) break;
        }
    }
    if (current && lines.length < segments.length) lines.push(current);
    lines.forEach((line, i) => {
        const seg = segments[i];
        drawContractText(ctx, line, seg.x, seg.y, { maxWidth: seg.maxWidth, size, minSize, align: seg.align || opt.align || 'left', bold: opt.bold === true });
    });
}

function drawContractInlineWrap(ctx, text, firstX, firstY, firstMaxWidth, nextX, nextY, nextMaxWidth, lineHeight = 34, opt = {}) {
    const words = String(text || '-').trim().split(/\s+/).filter(Boolean);
    const size = opt.size || 38;
    setupContractCanvasFont(ctx, size, opt.bold === true);
    const firstPxMax = firstMaxWidth * CONTRACT_CANVAS_SCALE_X;
    const nextPxMax = nextMaxWidth * CONTRACT_CANVAS_SCALE_X;
    const lines = [];
    let current = '';
    let currentMax = firstPxMax;
    for (const word of words) {
        const test = current ? current + ' ' + word : word;
        if (ctx.measureText(test).width <= currentMax || !current) {
            current = test;
        } else {
            lines.push(current);
            current = word;
            currentMax = nextPxMax;
            if (lines.length >= 2) break;
        }
    }
    if (current && lines.length < 2) lines.push(current);
    const align = opt.align || 'center';
    const nextAlign = opt.nextAlign || align;
    if (lines[0]) drawContractText(ctx, lines[0], firstX, firstY, { maxWidth: firstMaxWidth, size, minSize: opt.minSize || 24, align, bold: opt.bold === true });
    if (lines[1]) drawContractText(ctx, lines[1], nextX, nextY, { maxWidth: nextMaxWidth, size, minSize: opt.minSize || 24, align: nextAlign, bold: opt.bold === true });
}
function drawContractSignature(ctx, dataUrl, x, y, w, h) {
    if (!dataUrl) return Promise.resolve();
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const p = contractCanvasPoint(x, y);
            const boxW = w * CONTRACT_CANVAS_SCALE_X, boxH = h * CONTRACT_CANVAS_SCALE_Y;
            const scale = Math.min(boxW / img.width, boxH / img.height);
            const drawW = img.width * scale, drawH = img.height * scale;
            const dx = p.x + (boxW - drawW) / 2;
            // Bottom-align cropped ink within the signature box so it sits close to the printed line.
            const dy = p.y + boxH - drawH;
            // แปลงลายเซ็นให้เป็นสีน้ำเงินเดียวกับข้อความในฟอร์ม
            const sigCanvas = document.createElement('canvas');
            sigCanvas.width = img.width;
            sigCanvas.height = img.height;
            const sigCtx = sigCanvas.getContext('2d');
            sigCtx.drawImage(img, 0, 0);
            sigCtx.globalCompositeOperation = 'source-in';
            sigCtx.fillStyle = '#0000ff';
            sigCtx.fillRect(0, 0, sigCanvas.width, sigCanvas.height);
            sigCtx.globalCompositeOperation = 'source-over';
            ctx.drawImage(sigCanvas, dx, dy, drawW, drawH);
            resolve();
        };
        img.onerror = () => resolve();
        img.src = dataUrl;
    });
}
async function renderContractImageCanvas(row, debtor) {
    await ensureContractCanvasFont();
    const template = await loadContractTemplateImage();
    const canvas = document.createElement('canvas');
    canvas.width = CONTRACT_CANVAS_WIDTH; canvas.height = CONTRACT_CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(template, 0, 0, canvas.width, canvas.height);

    const borrowerName = debtor.name || row.borrowerName || '-';
    const lenderName = row.lenderName || currentProfile().lenderName || getDisplayName();
    const cdate = thDateParts(row.contractDate || today());
    const ddate = thDateParts(row.dueDate);
    const collateral = row.collateral || row.terms || '-';
    const interest = row.interestRate ? `${row.interestRate}% ต่อปี` : '-';
    const borrowerAge = debtorAgeForContract(debtor, row.contractDate || today());
    const parsedAddress = parseThaiAddressParts([debtor.houseNo, debtor.address, debtor.subDistrict, debtor.district, debtor.province].filter(Boolean).join(' '));
    const houseNo = debtor.houseNo || parsedAddress.houseNo || '-';
    const subDistrict = debtor.subDistrict || debtor.tambon || debtor.subdistrict || parsedAddress.subDistrict || '';
    const district = debtor.district || parsedAddress.district || '';
    const province = debtor.province || parsedAddress.province || '';
    const showFullAddress = privacySettings().showFullAddress;
    const pdfSubDistrict = showFullAddress ? subDistrict : '-';
    const pdfDistrict = showFullAddress ? district : '-';
    const pdfProvince = showFullAddress ? province : '-';
    const borrowerNameWithId = displayIdCard(debtor.idCard) !== '-' ? `${borrowerName} เลขประจำตัวประชาชน ${displayIdCard(debtor.idCard)}`.replace(/\s+/g, ' ').trim() : borrowerName;
    const lenderNameWithId = displayIdCard(row.lenderIdCard) !== '-' ? `${lenderName} เลขประจำตัวประชาชน ${displayIdCard(row.lenderIdCard)}`.replace(/\s+/g, ' ').trim() : lenderName;
    const amountParts = contractAmountTextParts(row.amount);
    const amountInteger = amountParts.number || '-';
    const amountSatang = amountParts.satangText || '';
    const amountThai = amountParts.bahtText || '-';

    // Template V2 coordinate map: แก้ตำแหน่ง/ขนาดที่นี่จุดเดียว
    // พิกัด x/y ใช้สเกลเดียวกับ PNG master 1447x2048
    const FS = 48;
    const FS_SMALL = 46;
    const FS_INLINE_ID = 44;
    const FS_COLLATERAL = 44;
    const FS_SIG_NAME = 43;
    // v8.0.2: compensate template-field visual centering for mobile canvas/font rendering.
    // Coordinates are in the 1447x2048 template coordinate map.
    // v8.0.5: top borrower/lender name fields must start immediately after the printed form text.
    // Do not center these fields, because mobile Canvas text metrics can visually push centered Thai text to the right.
    const isPdfMobileRender = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
        || (typeof window !== 'undefined' && ((window.innerWidth || 9999) <= 900 || (navigator.maxTouchPoints || 0) > 0));
    const PDF_FIELD_RIGHT_NUDGE = -12;
    // v8.0.15: Mobile Canvas text metrics do not match PC when a Thai field is centered/right-fitted.
    // Keep the PC-stable map untouched. On Mobile only, use fixed left/right anchors instead of center metrics
    // for the fields the user marked: both month fields, borrower subdistrict, and satang text.
    const mobileField = (pc, mobile) => isPdfMobileRender ? { ...pc, ...mobile } : pc;
    const F = {
        header: {
            contractNo: { x: 248, y: 166, maxWidth: 359, size: FS, minSize: 28, align: 'left' },
            place: { x: 755, y: 166, maxWidth: 514, size: FS, minSize: 28, align: 'left' },
            day: { x: 688, y: 217, maxWidth: 107, size: FS, minSize: 28, align: 'center' },
            month: { x: 875, y: 217, maxWidth: 154, size: FS, minSize: 28, align: 'left' },
            year: { x: 1116, y: 217, maxWidth: 154, size: FS, minSize: 28, align: 'center' }
        },
        borrower: {
            name: { x: 485, y: 268, maxWidth: 470, size: FS, minSize: 32, align: 'left', indent: 0 },
            age: { x: 1000 + PDF_FIELD_RIGHT_NUDGE, y: 268, maxWidth: 55, size: FS_SMALL, minSize: 30, align: 'center' },
            houseNo: { x: 1178 + PDF_FIELD_RIGHT_NUDGE, y: 268, maxWidth: 105, size: FS_SMALL, minSize: 30, align: 'center' },
            // subDistrict: mobileField({ x: 250 + PDF_FIELD_RIGHT_NUDGE, y: 320, maxWidth: 200, size: FS_SMALL, minSize: 30, align: 'center' }, { x: 250, maxWidth: 200, align: 'left', indent: 0 }),
            subDistrict: { x: 245 + PDF_FIELD_RIGHT_NUDGE, y: 320, maxWidth: 260, size: FS_SMALL, minSize: 30, align: 'left' },
            district: { x: 485 + PDF_FIELD_RIGHT_NUDGE, y: 320, maxWidth: 260, size: FS_SMALL, minSize: 30, align: 'center' },
            province: { x: 810 + PDF_FIELD_RIGHT_NUDGE, y: 320, maxWidth: 340, size: FS_SMALL, minSize: 30, align: 'center' }
        },
        lender: {
            name: { x: 370, y: 371, maxWidth: 705, size: FS, minSize: 32, align: 'left', indent: 0 }
        },
        clause1: {
            borrowerLine: { x: 405, y: 422, maxWidth: 730, size: FS_INLINE_ID, minSize: 30, align: 'left', indent: 0 },
            lenderLine: { x: 182, y: 473, maxWidth: 900, size: FS_INLINE_ID, minSize: 30, align: 'left', indent: 0 },
            // v8.0.11: number + Thai amount + satang/full text are on the SAME printed money line.
            // Do not use a second-line Y for the Thai amount text. Only X changes by field.
            amount: { x: 175, y: 525, maxWidth: 450, size: FS, minSize: 32, align: 'right', rightPad: 4 },
            // v9.0.3: ตัวหนังสือจำนวนเงินใส่วงเล็บและจัดกึ่งกลางในช่องข้อความ เพื่อให้ PC/Mobile ไม่เลื่อนจาก right-anchor
            amountText: { x: 635, y: 520, maxWidth: 340, size: 32, minSize: 20, align: 'center', rightPad: 0 },
            // v9.0.3: ถ้ามีสตางค์ให้ใส่วงเล็บและจัดกึ่งกลาง / ถ้า .00 ให้แสดง '-' ไม่ใส่วงเล็บ
            satang: { x: 1080, y: 520, maxWidth: 220, size: 32, minSize: 20, align: 'center', rightPad: 0 },
            satangFull: { x: 1080, y: 520, maxWidth: 145, size: 32, minSize: 20, align: 'center', rightPad: 0 } // '-' 
        },
        clause3: {
            day: { x: 223, y: 935, maxWidth: 118, size: FS, minSize: 32, align: 'center' },
            month: { x: 410, y: 935, maxWidth: 178, size: FS, minSize: 32, align: 'left' },
            year: { x: 655, y: 935, maxWidth: 178, size: FS, minSize: 32, align: 'center' }
        },
        clause4: {
            interest: { x: 500, y: 986, maxWidth: 645, size: FS, minSize: 32, align: 'center' }
        },
        signatures: {
            borrowerName: { x: 760, y: 1494, maxWidth: 300, size: FS_SIG_NAME, minSize: 28, align: 'left' },
            lenderName: { x: 760, y: 1545, maxWidth: 300, size: FS_SIG_NAME, minSize: 28, align: 'left' },
            witness1Name: { x: 760, y: 1700, maxWidth: 300, size: FS_SIG_NAME, minSize: 28, align: 'left' },
            witness2Name: { x: 760, y: 1752, maxWidth: 300, size: FS_SIG_NAME, minSize: 28, align: 'left' },
            writerName: { x: 760, y: 1803, maxWidth: 300, size: FS_SIG_NAME, minSize: 28, align: 'left' }
        }
    };
    // v9.0: apply user-saved coordinate overrides from Template Designer without touching the PC-stable base map.
    deepApplyPdfOverrides(F, pdfTemplateLoadOverrides());
    window.__lastContractPdfFieldMap = clonePlain(F);
    const drawF = (value, field) => drawContractText(ctx, value, field.x, field.y, field);

    // Header
    drawF(row.contractNo || nextContractNo(), F.header.contractNo);
    drawF(row.place || '-', F.header.place);
    drawF(cdate.day, F.header.day);
    drawF(cdate.month, F.header.month);
    drawF(cdate.year, F.header.year);

    // Borrower section
    drawF(borrowerName, F.borrower.name);
    drawF(borrowerAge || '-', F.borrower.age);
    drawF(houseNo, F.borrower.houseNo);
    drawF(pdfSubDistrict || '-', F.borrower.subDistrict);
    drawF(pdfDistrict || '-', F.borrower.district);
    drawF(pdfProvince || '-', F.borrower.province);

    // Lender section
    drawF(lenderName, F.lender.name);

    // Clause 1: วางเป็นแถวคงที่ ไม่ใช้การเว้นวรรคยาว ทำให้ชื่อกับเลขบัตรไม่ห่างกันเกินจริง
    drawF(borrowerNameWithId, F.clause1.borrowerLine);
    drawF(lenderNameWithId, F.clause1.lenderLine);
    drawF(amountInteger, F.clause1.amount);
    drawF(amountThai, F.clause1.amountText);
    drawF(amountSatang, amountSatang === '-' ? F.clause1.satangFull : F.clause1.satang);

    // Clause 2 - collateral can flow across almost three full lines.
    drawContractWrapSegments(ctx, collateral, [
        { x: 779, y: 627, maxWidth: 490, align: 'left' },
        { x: 182, y: 678, maxWidth: 1088, align: 'left' },
        { x: 182, y: 730, maxWidth: 1088, align: 'left' }
    ], { size: FS_COLLATERAL, minSize: 30, align: 'left', bold: true });

    // Clause 3 and 4
    drawF(ddate.day || '-', F.clause3.day);
    drawF(ddate.month || '-', F.clause3.month);
    drawF(ddate.year || '-', F.clause3.year);
    drawF(interest, F.clause4.interest);

    const signatures = row.signatures || {};
    for (const [key, box] of Object.entries(SIGNATURE_PDF_MAP)) {
        await drawContractSignature(ctx, signatures[key], box.x, box.y, box.w, box.h);
    }

    // Signature names: same row as the ink, directly to the right of the signature.
    drawF(`( ${borrowerName} )`, F.signatures.borrowerName);
    drawF(`( ${lenderName} )`, F.signatures.lenderName);
    drawF(`( ${row.witness1Name || '-'} )`, F.signatures.witness1Name);
    drawF(`( ${row.witness2Name || '-'} )`, F.signatures.witness2Name);
    drawF(`( ${row.writerName || lenderName} )`, F.signatures.writerName);
    return canvas;
}

function validateContractFormForPdf() {
    if (!$('contractDebtorId')?.value) { toast('กรุณาเลือกลูกหนี้ / ผู้กู้'); return null; }
    if (!$('contractLenderName')?.value.trim()) { toast('กรุณากรอกชื่อผู้ให้กู้'); return null; }
    const debtor = debtorForContract($('contractDebtorId').value);
    const row = readContractFormRow(true);
    if (!row.amount) { toast('กรุณากรอกจำนวนเงินกู้'); return null; }
    const interestNum = Number(String(row.interestRate || '').replace(/[^0-9.]/g, ''));
    if (Number.isFinite(interestNum) && interestNum > 15) {
        toast('อัตราดอกเบี้ยเกิน 15% ต่อปี กรุณาแก้ไขก่อนสร้างเอกสาร');
        return null;
    }
    return { row, debtor };
}

async function buildContractPdfBlob(row, debtor) {
    const canvas = await renderContractImageCanvas(row, debtor);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    return pdf.output('blob');
}

async function previewContractBeforeSave() {
    const data = validateContractFormForPdf();
    if (!data) return;
    try {
        toast('กำลังสร้างตัวอย่าง เอกสาร...');
        const blob = await buildContractPdfBlob(data.row, data.debtor);
        const url = URL.createObjectURL(blob);
        showPreviewModal('ตัวอย่าง เอกสาร ก่อนบันทึก', url, 'application/pdf', 'preview-loan-contract.pdf');
        toast('แสดงตัวอย่าง เอกสาร แล้ว');
    } catch (e) {
        console.error(e);
        toast('แสดงตัวอย่าง เอกสาร ไม่สำเร็จ: ' + e.message);
    }
}

async function generateContract() {
    const data = validateContractFormForPdf();
    if (!data) return;
    const { row, debtor } = data;
    const p = currentProfile();
    await saveSettings({ profile: { ...p, lenderName: row.lenderName, phone: row.lenderPhone || p.phone || '', lenderIdCard: row.lenderIdCard, lenderAddress: row.lenderAddress } });
    try {
        toast('กำลังสร้างเอกสาร...');
        const blob = await buildContractPdfBlob(row, debtor);
        await saveContractPdf(row, blob);
        toast(editingContractId ? 'บันทึกแก้ไขสัญญาแล้ว' : 'สร้างและบันทึกสัญญาแล้ว'); editingContractId = ''; editingContractNo = ''; $('contractFormCard').classList.add('hidden'); render(); switchTab('contracts');
    } catch (e) { console.error(e); toast('สร้างสัญญาไม่สำเร็จ: ' + e.message); }
}


// ===== v9.0 PDF Template Designer UI =====
function pdfDesignerSampleData() {
    const row = {
        contractNo: '2026060001',
        place: 'กรุงเทพมหานคร',
        contractDate: today(),
        dueDate: addMonthsSafe(today(), 1),
        lenderName: currentProfile().lenderName || 'นายผู้ให้กู้ ตัวอย่าง',
        lenderIdCard: currentProfile().lenderIdCard || '1234567890123',
        amount: 785412.53,
        interestRate: '15',
        collateral: 'ไม่มีหลักทรัพย์ค้ำประกัน',
        witness1Name: 'นายพยาน หนึ่ง',
        witness2Name: 'นางสาวพยาน สอง',
        writerName: currentProfile().lenderName || 'นายผู้เขียน ตัวอย่าง',
        signatures: {}
    };
    const debtor = {
        name: 'นายผู้กู้ ตัวอย่าง',
        idCard: '1234567890123',
        birthDate: '1990-01-01',
        houseNo: '99/99',
        address: '99/99',
        subDistrict: 'บึงคำพร้อย',
        district: 'ลำลูกกา',
        province: 'ปทุมธานี'
    };
    return { row, debtor };
}
function pdfDesignerFieldOptions() {
    return Object.entries(PDF_TEMPLATE_FIELD_LABELS)
        .map(([path, label]) => `<option value="${escapeHtml(path)}">${escapeHtml(label)} (${escapeHtml(path)})</option>`)
        .join('');
}
function pdfDesignerReadInputs() {
    return {
        x: Number($('pdfDesignerX')?.value),
        y: Number($('pdfDesignerY')?.value),
        maxWidth: Number($('pdfDesignerMaxWidth')?.value),
        size: Number($('pdfDesignerSize')?.value),
        minSize: Number($('pdfDesignerMinSize')?.value),
        align: $('pdfDesignerAlign')?.value || 'left'
    };
}
function pdfDesignerFillInputs(field = {}) {
    if ($('pdfDesignerX')) $('pdfDesignerX').value = field.x ?? '';
    if ($('pdfDesignerY')) $('pdfDesignerY').value = field.y ?? '';
    if ($('pdfDesignerMaxWidth')) $('pdfDesignerMaxWidth').value = field.maxWidth ?? '';
    if ($('pdfDesignerSize')) $('pdfDesignerSize').value = field.size ?? '';
    if ($('pdfDesignerMinSize')) $('pdfDesignerMinSize').value = field.minSize ?? '';
    if ($('pdfDesignerAlign')) $('pdfDesignerAlign').value = field.align || 'left';
}
function pdfDesignerSaveSelected() {
    const path = $('pdfDesignerField')?.value || pdfTemplateDesignerState.selected;
    if (!path) return;
    const patch = pdfDesignerReadInputs();
    setPdfOverrideField(path, patch);
    toast('บันทึกพิกัดเอกสารแล้ว');
}
async function pdfDesignerRenderPreview() {
    const img = $('pdfDesignerPreview');
    if (!img) return;
    pdfDesignerSaveSelected();
    const { row, debtor } = pdfDesignerSampleData();
    const canvas = await renderContractImageCanvas(row, debtor);
    const ctx = canvas.getContext('2d');
    const path = $('pdfDesignerField')?.value || pdfTemplateDesignerState.selected;
    const field = getPdfFieldByPath(window.__lastContractPdfFieldMap || {}, path);
    if (field) {
        const p = contractCanvasPoint(field.x, field.y);
        const w = (field.maxWidth || 120) * CONTRACT_CANVAS_SCALE_X;
        const h = 52 * CONTRACT_CANVAS_SCALE_Y;
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 5;
        ctx.setLineDash([14, 10]);
        ctx.strokeRect(p.x, p.y - h, w, h + 18);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    if (pdfTemplateDesignerState.previewUrl) URL.revokeObjectURL(pdfTemplateDesignerState.previewUrl);
    canvas.toBlob(blob => {
        if (!blob) return;
        pdfTemplateDesignerState.previewUrl = URL.createObjectURL(blob);
        img.src = pdfTemplateDesignerState.previewUrl;
    }, 'image/png');
}
async function openPdfTemplateDesigner() {
    $('pdfDesignerPanel')?.classList.remove('hidden');
    const sel = $('pdfDesignerField');
    if (sel && !sel.options.length) sel.innerHTML = pdfDesignerFieldOptions();
    if (sel) sel.value = pdfTemplateDesignerState.selected;
    const { row, debtor } = pdfDesignerSampleData();
    await renderContractImageCanvas(row, debtor);
    const field = getPdfFieldByPath(window.__lastContractPdfFieldMap || {}, pdfTemplateDesignerState.selected);
    pdfDesignerFillInputs(field || {});
    await pdfDesignerRenderPreview();
}
function bindPdfTemplateDesigner() {
    if ($('openPdfDesignerBtn')) $('openPdfDesignerBtn').onclick = openPdfTemplateDesigner;
    if ($('closePdfDesignerBtn')) $('closePdfDesignerBtn').onclick = () => $('pdfDesignerPanel')?.classList.add('hidden');
    if ($('pdfDesignerField')) $('pdfDesignerField').onchange = async e => {
        pdfTemplateDesignerState.selected = e.target.value;
        const { row, debtor } = pdfDesignerSampleData();
        await renderContractImageCanvas(row, debtor);
        const field = getPdfFieldByPath(window.__lastContractPdfFieldMap || {}, pdfTemplateDesignerState.selected);
        pdfDesignerFillInputs(field || {});
        await pdfDesignerRenderPreview();
    };
    if ($('savePdfDesignerBtn')) $('savePdfDesignerBtn').onclick = pdfDesignerSaveSelected;
    if ($('previewPdfDesignerBtn')) $('previewPdfDesignerBtn').onclick = pdfDesignerRenderPreview;
    const nudge = (dx, dy) => async () => {
        const x = Number($('pdfDesignerX')?.value || 0) + dx;
        const y = Number($('pdfDesignerY')?.value || 0) + dy;
        if ($('pdfDesignerX')) $('pdfDesignerX').value = x;
        if ($('pdfDesignerY')) $('pdfDesignerY').value = y;
        await pdfDesignerRenderPreview();
    };
    if ($('pdfDesignerLeftBtn')) $('pdfDesignerLeftBtn').onclick = nudge(-1, 0);
    if ($('pdfDesignerRightBtn')) $('pdfDesignerRightBtn').onclick = nudge(1, 0);
    if ($('pdfDesignerUpBtn')) $('pdfDesignerUpBtn').onclick = nudge(0, -1);
    if ($('pdfDesignerDownBtn')) $('pdfDesignerDownBtn').onclick = nudge(0, 1);
    if ($('resetPdfDesignerFieldBtn')) $('resetPdfDesignerFieldBtn').onclick = async () => {
        resetPdfOverrideField($('pdfDesignerField')?.value || pdfTemplateDesignerState.selected);
        toast('รีเซ็ตฟิลด์นี้แล้ว');
        await openPdfTemplateDesigner();
    };
    if ($('resetPdfDesignerAllBtn')) $('resetPdfDesignerAllBtn').onclick = async () => {
        const ok = await confirmAction({ title: 'ล้างพิกัดเอกสารทั้งหมด?', text: 'ค่าพิกัดที่ปรับไว้ในเครื่องนี้จะถูกลบทั้งหมด', confirmButtonText: 'ล้างพิกัด', confirmButtonColor: '#dc2626' });
        if (!ok) return;
        pdfTemplateSaveOverrides({});
        toast('ล้างพิกัดเอกสารทั้งหมดแล้ว');
        await openPdfTemplateDesigner();
    };
}

if ($('newContractBtn')) $('newContractBtn').onclick = () => showContractForm();
if ($('closeContractFormBtn')) $('closeContractFormBtn').onclick = () => $('contractFormCard').classList.add('hidden');
if ($('previewContractBtn')) $('previewContractBtn').onclick = previewContractBeforeSave;
if ($('generateContractBtn')) $('generateContractBtn').onclick = generateContract;
bindContractSmartUi();
bindPdfTemplateDesigner();
document.querySelectorAll('[data-clear-sig]').forEach(b => b.onclick = () => clearSignature(b.dataset.clearSig));
window.addEventListener('resize', () => { if (!$('contractFormCard')?.classList.contains('hidden')) SIG_IDS.forEach(id => resizeSignatureCanvas($(id))); });



window.lockContractDocument = async id => {
    const row = (latestData?.contracts || []).find(x => x.id === id);
    if (!row) return toast('ไม่พบสัญญา');
    if (isContractLocked(row)) return toast('เอกสารถูกล็อกแล้ว');
    if (!isContractFullySigned(row)) return toast('ล็อกไม่ได้ กรุณาลงลายเซ็นให้ครบก่อน');
    const ok = await confirmAction({
        title: 'ยืนยันการล็อกเอกสาร',
        html: `<div style="line-height:1.7;text-align:center">
            คุณต้องการยืนยันการล็อกเอกสารหรือไม่<br>
            <span style="color:#dc2626;font-weight:900">หลังดำเนินการนี้ จะไม่สามารถแก้ไขข้อมูลใดๆ ได้อีก</span><br>
            กรุณาตรวจสอบความถูกต้องก่อนยืนยัน
        </div>`,
        lockDocumentConfirm: true,
        checkboxText: 'ฉันเข้าใจแล้ว และต้องการล็อกเอกสาร',
        checkboxError: 'กรุณายืนยันก่อนล็อกเอกสาร',
        confirmButtonText: 'ยืนยันการล็อก',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#dc2626'
    });
    if (!ok) return toast('ยกเลิกการล็อกเอกสาร');
    await updateRow('contracts', id, { status: 'locked', locked: true, lockedDate: today(), updatedDate: today() });
    latestData = await getData();
    const lockedRow = (latestData.contracts || []).find(x => x.id === id) || { ...row, status: 'locked', locked: true };
    await ensureAutoDebtForLockedContract(lockedRow);
    latestData = await getData();
    await alertAction({ icon: 'success', title: 'ล็อกเอกสารสำเร็จ', text: 'เอกสารถูกล็อกเรียบร้อยแล้ว ไม่สามารถแก้ไขข้อมูลใดๆ ได้อีก' });
    render();
};

window.openContractPdf = async id => {
    const row = (latestData?.contracts || []).find(x => x.id === id);
    if (!row) return toast('ไม่พบสัญญา');
    const doc = (latestData?.documents || []).find(x => x.id === row.documentId);
    const freshUrl = doc ? (await freshStorageUrl(doc.storagePath) || doc.downloadURL) : (await freshStorageUrl(row.storagePath) || '');
    if (freshUrl) {
        showPreviewModal(row.fileName || doc?.fileName || 'สัญญากู้ยืมเงิน.pdf', freshUrl, 'application/pdf', row.fileName || doc?.fileName || 'loan-contract.pdf');
        return;
    }
    try {
        toast('กำลังสร้างแบบร่าง จากข้อมูลที่บันทึกไว้...');
        const debtor = debtorForContract(row.debtorId || '');
        const canvas = await renderContractImageCanvas(row, debtor);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        const blobUrl = URL.createObjectURL(pdf.output('blob'));
        showPreviewModal(row.fileName || 'สัญญากู้ยืมเงิน.pdf', blobUrl, 'application/pdf', row.fileName || 'loan-contract.pdf');
    } catch (e) {
        console.error(e);
        toast('เปิดสัญญาไม่สำเร็จ: ' + e.message);
    }
};

window.editContractDraft = id => {
    const row = (latestData?.contracts || []).find(x => x.id === id);
    if (!row) return toast('ไม่พบสัญญา');
    if (isContractLocked(row)) return toast('สัญญาที่ลงลายเซ็นครบแล้วถูกล็อก ไม่สามารถแก้ไขได้');
    editingContractNo = row.contractNo || ''; editingContractId = row.id || '';
    showContractForm(row.debtorId || '');
    const map = { contractLenderName: 'lenderName', contractLenderPhone: 'lenderPhone', contractLenderIdCard: 'lenderIdCard', contractLenderAddress: 'lenderAddress', contractAmount: 'amount', contractDate: 'contractDate', contractDueDate: 'dueDate', contractPaymentType: 'paymentType', contractInstallmentCount: 'installmentCount', contractFirstPaymentDate: 'firstPaymentDate', contractInterestRate: 'interestRate', contractPlace: 'place', contractCollateral: 'collateral', contractWitness1Name: 'witness1Name', contractWitness2Name: 'witness2Name', contractWriterName: 'writerName' };
    Object.entries(map).forEach(([el, key]) => { if ($(el)) $(el).value = row[key] || ''; });
    privacyInputSet('contractLenderPhone', row.lenderPhone || currentProfile().phone || '', displayPhone(row.lenderPhone || currentProfile().phone || ''));
    privacyInputSet('contractLenderIdCard', row.lenderIdCard || currentProfile().lenderIdCard || '', displayIdCard(row.lenderIdCard || currentProfile().lenderIdCard || ''));
    privacyInputSet('contractLenderAddress', row.lenderAddress || currentProfile().lenderAddress || '', displayAddress(row.lenderAddress || currentProfile().lenderAddress || ''));
    updateContractPaymentTypeUi();
    if ($('contractDebtorId')) $('contractDebtorId').value = row.debtorId || '';
    setTimeout(() => restoreContractSignatures(row.signatures || {}), 180);
    toast('เปิดแบบร่างเพื่อแก้ไขแล้ว เมื่อบันทึกจะอัปเดตฉบับเดิม');
};
window.deleteContractDraft = async id => {
    const row = (latestData?.contracts || []).find(x => x.id === id);
    if (!row) return toast('ไม่พบสัญญา');
    if (isContractLocked(row)) return toast('ลบไม่ได้ เพราะสัญญาลงลายเซ็นครบและถูกล็อกแล้ว');
    if (contractSignedCount(row) > 0) return toast('ลบไม่ได้ เพราะมีลายเซ็นแล้ว แต่ยังสามารถแก้ไขได้');
    const ok = await confirmAction({ title: 'ยืนยันการลบแบบร่างสัญญา', text: 'ลบแบบร่างสัญญานี้ใช่หรือไม่?', confirmButtonText: 'ลบแบบร่าง', confirmButtonColor: '#dc2626' }); if (!ok) return;
    if (row.documentId) await deleteDocument(row.documentId, { force: true, skipConfirm: true });
    await deleteRow('contracts', id);
    toast('ลบแบบร่างสัญญาแล้ว');
    render();
};
window.showContractForm = showContractForm;

if ($('closePreviewBtn')) $('closePreviewBtn').onclick = () => { $('documentPreviewModal').classList.add('hidden'); document.body.classList.remove('modal-open'); };
function renderAppFooter() {
    const text = `Version ${APP_INFO.version} • พัฒนาโดย ${APP_INFO.authorized} • © ${APP_INFO.year}`;
    if ($('appFooter')) $('appFooter').textContent = text;
}
async function clearAppCaches() {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => /debt-collector/i.test(k)).map(k => caches.delete(k)));
}
async function forceAppUpdate() {
    try {
        if (newWorker) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
            setTimeout(() => location.reload(), 700);
            return;
        }
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) await reg.update();
        }
        await clearAppCaches();
        toast('กำลังโหลดเวอร์ชันล่าสุด');
        setTimeout(() => location.replace(location.pathname + '?v=' + encodeURIComponent(APP_VERSION) + '&t=' + Date.now()), 500);
    } catch (e) {
        console.error(e);
        await clearAppCaches();
        location.reload();
    }
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('installBtn').classList.remove('hidden') }); $('installBtn').onclick = async () => { if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('installBtn').classList.add('hidden') } };
async function setupSW() { if (!('serviceWorker' in navigator)) return; const reg = await navigator.serviceWorker.register('service-worker.js?v=' + encodeURIComponent(APP_VERSION)); if (reg.waiting) { newWorker = reg.waiting; $('updateBtn')?.classList.remove('hidden') } reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { newWorker = w; $('updateBtn')?.classList.remove('hidden'); toast('มีเวอร์ชันใหม่พร้อมอัปเดต') } }) }); navigator.serviceWorker.addEventListener('controllerchange', () => location.reload()); setTimeout(() => reg.update().catch(() => { }), 1500); } if ($('updateBtn')) $('updateBtn').onclick = forceAppUpdate; if ($('clearCacheBtn')) $('clearCacheBtn').onclick = async () => { await clearAppCaches(); toast('ล้าง Cache แล้ว') }; if ($('enablePushBtn')) $('enablePushBtn').onclick = async () => { if (!('Notification' in window)) return toast('Browser ไม่รองรับ Notification'); const p = await Notification.requestPermission(); toast(p === 'granted' ? 'เปิด Notification แล้ว' : 'ยังไม่ได้อนุญาต Notification') };

/* ===== v7.0 UI Refresh helpers ===== */
const BUTTON_ICON_MAP = [
    [/ปิด/, 'bi-x-lg'], [/ล้าง/, 'bi-eraser'], [/บันทึก/, 'bi-check2-circle'], [/เพิ่ม/, 'bi-plus-circle'],
    [/สร้าง/, 'bi-file-earmark-plus'], [/แก้ไข/, 'bi-pencil-square'], [/ยกเลิก/, 'bi-arrow-counterclockwise'],
    [/ทดสอบ/, 'bi-send'], [/เปิด/, 'bi-box-arrow-up-right'], [/ดาวน์โหลด|Download|Export/, 'bi-download'],
    [/Import/, 'bi-upload'], [/ติดตั้ง/, 'bi-phone'], [/Notification/, 'bi-bell'], [/สมัคร/, 'bi-person-plus'],
    [/เข้าสู่ระบบ/, 'bi-box-arrow-in-right'], [/Demo/, 'bi-play-circle'], [/อ่านข้อมูล/, 'bi-card-text'], [/นำข้อมูล/, 'bi-arrow-right-circle']
];
function decorateButtons() {
    document.querySelectorAll('button, a.secondary, label.file').forEach(el => {
        if (el.dataset.v7Decorated) return;
        const text = (el.textContent || '').trim();
        if (!text) return;
        const found = BUTTON_ICON_MAP.find(([re]) => re.test(text));
        if (!found) return;
        const icon = found[1];
        el.dataset.v7Decorated = '1';
        el.setAttribute('title', el.getAttribute('title') || text);
        if (el.matches('.mini')) {
            el.classList.add('icon-mini');
            el.setAttribute('aria-label', text);
            el.innerHTML = `<i class="bi ${icon}"></i>`;
        } else if (!el.querySelector('i')) {
            el.insertAdjacentHTML('afterbegin', `<i class="bi ${icon}"></i> `);
        }
    });
}

function restoreBottomNavIcons() {
    const tabMap = {
        dashboard: ['bi-house', 'หน้าหลัก'],
        customers: ['bi-people', 'ลูกหนี้ทั้งหมด'],
        contracts: ['bi-file-earmark-text', 'สัญญา'],
        transactions: ['bi-cash-coin', 'ธุรกรรม'],
        settings: ['bi-gear', 'ตั้งค่า']
    };
    document.querySelectorAll('.bottom-tab[data-tab]').forEach(btn => {
        const cfg = tabMap[btn.dataset.tab];
        if (!cfg) return;
        const [icon, label] = cfg;
        const badgeId = btn.dataset.tab === 'transactions' ? 'bottomFollowupBadge' : '';
        const oldBadge = badgeId ? document.getElementById(badgeId) : null;
        const oldText = oldBadge?.textContent || '0';
        const oldHidden = oldBadge ? oldBadge.classList.contains('hidden') : true;
        btn.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i><span>${label}</span>${badgeId ? `<em id="${badgeId}" class="nav-badge ${oldHidden ? 'hidden' : ''}">${oldText}</em>` : ''}`;
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
    });
}
function restoreIconButtons() {
    document.querySelectorAll('.mini.icon-action').forEach(btn => {
        const title = btn.getAttribute('title') || btn.getAttribute('aria-label') || (btn.textContent || '').trim();
        if (title) btn.setAttribute('aria-label', title);
        if (btn.querySelector('i')) return;
        let icon = 'bi-three-dots';
        if (/เอกสาร/.test(title)) icon = 'bi-folder2-open';
        else if (/เพิ่ม/.test(title)) icon = 'bi-plus-circle';
        else if (/แก้ไข/.test(title)) icon = 'bi-pencil-square';
        else if (/ลบ/.test(title)) icon = 'bi-trash';
        else if (/เปิด/.test(title)) icon = 'bi-box-arrow-up-right';
        btn.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
    });
}
function restoreUiChrome() {
    restoreBottomNavIcons();
    restoreIconButtons();
    if (latestData) updateFollowupBadges(calc(latestData).debts.filter(x => x.isDue).length);
}

window.addEventListener('DOMContentLoaded', () => { decorateButtons(); restoreUiChrome(); });

try {
    decorateButtons();
    restoreUiChrome();
    renderAppFooter();
    initTheme(toast);
    applyTheme();
    initFirebase();
    setupSW();
} catch (e) {
    console.error('App init error:', e);
    toast('โหลดระบบไม่สำเร็จ: ' + e.message);
}

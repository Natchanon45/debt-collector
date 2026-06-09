import { firebaseConfig, OCR_FUNCTION_URL, TELEGRAM_TEST_FUNCTION_URL, VAPID_PUBLIC_KEY } from './firebase-config.js';
const $ = id => document.getElementById(id);
let firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId), auth, db, storage, currentUser = null, demoMode = !firebaseReady, deferredPrompt = null, newWorker = null, latestData = null, pendingOcrDebtor = null;
const LS = 'debt_collector_phase3_v1', blank = { debtors: [], debts: [], payments: [], followups: [], documents: [], contracts: [], settings: {} };
const uid = () => String(Date.now()) + Math.random().toString(16).slice(2), today = () => new Date().toISOString().slice(0, 10);
const num = v => { const n = Number(String(v ?? '').replace(/,/g, '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0 }, money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const maskId = id => { const s = String(id || '').replace(/\D/g, ''); return s.length >= 13 ? `${s.slice(0, 1)}-${s.slice(1, 5)}-xxxxx-${s.slice(10, 12)}-${s.slice(12, 13)}` : s.replace(/.(?=.{4})/g, 'x') };
const normalizeIdCard = id => String(id || '').replace(/\D/g, '');
function isDuplicateIdCard(id, ignoreId = '') { const v = normalizeIdCard(id); if (!v) return false; return (latestData?.debtors || []).some(d => d.id !== ignoreId && normalizeIdCard(d.idCard) === v) };
const fullNameOf = o => [o.prefix, o.firstName, o.lastName].filter(Boolean).join(' ').trim();
function toast(m) { const el = $('toast'); if (!el) return; el.textContent = m; el.classList.add('show'); clearTimeout(window.t); window.t = setTimeout(() => el.classList.remove('show'), 3000) }
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
async function add(type, row) { if (demoMode) { const d = local(); d[type].push({ id: uid(), ...row }); setLocal(d); return } const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'); await addDoc(collection(db, `users/${currentUser.uid}/${type}`), { ...row, createdAt: serverTimestamp() }) }
async function updateRow(type, id, row) { if (demoMode) { const d = local(); d[type] = d[type].map(x => x.id === id ? { ...x, ...row } : x); setLocal(d); return } const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'); await updateDoc(doc(db, `users/${currentUser.uid}/${type}/${id}`), row) }
async function deleteRow(type, id) {
    if (demoMode) { const d = local(); d[type] = d[type].filter(x => x.id !== id); setLocal(d); return }
    const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    await deleteDoc(doc(db, `users/${currentUser.uid}/${type}/${id}`));
}
async function saveSettings(row) { if (demoMode) { const d = local(); d.settings = { ...(d.settings || {}), ...row, profile: { ...((d.settings || {}).profile || {}), ...(row.profile || {}) } }; setLocal(d); latestData = { ...(latestData || blank), settings: d.settings }; return } const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'); await setDoc(doc(db, `users/${currentUser.uid}/settings/profile`), row, { merge:true }); latestData = { ...(latestData || blank), settings: { ...((latestData || {}).settings || {}), ...row, profile: { ...(((latestData || {}).settings || {}).profile || {}), ...(row.profile || {}) } } }; }
function canDeleteDebtor(id, d = latestData) {
    if (!d) return false;
    return !d.debts.some(x => x.debtorId === id) && !d.followups.some(x => x.debtorId === id) && !d.documents.some(x => x.debtorId === id) && !(d.contracts || []).some(x => x.debtorId === id);
}

function safeFileName(name) { return String(name || 'file').replace(/[^\w.\-\u0E00-\u0E7F]+/g, '_').slice(0, 120) }
function fileIcon(mime, name = '') { if (String(mime).startsWith('image/')) return 'bi-file-earmark-image'; if (String(mime).includes('pdf') || String(name).toLowerCase().endsWith('.pdf')) return 'bi-file-earmark-pdf'; return 'bi-file-earmark' }
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
async function deleteDocument(docId) {
    const doc = (latestData?.documents || []).find(x => x.id === docId);
    if (!doc) return toast('ไม่พบเอกสาร');
    if (!confirm(`ลบเอกสาร ${doc.fileName || ''} ใช่หรือไม่?`)) return;
    if (!demoMode && doc.storagePath) {
        try { const { ref, deleteObject } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js'); await deleteObject(ref(storage, doc.storagePath)); } catch (e) { console.warn('Storage delete warning', e) }
    }
    await deleteRow('documents', docId);
    toast('ลบเอกสารแล้ว');
    render();
}
window.deleteDocument = deleteDocument;
window.previewDocument = (id) => {
    const doc = (latestData?.documents || []).find(x => x.id === id);
    if (!doc) return toast('ไม่พบเอกสาร');
    const url = doc.downloadURL;
    if (!url) return toast('ไฟล์นี้ยังไม่มี URL สำหรับเปิดดู');
    $('previewTitle').textContent = doc.fileName || 'ดูเอกสาร';
    const mime = doc.mimeType || '';
    if (mime.startsWith('image/')) $('previewBody').innerHTML = `<img src="${url}" alt="${doc.fileName || ''}">`;
    else if (mime.includes('pdf') || String(doc.fileName || '').toLowerCase().endsWith('.pdf')) $('previewBody').innerHTML = `<iframe src="${url}"></iframe>`;
    else $('previewBody').innerHTML = `<div class="empty"><i class="bi ${fileIcon(mime, doc.fileName)}"></i><br>ไม่รองรับ Preview ไฟล์ชนิดนี้<br>กดดาวน์โหลด/เปิดไฟล์</div>`;
    $('previewDownloadBtn').href = url;
    $('documentPreviewModal').classList.remove('hidden');
};

function calc(d) { const paid = {}; d.payments.forEach(p => paid[p.debtId] = (paid[p.debtId] || 0) + num(p.amount)); const debtors = Object.fromEntries(d.debtors.map(x => [x.id, x])); const debts = d.debts.map(x => { const p = paid[x.id] || 0, remaining = Math.max(0, num(x.principal) - p), days = Math.max(0, Math.floor((new Date(today()) - new Date(x.dueDate || today())) / 86400000)); return { ...x, paid: p, remaining, isDue: remaining > 0 && String(x.dueDate || '') <= today(), isDueToday: remaining > 0 && String(x.dueDate || '') === today(), daysOverdue: days, debtor: debtors[x.debtorId] } }); return { debtors, debts, debtsById: Object.fromEntries(debts.map(x => [x.id, x])) } }
async function render() {
    const d = await getData(); latestData = d;
    const c = calc(d), due = c.debts.filter(x => x.isDue).sort((a, b) => b.daysOverdue - a.daysOverdue || b.remaining - a.remaining), followToday = d.followups.filter(f => String(f.nextFollowupDate || f.contactDate || '') <= today());
    $('debtorCount').textContent = d.debtors.length;
    $('debtTotal').textContent = money(c.debts.reduce((s, x) => s + num(x.principal), 0));
    $('openDebtTotal').textContent = money(c.debts.reduce((s, x) => s + x.remaining, 0));
    $('dueTotal').textContent = money(due.reduce((s, x) => s + x.remaining, 0));
    $('minCollectTotal').textContent = money(due.reduce((s, x) => s + Math.min(num(x.minCollectAmount || x.remaining), x.remaining), 0));
    $('dueTodayCount').textContent = c.debts.filter(x => x.isDueToday).length;
    $('followupTodayCount').textContent = followToday.length;
    renderAging(c.debts);
    $('priorityList').innerHTML = due.length ? due.map(x => `<div class="item"><div><div class="item-title">${x.debtor?.name || '-'} · ${x.title}</div><div class="item-sub">ครบกำหนด ${x.dueDate} · เกิน ${x.daysOverdue} วัน · ขั้นต่ำ ${money(Math.min(num(x.minCollectAmount || x.remaining), x.remaining))}</div></div><div class="amount">${money(x.remaining)}</div></div>`).join('') : '<div class="empty">ยังไม่มีรายการถึงกำหนด</div>';
    $('todayFollowupList').innerHTML = followToday.length ? followToday.map(f => `<div class="item"><div><div class="item-title">${c.debtors[f.debtorId]?.name || '-'} · ${f.status || f.channel}</div><div class="item-sub">${f.result || '-'} · นัด ${f.nextFollowupDate || '-'}</div></div></div>`).join('') : '<div class="empty">ยังไม่มีรายการติดตามวันนี้</div>';
    $('debtorList').innerHTML = d.debtors.length ? d.debtors.map(x => {
        const remain = c.debts.filter(dd => dd.debtorId === x.id)
            .reduce((s, dd) => s + dd.remaining, 0);

        return `
  <div class="item">
    <div>
      <div class="item-title">${x.name}</div>
      <div class="item-sub">
        ${x.phone || '-'} · ${maskId(x.idCard)} · ${x.district || ''} ${x.province || ''}
      </div>
      <div class="item-sub">
        ยอดคงเหลือ ${money(remain)}
      </div>
    </div>

    <div class="item-actions">

      <button
        class="mini icon-action"
        title="เอกสารลูกค้า"
        onclick="openDebtorDocuments('${x.id}')">
        <i class="bi bi-folder2-open"></i>
      </button>

      <button
        class="mini icon-action"
        title="เพิ่มหนี้"
        onclick="openDebtForm('${x.id}','${String(x.name).replace(/'/g, "\\'")}')">
        <i class="bi bi-plus-circle"></i>
      </button>

      <button
        class="mini icon-action"
        title="แก้ไขข้อมูล"
        onclick="openEditDebtor('${x.id}')">
        <i class="bi bi-pencil-square"></i>
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
    fillSettings(d.settings || {})
}
function renderAging(debts) { const b = { a: 0, b: 0, c: 0, d: 0 }; debts.filter(x => x.remaining > 0 && x.isDue).forEach(x => { if (x.daysOverdue <= 30) b.a += x.remaining; else if (x.daysOverdue <= 60) b.b += x.remaining; else if (x.daysOverdue <= 90) b.c += x.remaining; else b.d += x.remaining }); $('aging030').textContent = money(b.a); $('aging3160').textContent = money(b.b); $('aging6190').textContent = money(b.c); $('aging90').textContent = money(b.d) }
function fillSelects(d, c) { const debtorOpts = '<option value="">-- เลือกลูกหนี้ --</option>' + d.debtors.map(x => `<option value="${x.id}">${x.name}</option>`).join('');['followupDebtorId', 'documentDebtorId', 'transactionDebtorId', 'contractDebtorId'].forEach(id => { if ($(id)) $(id).innerHTML = debtorOpts }); const debtOpts = '<option value="">-- เลือกก้อนหนี้ --</option>' + c.debts.filter(x => x.remaining > 0).map(x => `<option value="${x.id}">${x.debtor?.name || '-'} · ${x.title} · ${money(x.remaining)}</option>`).join(''); $('paymentDebtId').innerHTML = debtOpts; $('followupDebtId').innerHTML = '<option value="">-- ไม่ระบุก้อนหนี้ --</option>' + debtOpts.replace('<option value="">-- เลือกก้อนหนี้ --</option>', '') }
function fillLists(d, c) { $('paymentList').innerHTML = d.payments.length ? d.payments.map(p => `<div class="item"><div><div class="item-title">${money(p.amount)}</div><div class="item-sub">${p.paidDate} · ${c.debtsById[p.debtId]?.title || '-'} · ${p.note || ''}</div></div></div>`).join('') : '<div class="empty">ยังไม่มีประวัติชำระ</div>'; $('followupList').innerHTML = d.followups.length ? d.followups.map(f => `<div class="item"><div><div class="item-title">${c.debtors[f.debtorId]?.name || '-'} · ${f.status || '-'}</div><div class="item-sub">${f.contactDate} · ${f.channel || '-'} · นัด ${f.nextFollowupDate || '-'}</div><div class="item-sub">${f.result || ''}</div></div></div>`).join('') : '<div class="empty">ยังไม่มีประวัติติดตาม</div>'; $('documentList').innerHTML = d.documents.length ? d.documents.map(doc => { const isImg = String(doc.mimeType || '').startsWith('image/'); const thumb = isImg && doc.downloadURL ? `<img src="${doc.downloadURL}" alt="">` : `<i class="bi ${fileIcon(doc.mimeType, doc.fileName)}"></i>`; return `<div class="item doc-card"><div class="doc-thumb">${thumb}</div><div><div class="item-title">${doc.type} · ${doc.fileName}</div><div class="item-sub">${c.debtors[doc.debtorId]?.name || '-'} · ${doc.createdDate || '-'} · ${doc.size ? money(doc.size / 1024) + ' KB' : ''}</div></div><div class="doc-actions"><button class="mini" onclick="previewDocument('${doc.id}')">เปิด</button><button class="mini mini-danger" onclick="deleteDocument('${doc.id}')">ลบ</button></div></div>` }).join('') : '<div class="empty">ยังไม่มีเอกสาร</div>' }
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
    setUserDisplay();
}
window.openDebtForm = (id, name) => { if ($('transactionDebtorId')) $('transactionDebtorId').value = id; switchTransaction('debt'); switchTab('transactions') };
window.openDebtorDocuments = id => { if ($('documentDebtorId')) $('documentDebtorId').value = id; switchTab('customers'); $('documentDebtorId')?.scrollIntoView({ behavior:'smooth', block:'center' }); toast('เลือกเอกสารของลูกหนี้แล้ว'); };
window.openEditDebtor = id => { const d = (latestData?.debtors || []).find(x => x.id === id); if (!d) return;['Name', 'Phone', 'LineId', 'IdCard', 'Address', 'District', 'Province'].forEach(k => { $('editDebtor' + k).value = d[k.charAt(0).toLowerCase() + k.slice(1)] || '' }); $('editDebtorId').value = id; $('editDebtorCard').classList.remove('hidden'); switchTab('customers') };
window.deleteDebtor = async id => { if (!canDeleteDebtor(id)) return toast('ลบไม่ได้ เพราะลูกหนี้ถูกนำไปใช้งานแล้ว'); const debtor = (latestData?.debtors || []).find(x => x.id === id); if (!confirm(`ลบลูกหนี้ ${debtor?.name || ''} ใช่หรือไม่?`)) return; await deleteRow('debtors', id); toast('ลบลูกหนี้แล้ว'); render() };
$('addDebtorBtn').onclick = async () => { const name = $('debtorName').value.trim(); if (!name) return toast('กรุณากรอกชื่อลูกหนี้'); if (isDuplicateIdCard($('debtorIdCard').value)) return toast('เลขบัตรประชาชนนี้มีอยู่แล้ว'); await add('debtors', { name, phone: $('debtorPhone').value.trim(), lineId: $('debtorLineId').value.trim(), idCard: $('debtorIdCard').value.trim(), address: $('debtorAddress').value.trim(), district: $('debtorDistrict').value.trim(), province: $('debtorProvince').value.trim() });['debtorName', 'debtorPhone', 'debtorLineId', 'debtorIdCard', 'debtorAddress', 'debtorDistrict', 'debtorProvince'].forEach(id => $(id).value = ''); toast('เพิ่มลูกหนี้สำเร็จ'); hideCustomerForm(); switchTab('customers'); render() };
$('saveEditDebtorBtn').onclick = async () => { const id = $('editDebtorId').value; if (!id) return; if (isDuplicateIdCard($('editDebtorIdCard').value, id)) return toast('เลขบัตรประชาชนนี้มีอยู่แล้ว'); await updateRow('debtors', id, { name: $('editDebtorName').value.trim(), phone: $('editDebtorPhone').value.trim(), lineId: $('editDebtorLineId').value.trim(), idCard: $('editDebtorIdCard').value.trim(), address: $('editDebtorAddress').value.trim(), district: $('editDebtorDistrict').value.trim(), province: $('editDebtorProvince').value.trim() }); $('editDebtorCard').classList.add('hidden'); toast('แก้ไขข้อมูลลูกหนี้แล้ว'); render() };
$('cancelEditDebtorBtn').onclick = () => $('editDebtorCard').classList.add('hidden');
$('addDebtBtn').onclick = async () => { const debtorId = $('transactionDebtorId').value, principal = num($('debtPrincipal').value); if (!debtorId) return toast('เลือกลูกหนี้ก่อน'); if (principal <= 0) return toast('กรอกยอดหนี้'); await add('debts', { debtorId, title: $('debtTitle').value || 'ก้อนหนี้', principal, minCollectAmount: num($('debtMinCollect').value) || principal, dueDate: $('debtDueDate').value || today(), status: 'open' });['debtTitle', 'debtPrincipal', 'debtMinCollect', 'debtDueDate'].forEach(id => $(id).value = ''); toast('เพิ่มก้อนหนี้สำเร็จ'); switchTab('transactions'); switchTransaction('debt'); render() };
$('addPaymentBtn').onclick = async () => { if (!$('paymentDebtId').value) return toast('เลือกก้อนหนี้'); const amount = num($('paymentAmount').value); if (amount <= 0) return toast('กรอกจำนวนเงิน'); await add('payments', { debtId: $('paymentDebtId').value, amount, paidDate: $('paymentDate').value || today(), note: $('paymentNote').value }); $('paymentAmount').value = ''; $('paymentNote').value = ''; toast('บันทึกชำระแล้ว'); switchTab('transactions'); switchTransaction('payment'); render() };
$('addFollowupBtn').onclick = async () => { if (!$('followupDebtorId').value) return toast('เลือกลูกหนี้'); await add('followups', { debtorId: $('followupDebtorId').value, debtId: $('followupDebtId').value, contactDate: $('followupDate').value || today(), status: $('followupStatus').value, channel: $('followupChannel').value, result: $('followupResult').value, nextFollowupDate: $('nextFollowupDate').value }); toast('บันทึกการติดตามแล้ว'); switchTab('transactions'); switchTransaction('followup'); render() };
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
function normalizeThaiLocation(text) {
    const raw = String(text || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const provinces = ['กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี'];
    let province = '';
    if (/กรุงเทพ|กทม/.test(raw)) province = 'กรุงเทพมหานคร';
    if (!province) { province = provinces.find(p => raw.includes(p)) || '' }
    let district = '';
    const districtPatterns = [
        /(?:เขต|อำเภอ|อ\.)\s*([ก-๙A-Za-z]+(?:\s+[ก-๙A-Za-z]+)?)/,
        /(?:แขวง|ตำบล|ต\.)\s*[ก-๙A-Za-z]+\s+(?:เขต|อำเภอ|อ\.)\s*([ก-๙A-Za-z]+(?:\s+[ก-๙A-Za-z]+)?)/,
        /(?:เขต|อำเภอ|อ\.)\s*([ก-๙A-Za-z]+)(?=\s*(?:จังหวัด|จ\.|กรุงเทพ|$))/
    ];
    for (const p of districtPatterns) { const m = raw.match(p); if (m && m[1]) { district = m[1].trim(); break } }
    if (district) {
        district = district.replace(/จังหวัด.*$/, '').replace(/กรุงเทพมหานคร.*$/, '').replace(/กทม.*$/, '').trim();
    }
    return { district, province };
}
function parseOcrResult(data) {
    const full = data.fullName || data.name || ''; let prefix = '', firstName = '', lastName = '';
    const nm = full.match(/(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)\s*([^\s]+)\s*(.*)/);
    if (nm) { prefix = nm[1]; firstName = nm[2] || ''; lastName = (nm[3] || '').trim() } else { const p = full.split(/\s+/).filter(Boolean); firstName = p[0] || ''; lastName = p.slice(1).join(' ') }
    const raw = (data.rawText || '') + ' ' + (data.address || '') + ' ' + (data.district || '') + ' ' + (data.province || '');
    const loc = normalizeThaiLocation(raw);
    return { prefix, firstName, lastName, idCard: data.idCard || '', address: data.address || '', district: (data.district || loc.district || '').trim(), province: (data.province || loc.province || '').trim() }
}
async function compressImageToBase64(file, maxWidth = 1600, quality = .86) { const img = await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = URL.createObjectURL(file) }); const scale = Math.min(1, maxWidth / img.width), canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale); canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/jpeg', quality).split(',')[1] }
async function getAuthToken() { return currentUser?.getIdToken ? await currentUser.getIdToken() : '' }
function fillOcrFields(o) { $('ocrPrefix').value = o.prefix || ''; $('ocrFirstName').value = o.firstName || ''; $('ocrLastName').value = o.lastName || ''; $('ocrIdCard').value = o.idCard || ''; $('ocrAddress').value = o.address || ''; $('ocrDistrict').value = o.district || ''; $('ocrProvince').value = o.province || ''; $('ocrIdMasked').textContent = o.idCard ? `แสดงแบบซ่อน: ${maskId(o.idCard)}` : '' }
function ocrDebtorObject() { return { name: fullNameOf({ prefix: $('ocrPrefix').value, firstName: $('ocrFirstName').value, lastName: $('ocrLastName').value }), phone: '', lineId: '', idCard: $('ocrIdCard').value, address: $('ocrAddress').value, district: $('ocrDistrict').value, province: $('ocrProvince').value, source: 'ocr' } }
$('runOcrBtn').onclick = async () => { const file = $('ocrFile').files[0]; if (!file) return toast('กรุณาถ่ายรูปหรือเลือกรูปบัตรก่อน'); if (!OCR_FUNCTION_URL) return toast('ยังไม่ได้ตั้งค่า OCR URL'); try { toast('กำลังอ่าน OCR...'); const imageBase64 = await compressImageToBase64(file), token = await getAuthToken(); const res = await fetch(OCR_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ imageBase64 }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'OCR failed'); const parsed = parseOcrResult(data); fillOcrFields(parsed); pendingOcrDebtor = ocrDebtorObject(); $('confirmText').textContent = `ชื่อ: ${pendingOcrDebtor.name}\nเลขบัตร: ${maskId(pendingOcrDebtor.idCard)}\nเขต/อำเภอ: ${pendingOcrDebtor.district || '-'}\nจังหวัด: ${pendingOcrDebtor.province || '-'}`; $('confirmModal').classList.remove('hidden'); toast('อ่าน OCR สำเร็จ') } catch (e) { console.error(e); toast('OCR ไม่สำเร็จ: ' + e.message) } };
$('confirmCreateDebtorBtn').onclick = async () => { if (!pendingOcrDebtor) pendingOcrDebtor = ocrDebtorObject(); if (!pendingOcrDebtor.name) return toast('ไม่มีชื่อลูกหนี้'); if (isDuplicateIdCard(pendingOcrDebtor.idCard)) return toast('เลขบัตรประชาชนนี้มีอยู่แล้ว'); await add('debtors', pendingOcrDebtor); $('confirmModal').classList.add('hidden'); toast('เพิ่มลูกหนี้จาก OCR แล้ว'); $('confirmModal')?.classList.add('hidden'); hideCustomerForm(); switchTab('customers'); render() };
$('cancelCreateDebtorBtn').onclick = () => $('confirmModal').classList.add('hidden'); $('autoCreateDebtorBtn').onclick = async () => { const row = ocrDebtorObject(); if (!row.name) return toast('ไม่มีข้อมูล OCR'); if (isDuplicateIdCard(row.idCard)) return toast('เลขบัตรประชาชนนี้มีอยู่แล้ว'); await add('debtors', row); toast('เพิ่มลูกหนี้จาก OCR แล้ว'); $('confirmModal')?.classList.add('hidden'); hideCustomerForm(); switchTab('customers'); render() }; $('useOcrToDebtorBtn').onclick = () => { const row = ocrDebtorObject(); $('debtorName').value = row.name; $('debtorIdCard').value = row.idCard; $('debtorAddress').value = row.address; $('debtorDistrict').value = row.district; $('debtorProvince').value = row.province; showCustomerForm('manual'); switchTab('customers'); toast('นำข้อมูล OCR ไปกรอกฟอร์มแล้ว') };
function bindDropzones() { [['dropzone', 'documentFile', 'dropzoneText'], ['ocrDropzone', 'ocrFile', 'ocrFileName']].forEach(([dzId, fileId, textId]) => { const dz = $(dzId), file = $(fileId), text = $(textId); if (!dz || !file) return; const show = () => { if (file.files[0]) { if (text) text.textContent = file.files[0].name; if (fileId === 'ocrFile') { $('ocrPreview').src = URL.createObjectURL(file.files[0]); $('ocrPreview').classList.remove('hidden') } } }; file.addEventListener('change', show);['dragenter', 'dragover'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.add('dragover') }));['dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.remove('dragover') })); dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) { file.files = e.dataTransfer.files; show() } }) }) }
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

$('saveProfileBtn').onclick = async () => {
    const alias = $('profileAlias').value.trim();
    const lenderName = ($('profileLenderName')?.value || '').trim();
    const displayName = lenderName || alias || getDisplayName();
    if (!displayName) return toast('กรุณากรอกชื่อผู้ใช้งานหรือชื่อผู้ให้กู้');
    await saveSettings({ profile: {
        alias: alias || displayName,
        lenderName: displayName,
        phone: $('profilePhone').value.trim(),
        lineId: $('profileLineId').value.trim(),
        telegramId: $('profileTelegramId').value.trim(),
        lenderIdCard: normalizeIdCard($('profileLenderIdCard')?.value || ''),
        lenderAddress: $('profileLenderAddress')?.value.trim() || ''
    } });
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
}); $('demoBtn').onclick = () => { demoMode = true; currentUser = { uid: 'demo' }; $('authView').classList.remove('active'); $('appView').classList.add('active'); setUserDisplay('Demo Mode'); toast('Demo Mode'); render() };
async function initFirebase() { if (!firebaseReady) return; const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'); const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'); const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'); const { getStorage } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js'); const app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); storage = getStorage(app); $('loginBtn').onclick = async () => { try { await signInWithEmailAndPassword(auth, $('email').value, $('password').value) } catch (e) { toast(e.code || e.message) } }; $('registerBtn').onclick = async () => { try { await createUserWithEmailAndPassword(auth, $('email').value, $('password').value) } catch (e) { toast(e.code || e.message) } }; $('logoutBtn').onclick = async () => { await signOut(auth); location.reload() }; onAuthStateChanged(auth, u => { if (u) { currentUser = u; demoMode = false; $('authView').classList.remove('active'); $('appView').classList.add('active'); setUserDisplay(u.email || u.displayName || 'ผู้ใช้ Firebase'); render() } else { setUserDisplay('') } }) } if (!firebaseReady) { $('loginBtn').onclick = $('demoBtn').onclick; $('registerBtn').onclick = $('demoBtn').onclick }
$('exportJsonBtn').onclick = async () => download(JSON.stringify({ data: await getData() }, null, 2), 'debt-backup.json', 'application/json'); $('exportTxtBtn').onclick = async () => download('DEBT_BACKUP\n' + JSON.stringify({ data: await getData() }, null, 2), 'debt-backup.txt', 'text/plain'); function download(c, n, t) { let a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([c], { type: t })); a.download = n; a.click() } $('importFile').onchange = async e => { let f = e.target.files[0]; if (!f) return; let txt = (await f.text()).replace(/^DEBT_BACKUP\s*/, '').trim(); setLocal(JSON.parse(txt).data || JSON.parse(txt)); demoMode = true; toast('Import เข้า Demo'); render() };

if ($('userMenuBtn')) $('userMenuBtn').onclick = (e) => { e.stopPropagation(); $('userDropdown').classList.toggle('hidden') };
if ($('openProfileBtn')) $('openProfileBtn').onclick = () => { switchTab('settings'); $('userDropdown').classList.add('hidden'); $('userProfileCard')?.scrollIntoView({ behavior: 'smooth' }) };
if ($('dropdownLogoutBtn')) $('dropdownLogoutBtn').onclick = () => $('logoutBtn')?.click();
document.addEventListener('click', e => { if ($('userDropdown') && !$('userMenuWrap')?.contains(e.target)) $('userDropdown').classList.add('hidden') });



/* ===== Phase 5: Loan Contract + Signature + PDF ===== */
const contractSigState = {};
let editingContractNo = '';
let editingContractId = '';
const SIG_IDS = ['sigLender','sigBorrower','sigWitness1','sigWitness2','sigWriter'];
function resizeSignatureCanvas(canvas) {
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
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
        canvas.addEventListener('touchstart', start, { passive:false }); canvas.addEventListener('touchmove', move, { passive:false }); canvas.addEventListener('touchend', end, { passive:false });
    }
}
function clearSignature(id) { const c = $(id); if (!c) return; c.dataset.hasInk = ''; c.getContext('2d').clearRect(0, 0, c.width, c.height); }
function hasSignature(id) { return $(id)?.dataset.hasInk === '1'; }
function getSignatureData(id) { const c = $(id); return c && hasSignature(id) ? c.toDataURL('image/png') : ''; }
const SIGNATURE_KEYS = { sigBorrower:'borrower', sigLender:'lender', sigWitness1:'witness1', sigWitness2:'witness2', sigWriter:'writer' };
const SIGNATURE_IDS_BY_KEY = Object.fromEntries(Object.entries(SIGNATURE_KEYS).map(([id,key]) => [key,id]));
const SIGNATURE_PDF_MAP = {
    // v6.12: reduced signatures and lowered them so the ink nearly touches the signature line.
    borrower:{ id:'sigBorrower', x:185, y:1328, w:140, h:24 },
    lender:{ id:'sigLender', x:645, y:1328, w:140, h:24 },
    witness1:{ id:'sigWitness1', x:185, y:1381, w:140, h:24 },
    witness2:{ id:'sigWitness2', x:645, y:1381, w:140, h:24 },
    writer:{ id:'sigWriter', x:185, y:1431, w:140, h:24 }
};
function initContractPads() { SIG_IDS.forEach(bindSignaturePad); }
function cropSignatureCanvas(canvas, padding=12) {
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
        const cssW = c.width / Math.max(window.devicePixelRatio || 1, 1);
        const cssH = c.height / Math.max(window.devicePixelRatio || 1, 1);
        const scale = Math.min((cssW * .82) / img.width, (cssH * .70) / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (cssW - w) / 2, (cssH - h) / 2, w, h);
        c.dataset.hasInk = '1';
    };
    img.src = dataUrl;
}
function restoreContractSignatures(signatures={}) {
    SIG_IDS.forEach(id => clearSignature(id));
    Object.entries(signatures || {}).forEach(([key, data]) => restoreSignatureCanvas(SIGNATURE_IDS_BY_KEY[key], data));
}
function debtorForContract(id) { return (latestData?.debtors || []).find(x => x.id === id) || {}; }
function showContractForm(prefillDebtorId='') {
    if (!prefillDebtorId) { editingContractNo = ''; editingContractId = ''; }
    const card = $('contractFormCard'); if (!card) return;
    card.classList.remove('hidden'); if ($('contractDate') && !$('contractDate').value) $('contractDate').value = today();
    const p = currentProfile();
    if ($('contractLenderName')) $('contractLenderName').value = p.lenderName || p.alias || getDisplayName();
    if ($('contractLenderIdCard')) $('contractLenderIdCard').value = p.lenderIdCard || '';
    if ($('contractLenderAddress')) $('contractLenderAddress').value = p.lenderAddress || '';
    if (prefillDebtorId && $('contractDebtorId')) $('contractDebtorId').value = prefillDebtorId;
    initContractPads();
    setTimeout(() => {
        SIG_IDS.forEach(id => resizeSignatureCanvas($(id)));
        if (!editingContractId) restoreContractSignatures({});
    }, 120);
    card.scrollIntoView({ behavior:'smooth' });
}
function renderContractList(d, c) {
    if (!$('contractList')) return;
    const list = (d.contracts || []).sort((a,b)=>String(b.createdDate||'').localeCompare(String(a.createdDate||'')));
    $('contractList').innerHTML = list.length ? list.map(x => {
        const signed = Number(x.signatureCount || 0), complete = signed >= 5;
        const status = complete ? 'สมบูรณ์' : (signed === 0 ? 'แบบร่าง' : `รอลายเซ็น ${signed}/5`);
        const canDelete = signed === 0;
        return `<div class="item doc-card contract-row"><div class="doc-thumb"><i class="bi bi-file-earmark-text"></i></div><div><div class="item-title">${c.debtors[x.debtorId]?.name || x.borrowerName || '-'} · ${money(x.amount)}</div><div class="item-sub">${status} · วันที่ ${thaiDate(x.contractDate || x.createdDate)} · ครบกำหนด ${thaiDate(x.dueDate)} · ${x.fileName || ''}</div></div><div class="doc-actions icon-actions">${x.documentId ? `<button class="icon-action icon-view" type="button" title="เปิด PDF" aria-label="เปิด PDF" onclick="previewDocument('${x.documentId}')"><i class="bi bi-file-earmark-pdf"></i></button>` : ''}${!complete ? `<button class="icon-action icon-edit" type="button" title="แก้ไข" aria-label="แก้ไข" onclick="editContractDraft('${x.id}')"><i class="bi bi-pencil-square"></i></button>` : ''}${canDelete ? `<button class="icon-action icon-delete" type="button" title="ลบ" aria-label="ลบ" onclick="deleteContractDraft('${x.id}')"><i class="bi bi-trash"></i></button>` : ''}</div></div>`;
    }).join('') : '<div class="empty">ยังไม่มีสัญญากู้ยืม</div>';
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function bahtTextFallback(n){
    const value = Number(String(n ?? 0).replace(/,/g,''));
    if (!Number.isFinite(value) || value <= 0) return 'ศูนย์บาทถ้วน';
    const nums = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
    const units = ['','สิบ','ร้อย','พัน','หมื่น','แสน','ล้าน'];
    const readInt = (numStr) => {
        numStr = String(parseInt(numStr || '0',10));
        if (numStr === '0') return '';
        let out = '';
        const len = numStr.length;
        for (let i=0;i<len;i++){
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
        numStr = String(parseInt(numStr || '0',10));
        if (numStr === '0') return 'ศูนย์';
        let parts = [];
        while (numStr.length > 6) { parts.unshift(numStr.slice(-6)); numStr = numStr.slice(0,-6); }
        parts.unshift(numStr);
        return parts.map((part, idx) => readInt(part) + (idx < parts.length-1 ? 'ล้าน' : '')).join('');
    };
    const fixed = value.toFixed(2);
    const [baht, satang] = fixed.split('.');
    const b = readMillion(baht) + 'บาท';
    const satangNum = Number(satang);
    return satangNum ? b + readInt(satang) + 'สตางค์' : b + 'ถ้วน';
}
function nextContractNo(){
    const d = new Date();
    const prefix = String(d.getFullYear()) + String(d.getMonth()+1).padStart(2,'0');
    const maxSeq = (latestData?.contracts || [])
        .map(x => String(x.contractNo || ''))
        .filter(no => no.startsWith(prefix))
        .map(no => Number(no.slice(6)) || 0)
        .reduce((m,n)=>Math.max(m,n),0);
    return prefix + String(maxSeq + 1).padStart(4,'0');
}
const TH_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const TH_MONTHS_SHORT = TH_MONTHS_FULL;
function thaiDate(v){
    if (!v) return '-';
    const d = new Date(String(v).includes('T') ? v : String(v) + 'T00:00:00');
    if (isNaN(d)) return v;
    return `${d.getDate()} ${TH_MONTHS_FULL[d.getMonth()]} ${d.getFullYear()+543}`;
}
function calcAgeYears(birthValue, atValue=today()){
    if (!birthValue) return '';
    const b = new Date(String(birthValue).includes('T') ? birthValue : String(birthValue) + 'T00:00:00');
    const at = new Date(String(atValue || today()).includes('T') ? atValue : String(atValue || today()) + 'T00:00:00');
    if (isNaN(b) || isNaN(at)) return '';
    let age = at.getFullYear() - b.getFullYear();
    const m = at.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && at.getDate() < b.getDate())) age--;
    return age >= 0 && age < 130 ? String(age) : '';
}
function debtorAgeForContract(debtor={}, atValue=today()){
    const explicit = String(debtor.age || '').trim();
    if (explicit && explicit !== '-') return explicit;
    return calcAgeYears(debtor.birthDate || debtor.birthday || debtor.dob || debtor.dateOfBirth || debtor.birth_date, atValue) || '-';
}
function currentProfile(){ return (latestData?.settings?.profile) || latestData?.settings || {}; }
function adjustSignaturePageBreak(paper){
    const sign = paper?.querySelector('.contract-sign-section'); if (!sign) return;
    sign.style.marginTop = '';
    const page = 1123, top = sign.offsetTop, h = sign.offsetHeight;
    if ((top % page) + h > page - 42) sign.style.marginTop = (page - (top % page) + 30) + 'px';
}
function fullId(v){ return normalizeIdCard(v || '') || '-'; }
function thDateParts(v){
    const t = thaiDate(v || today());
    if (!t || t === '-') return { day:'____', month:'__________', year:'____', full:'-' };
    const parts = t.split(' ');
    return { day:parts[0]||'____', month:parts[1]||'__________', year:parts[2]||'____', full:t };
}
function contractValue(v, cls=''){ return `<span class="contract-fill ${cls}"><span class="contract-fill-text">${escapeHtml(v || '-')}</span></span>`; }
function buildContractHtml(row, debtor) {
    const borrowerAddress = [debtor.address, debtor.district, debtor.province].filter(Boolean).join(' ');
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
        <p>ข้าพเจ้า ${contractValue(borrowerName)} อายุ ${contractValue(debtorAgeForContract(debtor, row.contractDate || today()))} ปี ที่อยู่ ${contractValue(borrowerAddress || '-')} เลขประจำตัวประชาชน ${contractValue(fullId(debtor.idCard))}</p>
        <p>ได้ทำหนังสือสัญญากู้เงินให้ไว้แก่ ${contractValue(lenderName)} เลขประจำตัวประชาชน ${contractValue(fullId(row.lenderIdCard))} ที่อยู่ ${contractValue(row.lenderAddress || '-')} มีข้อสัญญาดังแจ้งต่อไปนี้</p>
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
async function saveContractPdf(row, blob) {
    const debtorId = row.debtorId;
    const existing = (latestData?.contracts || []).find(x =>
        (editingContractId && x.id === editingContractId) ||
        (row.sourceContractId && x.id === row.sourceContractId) ||
        (row.contractNo && x.contractNo === row.contractNo)
    ) || null;
    const fileName = existing?.fileName || `loan-contract-${row.contractNo || debtorId}-${Date.now()}.pdf`;
    const docPayload = { debtorId, type:'สัญญากู้ยืม', fileName, mimeType:'application/pdf', size: blob.size, createdDate: existing?.createdDate || today(), updatedDate: today() };
    const contractPayload = { ...row, fileName, createdDate: existing?.createdDate || today(), updatedDate: today() };

    if (demoMode) {
        if (existing?.documentId) {
            await updateRow('documents', existing.documentId, docPayload);
            await updateRow('contracts', existing.id, { ...contractPayload, documentId: existing.documentId, downloadURL: existing.downloadURL || '' });
        } else if (existing?.id) {
            const d = local();
            const newDocId = uid();
            d.documents.push({ id: newDocId, ...docPayload, storagePath:'', downloadURL:'' });
            d.contracts = d.contracts.map(x => x.id === existing.id ? { ...x, ...contractPayload, documentId:newDocId, downloadURL:'' } : x);
            setLocal(d);
        } else {
            const d = local();
            const newDocId = uid(), newContractId = uid();
            d.documents.push({ id: newDocId, ...docPayload, storagePath:'', downloadURL:'' });
            d.contracts.push({ id: newContractId, ...contractPayload, documentId:newDocId, downloadURL:'' });
            setLocal(d);
        }
        return;
    }

    const { ref, uploadBytes, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js');
    const path = existing?.storagePath || `users/${currentUser.uid}/debtors/${debtorId}/contracts/${fileName}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, blob, { contentType:'application/pdf' });
    const downloadURL = await getDownloadURL(fileRef);

    const { collection, addDoc, doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    if (existing?.id) {
        let documentId = existing.documentId || '';
        if (documentId) {
            await updateDoc(doc(db, `users/${currentUser.uid}/documents/${documentId}`), { ...docPayload, storagePath:path, downloadURL, updatedAt: serverTimestamp() });
        } else {
            const docRef = await addDoc(collection(db, `users/${currentUser.uid}/documents`), { ...docPayload, storagePath:path, downloadURL, createdAt: serverTimestamp() });
            documentId = docRef.id;
        }
        await updateDoc(doc(db, `users/${currentUser.uid}/contracts/${existing.id}`), { ...contractPayload, documentId, storagePath:path, downloadURL, updatedAt: serverTimestamp() });
    } else {
        const docRef = await addDoc(collection(db, `users/${currentUser.uid}/documents`), { ...docPayload, storagePath:path, downloadURL, createdAt: serverTimestamp() });
        await addDoc(collection(db, `users/${currentUser.uid}/contracts`), { ...contractPayload, documentId: docRef.id, storagePath:path, downloadURL, createdAt: serverTimestamp() });
    }
}

const CONTRACT_TEMPLATE_URL = './assets/img/loan-contract-template-a4.png';
let contractTemplateImagePromise = null;
function loadContractTemplateImage(){
    if (!contractTemplateImagePromise) {
        contractTemplateImagePromise = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = CONTRACT_TEMPLATE_URL + '?v=6.12';
        });
    }
    return contractTemplateImagePromise;
}
function contractCanvasPoint(x, y){ return { x: x * (2480/1055), y: y * (3508/1491) }; }
function setupContractCanvasFont(ctx, size=40, bold=true){
    ctx.font = `${bold ? '700 ' : '400 '}${size}px "TH Sarabun New", "Sarabun", "Noto Sans Thai", Tahoma, sans-serif`;
    ctx.textBaseline = 'alphabetic';
}
function drawContractText(ctx, text, x, y, opt={}){
    const p = contractCanvasPoint(x, y);
    const maxWidth = opt.maxWidth ? opt.maxWidth * (2480/1055) : 9999;
    let align = opt.align || 'left';
    let size = opt.size || 40;
    const minSize = opt.minSize || 30;
    const value = String(text || '-').trim() || '-';
    ctx.fillStyle = opt.color || '#1554b7';
    while (size > minSize) {
        setupContractCanvasFont(ctx, size, opt.bold !== false);
        if (ctx.measureText(value).width <= maxWidth) break;
        size -= 2;
    }
    setupContractCanvasFont(ctx, size, opt.bold !== false);
    const textWidth = ctx.measureText(value).width;
    if (align === 'smart') {
        // Smart Alignment Rule v6.11:
        // - amount fields stay right-aligned
        // - text wider than half the line is centered
        // - short text starts from the left edge with a small two-space indent
        align = textWidth >= (maxWidth / 2) ? 'center' : 'left';
    }
    ctx.textAlign = align;
    const indent = opt.indent != null ? opt.indent * (2480/1055) : 12;
    const tx = align === 'right' ? p.x + maxWidth - (opt.rightPad || 0) * (2480/1055) : (align === 'center' ? p.x + (maxWidth / 2) : p.x + indent);
    ctx.fillText(value, tx, p.y, maxWidth);
}
function drawContractWrap(ctx, text, x, y, maxWidth, lineHeight=26, maxLines=2, opt={}){
    const words = String(text || '-').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    const size = opt.size || 38;
    setupContractCanvasFont(ctx, size, true);
    const pxMax = maxWidth * (2480/1055);
    for (const word of words) {
        const test = current ? current + ' ' + word : word;
        if (ctx.measureText(test).width <= pxMax || !current) current = test;
        else { lines.push(current); current = word; }
        if (lines.length >= maxLines) break;
    }
    if (current && lines.length < maxLines) lines.push(current);
    lines.forEach((line, i) => drawContractText(ctx, line, x, y + i*lineHeight, { maxWidth, size, minSize: opt.minSize || 24, align: opt.align || 'center' }));
}

function drawContractInlineWrap(ctx, text, firstX, firstY, firstMaxWidth, nextX, nextY, nextMaxWidth, lineHeight=34, opt={}){
    const words = String(text || '-').trim().split(/\s+/).filter(Boolean);
    const size = opt.size || 38;
    setupContractCanvasFont(ctx, size, opt.bold !== false);
    const firstPxMax = firstMaxWidth * (2480/1055);
    const nextPxMax = nextMaxWidth * (2480/1055);
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
    if (lines[0]) drawContractText(ctx, lines[0], firstX, firstY, { maxWidth:firstMaxWidth, size, minSize: opt.minSize || 24, align });
    if (lines[1]) drawContractText(ctx, lines[1], nextX, nextY, { maxWidth:nextMaxWidth, size, minSize: opt.minSize || 24, align });
}
function drawContractSignature(ctx, dataUrl, x, y, w, h){
    if (!dataUrl) return Promise.resolve();
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const p = contractCanvasPoint(x, y);
            const boxW = w*(2480/1055), boxH = h*(3508/1491);
            const scale = Math.min(boxW / img.width, boxH / img.height);
            const drawW = img.width * scale, drawH = img.height * scale;
            const dx = p.x + (boxW - drawW) / 2;
            // Bottom-align cropped ink within the signature box so it sits close to the printed line.
            const dy = p.y + boxH - drawH;
            ctx.drawImage(img, dx, dy, drawW, drawH);
            resolve();
        };
        img.onerror = () => resolve();
        img.src = dataUrl;
    });
}
async function renderContractImageCanvas(row, debtor){
    const template = await loadContractTemplateImage();
    const canvas = document.createElement('canvas');
    canvas.width = 2480; canvas.height = 3508;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(template, 0, 0, canvas.width, canvas.height);
    const borrowerAddress = [debtor.address, debtor.district, debtor.province].filter(Boolean).join(' ');
    const borrowerName = debtor.name || row.borrowerName || '-';
    const lenderName = row.lenderName || currentProfile().lenderName || getDisplayName();
    const cdate = thDateParts(row.contractDate || today());
    const ddate = thDateParts(row.dueDate);
    const collateral = row.collateral || row.terms || '-';
    const interest = row.interestRate ? `${row.interestRate}%` : '-';
    const borrowerAge = debtorAgeForContract(debtor, row.contractDate || today());

    // v6.9: only reposition the blue filled values. The black template remains untouched.
    // Header fields start from the same X column, based on the "ลำดับที่" field.
    drawContractText(ctx, row.contractNo || nextContractNo(), 105, 130, { maxWidth:210, size:32, minSize:24, align:'smart' });
    drawContractText(ctx, row.place || '-', 105, 174, { maxWidth:500, size:32, minSize:24, align:'smart' });
    drawContractText(ctx, cdate.day, 105, 219, { maxWidth:60, align:'center', size:32, minSize:24 });
    drawContractText(ctx, cdate.month, 205, 219, { maxWidth:120, align:'center', size:32, minSize:22 });
    drawContractText(ctx, cdate.year, 348, 219, { maxWidth:120, align:'center', size:32, minSize:24 });

    drawContractText(ctx, borrowerName, 122, 291, { maxWidth:260, size:32, minSize:23, align:'smart' });
    drawContractText(ctx, borrowerAge, 425, 291, { maxWidth:100, align:'center', size:32, minSize:23 });
    drawContractInlineWrap(ctx, borrowerAddress || '-', 650, 291, 320, 48, 335, 910, 34, { size:32, minSize:23, align:'smart' });
    drawContractText(ctx, fullId(debtor.idCard), 226, 374, { maxWidth:740, size:32, minSize:23, align:'smart' });

    drawContractText(ctx, lenderName, 305, 423, { maxWidth:240, size:32, minSize:23, align:'smart' });
    drawContractText(ctx, fullId(row.lenderIdCard), 772, 423, { maxWidth:220, size:32, minSize:23, align:'smart' });
    drawContractWrap(ctx, row.lenderAddress || '-', 95, 470, 860, 34, 1, { size:32, minSize:23, align:'smart' });

    drawContractText(ctx, borrowerName, 210, 563, { maxWidth:250, size:32, minSize:23, align:'smart' });
    drawContractText(ctx, lenderName, 570, 563, { maxWidth:205, size:32, minSize:23, align:'smart' });
    drawContractText(ctx, money(row.amount), 55, 611, { maxWidth:155, align:'right', size:32, minSize:23 });
    drawContractText(ctx, bahtTextFallback(row.amount), 270, 611, { maxWidth:240, size:32, minSize:23, align:'center' });

    drawContractText(ctx, collateral, 555, 663, { maxWidth:190, size:32, minSize:22, align:'smart' });
    drawContractText(ctx, ddate.day, 725, 806, { maxWidth:65, align:'center', size:32, minSize:23 });
    drawContractText(ctx, ddate.month, 835, 806, { maxWidth:130, align:'center', size:32, minSize:21 });
    drawContractText(ctx, ddate.year, 95, 852, { maxWidth:100, size:32, minSize:23, align:'center' });
    drawContractText(ctx, interest, 325, 898, { maxWidth:120, align:'smart', size:32, minSize:22 });

    // Signature Engine v6.12: cropped signatures are reduced and bottom-aligned close above the line.
    const signatures = row.signatures || {};
    for (const [key, box] of Object.entries(SIGNATURE_PDF_MAP)) {
        await drawContractSignature(ctx, signatures[key], box.x, box.y, box.w, box.h);
    }

    // Names are below the signature lines; only the signature image itself is above the line.
    drawContractText(ctx, `(${borrowerName})`, 145, 1372, { maxWidth:190, size:21, minSize:16, align:'center' });
    drawContractText(ctx, `(${lenderName})`, 605, 1372, { maxWidth:190, size:21, minSize:16, align:'center' });
    drawContractText(ctx, `(${row.witness1Name || '-'})`, 145, 1425, { maxWidth:190, size:21, minSize:16, align:'center' });
    drawContractText(ctx, `(${row.witness2Name || '-'})`, 605, 1425, { maxWidth:190, size:21, minSize:16, align:'center' });
    drawContractText(ctx, `(${row.writerName || lenderName})`, 145, 1474, { maxWidth:180, size:20, minSize:15, align:'center' });
    return canvas;
}

async function generateContract() {
    if (!$('contractDebtorId')?.value) return toast('กรุณาเลือกลูกหนี้ / ผู้กู้');
    if (!$('contractLenderName')?.value.trim()) return toast('กรุณากรอกชื่อผู้ให้กู้');
    const debtor = debtorForContract($('contractDebtorId').value);
    const p = currentProfile();
    const signatures = collectContractSignatures();
    const signatureCount = Object.keys(signatures).length;
    const row = { contractNo: editingContractNo || nextContractNo(), sourceContractId: editingContractId || '', debtorId:$('contractDebtorId').value, borrowerName:debtor.name || '', lenderName:($('contractLenderName').value.trim() || p.lenderName || getDisplayName()), lenderIdCard:normalizeIdCard($('contractLenderIdCard').value || p.lenderIdCard || ''), lenderAddress:($('contractLenderAddress').value.trim() || p.lenderAddress || ''), amount:num($('contractAmount').value), contractDate:$('contractDate').value || today(), dueDate:$('contractDueDate').value, interestRate:String($('contractInterestRate').value || '').replace(/,/g,''), place:$('contractPlace').value.trim(), collateral:($('contractCollateral')?.value || '').trim(), witness1Name:$('contractWitness1Name').value.trim(), witness2Name:$('contractWitness2Name').value.trim(), writerName:($('contractWriterName')?.value || '').trim() || ($('contractLenderName')?.value || '').trim(), signatures, signatureCount, status: signatureCount >= 5 ? 'completed' : (signatureCount ? 'partial' : 'draft') };
    if (!row.amount) return toast('กรุณากรอกจำนวนเงินกู้');
    await saveSettings({ profile: { ...p, lenderName: row.lenderName, lenderIdCard: row.lenderIdCard, lenderAddress: row.lenderAddress } });
    try {
        toast('กำลังสร้าง PDF...');
        const canvas = await renderContractImageCanvas(row, debtor);
        const { jsPDF } = window.jspdf; const pdf = new jsPDF('p', 'mm', 'a4');
        const img = canvas.toDataURL('image/jpeg', 0.96);
        pdf.addImage(img, 'JPEG', 0, 0, 210, 297);
        const blob = pdf.output('blob');
        await saveContractPdf(row, blob);
        toast(editingContractId ? 'บันทึกแก้ไขสัญญาแล้ว' : 'สร้างและบันทึกสัญญาแล้ว'); editingContractId = ''; editingContractNo = ''; $('contractFormCard').classList.add('hidden'); render(); switchTab('contracts');
    } catch (e) { console.error(e); toast('สร้างสัญญาไม่สำเร็จ: ' + e.message); }
}
if ($('newContractBtn')) $('newContractBtn').onclick = () => showContractForm();
if ($('closeContractFormBtn')) $('closeContractFormBtn').onclick = () => $('contractFormCard').classList.add('hidden');
if ($('generateContractBtn')) $('generateContractBtn').onclick = generateContract;
document.querySelectorAll('[data-clear-sig]').forEach(b => b.onclick = () => clearSignature(b.dataset.clearSig));
window.addEventListener('resize', () => { if (!$('contractFormCard')?.classList.contains('hidden')) SIG_IDS.forEach(id => resizeSignatureCanvas($(id))); });

window.editContractDraft = id => {
    const row = (latestData?.contracts || []).find(x => x.id === id);
    if (!row) return toast('ไม่พบสัญญา');
    if (Number(row.signatureCount || 0) >= 5) return toast('สัญญาที่ลงลายเซ็นครบแล้วไม่สามารถแก้ไขได้');
    editingContractNo = row.contractNo || ''; editingContractId = row.id || '';
    showContractForm(row.debtorId || '');
    const map = { contractLenderName:'lenderName', contractLenderIdCard:'lenderIdCard', contractLenderAddress:'lenderAddress', contractAmount:'amount', contractDate:'contractDate', contractDueDate:'dueDate', contractInterestRate:'interestRate', contractPlace:'place', contractCollateral:'collateral', contractWitness1Name:'witness1Name', contractWitness2Name:'witness2Name', contractWriterName:'writerName' };
    Object.entries(map).forEach(([el, key]) => { if ($(el)) $(el).value = row[key] || ''; });
    if ($('contractDebtorId')) $('contractDebtorId').value = row.debtorId || '';
    setTimeout(() => restoreContractSignatures(row.signatures || {}), 180);
    toast('เปิดแบบร่างเพื่อแก้ไขแล้ว เมื่อบันทึกจะอัปเดตฉบับเดิม');
};
window.deleteContractDraft = async id => {
    const row = (latestData?.contracts || []).find(x => x.id === id);
    if (!row) return toast('ไม่พบสัญญา');
    if (Number(row.signatureCount || 0) > 0) return toast('ลบไม่ได้ เพราะมีลายเซ็นแล้ว แต่ยังสามารถแก้ไขได้');
    if (!confirm('ลบแบบร่างสัญญานี้ใช่หรือไม่?')) return;
    if (row.documentId) await deleteDocument(row.documentId);
    await deleteRow('contracts', id);
    toast('ลบแบบร่างสัญญาแล้ว');
    render();
};
window.showContractForm = showContractForm;

if ($('closePreviewBtn')) $('closePreviewBtn').onclick = () => $('documentPreviewModal').classList.add('hidden');
const themeModes = ['light', 'dark', 'auto']; function getThemeMode() { return localStorage.getItem('themeMode') || 'auto' } function applyTheme() { const mode = getThemeMode(), resolved = mode === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode; document.documentElement.setAttribute('data-theme', resolved); document.body.setAttribute('data-theme', resolved); $('themeIcon').className = mode === 'auto' ? 'bi bi-circle-half' : resolved === 'dark' ? 'bi bi-moon-stars' : 'bi bi-sun' } $('themeBtn').onclick = () => { const cur = getThemeMode(), next = themeModes[(themeModes.indexOf(cur) + 1) % themeModes.length]; localStorage.setItem('themeMode', next); applyTheme(); toast(next === 'auto' ? 'โหมดอัตโนมัติ' : next === 'dark' ? 'โหมดกลางคืน' : 'โหมดกลางวัน') };
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('installBtn').classList.remove('hidden') }); $('installBtn').onclick = async () => { if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('installBtn').classList.add('hidden') } };
async function setupSW() { if (!('serviceWorker' in navigator)) return; const reg = await navigator.serviceWorker.register('service-worker.js'); if (reg.waiting) { newWorker = reg.waiting; $('updateBtn').classList.remove('hidden') } reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { newWorker = w; $('updateBtn').classList.remove('hidden'); toast('มีเวอร์ชันใหม่พร้อมอัปเดต') } }) }); navigator.serviceWorker.addEventListener('controllerchange', () => location.reload()) } $('updateBtn').onclick = () => { if (newWorker) newWorker.postMessage({ type: 'SKIP_WAITING' }); else location.reload() }; $('clearCacheBtn').onclick = async () => { if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); toast('ล้าง Cache แล้ว') } }; $('enablePushBtn').onclick = async () => { if (!('Notification' in window)) return toast('Browser ไม่รองรับ Notification'); const p = await Notification.requestPermission(); toast(p === 'granted' ? 'เปิด Notification แล้ว' : 'ยังไม่ได้อนุญาต Notification') };
try {
    applyTheme();
    initFirebase();
    setupSW();
} catch (e) {
    console.error('App init error:', e);
    toast('โหลดระบบไม่สำเร็จ: ' + e.message);
}

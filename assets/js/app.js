import { firebaseConfig, OCR_FUNCTION_URL } from './firebase-config.js';
const $ = id => document.getElementById(id);
let firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId), auth, db, currentUser = null, demoMode = !firebaseReady;
const LS = 'debt_collector_sprint13_v2', blank = { debtors: [], debts: [], payments: [], followups: [], documents: [] };
const uid = () => String(Date.now()) + Math.random().toString(16).slice(2);
const today = () => new Date().toISOString().slice(0, 10);
const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0 };
const money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const maskId = id => { const s = String(id || '').replace(/\D/g, ''); return s.length >= 13 ? `${s.slice(0, 1)}-${s.slice(1, 5)}-xxxxx-${s.slice(10, 12)}-${s.slice(12, 13)}` : s.replace(/.(?=.{4})/g, 'x') };

function toast(m) { $('toast').textContent = m; $('toast').classList.add('show'); clearTimeout(window.t); window.t = setTimeout(() => $('toast').classList.remove('show'), 2200) }
function local() { return JSON.parse(localStorage.getItem(LS) || JSON.stringify(blank)) }
function setLocal(d) { localStorage.setItem(LS, JSON.stringify({ ...blank, ...d })) }

async function getData() {
    if (demoMode) return local();
    const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const names = ['debtors', 'debts', 'payments', 'followups', 'documents'];
    const snaps = await Promise.all(names.map(n => getDocs(collection(db, `users/${currentUser.uid}/${n}`))));
    return Object.fromEntries(names.map((n, i) => [n, snaps[i].docs.map(d => ({ id: d.id, ...d.data() }))]));
}
async function add(type, row) {
    if (demoMode) { const d = local(); d[type].push({ id: uid(), ...row }); setLocal(d); return }
    const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    await addDoc(collection(db, `users/${currentUser.uid}/${type}`), { ...row, createdAt: serverTimestamp() });
}
async function updateRow(type, id, row) {
    if (demoMode) { const d = local(); d[type] = d[type].map(x => x.id === id ? { ...x, ...row } : x); setLocal(d); return }
    const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    await updateDoc(doc(db, `users/${currentUser.uid}/${type}/${id}`), row);
}
function calc(d) {
    const paid = {}; d.payments.forEach(p => paid[p.debtId] = (paid[p.debtId] || 0) + num(p.amount));
    const debtors = Object.fromEntries(d.debtors.map(x => [x.id, x]));
    const debts = d.debts.map(x => { const p = paid[x.id] || 0, remain = Math.max(0, num(x.principal) - p); return { ...x, paid: p, remaining: remain, isDue: remain > 0 && String(x.dueDate || '') <= today(), debtor: debtors[x.debtorId] } });
    return { debts, debtors, debtsById: Object.fromEntries(debts.map(x => [x.id, x])) };
}
let latestData = null;
async function render() {
    const d = await getData(); latestData = d; const c = calc(d), due = c.debts.filter(x => x.isDue).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    $('debtorCount').textContent = d.debtors.length;
    $('openDebtTotal').textContent = money(c.debts.reduce((s, x) => s + x.remaining, 0));
    $('dueTotal').textContent = money(due.reduce((s, x) => s + x.remaining, 0));
    $('minCollectTotal').textContent = money(due.reduce((s, x) => s + Math.min(num(x.minCollectAmount || x.remaining), x.remaining), 0));
    $('followupTodayCount').textContent = d.followups.filter(f => String(f.nextFollowupDate || f.contactDate || '') <= today()).length;
    $('priorityList').innerHTML = due.length ? due.map(x => `<div class="item"><div><div class="item-title">${x.debtor?.name || '-'} · ${x.title}</div><div class="item-sub">ครบกำหนด ${x.dueDate} · ขั้นต่ำ ${money(Math.min(num(x.minCollectAmount || x.remaining), x.remaining))}</div></div><div class="amount">${money(x.remaining)}</div></div>`).join('') : '<div class="empty">ยังไม่มีรายการถึงกำหนด</div>';
    $('todayFollowupList').innerHTML = d.followups.filter(f => String(f.nextFollowupDate || f.contactDate || '') <= today()).map(f => `<div class="item"><div><div class="item-title">${c.debtors[f.debtorId]?.name || '-'} · ${f.channel}</div><div class="item-sub">${f.result || '-'} · นัด ${f.nextFollowupDate || '-'}</div></div></div>`).join('') || '<div class="empty">ยังไม่มีรายการติดตามวันนี้</div>';
    $('debtorList').innerHTML = d.debtors.map(x => { const remain = c.debts.filter(dd => dd.debtorId === x.id).reduce((s, dd) => s + dd.remaining, 0); return `<div class="item"><div><div class="item-title">${x.name}</div><div class="item-sub">${x.phone || '-'} · ${maskId(x.idCard)}</div><div class="item-sub">ยอดคงเหลือ ${money(remain)}</div></div><button class="mini" onclick="openDebtForm('${x.id}','${String(x.name).replace(/'/g, "\\'")}')">เพิ่มหนี้</button><button class="mini" onclick="openEditDebtor('${x.id}')">แก้ไข</button></div>` }).join('') || '<div class="empty">ยังไม่มีลูกหนี้</div>';
    fillSelects(d, c); fillLists(d, c);
}
function fillSelects(d, c) {
    let debtorOpts = '<option value="">-- เลือกลูกหนี้ --</option>' + d.debtors.map(x => `<option value="${x.id}">${x.name}</option>`).join('');
    ['followupDebtorId', 'documentDebtorId'].forEach(id => $(id).innerHTML = debtorOpts);
    let debtOpts = '<option value="">-- เลือกก้อนหนี้ --</option>' + c.debts.filter(x => x.remaining > 0).map(x => `<option value="${x.id}">${x.debtor?.name || '-'} · ${x.title} · ${money(x.remaining)}</option>`).join('');
    $('paymentDebtId').innerHTML = debtOpts; $('followupDebtId').innerHTML = '<option value="">-- ไม่ระบุก้อนหนี้ --</option>' + debtOpts.replace('<option value="">-- เลือกก้อนหนี้ --</option>', '');
}
function fillLists(d, c) {
    $('paymentList').innerHTML = d.payments.map(p => `<div class="item"><div><div class="item-title">${money(p.amount)}</div><div class="item-sub">${p.paidDate} · ${c.debtsById[p.debtId]?.title || '-'} · ${p.note || ''}</div></div></div>`).join('') || '<div class="empty">ยังไม่มีประวัติชำระ</div>';
    $('followupList').innerHTML = d.followups.map(f => `<div class="item"><div><div class="item-title">${c.debtors[f.debtorId]?.name || '-'} · ${f.channel}</div><div class="item-sub">${f.contactDate} · ${f.result || '-'} · นัด ${f.nextFollowupDate || '-'}</div></div></div>`).join('') || '<div class="empty">ยังไม่มีประวัติติดตาม</div>';
    $('documentList').innerHTML = d.documents.map(doc => `<div class="item"><div><div class="item-title">${doc.type} · ${doc.fileName}</div><div class="item-sub">${c.debtors[doc.debtorId]?.name || '-'} · ${doc.createdDate}</div></div></div>`).join('') || '<div class="empty">ยังไม่มีเอกสาร</div>';
}

window.openDebtForm = (id, name) => { $('selectedDebtorId').value = id; $('selectedDebtorName').textContent = name; $('debtFormCard').classList.remove('hidden') };
$('addDebtorBtn').onclick = async () => { if (!$('debtorName').value.trim()) return toast('กรุณากรอกชื่อลูกหนี้'); await add('debtors', { name: $('debtorName').value.trim(), phone: $('debtorPhone').value.trim(), idCard: $('debtorIdCard').value.trim(), address: $('debtorAddress').value.trim() });['debtorName', 'debtorPhone', 'debtorIdCard', 'debtorAddress'].forEach(id => $(id).value = ''); toast('เพิ่มลูกหนี้สำเร็จ'); render() };
$('addDebtBtn').onclick = async () => { if (!$('selectedDebtorId').value) return toast('เลือกลูกหนี้ก่อน'); let principal = num($('debtPrincipal').value); if (principal <= 0) return toast('กรอกยอดหนี้'); await add('debts', { debtorId: $('selectedDebtorId').value, title: $('debtTitle').value || 'ก้อนหนี้', principal, minCollectAmount: num($('debtMinCollect').value) || principal, dueDate: $('debtDueDate').value || today(), status: 'open' });['debtTitle', 'debtPrincipal', 'debtMinCollect', 'debtDueDate'].forEach(id => $(id).value = ''); toast('เพิ่มก้อนหนี้สำเร็จ'); render() };
$('addPaymentBtn').onclick = async () => { if (!$('paymentDebtId').value) return toast('เลือกก้อนหนี้'); let amount = num($('paymentAmount').value); if (amount <= 0) return toast('กรอกจำนวนเงิน'); await add('payments', { debtId: $('paymentDebtId').value, amount, paidDate: $('paymentDate').value || today(), note: $('paymentNote').value }); $('paymentAmount').value = ''; $('paymentNote').value = ''; toast('บันทึกชำระแล้ว'); render() };
$('addFollowupBtn').onclick = async () => { if (!$('followupDebtorId').value) return toast('เลือกลูกหนี้'); await add('followups', { debtorId: $('followupDebtorId').value, debtId: $('followupDebtId').value, contactDate: $('followupDate').value || today(), channel: $('followupChannel').value, result: $('followupResult').value, nextFollowupDate: $('nextFollowupDate').value }); toast('บันทึกการติดตามแล้ว'); render() };
$('addDocumentBtn').onclick = async () => { if (!$('documentDebtorId').value) return toast('เลือกลูกหนี้'); let f = $('documentFile').files[0]; await add('documents', { debtorId: $('documentDebtorId').value, type: $('documentType').value, fileName: f ? f.name : 'ไม่ได้แนบไฟล์', createdDate: today(), storagePath: '' }); $('documentFile').value = ''; const dzText = $('dropzoneText'); if (dzText) dzText.textContent = 'รองรับรูปภาพ / PDF / เอกสารทั่วไป'; toast('บันทึกเอกสารแล้ว'); render() };


window.openEditDebtor = (id) => {
    const d = (latestData?.debtors || []).find(x => x.id === id);
    if (!d) return toast('ไม่พบข้อมูลลูกหนี้');
    $('editDebtorId').value = d.id;
    $('editDebtorName').value = d.name || '';
    $('editDebtorPhone').value = d.phone || '';
    $('editDebtorIdCard').value = d.idCard || '';
    $('editDebtorAddress').value = d.address || '';
    $('editDebtorCard').classList.remove('hidden');
    window.scrollTo({ top: $('editDebtorCard').offsetTop - 80, behavior: 'smooth' });
};
$('cancelEditDebtorBtn').onclick = () => { $('editDebtorCard').classList.add('hidden') };
$('saveEditDebtorBtn').onclick = async () => {
    const id = $('editDebtorId').value;
    if (!id) return toast('ไม่พบรหัสลูกหนี้');
    if (!$('editDebtorName').value.trim()) return toast('กรุณากรอกชื่อลูกหนี้');
    await updateRow('debtors', id, {
        name: $('editDebtorName').value.trim(),
        phone: $('editDebtorPhone').value.trim(),
        idCard: $('editDebtorIdCard').value.trim(),
        address: $('editDebtorAddress').value.trim()
    });
    $('editDebtorCard').classList.add('hidden');
    toast('แก้ไขข้อมูลลูกหนี้แล้ว');
    render();
};

function bindMoneyInputs() {
    document.querySelectorAll('.money-input').forEach(input => {
        input.addEventListener('focus', () => { input.value = String(num(input.value) || ''); input.select() });
        input.addEventListener('blur', () => { const n = num(input.value); input.value = n ? money(n) : '' });
    });
}
function bindDropzone() {
    const dz = $('dropzone'), file = $('documentFile'), text = $('dropzoneText');
    if (!dz || !file) return;
    const showFile = () => { text.textContent = file.files[0] ? file.files[0].name : 'รองรับรูปภาพ / PDF / เอกสารทั่วไป' };
    file.addEventListener('change', showFile);
    ['dragenter', 'dragover'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.add('dragover') }));
    ['dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.remove('dragover') }));
    dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) { file.files = e.dataTransfer.files; showFile() } });
}
bindMoneyInputs();
bindDropzone();

document.querySelectorAll('.tab').forEach(b => b.onclick = () => { document.querySelectorAll('.tab,.panel').forEach(x => x.classList.remove('active')); b.classList.add('active'); $('tab-' + b.dataset.tab).classList.add('active') });
$('demoBtn').onclick = () => { demoMode = true; currentUser = { uid: 'demo' }; $('authView').classList.remove('active'); $('appView').classList.add('active'); toast('เข้าสู่ Demo Mode'); render() };

async function initFirebase() { if (!firebaseReady) { toast('ยังไม่ได้ตั้งค่า Firebase จึงใช้ Demo Mode'); return; } if (firebaseConfig.apiKey === '') { toast('ยังไม่ได้ตั้งค่า Firebase จึงใช้ Demo Mode'); return; } const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'); const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'); const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'); let app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); $('loginBtn').onclick = async () => { try { await signInWithEmailAndPassword(auth, $('email').value, $('password').value) } catch (e) { toast(e.code) } }; $('registerBtn').onclick = async () => { try { await createUserWithEmailAndPassword(auth, $('email').value, $('password').value) } catch (e) { toast(e.code) } }; $('logoutBtn').onclick = async () => { await signOut(auth); location.reload() }; onAuthStateChanged(auth, u => { if (u) { currentUser = u; demoMode = false; $('authView').classList.remove('active'); $('appView').classList.add('active'); render() } }) }
if (!firebaseReady) { $('loginBtn').onclick = $('demoBtn').onclick; $('registerBtn').onclick = $('demoBtn').onclick }

$('exportJsonBtn').onclick = async () => download(JSON.stringify({ data: await getData() }, null, 2), 'debt-backup.json', 'application/json');
$('exportTxtBtn').onclick = async () => download('DEBT_BACKUP\\n' + JSON.stringify({ data: await getData() }, null, 2), 'debt-backup.txt', 'text/plain');
function download(c, n, t) { let a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([c], { type: t })); a.download = n; a.click() }
$('importFile').onchange = async e => { let f = e.target.files[0]; if (!f) return; let txt = (await f.text()).replace(/^DEBT_BACKUP\\s*/, '').trim(); setLocal(JSON.parse(txt).data || JSON.parse(txt)); demoMode = true; toast('Import เข้า Demo'); render() };

const themeModes = ['light', 'dark', 'auto'];
function getThemeMode() {
    return localStorage.getItem('themeMode') || 'auto';
}
function getResolvedTheme(mode) {
    if (mode === 'auto') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode;
}

async function compressImageToBase64(file, maxWidth = 1600, quality = 0.86) {
    const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = URL.createObjectURL(file);
    });
    const scale = Math.min(1, maxWidth / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}
function bindOcr() {
    const file = $('ocrFile'), dz = $('ocrDropzone'), preview = $('ocrPreview'), nameEl = $('ocrFileName');
    if (!file || !dz) return;
    const show = () => {
        const f = file.files[0];
        if (!f) return;
        if (nameEl) nameEl.textContent = f.name;
        if (preview) { preview.src = URL.createObjectURL(f); preview.classList.remove('hidden'); }
    };
    file.addEventListener('change', show);
    ['dragenter', 'dragover'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.add('dragover') }));
    ['dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.remove('dragover') }));
    dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) { file.files = e.dataTransfer.files; show(); } });
}
async function getAuthTokenForOcr() {
    if (currentUser && currentUser.getIdToken) return await currentUser.getIdToken();
    return '';
}
if ($('runOcrBtn')) {
    $('runOcrBtn').onclick = async () => {
        const file = $('ocrFile')?.files?.[0];
        if (!file) return toast('กรุณาถ่ายรูปหรือเลือกรูปบัตรก่อน');
        if (!OCR_FUNCTION_URL) return toast('กรุณาใส่ OCR_FUNCTION_URL ใน firebase-config.js หลัง deploy function');
        try {
            toast('กำลังอ่าน OCR...');
            const imageBase64 = await compressImageToBase64(file);
            const token = await getAuthTokenForOcr();
            const res = await fetch(OCR_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ imageBase64 })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'OCR failed');
            if ($('ocrName')) $('ocrName').value = data.fullName || data.name || '';
            if ($('ocrIdCard')) $('ocrIdCard').value = data.idCard || '';
            if ($('ocrAddress')) $('ocrAddress').value = data.address || '';
            toast('อ่าน OCR สำเร็จ กรุณาตรวจสอบข้อมูล');
        } catch (err) {
            console.error(err);
            toast('OCR ไม่สำเร็จ: ' + err.message);
        }
    };
}
if ($('useOcrToDebtorBtn')) {
    $('useOcrToDebtorBtn').onclick = () => {
        if ($('debtorName')) $('debtorName').value = $('ocrName')?.value || '';
        if ($('debtorIdCard')) $('debtorIdCard').value = $('ocrIdCard')?.value || '';
        if ($('debtorAddress')) $('debtorAddress').value = $('ocrAddress')?.value || '';
        document.querySelector('[data-tab="debtors"]')?.click();
        toast('นำข้อมูล OCR ไปกรอกฟอร์มลูกหนี้แล้ว');
    };
}
bindOcr();

function applyTheme() {
    const mode = getThemeMode();
    const resolved = getResolvedTheme(mode);
    document.documentElement.setAttribute('data-theme', resolved);
    document.body.setAttribute('data-theme', resolved);
    const icon = $('themeIcon');
    if (icon) {
        icon.className = mode === 'auto'
            ? 'bi bi-circle-half'
            : resolved === 'dark'
                ? 'bi bi-moon-stars-fill'
                : 'bi bi-sun-fill';
    }
    const btn = $('themeBtn');
    if (btn) {
        btn.title = mode === 'auto' ? 'โหมดอัตโนมัติ' : resolved === 'dark' ? 'โหมดกลางคืน' : 'โหมดกลางวัน';
        btn.setAttribute('aria-label', btn.title);
    }
}
$('themeBtn').onclick = () => {
    const current = getThemeMode();
    const next = themeModes[(themeModes.indexOf(current) + 1) % themeModes.length];
    localStorage.setItem('themeMode', next);
    applyTheme();
    toast(next === 'auto' ? 'โหมดอัตโนมัติ' : next === 'dark' ? 'โหมดกลางคืน' : 'โหมดกลางวัน');
};
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (getThemeMode() === 'auto') applyTheme();
});
applyTheme();
initFirebase();


export const firebaseConfig = {
  apiKey: "AIzaSyAT2YIuk4A0ibSBXpMA_3Im54gj9s4WRW8",
  authDomain: "project-987b9bba-eddc-4459-bdb.firebaseapp.com",
  projectId: "project-987b9bba-eddc-4459-bdb",
  storageBucket: "project-987b9bba-eddc-4459-bdb.firebasestorage.app",
  messagingSenderId: "298432652014",
  appId: "1:298432652014:web:ba66705f4c67baecf489ff",
  measurementId: "G-FEZV3HQPPZ"
};

export const OCR_FUNCTION_URL = "https://ocrthaiidcardv2-45hiykrzuq-as.a.run.app";
export const TELEGRAM_TEST_FUNCTION_URL = "";
export const VAPID_PUBLIC_KEY = "";

/* Generic Document Editor v2: Word-like A4 mode, no TinyMCE. */
try {
  window.tinymce = null;
  window.__DC_DISABLE_TINYMCE = true;
} catch (e) {
  console.warn('TinyMCE disable skipped', e);
}

const GENERIC_DOC_EDITOR_STYLE_ID = 'generic-doc-grid-editor-v2-style';
const GENERIC_DOC_FIXED_MARGINS = { top: 18, right: 16, bottom: 18, left: 16 };
let genericDocSavedRange = null;
let genericDocExecPatched = false;
let genericDocLastValidHtml = '';
let genericDocOverflowTimer = null;

function ensureGenericDocGridEditorStyle() {
  if (document.getElementById(GENERIC_DOC_EDITOR_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = GENERIC_DOC_EDITOR_STYLE_ID;
  style.textContent = `
    #tab-generic-docs .generic-doc-hero{margin-bottom:8px}
    #tab-generic-docs .generic-doc-hero > .generic-doc-toolbar{display:none!important}
    #genericDocFormCard{padding-top:14px}
    .generic-doc-attached-tools{position:sticky;top:6px;z-index:30;margin:0 0 8px;padding:8px;border:1px solid #bbf7d0;border-radius:16px;background:rgba(255,255,255,.96);box-shadow:0 8px 22px rgba(15,23,42,.08);backdrop-filter:blur(10px)}
    .generic-doc-attached-tools .generic-doc-toolbar{display:flex!important;align-items:center;gap:6px;overflow-x:auto;white-space:nowrap;padding:0;margin:0;background:transparent;border:0;box-shadow:none}
    .generic-doc-attached-tools .gdoc-toolbar-group{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;padding:3px;border-right:1px solid #e2e8f0}
    .generic-doc-attached-tools .gdoc-toolbar-group:last-child{border-right:0}
    .generic-doc-attached-tools button{min-width:34px;height:34px;padding:0 8px;border-radius:10px}
    .generic-doc-attached-tools select,.generic-doc-attached-tools input[type=number]{height:34px;min-height:34px;padding:4px 8px;border-radius:10px}
    .generic-doc-page-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;padding:9px 12px;border:1px solid #dbeafe;border-radius:16px;background:linear-gradient(135deg,#f8fafc,#eff6ff);color:#0f172a;font-weight:900}
    .generic-doc-page-tools small{color:#64748b;font-weight:700}
    .generic-doc-editor-shell{--gdoc-margin-top:18mm;--gdoc-margin-right:16mm;--gdoc-margin-bottom:18mm;--gdoc-margin-left:16mm;position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);grid-template-rows:28px auto;gap:0;max-width:100%;overflow:auto;padding:0 0 12px;background:#eef2f7;border:1px solid #dbe4ef;border-radius:18px}
    .generic-doc-ruler-top{grid-column:2;grid-row:1;position:sticky;top:0;z-index:3;height:28px;background:#f8fafc;border-bottom:1px solid #cbd5e1;background-image:repeating-linear-gradient(90deg,#64748b 0 1px,transparent 1px 37.8px)}
    .generic-doc-ruler-top::after{content:'0     1     2     3     4     5     6     7     8     9    10    11    12    13    14    15    16    17    18';font-size:10px;font-weight:800;color:#64748b;letter-spacing:13px;white-space:nowrap;position:absolute;left:6px;top:6px}
    .generic-doc-ruler-left{grid-column:1;grid-row:2;position:sticky;left:0;z-index:2;width:34px;background:#f8fafc;border-right:1px solid #cbd5e1;background-image:repeating-linear-gradient(180deg,#64748b 0 1px,transparent 1px 37.8px)}
    .generic-doc-ruler-left::after{content:'0\\A 1\\A 2\\A 3\\A 4\\A 5\\A 6\\A 7\\A 8\\A 9\\A 10\\A 11\\A 12\\A 13\\A 14\\A 15\\A 16\\A 17\\A 18\\A 19\\A 20\\A 21\\A 22\\A 23\\A 24\\A 25\\A 26\\A 27';white-space:pre;line-height:37.8px;font-size:10px;font-weight:800;color:#64748b;position:absolute;right:4px;top:0;text-align:right}
    .generic-doc-ruler-corner{grid-column:1;grid-row:1;position:sticky;left:0;top:0;z-index:4;background:#e2e8f0;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1}
    .generic-doc-editor-page-wrap{grid-column:2;grid-row:2;padding:14px;min-width:max-content}
    #genericDocEditor.generic-doc-editor-fallback{position:relative;display:block;width:210mm;height:297mm;max-height:297mm;box-sizing:border-box;margin:0 auto;background:#fff;color:#111827;border:0;border-radius:2px;box-shadow:0 14px 38px rgba(15,23,42,.16);padding:var(--gdoc-margin-top) var(--gdoc-margin-right) var(--gdoc-margin-bottom) var(--gdoc-margin-left);font-family:'Sarabun','Noto Sans Thai',sans-serif;line-height:1.45;outline:none;overflow:hidden;overflow-wrap:break-word;word-break:break-word;white-space:normal}
    #genericDocEditor.generic-doc-editor-fallback::before{content:'';position:absolute;inset:var(--gdoc-margin-top) var(--gdoc-margin-right) var(--gdoc-margin-bottom) var(--gdoc-margin-left);border:1.5px dashed rgba(22,163,74,.55);border-radius:4px;pointer-events:none;z-index:0}
    #genericDocEditor.generic-doc-editor-fallback > *{position:relative;z-index:1;max-width:100%;box-sizing:border-box}
    #genericDocEditor.generic-doc-editor-fallback:focus{box-shadow:0 0 0 3px rgba(22,163,74,.18),0 14px 38px rgba(15,23,42,.16)}
    #genericDocEditor.generic-doc-editor-fallback p,#genericDocEditor.generic-doc-editor-fallback div,#genericDocEditor.generic-doc-editor-fallback li{max-width:100%;overflow-wrap:break-word;word-break:break-word}
    #genericDocEditor.generic-doc-editor-fallback table{border-collapse:collapse;width:100%;max-width:100%;table-layout:fixed}
    #genericDocEditor.generic-doc-editor-fallback td,#genericDocEditor.generic-doc-editor-fallback th{border:1px solid #cbd5e1;padding:8px;overflow-wrap:break-word;word-break:break-word}
    #genericDocEditor.generic-doc-editor-fallback img{max-width:100%;height:auto}
    #genericDocEditor.generic-doc-editor-fallback hr{border:0;border-top:1px solid #cbd5e1;margin:12px 0}
    .generic-doc-overflow-warning{outline:3px solid rgba(220,38,38,.3)!important}
    .generic-sign-designer-toolbar .secondary,.generic-sign-nudge-panel .secondary,.sig-actions-row .mini,.sig-tool-btn{border-radius:10px!important;min-width:auto!important;width:auto!important;height:34px!important;padding:0 12px!important}
    .signature-box .sig-actions-row button,.profile-signature-box .sig-actions-row button{border-radius:10px!important}
    .generic-sign-designer-real-preview,.generic-signature-slot,.signature-image-with-meta{line-height:1.1!important;gap:2px!important}
    .generic-sign-designer-real-meta,.generic-signature-meta{line-height:1.08!important;margin-top:1px!important;font-size:var(--signature-meta-size,12px)!important}
    .generic-sign-designer-real-img,.generic-signature-slot img{margin-bottom:0!important}
    @media(max-width:760px){.generic-doc-attached-tools{top:4px;padding:6px;border-radius:14px}.generic-doc-attached-tools button{min-width:32px;height:32px}.generic-doc-page-tools{padding:8px;border-radius:14px}.generic-doc-page-tools small{display:none}.generic-doc-editor-shell{grid-template-columns:24px minmax(0,1fr);grid-template-rows:24px auto;border-radius:14px}.generic-doc-ruler-top{height:24px}.generic-doc-ruler-left{width:24px}.generic-doc-ruler-top::after{font-size:9px;letter-spacing:10px}.generic-doc-ruler-left::after{font-size:9px;line-height:37.8px}.generic-doc-editor-page-wrap{padding:8px}#genericDocEditor.generic-doc-editor-fallback{width:210mm;height:297mm;max-height:297mm}}
  `;
  document.head.appendChild(style);
}

function genericDocEditorEl() {
  return document.getElementById('genericDocEditor');
}

function selectionInsideGenericDoc() {
  const editor = genericDocEditorEl();
  const sel = window.getSelection?.();
  if (!editor || !sel || !sel.rangeCount) return false;
  const node = sel.anchorNode;
  return !!(node && (node === editor || editor.contains(node)));
}

function saveGenericDocSelection() {
  const editor = genericDocEditorEl();
  const sel = window.getSelection?.();
  if (!editor || !sel || !sel.rangeCount || !selectionInsideGenericDoc()) return;
  genericDocSavedRange = sel.getRangeAt(0).cloneRange();
}

function restoreGenericDocSelection() {
  const editor = genericDocEditorEl();
  const sel = window.getSelection?.();
  if (!editor || !sel) return;
  if (selectionInsideGenericDoc()) return;
  editor.focus({ preventScroll: true });
  if (genericDocSavedRange) {
    sel.removeAllRanges();
    sel.addRange(genericDocSavedRange);
  }
}

function patchExecCommandForGenericDoc() {
  if (genericDocExecPatched || !document.execCommand) return;
  genericDocExecPatched = true;
  const originalExecCommand = document.execCommand.bind(document);
  document.execCommand = function(command, showUi, value) {
    restoreGenericDocSelection();
    const result = originalExecCommand(command, showUi, value);
    saveGenericDocSelection();
    setTimeout(guardGenericDocOverflow, 0);
    return result;
  };
}

function setFixedGenericDocMargins(shell) {
  const root = shell || document.querySelector('.generic-doc-editor-shell');
  if (!root) return;
  Object.entries(GENERIC_DOC_FIXED_MARGINS).forEach(([side, value]) => {
    root.style.setProperty(`--gdoc-margin-${side}`, `${value}mm`);
  });
}

function moveGenericDocToolbarBefore(tools) {
  const formCard = document.getElementById('genericDocFormCard');
  const heroToolbar = document.querySelector('#tab-generic-docs .generic-doc-hero .generic-doc-toolbar');
  if (!formCard || !heroToolbar || document.getElementById('genericDocAttachedTools')) return;
  const wrap = document.createElement('div');
  wrap.id = 'genericDocAttachedTools';
  wrap.className = 'generic-doc-attached-tools';
  wrap.appendChild(heroToolbar);
  tools.before(wrap);
  wrap.addEventListener('mousedown', event => {
    if (event.target.closest('button')) event.preventDefault();
  }, true);
  wrap.addEventListener('click', event => {
    if (event.target.closest('button,[data-gdoc-cmd]')) restoreGenericDocSelection();
  }, true);
  wrap.querySelectorAll('select,input[type=color],input[type=number]').forEach(el => {
    el.addEventListener('focus', saveGenericDocSelection, true);
    el.addEventListener('mousedown', saveGenericDocSelection, true);
    el.addEventListener('change', restoreGenericDocSelection, true);
  });
}

function guardGenericDocOverflow() {
  const editor = genericDocEditorEl();
  if (!editor) return;
  clearTimeout(genericDocOverflowTimer);
  genericDocOverflowTimer = setTimeout(() => {
    const overflow = editor.scrollHeight > editor.clientHeight + 2 || editor.scrollWidth > editor.clientWidth + 2;
    editor.classList.toggle('generic-doc-overflow-warning', overflow);
    if (overflow && genericDocLastValidHtml) {
      editor.innerHTML = genericDocLastValidHtml;
      const sel = window.getSelection?.();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
      genericDocSavedRange = range.cloneRange();
      if (window.toast) window.toast('เนื้อหาเกินพื้นที่ A4 แล้ว ระบบย้อนกลับตำแหน่งล่าสุด');
      editor.classList.remove('generic-doc-overflow-warning');
      return;
    }
    if (!overflow) genericDocLastValidHtml = editor.innerHTML;
  }, 40);
}

function installGenericDocGridEditor() {
  ensureGenericDocGridEditorStyle();
  patchExecCommandForGenericDoc();
  const oldEditor = document.getElementById('genericDocEditor');
  if (!oldEditor || oldEditor.dataset.gridEditorReady === '1') return;

  const editor = document.createElement('div');
  editor.id = oldEditor.id;
  editor.className = `${oldEditor.className || ''} generic-doc-editor-fallback`.trim();
  editor.contentEditable = 'true';
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-multiline', 'true');
  editor.setAttribute('spellcheck', 'true');
  editor.dataset.gridEditorReady = '1';
  editor.innerHTML = oldEditor.value || oldEditor.innerHTML || '';
  genericDocLastValidHtml = editor.innerHTML;

  const tools = document.createElement('div');
  tools.className = 'generic-doc-page-tools';
  tools.innerHTML = `<span><i class="bi bi-rulers"></i> A4 Word Mode · พื้นที่เส้นประคือขอบเขตที่พิมพ์ได้</span><small>ระบบตัดบรรทัดอัตโนมัติและกันไม่ให้พิมพ์เกิน A4</small>`;

  const shell = document.createElement('div');
  shell.className = 'generic-doc-editor-shell';
  shell.innerHTML = '<div class="generic-doc-ruler-corner"></div><div class="generic-doc-ruler-top"></div><div class="generic-doc-ruler-left"></div>';
  const pageWrap = document.createElement('div');
  pageWrap.className = 'generic-doc-editor-page-wrap';
  pageWrap.appendChild(editor);
  shell.appendChild(pageWrap);

  oldEditor.replaceWith(tools, shell);
  moveGenericDocToolbarBefore(tools);
  setFixedGenericDocMargins(shell);

  ['keyup', 'mouseup', 'touchend', 'focus'].forEach(evt => editor.addEventListener(evt, saveGenericDocSelection));
  editor.addEventListener('beforeinput', saveGenericDocSelection);
  editor.addEventListener('input', () => {
    saveGenericDocSelection();
    guardGenericDocOverflow();
  });
  editor.addEventListener('paste', event => {
    event.preventDefault();
    restoreGenericDocSelection();
    const html = event.clipboardData?.getData('text/html');
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertHTML', false, html || text.replace(/\n/g, '<br>'));
    guardGenericDocOverflow();
  });
  setTimeout(guardGenericDocOverflow, 80);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installGenericDocGridEditor, { once: true });
} else {
  installGenericDocGridEditor();
}

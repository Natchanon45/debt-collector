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

/* Generic Document Editor v2: no TinyMCE, toolbar attached to A4 editor. */
try {
  window.tinymce = null;
  window.__DC_DISABLE_TINYMCE = true;
} catch (e) {
  console.warn('TinyMCE disable skipped', e);
}

const GENERIC_DOC_EDITOR_STYLE_ID = 'generic-doc-grid-editor-v2-style';
const GENERIC_DOC_DEFAULT_MARGINS = { top: 18, right: 16, bottom: 18, left: 16 };
let genericDocSavedRange = null;
let genericDocExecPatched = false;

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
    .generic-doc-page-tools{display:grid;gap:8px;margin:0 0 8px;padding:10px;border:1px solid #dbeafe;border-radius:16px;background:linear-gradient(135deg,#f8fafc,#eff6ff)}
    .generic-doc-page-tools-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;color:#0f172a;font-weight:900}
    .generic-doc-page-tools-head small{color:#64748b;font-weight:700}
    .generic-doc-margin-grid{display:grid;grid-template-columns:repeat(4,minmax(72px,1fr));gap:6px}
    .generic-doc-margin-grid label{font-size:12px;font-weight:900;color:#334155;margin:0}
    .generic-doc-margin-grid input{width:100%;margin-top:3px;padding:8px 9px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:800}
    .generic-doc-reset-margin{border:1px solid #bbf7d0;background:#fff;color:#15803d;border-radius:999px;padding:7px 11px;font-weight:900}
    .generic-doc-editor-shell{--gdoc-margin-top:18mm;--gdoc-margin-right:16mm;--gdoc-margin-bottom:18mm;--gdoc-margin-left:16mm;position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);grid-template-rows:28px auto;gap:0;max-width:100%;overflow:auto;padding:0 0 12px;background:#f1f5f9;border:1px solid #dbe4ef;border-radius:18px}
    .generic-doc-ruler-top{grid-column:2;grid-row:1;position:sticky;top:0;z-index:3;height:28px;background:#f8fafc;border-bottom:1px solid #cbd5e1;background-image:repeating-linear-gradient(90deg,#94a3b8 0 1px,transparent 1px 37.8px)}
    .generic-doc-ruler-left{grid-column:1;grid-row:2;position:sticky;left:0;z-index:2;width:34px;background:#f8fafc;border-right:1px solid #cbd5e1;background-image:repeating-linear-gradient(180deg,#94a3b8 0 1px,transparent 1px 37.8px)}
    .generic-doc-ruler-corner{grid-column:1;grid-row:1;position:sticky;left:0;top:0;z-index:4;background:#e2e8f0;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1}
    .generic-doc-editor-page-wrap{grid-column:2;grid-row:2;padding:14px;min-width:max-content}
    #genericDocEditor.generic-doc-editor-fallback{display:block;width:210mm;min-height:297mm;box-sizing:border-box;margin:0 auto;background:#fff;color:#111827;border:0;border-radius:2px;box-shadow:0 14px 38px rgba(15,23,42,.16);padding:var(--gdoc-margin-top) var(--gdoc-margin-right) var(--gdoc-margin-bottom) var(--gdoc-margin-left);font-family:'Sarabun','Noto Sans Thai',sans-serif;line-height:1.65;outline:none;overflow-wrap:break-word;background-image:linear-gradient(rgba(14,165,233,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(14,165,233,.08) 1px,transparent 1px);background-size:10mm 10mm,10mm 10mm;background-origin:content-box;background-clip:border-box}
    #genericDocEditor.generic-doc-editor-fallback:focus{box-shadow:0 0 0 3px rgba(22,163,74,.18),0 14px 38px rgba(15,23,42,.16)}
    #genericDocEditor.generic-doc-editor-fallback table{border-collapse:collapse;width:100%}
    #genericDocEditor.generic-doc-editor-fallback td,#genericDocEditor.generic-doc-editor-fallback th{border:1px solid #cbd5e1;padding:8px}
    #genericDocEditor.generic-doc-editor-fallback img{max-width:100%;height:auto}
    #genericDocEditor.generic-doc-editor-fallback hr{border:0;border-top:1px solid #cbd5e1;margin:18px 0}
    @media(max-width:760px){.generic-doc-attached-tools{top:4px;padding:6px;border-radius:14px}.generic-doc-attached-tools button{min-width:32px;height:32px}.generic-doc-margin-grid{grid-template-columns:repeat(4,minmax(58px,1fr));gap:4px}.generic-doc-page-tools{padding:8px}.generic-doc-page-tools-head small{display:none}.generic-doc-editor-shell{grid-template-columns:24px minmax(0,1fr);grid-template-rows:24px auto;border-radius:14px}.generic-doc-ruler-top{height:24px}.generic-doc-ruler-left{width:24px}.generic-doc-editor-page-wrap{padding:8px}#genericDocEditor.generic-doc-editor-fallback{width:210mm;min-height:297mm}}
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
    return result;
  };
}

function mmValue(value, fallback) {
  const n = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.min(60, n) : fallback;
}

function applyGenericDocMargins(shell) {
  const root = shell || document.querySelector('.generic-doc-editor-shell');
  if (!root) return;
  ['top', 'right', 'bottom', 'left'].forEach(side => {
    const input = document.getElementById(`genericDocMargin${side[0].toUpperCase()}${side.slice(1)}`);
    const value = mmValue(input?.value, GENERIC_DOC_DEFAULT_MARGINS[side]);
    if (input) input.value = String(value);
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

  const tools = document.createElement('div');
  tools.className = 'generic-doc-page-tools';
  tools.innerHTML = `
    <div class="generic-doc-page-tools-head">
      <span><i class="bi bi-rulers"></i> ไม้บรรทัด / ขอบกระดาษ A4</span>
      <button type="button" class="generic-doc-reset-margin" id="genericDocResetMarginsBtn"><i class="bi bi-arrow-counterclockwise"></i> Reset</button>
      <small>หน่วย mm · อยู่ติดกับเอกสาร</small>
    </div>
    <div class="generic-doc-margin-grid">
      <label>บน <input id="genericDocMarginTop" type="number" min="0" max="60" step="1" value="18"></label>
      <label>ขวา <input id="genericDocMarginRight" type="number" min="0" max="60" step="1" value="16"></label>
      <label>ล่าง <input id="genericDocMarginBottom" type="number" min="0" max="60" step="1" value="18"></label>
      <label>ซ้าย <input id="genericDocMarginLeft" type="number" min="0" max="60" step="1" value="16"></label>
    </div>`;

  const shell = document.createElement('div');
  shell.className = 'generic-doc-editor-shell';
  shell.innerHTML = '<div class="generic-doc-ruler-corner"></div><div class="generic-doc-ruler-top"></div><div class="generic-doc-ruler-left"></div>';
  const pageWrap = document.createElement('div');
  pageWrap.className = 'generic-doc-editor-page-wrap';
  pageWrap.appendChild(editor);
  shell.appendChild(pageWrap);

  oldEditor.replaceWith(tools, shell);
  moveGenericDocToolbarBefore(tools);
  applyGenericDocMargins(shell);

  ['Top', 'Right', 'Bottom', 'Left'].forEach(side => {
    document.getElementById(`genericDocMargin${side}`)?.addEventListener('input', () => applyGenericDocMargins(shell));
  });
  document.getElementById('genericDocResetMarginsBtn')?.addEventListener('click', () => {
    Object.entries(GENERIC_DOC_DEFAULT_MARGINS).forEach(([side, value]) => {
      const input = document.getElementById(`genericDocMargin${side[0].toUpperCase()}${side.slice(1)}`);
      if (input) input.value = String(value);
    });
    applyGenericDocMargins(shell);
  });

  ['keyup', 'mouseup', 'touchend', 'focus', 'input'].forEach(evt => editor.addEventListener(evt, saveGenericDocSelection));
  editor.addEventListener('paste', event => {
    event.preventDefault();
    restoreGenericDocSelection();
    const html = event.clipboardData?.getData('text/html');
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertHTML', false, html || text.replace(/\n/g, '<br>'));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installGenericDocGridEditor, { once: true });
} else {
  installGenericDocGridEditor();
}

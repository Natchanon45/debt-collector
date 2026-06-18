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

/*
 * Generic Document Editor v2 bootstrap
 * - Disable TinyMCE so assets/js/app.js uses its built-in contenteditable fallback.
 * - Upgrade the fallback editor into an A4 grid editor with rulers and margin controls.
 */
try {
  window.tinymce = null;
  window.__DC_DISABLE_TINYMCE = true;
} catch (e) {
  console.warn('TinyMCE disable skipped', e);
}

const GENERIC_DOC_EDITOR_STYLE_ID = 'generic-doc-grid-editor-v2-style';
const GENERIC_DOC_DEFAULT_MARGINS = { top: 18, right: 16, bottom: 18, left: 16 };

function ensureGenericDocGridEditorStyle() {
  if (document.getElementById(GENERIC_DOC_EDITOR_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = GENERIC_DOC_EDITOR_STYLE_ID;
  style.textContent = `
    .generic-doc-page-tools{display:grid;gap:10px;margin:6px 0 12px;padding:12px;border:1px solid #dbeafe;border-radius:18px;background:linear-gradient(135deg,#f8fafc,#eff6ff)}
    .generic-doc-page-tools-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;color:#0f172a;font-weight:900}
    .generic-doc-page-tools-head small{color:#64748b;font-weight:700}
    .generic-doc-margin-grid{display:grid;grid-template-columns:repeat(4,minmax(96px,1fr));gap:8px}
    .generic-doc-margin-grid label{font-size:12px;font-weight:900;color:#334155;margin:0}
    .generic-doc-margin-grid input{width:100%;margin-top:4px;padding:9px 10px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;font-weight:800}
    .generic-doc-reset-margin{border:1px solid #bbf7d0;background:#fff;color:#15803d;border-radius:999px;padding:8px 12px;font-weight:900}
    .generic-doc-editor-shell{--gdoc-margin-top:18mm;--gdoc-margin-right:16mm;--gdoc-margin-bottom:18mm;--gdoc-margin-left:16mm;position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);grid-template-rows:28px auto;gap:0;max-width:100%;overflow:auto;padding:0 0 18px;background:#f1f5f9;border:1px solid #dbe4ef;border-radius:20px}
    .generic-doc-ruler-top{grid-column:2;grid-row:1;position:sticky;top:0;z-index:3;height:28px;background:#f8fafc;border-bottom:1px solid #cbd5e1;background-image:repeating-linear-gradient(90deg,#94a3b8 0 1px,transparent 1px 37.8px)}
    .generic-doc-ruler-left{grid-column:1;grid-row:2;position:sticky;left:0;z-index:2;width:34px;background:#f8fafc;border-right:1px solid #cbd5e1;background-image:repeating-linear-gradient(180deg,#94a3b8 0 1px,transparent 1px 37.8px)}
    .generic-doc-ruler-corner{grid-column:1;grid-row:1;position:sticky;left:0;top:0;z-index:4;background:#e2e8f0;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1}
    .generic-doc-editor-page-wrap{grid-column:2;grid-row:2;padding:18px;min-width:max-content}
    #genericDocEditor.generic-doc-editor-fallback{display:block;width:210mm;min-height:297mm;box-sizing:border-box;margin:0 auto;background:#fff;color:#111827;border:0;border-radius:2px;box-shadow:0 16px 46px rgba(15,23,42,.18);padding:var(--gdoc-margin-top) var(--gdoc-margin-right) var(--gdoc-margin-bottom) var(--gdoc-margin-left);font-family:'Sarabun','Noto Sans Thai',sans-serif;line-height:1.65;outline:none;overflow-wrap:break-word;background-image:linear-gradient(rgba(14,165,233,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(14,165,233,.08) 1px,transparent 1px);background-size:10mm 10mm,10mm 10mm;background-origin:content-box;background-clip:border-box}
    #genericDocEditor.generic-doc-editor-fallback:focus{box-shadow:0 0 0 3px rgba(22,163,74,.18),0 16px 46px rgba(15,23,42,.18)}
    #genericDocEditor.generic-doc-editor-fallback table{border-collapse:collapse;width:100%}
    #genericDocEditor.generic-doc-editor-fallback td,#genericDocEditor.generic-doc-editor-fallback th{border:1px solid #cbd5e1;padding:8px}
    #genericDocEditor.generic-doc-editor-fallback img{max-width:100%;height:auto}
    #genericDocEditor.generic-doc-editor-fallback hr{border:0;border-top:1px solid #cbd5e1;margin:18px 0}
    @media(max-width:760px){.generic-doc-margin-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.generic-doc-editor-shell{grid-template-columns:24px minmax(0,1fr);grid-template-rows:24px auto;border-radius:16px}.generic-doc-ruler-top{height:24px}.generic-doc-ruler-left{width:24px}.generic-doc-editor-page-wrap{padding:10px}#genericDocEditor.generic-doc-editor-fallback{width:210mm;min-height:297mm}}
  `;
  document.head.appendChild(style);
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

function installGenericDocGridEditor() {
  ensureGenericDocGridEditorStyle();
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
      <small>หน่วย mm · แก้ไขบน Grid ได้โดยตรง</small>
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

  editor.addEventListener('paste', event => {
    event.preventDefault();
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

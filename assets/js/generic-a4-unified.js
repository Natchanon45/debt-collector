// v10.0.1 Generic Document Unified Engine bridge
// Loaded from config.js. Keeps one A4 contract across editor, preview,
// signature designer, public signing and PDF export while the legacy app code
// is gradually migrated.
(function () {
    'use strict';

    const A4 = Object.freeze({
        widthPx: 794,
        heightPx: 1123,
        widthMm: 210,
        heightMm: 297,
        padTopPx: 68,
        padRightPx: 60,
        padBottomPx: 68,
        padLeftPx: 60,
        fontSizePx: 18,
        lineHeight: 1.45,
        fontFamily: "'TH Sarabun', 'TH Sarabun New', Sarabun, 'Noto Sans Thai', Tahoma, sans-serif"
    });

    window.GENERIC_A4_CONFIG = A4;

    function escapeAttr(value) {
        return String(value || '').replace(/[&<>"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[ch]));
    }

    function isDateText(value) {
        const text = String(value || '').trim();
        return /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(text) || /\d{4}-\d{1,2}-\d{1,2}/.test(text);
    }

    function classifyMetaLines(lines) {
        const result = { name: '', role: '', date: '' };
        const clean = (Array.isArray(lines) ? lines : []).map(x => String(x || '').trim()).filter(Boolean);
        result.date = clean.find(isDateText) || '';
        const nonDate = clean.filter(x => x !== result.date);
        result.name = nonDate[0] || '';
        result.role = nonDate[1] || '';
        return result;
    }

    const css = `
:root{
    --generic-a4-width:${A4.widthPx}px;
    --generic-a4-height:${A4.heightPx}px;
    --generic-a4-pad-top:${A4.padTopPx}px;
    --generic-a4-pad-right:${A4.padRightPx}px;
    --generic-a4-pad-bottom:${A4.padBottomPx}px;
    --generic-a4-pad-left:${A4.padLeftPx}px;
    --generic-a4-font-size:${A4.fontSizePx}px;
    --generic-a4-line-height:${A4.lineHeight};
}
.generic-doc-view-body,.generic-doc-a4-scroll,.generic-sign-designer-wrap,.public-sign-page #gPubBody > div > div:first-child{
    width:100%!important;max-width:100%!important;overflow:auto!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-x pan-y!important;background:#e5e7eb!important;
}
#genericDocEditor.generic-doc-editor-fallback,.generic-doc-view-paper,.generic-a4-page,.generic-sign-designer-paper,.generic-public-a4-page{
    width:var(--generic-a4-width)!important;min-width:var(--generic-a4-width)!important;max-width:var(--generic-a4-width)!important;height:var(--generic-a4-height)!important;min-height:var(--generic-a4-height)!important;max-height:var(--generic-a4-height)!important;box-sizing:border-box!important;margin:16px auto!important;background:#fff!important;color:#111827!important;position:relative!important;flex:0 0 auto!important;overflow:hidden!important;font-family:${A4.fontFamily}!important;line-height:var(--generic-a4-line-height)!important;
}
#genericDocEditor.generic-doc-editor-fallback,.generic-a4-content,.generic-a4-html,.generic-sign-designer-content,.generic-public-a4-page{
    box-sizing:border-box!important;font-family:${A4.fontFamily}!important;font-size:var(--generic-a4-font-size)!important;line-height:var(--generic-a4-line-height)!important;overflow:hidden!important;overflow-wrap:break-word!important;word-break:break-word!important;
}
#genericDocEditor.generic-doc-editor-fallback,.generic-a4-content,.generic-sign-designer-content,.generic-public-a4-page{
    padding:var(--generic-a4-pad-top) var(--generic-a4-pad-right) var(--generic-a4-pad-bottom) var(--generic-a4-pad-left)!important;
}
#genericDocEditor.generic-doc-editor-fallback:before,.generic-sign-designer-paper:before{
    content:'';position:absolute;left:var(--generic-a4-pad-left);right:var(--generic-a4-pad-right);top:var(--generic-a4-pad-top);bottom:var(--generic-a4-pad-bottom);border:1.5px dashed rgba(22,163,74,.45);border-radius:4px;pointer-events:none;z-index:9;
}
.generic-doc-view-paper:before,.generic-a4-page:before,.generic-public-a4-page:before{
    content:none!important;display:none!important;border:0!important;
}
.generic-sign-designer-layer,.generic-sign-layer,.generic-signature-layer{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;pointer-events:none;z-index:5!important;}
.generic-sign-designer-box,.generic-sign-item,.generic-signature-slot,.gdu-part{position:absolute!important;box-sizing:border-box!important;}
.generic-sign-designer-box{pointer-events:auto!important;}
.generic-signature-slot{border:0!important;background:transparent!important;box-shadow:none!important;}
.generic-signature-slot.gdu-split-done>img,.generic-signature-slot.gdu-split-done>.generic-signature-meta{display:none!important;}
.gdu-part{display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;line-height:1.08!important;overflow:hidden!important;color:#111827!important;}
.gdu-part-signature img{width:100%!important;height:100%!important;object-fit:contain!important;display:block!important;margin:0!important;}
.gdu-part-text{white-space:nowrap!important;font-weight:700!important;padding:0 2px!important;}
.generic-sign-designer-box.gdu-ready{outline:1.5px dashed rgba(22,163,74,.85)!important;background:rgba(22,163,74,.045)!important;}
.generic-sign-designer-box.gdu-ready .generic-sign-designer-real-preview{display:none!important;}
.gdu-designer-part{pointer-events:auto!important;border:1px dashed rgba(37,99,235,.45)!important;background:rgba(255,255,255,.72)!important;border-radius:6px!important;touch-action:none!important;}
.gdu-designer-part.gdu-selected{border-color:#f59e0b!important;box-shadow:0 0 0 3px rgba(245,158,11,.16)!important;}
.gdu-mobile-tools{position:sticky;bottom:8px;z-index:40;margin:8px auto;display:flex;gap:6px;justify-content:center;background:rgba(255,255,255,.94);border:1px solid #dbeafe;border-radius:999px;padding:6px;box-shadow:0 8px 22px rgba(15,23,42,.12);max-width:max-content;}
.gdu-mobile-tools button{width:36px!important;height:36px!important;min-width:36px!important;border-radius:999px!important;border:1px solid #cbd5e1!important;background:#fff!important;color:#15803d!important;display:grid!important;place-items:center!important;padding:0!important;}
.tox .tox-edit-area,.tox .tox-edit-area iframe{overflow:auto!important;-webkit-overflow-scrolling:touch!important;}
.tox .tox-edit-area iframe{min-width:calc(var(--generic-a4-width) + 160px)!important;}
.public-sign-page #gPubBody{padding:10px!important;}
.public-sign-page #gPubBody > div{gap:10px!important;}
.public-sign-card{padding:10px!important;transition:.18s ease;}
.public-sign-card .dc-sign-options-row{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important;margin:6px 0!important;}
.public-sign-card .dc-sign-options-row label{display:flex!important;align-items:center!important;gap:5px!important;margin:0!important;font-weight:800!important;white-space:nowrap!important;font-size:12px!important;}
.public-sign-card canvas{height:210px!important;display:block!important;}
.dc-sign-tools-under-canvas{display:flex!important;justify-content:center!important;align-items:center!important;gap:8px!important;margin-top:8px!important;}
.dc-sign-tool-btn{width:36px!important;height:36px!important;border-radius:999px!important;border:1px solid #cbd5e1!important;background:#fff!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;padding:0!important;color:#0f172a!important;}
.dc-sign-tool-btn.danger,.public-sign-card [data-clear].dc-sign-tool-btn{color:#dc2626!important;border-color:#fecaca!important;background:#fff5f5!important;}
.dc-sign-tool-btn[hidden]{display:none!important;}
@media (max-width:720px){.generic-doc-view-paper,.generic-a4-page,.generic-sign-designer-paper,.generic-public-a4-page{margin:10px!important}.public-sign-card canvas{height:230px!important}}
`;

    function installStyle() {
        if (document.getElementById('genericA4UnifiedStyle')) return;
        const style = document.createElement('style');
        style.id = 'genericA4UnifiedStyle';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function tinyContentStyle() {
        return `
@font-face{font-family:'TH Sarabun';src:url('../fonts/THSarabun.ttf') format('truetype');font-weight:400;font-style:normal;}
@font-face{font-family:'TH Sarabun';src:url('../fonts/THSarabun-Bold.ttf') format('truetype');font-weight:700;font-style:normal;}
html{background:#e5e7eb!important;min-width:${A4.widthPx + A4.padLeftPx + A4.padRightPx}px!important;overflow:auto!important;}
body{width:${A4.widthPx}px!important;min-width:${A4.widthPx}px!important;max-width:${A4.widthPx}px!important;min-height:${A4.heightPx}px!important;margin:16px auto!important;padding:${A4.padTopPx}px ${A4.padRightPx}px ${A4.padBottomPx}px ${A4.padLeftPx}px!important;box-sizing:border-box!important;background:#fff!important;color:#111827!important;font-family:${A4.fontFamily}!important;font-size:${A4.fontSizePx}px!important;line-height:${A4.lineHeight}!important;overflow:visible!important;}
body *{box-sizing:border-box;} table{max-width:100%;}
`;
    }

    function splitSignatureSlot(slot) {
        if (!slot || slot.classList.contains('gdu-split-done')) return;
        const img = slot.querySelector(':scope > img');
        if (!img || !img.getAttribute('src')) return;
        const meta = classifyMetaLines(Array.from(slot.querySelectorAll('.generic-signature-meta div')).map(x => x.textContent));
        slot.classList.add('gdu-split-done');
        const sig = document.createElement('div');
        sig.className = 'gdu-part gdu-part-signature';
        sig.style.cssText = 'left:0;top:0;width:100%;height:56%;';
        sig.innerHTML = `<img src="${escapeAttr(img.src)}" alt="signature">`;
        slot.appendChild(sig);
        const positions = { name:58, role:72, date:86 };
        ['name','role','date'].forEach(type => {
            if (!meta[type]) return;
            const part = document.createElement('div');
            part.className = `gdu-part gdu-part-text gdu-part-${type}`;
            part.textContent = meta[type];
            part.style.cssText = `left:0;top:${positions[type]}%;width:100%;height:13%;font-size:clamp(10px,var(--signature-meta-size,14px),28px);`;
            slot.appendChild(part);
        });
    }

    function enhanceDesignerBox(box) {
        if (!box || box.classList.contains('gdu-ready')) return;
        box.classList.add('gdu-ready');
        const preview = box.querySelector('.generic-sign-designer-real-preview');
        const img = preview?.querySelector('img');
        const meta = classifyMetaLines(Array.from(preview?.querySelectorAll('.generic-sign-designer-real-meta div') || []).map(x => x.textContent));
        const empty = preview?.querySelector('.generic-sign-designer-empty-img span')?.textContent || box.dataset.key || '';
        const make = (type, text, cssText) => {
            const p = document.createElement('div');
            p.className = `gdu-part gdu-designer-part gdu-part-${type}`;
            p.dataset.part = type;
            p.textContent = text || '';
            p.style.cssText = cssText;
            if (type === 'signature') {
                p.innerHTML = img?.src ? `<img src="${escapeAttr(img.src)}" alt="signature">` : `<span>${escapeAttr(empty)}</span>`;
                p.classList.add('gdu-part-signature');
            } else {
                p.classList.add('gdu-part-text');
            }
            wirePartDrag(p);
            box.appendChild(p);
        };
        make('signature', '', 'left:0;top:0;width:100%;height:55%;');
        if (meta.name) make('name', meta.name, 'left:0;top:58%;width:100%;height:13%;');
        if (meta.role) make('role', meta.role, 'left:0;top:72%;width:100%;height:13%;');
        if (meta.date) make('date', meta.date, 'left:0;top:86%;width:100%;height:13%;');
    }

    function wirePartDrag(part) {
        if (part.dataset.dragReady === '1') return;
        part.dataset.dragReady = '1';
        part.addEventListener('pointerdown', ev => {
            ev.stopPropagation();
            ev.preventDefault();
            document.querySelectorAll('.gdu-selected').forEach(x => x.classList.remove('gdu-selected'));
            part.classList.add('gdu-selected');
            const parent = part.parentElement;
            const rect = parent.getBoundingClientRect();
            const sx = ev.clientX, sy = ev.clientY;
            const sl = parseFloat(part.style.left || '0'), st = parseFloat(part.style.top || '0');
            const onMove = e => {
                const dx = ((e.clientX - sx) / rect.width) * 100;
                const dy = ((e.clientY - sy) / rect.height) * 100;
                const w = parseFloat(part.style.width || '20');
                const h = parseFloat(part.style.height || '10');
                part.style.left = `${Math.max(0, Math.min(100 - w, sl + dx))}%`;
                part.style.top = `${Math.max(0, Math.min(100 - h, st + dy))}%`;
            };
            const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp, { once:true });
        });
    }

    function normalizeA4Surfaces(root = document) {
        root.querySelectorAll('.generic-doc-view-body, .generic-sign-designer-wrap').forEach(el => el.classList.add('generic-doc-a4-scroll'));
        root.querySelectorAll('.generic-doc-view-paper, .generic-a4-page, .generic-sign-designer-paper').forEach(el => {
            el.style.width = `${A4.widthPx}px`;
            el.style.minWidth = `${A4.widthPx}px`;
            el.style.maxWidth = `${A4.widthPx}px`;
            el.style.height = `${A4.heightPx}px`;
            el.style.minHeight = `${A4.heightPx}px`;
            el.style.position = 'relative';
            el.style.boxSizing = 'border-box';
        });
        root.querySelectorAll('.generic-a4-content, .generic-sign-designer-content').forEach(el => {
            el.style.fontFamily = A4.fontFamily;
            el.style.lineHeight = String(A4.lineHeight);
            if (!el.style.fontSize) el.style.fontSize = `${A4.fontSizePx}px`;
        });
        root.querySelectorAll('.generic-signature-slot').forEach(splitSignatureSlot);
        root.querySelectorAll('.generic-sign-designer-box').forEach(enhanceDesignerBox);

        const pubPreview = root.querySelector('.public-sign-page #gPubBody > div > div:first-child > div');
        if (pubPreview) {
            pubPreview.classList.add('generic-public-a4-page');
            pubPreview.style.width = `${A4.widthPx}px`;
            pubPreview.style.maxWidth = 'none';
            pubPreview.style.height = `${A4.heightPx}px`;
            pubPreview.style.minHeight = `${A4.heightPx}px`;
            pubPreview.style.padding = `${A4.padTopPx}px ${A4.padRightPx}px ${A4.padBottomPx}px ${A4.padLeftPx}px`;
            pubPreview.style.fontFamily = A4.fontFamily;
            pubPreview.style.lineHeight = String(A4.lineHeight);
        }
    }

    function injectTinyMceA4() {
        document.querySelectorAll('iframe.tox-edit-area__iframe').forEach(frame => {
            try {
                const doc = frame.contentDocument;
                if (!doc || doc.getElementById('genericA4TinyContentStyle')) return;
                const style = doc.createElement('style');
                style.id = 'genericA4TinyContentStyle';
                style.textContent = tinyContentStyle();
                doc.head.appendChild(style);
                doc.documentElement.style.minWidth = `${A4.widthPx + A4.padLeftPx + A4.padRightPx}px`;
            } catch (e) { console.warn('TinyMCE A4 style injection skipped', e); }
        });
    }

    function dataUrlOf(canvas) { try { return canvas.toDataURL('image/png'); } catch { return ''; } }
    function restoreCanvas(canvas, dataUrl) {
        if (!canvas || !dataUrl) return;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
        img.src = dataUrl;
    }

    function compactPublicSignControls(root = document) {
        root.querySelectorAll('.public-sign-card').forEach(card => {
            if (card.dataset.a4UxReady === '1') return;
            const canvas = card.querySelector('canvas');
            const clearBtn = card.querySelector('[data-clear]');
            if (!canvas || !clearBtn) return;
            card.dataset.a4UxReady = '1';
            const labels = Array.from(card.querySelectorAll('label')).filter(label => label.querySelector('input[type="checkbox"]'));
            if (labels.length) {
                const row = document.createElement('div');
                row.className = 'dc-sign-options-row';
                labels[0].before(row);
                labels.forEach(label => {
                    label.innerHTML = label.innerHTML.replace('แสดงชื่อ', 'ชื่อ').replace('แสดงบทบาท', 'บทบาท').replace('แสดงวันที่', 'วันที่');
                    row.appendChild(label);
                });
            }
            const tools = document.createElement('div');
            tools.className = 'dc-sign-tools-under-canvas';
            const undoBtn = document.createElement('button');
            undoBtn.type = 'button'; undoBtn.className = 'dc-sign-tool-btn'; undoBtn.title = 'ย้อนกลับ'; undoBtn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i>'; undoBtn.hidden = true;
            const redoBtn = document.createElement('button');
            redoBtn.type = 'button'; redoBtn.className = 'dc-sign-tool-btn'; redoBtn.title = 'ทำซ้ำ'; redoBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i>'; redoBtn.hidden = true;
            clearBtn.classList.add('dc-sign-tool-btn', 'danger'); clearBtn.title = 'ล้างลายเซ็น'; clearBtn.innerHTML = '<i class="bi bi-eraser"></i>';
            tools.append(undoBtn, redoBtn, clearBtn); canvas.after(tools);
            const state = { before: '', undo: [], redo: [] };
            const sync = () => { undoBtn.hidden = state.undo.length === 0; redoBtn.hidden = state.redo.length === 0; };
            canvas.addEventListener('pointerdown', () => { state.before = dataUrlOf(canvas); }, true);
            canvas.addEventListener('pointerup', () => { const after = dataUrlOf(canvas); if (state.before && state.before !== after) { state.undo.push(state.before); state.redo = []; } sync(); }, true);
            clearBtn.addEventListener('click', () => { const before = dataUrlOf(canvas); if (before) state.undo.push(before); state.redo = []; setTimeout(sync, 0); }, true);
            undoBtn.addEventListener('click', () => { if (!state.undo.length) return; state.redo.push(dataUrlOf(canvas)); restoreCanvas(canvas, state.undo.pop()); sync(); });
            redoBtn.addEventListener('click', () => { if (!state.redo.length) return; state.undo.push(dataUrlOf(canvas)); restoreCanvas(canvas, state.redo.pop()); sync(); });
            sync();
        });
    }

    function installDesignerTools() {
        if (document.getElementById('gduMobileTools')) return;
        const wrap = document.querySelector('.generic-sign-designer-wrap');
        if (!wrap) return;
        const tools = document.createElement('div');
        tools.id = 'gduMobileTools'; tools.className = 'gdu-mobile-tools';
        tools.innerHTML = '<button type="button" data-n="up">↑</button><button type="button" data-n="left">←</button><button type="button" data-n="right">→</button><button type="button" data-n="down">↓</button><button type="button" data-n="smaller">A-</button><button type="button" data-n="bigger">A+</button>';
        wrap.after(tools);
        tools.addEventListener('click', ev => {
            const btn = ev.target.closest('button'); if (!btn) return;
            const obj = document.querySelector('.gdu-selected'); if (!obj) return;
            const step = 1;
            const left = parseFloat(obj.style.left || '0'), top = parseFloat(obj.style.top || '0'), width = parseFloat(obj.style.width || '20'), height = parseFloat(obj.style.height || '10');
            const act = btn.dataset.n;
            if (act === 'left') obj.style.left = `${Math.max(0, left - step)}%`;
            if (act === 'right') obj.style.left = `${Math.min(100 - width, left + step)}%`;
            if (act === 'up') obj.style.top = `${Math.max(0, top - step)}%`;
            if (act === 'down') obj.style.top = `${Math.min(100 - height, top + step)}%`;
            if (act === 'smaller') obj.style.fontSize = `${Math.max(8, (parseFloat(getComputedStyle(obj).fontSize) || 14) - 1)}px`;
            if (act === 'bigger') obj.style.fontSize = `${Math.min(72, (parseFloat(getComputedStyle(obj).fontSize) || 14) + 1)}px`;
        });
    }

    function patchWindowFunctions() {
        if (window.__genericA4FunctionPatchReady) return;
        if (typeof window.viewGenericDocument !== 'function' || typeof window.exportGenericDocumentPdf !== 'function') return;
        window.__genericA4FunctionPatchReady = true;
        const originalView = window.viewGenericDocument;
        window.viewGenericDocument = function patchedViewGenericDocument(...args) {
            const result = originalView.apply(this, args);
            requestAnimationFrame(() => normalizeA4Surfaces(document));
            return result;
        };
        const originalExport = window.exportGenericDocumentPdf;
        window.exportGenericDocumentPdf = async function patchedExportGenericDocumentPdf(...args) {
            normalizeA4Surfaces(document);
            const result = await originalExport.apply(this, args);
            normalizeA4Surfaces(document);
            return result;
        };
        if (typeof window.openGenericSignatureDesigner === 'function') {
            const originalDesigner = window.openGenericSignatureDesigner;
            window.openGenericSignatureDesigner = async function patchedOpenGenericSignatureDesigner(...args) {
                const timer = setInterval(() => { normalizeA4Surfaces(document); installDesignerTools(); }, 80);
                try { return await originalDesigner.apply(this, args); }
                finally { clearInterval(timer); setTimeout(() => { normalizeA4Surfaces(document); installDesignerTools(); }, 50); }
            };
        }
    }

    function boot() {
        installStyle(); normalizeA4Surfaces(document); injectTinyMceA4(); compactPublicSignControls(document); installDesignerTools(); patchWindowFunctions();
    }
    window.GenericDocumentUnifiedEngine = { A4, normalizeA4Surfaces, splitSignatureSlot, enhanceDesignerBox, classifyMetaLines };
    const observer = new MutationObserver(() => boot());
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { boot(); observer.observe(document.documentElement, { childList: true, subtree: true }); setInterval(boot, 800); });
    } else { boot(); observer.observe(document.documentElement, { childList: true, subtree: true }); setInterval(boot, 800); }
})();

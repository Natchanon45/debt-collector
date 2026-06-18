// v9.9.3 Generic Document A4 renderer + public signing UX patch
// This file is loaded as a side-effect from config.js so it can normalize
// Create/Edit, Preview, Sign Designer, Public Sign, and PDF Export surfaces.
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
        lineHeight: 1.65,
        fontFamily: "'TH Sarabun', 'TH Sarabun New', Sarabun, 'Noto Sans Thai', Tahoma, sans-serif"
    });

    window.GENERIC_A4_CONFIG = A4;

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
.generic-doc-view-body,
.generic-doc-a4-scroll,
.generic-sign-designer-wrap,
.public-sign-page #gPubBody > div > div:first-child{
    width:100%!important;
    max-width:100%!important;
    overflow:auto!important;
    -webkit-overflow-scrolling:touch!important;
    touch-action:pan-x pan-y!important;
    background:#e5e7eb!important;
}
.generic-doc-view-paper,
.generic-a4-page,
.generic-sign-designer-paper,
.generic-public-a4-page{
    width:var(--generic-a4-width)!important;
    min-width:var(--generic-a4-width)!important;
    max-width:var(--generic-a4-width)!important;
    min-height:var(--generic-a4-height)!important;
    box-sizing:border-box!important;
    margin:16px auto!important;
    background:#fff!important;
    color:#111827!important;
    position:relative!important;
    flex:0 0 auto!important;
    overflow:visible!important;
}
.generic-a4-content,
.generic-a4-html,
.generic-sign-designer-content,
.generic-public-a4-page{
    font-family:${A4.fontFamily}!important;
    font-size:var(--generic-a4-font-size)!important;
    line-height:var(--generic-a4-line-height)!important;
    box-sizing:border-box!important;
}
.generic-a4-content{
    width:100%!important;
    min-height:var(--generic-a4-height)!important;
    padding:var(--generic-a4-pad-top) var(--generic-a4-pad-right) var(--generic-a4-pad-bottom) var(--generic-a4-pad-left)!important;
    position:relative!important;
}
.generic-a4-page > .generic-a4-content,
.generic-doc-view-paper > .generic-a4-content{
    padding:var(--generic-a4-pad-top) var(--generic-a4-pad-right) var(--generic-a4-pad-bottom) var(--generic-a4-pad-left)!important;
}
.generic-sign-designer-content{
    width:100%!important;
    min-height:100%!important;
    padding:var(--generic-a4-pad-top) var(--generic-a4-pad-right) var(--generic-a4-pad-bottom) var(--generic-a4-pad-left)!important;
    background:#fff!important;
}
.generic-sign-designer-layer,
.generic-sign-layer{
    position:absolute!important;
    inset:0!important;
    pointer-events:none;
}
.generic-sign-designer-box,
.generic-sign-item{
    position:absolute!important;
    box-sizing:border-box!important;
}
.generic-sign-designer-box{
    pointer-events:auto!important;
}
.tox .tox-edit-area,
.tox .tox-edit-area iframe{
    overflow:auto!important;
    -webkit-overflow-scrolling:touch!important;
}
.tox .tox-edit-area iframe{
    min-width:calc(var(--generic-a4-width) + 160px)!important;
}
.public-sign-page #gPubBody{
    padding:10px!important;
}
.public-sign-page #gPubBody > div{
    gap:10px!important;
}
.public-sign-card{
    padding:10px!important;
}
.public-sign-card .dc-sign-options-row{
    display:grid!important;
    grid-template-columns:repeat(3,minmax(0,1fr))!important;
    gap:6px!important;
    margin:6px 0!important;
}
.public-sign-card .dc-sign-options-row label{
    display:flex!important;
    align-items:center!important;
    gap:5px!important;
    margin:0!important;
    font-weight:800!important;
    white-space:nowrap!important;
    font-size:12px!important;
}
.public-sign-card canvas{
    height:210px!important;
    display:block!important;
}
.dc-sign-tools-under-canvas{
    display:flex!important;
    justify-content:center!important;
    align-items:center!important;
    gap:8px!important;
    margin-top:8px!important;
}
.dc-sign-tool-btn{
    width:36px!important;
    height:36px!important;
    border-radius:999px!important;
    border:1px solid #cbd5e1!important;
    background:#fff!important;
    display:inline-flex!important;
    align-items:center!important;
    justify-content:center!important;
    padding:0!important;
    color:#0f172a!important;
}
.dc-sign-tool-btn.danger,
.public-sign-card [data-clear].dc-sign-tool-btn{
    color:#dc2626!important;
    border-color:#fecaca!important;
    background:#fff5f5!important;
}
.dc-sign-tool-btn[hidden]{display:none!important;}
@media (max-width: 720px){
    .generic-doc-view-paper,
    .generic-a4-page,
    .generic-sign-designer-paper,
    .generic-public-a4-page{
        margin:10px!important;
    }
    .public-sign-card canvas{height:230px!important;}
}
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
body{
    width:${A4.widthPx}px!important;
    min-width:${A4.widthPx}px!important;
    max-width:${A4.widthPx}px!important;
    min-height:${A4.heightPx}px!important;
    margin:16px auto!important;
    padding:${A4.padTopPx}px ${A4.padRightPx}px ${A4.padBottomPx}px ${A4.padLeftPx}px!important;
    box-sizing:border-box!important;
    background:#fff!important;
    color:#111827!important;
    font-family:${A4.fontFamily}!important;
    font-size:${A4.fontSizePx}px!important;
    line-height:${A4.lineHeight}!important;
    overflow:visible!important;
}
body *{box-sizing:border-box;}
table{max-width:100%;}
`;
    }

    function normalizeA4Surfaces(root = document) {
        root.querySelectorAll('.generic-doc-view-body, .generic-sign-designer-wrap').forEach(el => {
            el.classList.add('generic-doc-a4-scroll');
        });
        root.querySelectorAll('.generic-doc-view-paper, .generic-a4-page, .generic-sign-designer-paper').forEach(el => {
            el.style.width = `${A4.widthPx}px`;
            el.style.minWidth = `${A4.widthPx}px`;
            el.style.maxWidth = `${A4.widthPx}px`;
            el.style.minHeight = `${A4.heightPx}px`;
            el.style.position = 'relative';
            el.style.boxSizing = 'border-box';
        });
        root.querySelectorAll('.generic-a4-content, .generic-sign-designer-content').forEach(el => {
            el.style.fontFamily = A4.fontFamily;
            el.style.lineHeight = String(A4.lineHeight);
            if (!el.style.fontSize) el.style.fontSize = `${A4.fontSizePx}px`;
        });

        // Public sign preview is generated with inline styles and no stable class.
        const pubPreview = root.querySelector('.public-sign-page #gPubBody > div > div:first-child > div');
        if (pubPreview) {
            pubPreview.classList.add('generic-public-a4-page');
            pubPreview.style.width = `${A4.widthPx}px`;
            pubPreview.style.maxWidth = 'none';
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
            } catch (e) {
                console.warn('TinyMCE A4 style injection skipped', e);
            }
        });
    }

    function dataUrlOf(canvas) {
        try { return canvas.toDataURL('image/png'); } catch { return ''; }
    }
    function restoreCanvas(canvas, dataUrl) {
        if (!canvas || !dataUrl) return;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = dataUrl;
    }

    function compactPublicSignControls(root = document) {
        root.querySelectorAll('.public-sign-card').forEach(card => {
            if (card.dataset.a4UxReady === '1') return;
            const canvas = card.querySelector('canvas');
            const clearBtn = card.querySelector('[data-clear]');
            if (!canvas || !clearBtn) return;
            card.dataset.a4UxReady = '1';

            // Compact checkbox labels into one row.
            const labels = Array.from(card.querySelectorAll('label')).filter(label => label.querySelector('input[type="checkbox"]'));
            if (labels.length) {
                const row = document.createElement('div');
                row.className = 'dc-sign-options-row';
                labels[0].before(row);
                labels.forEach(label => {
                    label.innerHTML = label.innerHTML
                        .replace('แสดงชื่อ', 'ชื่อ')
                        .replace('แสดงบทบาท', 'บทบาท')
                        .replace('แสดงวันที่', 'วันที่');
                    row.appendChild(label);
                });
            }

            const tools = document.createElement('div');
            tools.className = 'dc-sign-tools-under-canvas';
            const undoBtn = document.createElement('button');
            undoBtn.type = 'button';
            undoBtn.className = 'dc-sign-tool-btn';
            undoBtn.title = 'ย้อนกลับ';
            undoBtn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i>';
            undoBtn.hidden = true;
            const redoBtn = document.createElement('button');
            redoBtn.type = 'button';
            redoBtn.className = 'dc-sign-tool-btn';
            redoBtn.title = 'ทำซ้ำ';
            redoBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
            redoBtn.hidden = true;
            clearBtn.classList.add('dc-sign-tool-btn', 'danger');
            clearBtn.title = 'ล้างลายเซ็น';
            clearBtn.innerHTML = '<i class="bi bi-eraser"></i>';
            tools.append(undoBtn, redoBtn, clearBtn);
            canvas.after(tools);

            const state = { before: '', undo: [], redo: [] };
            const sync = () => {
                undoBtn.hidden = state.undo.length === 0;
                redoBtn.hidden = state.redo.length === 0;
            };
            canvas.addEventListener('pointerdown', () => { state.before = dataUrlOf(canvas); }, true);
            canvas.addEventListener('pointerup', () => {
                const after = dataUrlOf(canvas);
                if (state.before && state.before !== after) {
                    state.undo.push(state.before);
                    state.redo = [];
                }
                sync();
            }, true);
            clearBtn.addEventListener('click', () => {
                const before = dataUrlOf(canvas);
                if (before) state.undo.push(before);
                state.redo = [];
                setTimeout(sync, 0);
            }, true);
            undoBtn.addEventListener('click', () => {
                if (!state.undo.length) return;
                state.redo.push(dataUrlOf(canvas));
                restoreCanvas(canvas, state.undo.pop());
                sync();
            });
            redoBtn.addEventListener('click', () => {
                if (!state.redo.length) return;
                state.undo.push(dataUrlOf(canvas));
                restoreCanvas(canvas, state.redo.pop());
                sync();
            });
            sync();
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
                const tick = setInterval(() => {
                    normalizeA4Surfaces(document);
                    const paper = document.getElementById('genericSignatureDesignerPaper');
                    if (paper) {
                        paper.style.width = `${A4.widthPx}px`;
                        paper.style.minHeight = `${A4.heightPx}px`;
                    }
                }, 80);
                try { return await originalDesigner.apply(this, args); }
                finally { clearInterval(tick); }
            };
        }
    }

    function boot() {
        installStyle();
        normalizeA4Surfaces(document);
        injectTinyMceA4();
        compactPublicSignControls(document);
        patchWindowFunctions();
    }

    const observer = new MutationObserver(() => {
        boot();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            boot();
            observer.observe(document.documentElement, { childList: true, subtree: true });
            setInterval(boot, 800);
        });
    } else {
        boot();
        observer.observe(document.documentElement, { childList: true, subtree: true });
        setInterval(boot, 800);
    }
})();

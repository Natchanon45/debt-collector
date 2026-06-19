/* Generic Document Unified Engine Bridge
 * Phase 1-2: normalize the A4 surface and split signature visual objects
 * without breaking existing saved data. The existing app still owns storage;
 * this bridge makes Editor / Preview / Sign / PDF DOM follow one contract.
 */
(function(){
  const PAGE = { w:210, h:297, mt:18, mr:16, mb:18, ml:16, line:1.45 };
  const signerLabels = { party1:'คู่สัญญาฝ่ายที่ 1', party2:'คู่สัญญาฝ่ายที่ 2', witness1:'พยาน 1', witness2:'พยาน 2' };
  function css(){
    if(document.getElementById('gdu-style')) return;
    const s=document.createElement('style');
    s.id='gdu-style';
    s.textContent=`
      :root{--gdu-w:${PAGE.w}mm;--gdu-h:${PAGE.h}mm;--gdu-mt:${PAGE.mt}mm;--gdu-mr:${PAGE.mr}mm;--gdu-mb:${PAGE.mb}mm;--gdu-ml:${PAGE.ml}mm;--gdu-line:${PAGE.line}}
      .gdu-page,#genericDocEditor.generic-doc-editor-fallback,.generic-a4-page,.generic-a4-content,.generic-sign-designer-paper{width:var(--gdu-w)!important;height:var(--gdu-h)!important;min-width:var(--gdu-w)!important;min-height:var(--gdu-h)!important;max-width:var(--gdu-w)!important;max-height:var(--gdu-h)!important;box-sizing:border-box!important;background:#fff!important;color:#111827!important;position:relative!important;overflow:hidden!important;font-family:'Sarabun','Noto Sans Thai',sans-serif!important;line-height:var(--gdu-line)!important;}
      #genericDocEditor.generic-doc-editor-fallback,.gdu-content,.generic-a4-html,.generic-sign-designer-content{padding:var(--gdu-mt) var(--gdu-mr) var(--gdu-mb) var(--gdu-ml)!important;box-sizing:border-box!important;overflow:hidden!important;overflow-wrap:break-word!important;word-break:break-word!important;}
      #genericDocEditor.generic-doc-editor-fallback:before,.gdu-page:before,.generic-a4-content:before,.generic-sign-designer-paper:before{content:'';position:absolute;inset:var(--gdu-mt) var(--gdu-mr) var(--gdu-mb) var(--gdu-ml);border:1.5px dashed rgba(22,163,74,.45);border-radius:4px;pointer-events:none;z-index:9;}
      .generic-signature-layer,.generic-sign-designer-layer,.gdu-sign-layer{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;z-index:4!important;pointer-events:none!important;}
      .generic-signature-slot,.generic-sign-designer-box,.gdu-obj{position:absolute!important;box-sizing:border-box!important;}
      .generic-signature-slot{border:0!important;background:transparent!important;box-shadow:none!important;}
      .gdu-obj{display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;line-height:1.08!important;color:#111827!important;overflow:hidden!important;pointer-events:auto!important;}
      .gdu-obj-signature img{width:100%!important;height:100%!important;object-fit:contain!important;display:block!important;margin:0!important;}
      .gdu-obj-text{font-weight:700!important;white-space:nowrap!important;padding:0 2px!important;}
      .generic-signature-slot.gdu-split-done>img,.generic-signature-slot.gdu-split-done>.generic-signature-meta{display:none!important;}
      .generic-sign-designer-box.gdu-selectable{outline:1.5px dashed rgba(22,163,74,.8)!important;background:rgba(22,163,74,.045)!important;}
      .gdu-mobile-tools{position:sticky;bottom:8px;z-index:40;margin:8px auto;display:flex;gap:6px;justify-content:center;background:rgba(255,255,255,.94);border:1px solid #dbeafe;border-radius:999px;padding:6px;box-shadow:0 8px 22px rgba(15,23,42,.12);max-width:max-content;}
      .gdu-mobile-tools button{width:36px!important;height:36px!important;min-width:36px!important;border-radius:999px!important;border:1px solid #cbd5e1!important;background:#fff!important;color:#15803d!important;display:grid!important;place-items:center!important;padding:0!important;}
      .public-sign-card{transition:.18s ease}.public-sign-card.gdu-card-collapsed canvas,.public-sign-card.gdu-card-collapsed input:not([type=checkbox]){display:none!important}.public-sign-card.gdu-card-collapsed{padding:8px!important}.public-sign-card>div:first-child{cursor:pointer!important;}
      @media(max-width:860px){.public-sign-page{padding:8px!important}.public-sign-page #gPubBody>div>div:first-child{height:58vh!important;overflow:auto!important}.public-sign-card canvas{height:190px!important}}
    `;
    document.head.appendChild(s);
  }
  function esc(v){return String(v||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
  function splitSignatureSlot(slot){
    if(!slot || slot.classList.contains('gdu-split-done')) return;
    const img=slot.querySelector(':scope > img');
    if(!img || !img.getAttribute('src')) return;
    const meta=[...slot.querySelectorAll('.generic-signature-meta div')].map(x=>x.textContent.trim()).filter(Boolean);
    slot.classList.add('gdu-split-done');
    const sig=document.createElement('div'); sig.className='gdu-obj gdu-obj-signature'; sig.style.cssText='left:0;top:0;width:100%;height:56%;'; sig.innerHTML=`<img src="${esc(img.src)}" alt="signature">`; slot.appendChild(sig);
    const types=['name','role','date'];
    meta.slice(0,3).forEach((txt,i)=>{ const d=document.createElement('div'); d.className=`gdu-obj gdu-obj-text gdu-obj-${types[i]}`; d.textContent=txt; d.style.cssText=`left:0;top:${58+i*14}%;width:100%;height:13%;font-size:clamp(10px,var(--signature-meta-size,14px),28px);`; slot.appendChild(d); });
  }
  function normalizeA4(root=document){
    css();
    root.querySelectorAll('.generic-a4-page,.generic-a4-content,.generic-sign-designer-paper,#genericDocEditor').forEach(el=>el.classList.add('gdu-page'));
    root.querySelectorAll('.generic-signature-slot').forEach(splitSignatureSlot);
    root.querySelectorAll('.generic-sign-designer-box').forEach(box=>box.classList.add('gdu-selectable'));
    compactPublicSign(root);
  }
  function compactPublicSign(root=document){
    root.querySelectorAll('.public-sign-card').forEach(card=>{
      if(card.dataset.gduReady==='1') return; card.dataset.gduReady='1';
      const head=card.querySelector(':scope > div:first-child');
      if(head) head.addEventListener('click',e=>{ if(e.target.closest('button,input')) return; card.classList.toggle('gdu-card-collapsed'); });
    });
  }
  function installTools(){
    if(document.getElementById('gduMobileTools')) return;
    const target=document.querySelector('#gPubBody')||document.querySelector('#genericSignatureDesignerPaper')?.parentElement;
    if(!target) return;
    const bar=document.createElement('div'); bar.id='gduMobileTools'; bar.className='gdu-mobile-tools';
    bar.innerHTML='<button type="button" data-gdu="up">↑</button><button type="button" data-gdu="left">←</button><button type="button" data-gdu="right">→</button><button type="button" data-gdu="down">↓</button><button type="button" data-gdu="smaller">A-</button><button type="button" data-gdu="bigger">A+</button>';
    target.appendChild(bar);
  }
  function boot(){ css(); normalizeA4(); installTools(); new MutationObserver(m=>m.forEach(x=>x.addedNodes.forEach(n=>{if(n.nodeType===1){normalizeA4(n);installTools();}}))).observe(document.documentElement,{childList:true,subtree:true}); }
  window.GenericDocUnifiedEngine={PAGE,signerLabels,normalizeA4,splitSignatureSlot};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();

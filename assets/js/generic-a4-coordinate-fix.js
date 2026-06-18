// v9.9.4: coordinate/frame fix for generic document signature layer
(function(){
  const A4={w:794,h:1123};
  window.A4Engine={widthPx:A4.w,heightPx:A4.h,percentToPx(v,axis='x'){return (Number(v||0)/100)*(axis==='y'||axis==='height'?A4.h:A4.w)}};
  const css=`
.generic-signature-layer,.generic-sign-designer-layer{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;pointer-events:none!important;box-sizing:border-box!important;z-index:20!important}
.generic-signature-slot,.generic-sign-designer-box{position:absolute!important;box-sizing:border-box!important;overflow:visible!important}
.generic-signature-slot{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:flex-start!important;text-align:center!important}
.generic-signature-slot img,.generic-sign-designer-real-img{display:block!important;width:100%!important;height:58%!important;max-width:100%!important;object-fit:contain!important;object-position:center bottom!important}
.generic-signature-meta,.generic-sign-designer-real-meta{width:100%!important;text-align:center!important;line-height:1.18!important;font-family:'TH Sarabun','TH Sarabun New',Sarabun,'Noto Sans Thai',Tahoma,sans-serif!important;font-size:var(--signature-meta-size,18px)!important;color:#111827!important;white-space:normal!important;overflow:visible!important}
.generic-sign-designer-coord-badge{position:absolute!important;left:50%!important;bottom:-24px!important;transform:translateX(-50%)!important;background:#0f172a!important;color:#fff!important;border-radius:999px!important;padding:4px 8px!important;font-size:11px!important;line-height:1!important;white-space:nowrap!important}
.tox .tox-edit-area iframe{min-width:954px!important}.public-sign-card canvas{height:245px!important}.public-sign-card .dc-sign-options-row label{font-size:12px!important;padding:7px 8px!important;border-radius:999px!important;background:#eef4ff!important}.dc-sign-tools-under-canvas{margin-top:8px!important}`;
  function install(){let s=document.getElementById('genericA4CoordinateFixStyle');if(!s){s=document.createElement('style');s.id='genericA4CoordinateFixStyle';document.head.appendChild(s)}s.textContent=css}
  const n=v=>Number(String(v||'').replace('%',''))||0;
  function updateBadge(box){const x=Math.round(window.A4Engine.percentToPx(n(box.style.left),'x'));const y=Math.round(window.A4Engine.percentToPx(n(box.style.top),'y'));const w=Math.round(window.A4Engine.percentToPx(n(box.style.width),'width'));const h=Math.round(window.A4Engine.percentToPx(n(box.style.height),'height'));box.dataset.xPx=x;box.dataset.yPx=y;box.dataset.wPx=w;box.dataset.hPx=h;const b=box.querySelector('.generic-sign-designer-coord-badge');if(b)b.textContent=`X:${x} Y:${y} W:${w} H:${h}`}
  function boot(){install();document.querySelectorAll('.generic-signature-layer,.generic-sign-designer-layer').forEach(e=>{e.style.position='absolute';e.style.inset='0';e.style.width='100%';e.style.height='100%'});document.querySelectorAll('.generic-signature-slot,.generic-sign-designer-box').forEach(updateBadge)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{boot();new MutationObserver(boot).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});setInterval(boot,700)});else{boot();new MutationObserver(boot).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});setInterval(boot,700)}
})();

const APP_VERSION='7.5.0';
const CACHE_NAME='debt-collector-v'+APP_VERSION;
const ASSETS=['./','./index.html','./manifest.json','./assets/css/style.css','./assets/js/app.js','./assets/js/firebase-config.js','./assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/img/loan-contract-template-a4.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>/^debt-collector/i.test(k)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting(); if(e.data&&e.data.type==='CLEAR_CACHES')e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>/^debt-collector/i.test(k)).map(k=>caches.delete(k)))))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const req=e.request;
  const url=new URL(req.url);
  if(req.mode==='navigate'||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/assets/js/app.js')||url.pathname.endsWith('/assets/css/style.css')||url.pathname.endsWith('/service-worker.js')){
    e.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));return res}).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(c=>c||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE_NAME).then(cache=>cache.put(req,copy));return res}).catch(()=>caches.match('./index.html'))));
});
self.addEventListener('push',e=>{const d=e.data?e.data.json():{title:'Debt Collector',body:'มีรายการต้องติดตาม'};e.waitUntil(self.registration.showNotification(d.title||'Debt Collector',{body:d.body||'มีรายการต้องติดตาม',icon:'assets/icons/icon-192.png',badge:'assets/icons/icon-192.png'}))});

const APP_VERSION = '9.0.5';
const CACHE_NAME = 'debt-collector-v9.0.5';
const ASSETS = ['./', './index.html', './manifest.json', './assets/css/style.css', './assets/css/navigation.css', './assets/css/followup.css', './assets/css/ui-hotfix.css', './assets/js/app.js', './assets/js/config.js', './assets/js/utils.js', './assets/js/calculate.js', './assets/js/theme.js', './assets/js/firebase-config.js', './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/img/loan-contract-template-a4.png'];

const isHttp = url => url.protocol === 'http:' || url.protocol === 'https:';
const isSameOrigin = url => url.origin === self.location.origin;
const isFirebaseStorage = url => url.hostname === 'firebasestorage.googleapis.com' || url.hostname.endsWith('.firebasestorage.app');
const canCacheResponse = res => res && res.ok && (res.type === 'basic' || res.type === 'cors');

self.addEventListener('install', e => e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
));

self.addEventListener('activate', e => e.waitUntil(
    caches.keys()
        .then(keys => Promise.all(keys.filter(k => /^debt-collector/i.test(k) && k !== CACHE_NAME).map(k => caches.delete(k))))
        .then(() => self.clients.claim())
));

self.addEventListener('message', e => {
    if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
    if (e.data && e.data.type === 'CLEAR_CACHES') {
        e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => /^debt-collector/i.test(k)).map(k => caches.delete(k)))));
    }
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const req = e.request;
    const url = new URL(req.url);

    // Do not touch chrome-extension:, data:, blob:, Firebase Storage download URLs, or any unsupported schemes.
    if (!isHttp(url) || isFirebaseStorage(url)) return;

    // External CDN requests are network-only. This prevents cache.put errors on opaque/unsupported responses.
    if (!isSameOrigin(url)) {
        e.respondWith(fetch(req));
        return;
    }

    const isFreshFirst = req.mode === 'navigate' ||
        url.pathname.endsWith('/index.html') ||
        url.pathname.includes('/assets/js/') ||
        url.pathname.includes('/assets/css/') ||
        url.pathname.endsWith('/service-worker.js');

    if (isFreshFirst) {
        e.respondWith(
            fetch(req).then(res => {
                if (canCacheResponse(res)) {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => { });
                }
                return res;
            }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
        );
        return;
    }

    e.respondWith(
        caches.match(req).then(c => c || fetch(req).then(res => {
            if (canCacheResponse(res)) {
                const copy = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => { });
            }
            return res;
        }).catch(() => caches.match('./index.html')))
    );
});

self.addEventListener('push', e => {
    const d = e.data ? e.data.json() : { title: 'Debt Collector', body: 'มีรายการต้องติดตาม' };
    e.waitUntil(self.registration.showNotification(d.title || 'Debt Collector', {
        body: d.body || 'มีรายการต้องติดตาม',
        icon: 'assets/icons/icon-192.png',
        badge: 'assets/icons/icon-192.png'
    }));
});

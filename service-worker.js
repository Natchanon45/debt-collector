const APP_VERSION = 'phase3-v3';

const CACHE_NAME = 'debt-collector-' + APP_VERSION;

const ASSETS = ['./',
    './index.html',
    './manifest.json',
    './assets/css/style.css',
    './assets/js/app.js',
    './assets/js/firebase-config.js',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png'];

self.addEventListener('install',
    e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
        .then(() => self.skipWaiting())));

self.addEventListener('activate',

    e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('message',

    e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting() });

self.addEventListener('fetch',

    e => {
        if (e.request.method !== 'GET') return;

        e.respondWith(caches.match(e.request).then(c => c || fetch(e.request).catch(() => caches.match('./index.html'))))
    });

self.addEventListener('push',
    e => {
        const d = e.data ? e.data.json() : {
            title: 'Debt Collector',

            body: 'มีรายการต้องติดตาม'
        };
        e.waitUntil(self.registration.showNotification(d.title || 'Debt Collector',
            {
                body: d.body || 'มีรายการต้องติดตาม',
                icon: 'assets/icons/icon-192.png',
                badge: 'assets/icons/icon-192.png'
            }))
    });

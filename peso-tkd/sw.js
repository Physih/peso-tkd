// =====================================================================
// sw.js — Service worker: hace que la app funcione sin conexión.
// Estrategia: "red primero" con límite de 3 s; si no hay red, usa la caché.
// Así siempre ves la última versión cuando hay internet y la app abre offline.
// Si agregas archivos nuevos, añádelos a ARCHIVOS y sube la VERSION.
// =====================================================================

const VERSION = 'peso-tkd-v1';

const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './lib/chart.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/app.js',
  './js/util.js',
  './js/constantes.js',
  './js/db.js',
  './js/calc.js',
  './js/contexto.js',
  './js/report.js',
  './js/backup.js',
  './js/sample.js',
  './js/ui/registro.js',
  './js/ui/reporte.js',
  './js/ui/progreso.js',
  './js/ui/ajustes.js',
  './js/ui/charts.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      // Red con límite de tiempo
      const res = await Promise.race([
        fetch(req, { cache: 'no-cache' }), // revalida con el servidor (evita archivos viejos)
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
      ]);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const enCache = await cache.match(req, { ignoreSearch: true });
      if (enCache) return enCache;
      if (req.mode === 'navigate') return cache.match('./index.html');
      return Response.error();
    }
  })());
});

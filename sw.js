// el Movies - internetsiz çalışma için önbellek.
// Uygulama dosyaları ilk açılışta telefona kaydedilir; sonra internet olmadan açılır.
// İnternet varken arka planda güncel sürüm indirilir ve bir sonraki açılışta kullanılır.
var CACHE = 'el-movies-v1';
var FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './seed.js',
  './manifest.webmanifest',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) c.put(req, res.clone());
        return res;
      }).catch(function () { return null; });
      if (hit) { e.waitUntil(net); return hit; }
      return net.then(function (res) {
        if (res) return res;
        if (req.mode === 'navigate') return c.match('./index.html');
        return new Response('', { status: 504 });
      });
    });
  }));
});

/* Funciona sin conexión. Sirve primero lo guardado y actualiza en segundo
   plano, así los cambios al banco de frases aparecen en la siguiente visita. */
var CACHE = 'discursos-v4';
var ARCHIVOS = [
  './', 'index.html', 'css/estilos.css', 'js/motor.js', 'js/app.js',
  'data/lexico.json', 'data/documentos.json', 'data/formatos.json', 'js/vendor/html2canvas.min.js', 'data/membrete.json', 'data/temas.json',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(e.request).then(function (guardado) {
      var red = fetch(e.request).then(function (r) {
        if (r && r.ok) c.put(e.request, r.clone());
        return r;
      }).catch(function () { return guardado; });
      return guardado || red;
    });
  }));
});

/* Lets the form open with no signal once it has been opened once.
 * Network first, so people get updates; the saved copy is the fallback.
 * Map tiles are not saved. Without a signal the map is blank but pins still work. */
var CACHE = 'walk-audit-v6';
var CORE = ['./', 'index.html', 'styles.css', 'config.js', 'manifest.webmanifest',
  'js/forms.js', 'js/data.js', 'js/store.js', 'js/sync.js', 'js/export.js', 'js/report.js', 'js/app.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'vendor/leaflet/images/marker-icon.png', 'vendor/leaflet/images/marker-icon-2x.png', 'vendor/leaflet/images/marker-shadow.png',
  'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  function saved() {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined);
    });
  }
  e.respondWith(new Promise(function (resolve) {
    var done = false;
    function finish(res) { if (!done && res) { done = true; resolve(res); } }
    /* A weak signal can hang for a long time. After 3.5 s, use the saved copy. */
    var slow = setTimeout(function () { saved().then(finish); }, 3500);
    fetch(req).then(function (res) {
      clearTimeout(slow);
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      finish(res);
    }).catch(function () {
      clearTimeout(slow);
      saved().then(function (hit) { finish(hit || Response.error()); });
    });
  }));
});

/* 离线缓存：首次联网打开后，之后完全不依赖网络/本地服务。
 *
 * 打开速度是这里的关键 —— 之前的"联网优先"策略会让每次打开都先等
 * 本地服务响应（它跑在 PRoot 沙箱里，很慢），于是出现"很慢才能打开"。
 * 现在页面导航改成"缓存优先 + 后台刷新"：立刻出内容，顺带更新缓存。
 */
var CACHE = 'workclock-v8';
var ASSETS = ['./', './index.html',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  // 页面导航：先给缓存（保证秒开），同时后台拉新版本
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(function (cached) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) {
            caches.open(CACHE).then(function (c) { c.put('./index.html', res.clone()); });
          }
          return res;
        }).catch(function () { return null; });

        if (cached) return cached;

        return net.then(function (res) {
          if (res) return res;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>工时打卡</title>' +
            '<body style="font:16px sans-serif;padding:40px;text-align:center">' +
            '<p>缓存尚未建立，请联网打开一次。</p></body>',
            { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } });
        });
      })
    );
    return;
  }

  // 其他静态资源：先用缓存，后台顺带更新
  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) {
        fetch(req).then(function (res) {
          if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
        }).catch(function () {});
        return cached;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok && new URL(req.url).origin === self.location.origin) {
          caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
        }
        return res;
      }).catch(function () {});
    })
  );
});

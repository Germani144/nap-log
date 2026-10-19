const C='nap-v3.3';
// Always ask the server for the newest files ('no-cache' revalidates instead of trusting the browser's 10-minute HTTP
// cache), so index.html and plan.js can never come from different versions. The cache below is only for offline use.
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','plan.js'].map(u=>new Request(u,{cache:'reload'})))));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(fetch(e.request.url,{cache:'no-cache',credentials:'same-origin'}).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)));
});

// ---- push notifications (sent by sender/notify.mjs through GitHub Actions)
self.addEventListener('push',e=>{
  let d={};
  try{d=e.data.json()}catch{d={body:e.data?e.data.text():''}}
  e.waitUntil(self.registration.showNotification(d.title||'Nap Log',{body:d.body||'',icon:'icon-192.png',badge:'badge-96.png',tag:d.tag||'naplog',renotify:true}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
    for(const c of l)if('focus'in c)return c.focus();
    return clients.openWindow('./');
  }));
});

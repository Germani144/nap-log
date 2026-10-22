// All of Pedro's apps share one origin (germani144.github.io), so they share CacheStorage: this worker only ever
// touches caches with its own prefix, and only handles requests inside its own scope (/nap-log/).
const P='nap-log-',C=P+'v3.10';
const mine=k=>k.startsWith(P)||/^nap-v\d/.test(k); // 'nap-v…' = this app's cache names before v3.4
// Always ask the server for the newest files ('no-cache' revalidates instead of trusting the browser's 10-minute HTTP
// cache), so index.html, plan.js and backup.js can never come from different versions. The cache below is only for offline use.
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','plan.js','backup.js'].map(u=>new Request(u,{cache:'reload'})))));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>mine(k)&&k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(self.registration.scope))return;
  if(new URL(e.request.url).searchParams.has('check'))return; // "Check for updates": straight to the server, never cached
  e.respondWith(fetch(e.request.url,{cache:'no-cache',credentials:'same-origin'}).then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp))}return r})
    .catch(async()=>{const c=await caches.open(C);return(await c.match(e.request,{ignoreSearch:true}))||(e.request.mode==='navigate'&&await c.match('./index.html'))||Response.error()}));
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
    for(const c of l)if(c.url.startsWith(self.registration.scope)&&'focus'in c)return c.focus(); // not another app's tab
    return clients.openWindow('./');
  }));
});

const CACHE_NAME = "ai-papers-cache-v1";
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "manifest.json",
  "icon-72.png",
  "icon-96.png",
  "icon-128.png",
  "icon-144.png",
  "icon-152.png",
  "icon-192.png",
  "icon-384.png",
  "icon-512.png",
  "icon-maskable-192.png",
  "icon-maskable-512.png"
];

self.addEventListener("install", (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>{
      // Cache each asset individually so one missing file doesn't
      // block the whole offline shell from being cached.
      return Promise.all(
        ASSETS.map(asset =>
          cache.add(asset).catch(err => console.warn("SW cache skip:", asset, err))
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event)=>{
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event)=>{
  const req = event.request;
  const url = req.url;

  // Never cache AI API calls - always go to network (real-time generation)
  if(url.includes("text.pollinations.ai")){
    event.respondWith(
      fetch(req).catch(()=> new Response(
        JSON.stringify({ error: "AI offline, please check your internet connection." }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      ))
    );
    return;
  }

  // Only handle GET requests for the app shell (POST/PUT etc pass straight through)
  if(req.method !== "GET") return;

  // Skip cross-origin requests (fonts, CDNs, analytics) - let them hit the network normally
  if(new URL(url).origin !== self.location.origin) return;

  // App shell: cache-first, fallback to network, with a safe offline fallback
  event.respondWith(
    caches.match(req).then(cached=>{
      if(cached) return cached;
      return fetch(req).then(res=>{
        if(res && res.status === 200){
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        }
        return res;
      }).catch(()=>{
        if(req.mode === "navigate"){
          return caches.match("index.html");
        }
        // Generic offline fallback so we never resolve to undefined
        return new Response("Offline", { status: 503, statusText: "Offline" });
      });
    })
  );
});

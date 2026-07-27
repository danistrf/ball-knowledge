/* Service Worker für Ball-Knowledge (PWA).
   Strategie:
   - Eigene Dateien (index.html, spieler*.js, Icons): NETZ ZUERST, Cache als
     Offline-Fallback. So kommen Updates sofort an (kein Stale-Content-Risiko),
     und ohne Netz läuft die zuletzt geladene Version weiter.
   - Google Fonts: Cache zuerst (ändern sich praktisch nie).
   - Wikipedia-Bilder (Spielerfotos/Pokale): Cache zuerst, im Hintergrund
     auffrischen. Ohne Netz zeigt die App sonst nur Emoji-Fallbacks.
   Bei Änderungen an dieser Datei VERSION hochzählen — alte Caches werden
   beim Aktivieren aufgeräumt. */

const VERSION = "v1";
const CACHE_APP = "bk-app-" + VERSION;
const CACHE_EXTERN = "bk-extern-" + VERSION;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_APP).then((c) => c.addAll(["/"])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_APP && k !== CACHE_EXTERN).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    // Netz zuerst; Erfolg in den Cache spiegeln, sonst Cache (Offline)
    e.respondWith(
      fetch(req)
        .then((antwort) => {
          const kopie = antwort.clone();
          caches.open(CACHE_APP).then((c) => c.put(req, kopie));
          return antwort;
        })
        .catch(() =>
          caches.match(req).then((tref) =>
            // Navigation offline: notfalls die gecachte Startseite liefern
            tref || (req.mode === "navigate" ? caches.match("/") : undefined)
          )
        )
    );
    return;
  }

  const istFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  const istWiki = url.hostname.endsWith(".wikipedia.org") || url.hostname.endsWith(".wikimedia.org");
  if (istFont || istWiki) {
    // Cache zuerst, im Hintergrund auffrischen (stale-while-revalidate)
    e.respondWith(
      caches.open(CACHE_EXTERN).then(async (c) => {
        const tref = await c.match(req);
        const frisch = fetch(req)
          .then((antwort) => {
            if (antwort.ok || antwort.type === "opaque") c.put(req, antwort.clone());
            return antwort;
          })
          .catch(() => tref);
        return tref || frisch;
      })
    );
  }
  // Alles andere (falls es je dazukommt): Browser-Standard, kein Eingriff
});

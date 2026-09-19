const CACHE_PREFIX = "swap-assistant-pwa-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (["style", "script"].includes(request.destination)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (["image", "font"].includes(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil(showPush(event));
});

async function showPush(event) {
  const payload = readPushPayload(event);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  const manifest = await fetch("/manifest.webmanifest", { cache: "no-store", signal: controller.signal })
    .then((response) => response.ok ? response.json() : {})
    .catch(() => ({}))
    .finally(() => clearTimeout(timeout));
  const title = payload.title || manifest.name || "Swap alert";
  const iconUrl = sanitizeNotificationUrl(manifest.icons && manifest.icons[0] && manifest.icons[0].src);
  const options = {
    body: payload.body || "Open the app to review your alert.",
    icon: iconUrl === "/swap" ? "/icon-192.png" : iconUrl,
    badge: iconUrl === "/swap" ? "/icon-192.png" : iconUrl,
    tag: payload.tag || "swap-assistant-alert",
    renotify: false,
    data: {
      url: sanitizeNotificationUrl(payload.url)
    }
  };

  await self.registration.showNotification(title, options);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = sanitizeNotificationUrl(event.notification.data && event.notification.data.url);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      return self.clients.openWindow(url);
    })
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("Network request failed and no cached response is available.");
  }
}

function readPushPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

function sanitizeNotificationUrl(rawUrl) {
  if (!rawUrl) return "/swap";
  try {
    const parsed = new URL(rawUrl, self.location.origin);
    return parsed.origin === self.location.origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/swap";
  } catch {
    return "/swap";
  }
}

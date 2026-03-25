/**
 * K11 OMNI ELITE — Service Worker v1.0
 * PWA offline-first com cache estratégico
 * Cache-first para assets estáticos, network-first para API
 */
const CACHE_NAME   = 'k11-omni-v3';
const API_CACHE    = 'k11-api-v1';
const OFFLINE_PAGE = '/';

const PRECACHE_URLS = [
  '/',
  '/dashboard.html',
  '/global.css',
  '/k11-skill-styles.css',
  '/k11-config.js',
  '/k11-utils.js',
  '/k11-views.js',
  '/k11-app.js',
  '/k11-ui.js',
  '/k11-processors.js',
  '/k11-actions-.js',
  '/k11-brain-auxiliar.js',
  '/k11-data-inject.js',
  '/k11-live-panel.js',
  '/k11-live-engine.js',
  '/k11-skill-system.js',
  '/k11-mission-engine.js',
  '/k11-obra.js',
  '/k11-voice.js',
  '/k11-float-ai.js',
  '/k11-auth-ui.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

/* ── INSTALL: pré-cache dos assets estáticos ─────────────────── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS.filter(u => !u.includes('.json') || u === '/manifest.json')))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] precache parcial:', err.message))
  );
});

/* ── ACTIVATE: limpa caches antigos ──────────────────────────── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== API_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: estratégia por tipo de request ───────────────────── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // SSE streams — nunca interceptar
  if (url.pathname.includes('/stream')) return;

  // API calls — network-first, fallback para cache
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirstAPI(e.request));
    return;
  }

  // Assets estáticos — cache-first
  e.respondWith(cacheFirst(e.request));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, resp.clone());
    }
    return resp;
  } catch {
    const fallback = await caches.match(OFFLINE_PAGE);
    return fallback || new Response('Offline — sem cache disponível', { status: 503 });
  }
}

async function networkFirstAPI(req) {
  try {
    const resp = await fetch(req.clone(), { signal: AbortSignal.timeout(8000) });
    if (resp.ok && req.method === 'GET') {
      const cache = await caches.open(API_CACHE);
      cache.put(req, resp.clone());
    }
    return resp;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ ok: false, offline: true, error: 'Sem conexão' }), {
      headers: { 'Content-Type': 'application/json' }, status: 503,
    });
  }
}

/* ── PUSH NOTIFICATIONS ──────────────────────────────────────── */
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'K11 OMNI ELITE', {
      body:    data.body || '',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      tag:     data.tag || 'k11-alert',
      data:    data.url ? { url: data.url } : {},
      vibrate: data.severity === 'critical' ? [200, 100, 200] : [100],
      actions: data.actions || [],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/dashboard.html';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(wins => {
      const w = wins.find(w => w.url.includes(self.location.origin));
      if (w) { w.focus(); w.postMessage({ type: 'navigate', url }); }
      else clients.openWindow(url);
    })
  );
});

/* ── BACKGROUND SYNC ─────────────────────────────────────────── */
self.addEventListener('sync', e => {
  if (e.tag === 'k11-sync-queue') {
    e.waitUntil(syncPendingActions());
  }
});

async function syncPendingActions() {
  // Sincroniza ações pendentes quando volta online
  const cache  = await caches.open('k11-pending-v1');
  const keys   = await cache.keys();
  for (const req of keys) {
    try {
      await fetch(req);
      await cache.delete(req);
    } catch (_) {}
  }
}

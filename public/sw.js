/**
 * K11 OMNI ELITE — SERVICE WORKER
 * ════════════════════════════════
 * Estratégia: Network First para dados da API, Cache First para assets estáticos.
 * Garante funcionamento offline parcial e instalação no iPhone (iOS 16.4+).
 */

'use strict';

const CACHE_NAME    = 'k11-omni-v3';
const CACHE_STATIC  = 'k11-static-v3';
const CACHE_DYNAMIC = 'k11-dynamic-v3';

// ── Assets que entram no cache imediatamente ao instalar ──────
const STATIC_ASSETS = [
  '/dashboard.html',
  '/global.css',
  '/',
  '/index.html',
  '/k11-config.js',
  '/k11-auth-ui.js',
  '/k11-utils.js',
  '/k11-ui.js',
  '/k11-processors.js',
  '/k11-views.js',
  '/k11-actions.js',
  '/k11-app.js',
  '/k11-modal-regional.js',
  '/k11-data-inject.js',
  '/k11-key-voice.js',
  '/k11-voice-id.js',
  '/k11-brain-auxiliar.js',
  '/k11-voice-assistant.js',
  '/k11-float-ai.js',
  '/k11-setup.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Fontes do Google (serão cached dinamicamente na primeira visita)
];

// ── URLs da API — sempre tenta rede, sem cache ────────────────
const API_ORIGINS = [
  'web-production-8c4b.up.railway.app',
  'fpvopkbzuhltosiqfcph.supabase.co',
  'api.groq.com',
  'texttospeech.googleapis.com',
];

const isApiRequest = (url) =>
  API_ORIGINS.some(origin => url.includes(origin));

const isStaticAsset = (url) =>
  url.match(/\.(js|css|html|png|jpg|svg|ico|woff2?)(\?|$)/);

// ─────────────────────────────────────────────────────────────
// INSTALL — pré-cacheia assets críticos
// ─────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando K11 OMNI PWA...');
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        console.log('[SW] Cacheando assets estáticos...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] ✅ Assets cacheados. Ativando imediatamente.');
        return self.skipWaiting();
      })
      .catch(err => {
        // Não falha a instalação se algum asset não existir ainda
        console.warn('[SW] Alguns assets não cacheados:', err.message);
        return self.skipWaiting();
      })
  );
});

// ─────────────────────────────────────────────────────────────
// ACTIVATE — limpa caches antigos
// ─────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando novo Service Worker...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_DYNAMIC)
          .map(k => {
            console.log('[SW] Removendo cache antigo:', k);
            return caches.delete(k);
          })
      )
    ).then(() => {
      console.log('[SW] ✅ Service Worker ativo e controlando.');
      return self.clients.claim();
    })
  );
});

// ─────────────────────────────────────────────────────────────
// FETCH — estratégias por tipo de recurso
// ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Ignora requests não-GET e chrome-extension
  if (request.method !== 'GET') return;
  if (url.startsWith('chrome-extension')) return;

  // 1️⃣ API requests — Network Only (dados sempre frescos)
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request).catch(() => {
        // Offline: retorna erro legível para o app tratar
        return new Response(
          JSON.stringify({ ok: false, error: 'Sem conexão com o servidor.' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // 2️⃣ Assets estáticos — Network First, cache como fallback
  // (garante que atualizações de JS/CSS chegam imediatamente)
  if (isStaticAsset(url)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_STATIC).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 3️⃣ Tudo mais — Network First, cache como fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_DYNAMIC).then(c => c.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ─────────────────────────────────────────────────────────────
// PUSH (futuro — notificações push)
// ─────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'K11 OMNI', {
      body:    data.body || '',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-96.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/dashboard.html' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/dashboard.html')
  );
});

// ─────────────────────────────────────────────────────────────
// SYNC — Background sync (futuro)
// ─────────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'k11-sync-tarefas') {
    console.log('[SW] Background sync: tarefas');
    // Implementar quando necessário
  }
});

console.log('[SW] K11 OMNI Service Worker carregado ✅');

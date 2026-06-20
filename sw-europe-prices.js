// Service Worker minimo para a pagina Europe Prices.
//
// Estrategias:
//  - Assets do mapa (allowlist SWR_ALLOWLIST): stale-while-revalidate
//  - Ficheiros JSON de precos (/precos_qh/):   network-first com fallback cache
//  - Bibliotecas CDN (Leaflet, etc.):          cache-first
//  - Tudo o resto (incl. as outras paginas do site): passa direto para a rede
//
// Atualizar CACHE_VERSION sempre que houver alteracoes ao SW para forcar
// limpeza da versao antiga.

const CACHE_VERSION = 'europe-prices-v5';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const CDN_CACHE = `${CACHE_VERSION}-cdn`;

const STATIC_ASSETS = [
    'europe-prices.html',
    'style.css',
    'theme.js',
    'dados.js',
    'menu.html',
    'menu.js',
    'footer.html',
    'script.js',
    'cookie-consent.js',
    'glossario.js',
    'europe_zones_compact.js',
];

// Únicos caminhos same-origin servidos com stale-while-revalidate.
// O SW tem scope global ('/'): sem esta allowlist, TODAS as páginas do site
// passariam a ser servidas da cache após uma visita ao mapa, e os visitantes
// veriam versões antigas até ao refresh seguinte. Tudo o que não está aqui
// passa direto para a rede.
const SWR_ALLOWLIST = new Set([
    '/europe-prices', '/europe-prices.html',
    '/style.css', '/theme.js', '/dados.js',
    '/menu.html', '/menu.js', '/footer.html',
    '/script.js', '/cookie-consent.js', '/glossario.js',
    '/europe_zones_compact.js',
]);

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            // Pre-cache best-effort: nao falhar se algum asset nao estiver
            return Promise.all(
                STATIC_ASSETS.map((url) =>
                    fetch(url).then((r) => (r.ok ? cache.put(url, r) : null)).catch(() => null)
                )
            );
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((k) => !k.startsWith(CACHE_VERSION))
                    .map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Bibliotecas CDN — cache-first (raramente mudam)
    if (
        url.hostname === 'unpkg.com' ||
        url.hostname === 'cdn.jsdelivr.net' ||
        url.hostname === 'flagcdn.com'
    ) {
        event.respondWith(cacheFirst(req, CDN_CACHE));
        return;
    }

    // Dados de precos (mesma origem ou raw.githubusercontent.com)
    if (
        url.pathname.includes('/precos_qh/')
    ) {
        event.respondWith(networkFirst(req, DATA_CACHE));
        return;
    }

    // Mesma origem — stale-while-revalidate APENAS para os assets do mapa
    // (ver SWR_ALLOWLIST). As restantes páginas/recursos do site vão direto
    // à rede, para nunca servirmos versões desatualizadas do site inteiro.
    if (url.origin === self.location.origin && SWR_ALLOWLIST.has(url.pathname)) {
        event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
        return;
    }
});

// ---- Estrategias ----

async function cacheFirst(req, cacheName) {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
        const resp = await fetch(req);
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
    } catch (e) {
        return new Response('', { status: 504, statusText: 'Offline' });
    }
}

async function networkFirst(req, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const resp = await fetch(req);
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
    } catch (e) {
        const hit = await cache.match(req);
        if (hit) return hit;
        return new Response('', { status: 504, statusText: 'Offline' });
    }
}

async function staleWhileRevalidate(req, cacheName) {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(req);
    const fetchPromise = fetch(req)
        .then((resp) => {
            if (resp.ok) cache.put(req, resp.clone());
            return resp;
        })
        .catch(() => hit);
    return hit || fetchPromise;
}

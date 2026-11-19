/*
 * Service worker Echomers.
 * Tujuan: aplikasi tetap bisa dibuka saat sinyal jelek atau offline,
 * dan aset yang sudah diunduh tidak diunduh ulang tiap pindah halaman.
 */
const VERSION = 'echomers-v2'
const SHELL_CACHE = `${VERSION}-shell`
const RUNTIME_CACHE = `${VERSION}-runtime`

// Kerangka aplikasi yang harus ada supaya layar tidak putih saat offline.
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'favicon.svg',
  'icons.svg',
  'img/pwa-192.png',
  'img/pwa-512.png',
  'img/pwa-maskable-512.png',
  'img/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // Simpan satu per satu: satu file gagal tidak membatalkan seluruh instalasi.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' })
            if (response.ok) await cache.put(url, response)
          } catch {
            /* lewati file yang gagal */
          }
        }),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key.startsWith('echomers-') && !key.startsWith(VERSION)).map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

/** Halaman: coba jaringan dulu supaya konten selalu baru, cache hanya cadangan. */
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put('index.html', response.clone())
    return response
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match('index.html')) ||
      (await cache.match('./')) ||
      new Response('<h1>Echomers offline</h1><p>Sambungkan internet lalu buka lagi.</p>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    )
  }
}

/** Aset milik sendiri (hash Vite): pakai cache, unduh sekali saja. */
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE)
    cache.put(request, response.clone())
  }
  return response
}

/** Font Google: tampilkan cache, perbarui di belakang. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  return cached || network
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com')) {
    event.respondWith(staleWhileRevalidate(request))
  }
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

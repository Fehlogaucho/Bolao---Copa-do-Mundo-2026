// KILL SWITCH — remove o service worker e limpa TODO o cache.
// Suba este arquivo como public/sw.js no lugar do anterior.
// Os aparelhos que já tinham o SW vão atualizar pra esta versão,
// apagar o cache e se desregistrar sozinhos. Ele NÃO intercepta nada:
// todas as requisições (telas, imagens, /api) passam direto pra rede.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) { try { c.navigate(c.url); } catch (_) {} }
    } catch (_) {}
  })());
});
// sem handler de 'fetch' de propósito — nada é cacheado nem interceptado.

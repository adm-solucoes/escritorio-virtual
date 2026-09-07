// Service worker minimo, so pra deixar o app instalavel no computador.
//
// De proposito ele **nao guarda cache** do HTML/JS/CSS: o escritorio depende de
// Socket.io ao vivo e um cache velho serviria a versao antiga do jogo depois de
// um deploy - o bug classico de PWA. Aqui a rede sempre manda; o cache existe
// so pra mostrar um aviso decente quando a pessoa esta sem internet.
const CACHE = 'sede-offline-v1';
const PAGINA_OFFLINE = '/offline.html';

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((c) => c.add(PAGINA_OFFLINE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  // so navegacao: o resto (js, css, socket.io) vai direto pra rede
  if (req.mode !== 'navigate') return;
  evento.respondWith(
    fetch(req).catch(() => caches.match(PAGINA_OFFLINE))
  );
});

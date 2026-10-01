// Grid de chamada estilo Meet/Zoom: aparece sozinho quando voce esta numa
// chamada por proximidade conectada com pelo menos mais uma pessoa, no lugar
// das bolhas de video flutuantes acima dos bonecos (game.js consulta
// CallGrid.estaAtivo() pra saber quando parar de desenhar as bolhas).
(function () {
  let painel, grade, previewLocal, videoLocal, controlesLocais, selfNomeEl, selfFallback;
  let botaoMinimizar, botaoMostrar, textoMostrar;
  let ativo = false;
  // A grade ocupa quase o mapa todo. Quem prefere andar com a chamada recolhida
  // minimiza, e a escolha vale tambem nas proximas chamadas (a pessoa que
  // minimizou uma vez nao quer a grade tampando o mapa toda vez que chega perto
  // de alguem). So existe na sede: na pagina de quem entrou pelo link da reuniao
  // a grade e a tela inteira, e recolher deixaria a pagina vazia.
  let minimizada = false;
  let podeMinimizar = false;
  // A grade esta de fato aberta na frente do mapa (em chamada E nao minimizada).
  let mostrando = false;
  const CHAVE_MINIMIZADA = 'sede-chamada-minimizada';
  // Na pagina de quem entrou pelo link da reuniao, a grade abre mesmo sem camera
  // nem microfone: ele pode so assistir. Na sede, sem camera nao ha chamada.
  let semCameraTambem = false;
  const tilesRemotos = new Map(); // id -> { el, video, nomeEl, fallback }

  function iniciais(nome) {
    return (nome || '?').trim().slice(0, 2).toUpperCase();
  }

  function montarTileSelf() {
    const tile = document.createElement('div');
    tile.className = 'chamada-tile chamada-tile-self';
    tile.id = 'chamada-tile-self';

    selfFallback = document.createElement('div');
    selfFallback.className = 'chamada-fallback oculto';
    tile.appendChild(selfFallback);

    selfNomeEl = document.createElement('div');
    selfNomeEl.className = 'chamada-nome';
    selfNomeEl.textContent = 'Voce';
    tile.appendChild(selfNomeEl);

    grade.appendChild(tile);
  }

  function garantirTileRemoto(id) {
    let t = tilesRemotos.get(id);
    if (t) return t;

    const el = document.createElement('div');
    el.className = 'chamada-tile';

    const fallback = document.createElement('div');
    fallback.className = 'chamada-fallback oculto';
    el.appendChild(fallback);

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    el.appendChild(video);

    const nomeEl = document.createElement('div');
    nomeEl.className = 'chamada-nome';
    el.appendChild(nomeEl);

    grade.appendChild(el);
    t = { el, video, nomeEl, fallback };
    tilesRemotos.set(id, t);
    return t;
  }

  function removerTile(id) {
    const t = tilesRemotos.get(id);
    if (!t) return;
    t.el.remove();
    tilesRemotos.delete(id);
  }

  function limparTilesRemotos() {
    tilesRemotos.forEach((t) => t.el.remove());
    tilesRemotos.clear();
  }

  function nomeExibido(player) {
    if (!player) return '...';
    return (player.isAdmin ? '👑 ' : '') + player.name;
  }

  function atualizarFallback(fallback, player) {
    fallback.style.background = (player && player.appearance && player.appearance.skin) || '#3a4a52';
    fallback.textContent = iniciais(player && player.name);
  }

  function atualizar() {
    const peers = Calls.getPeersConectados();
    const deveEstarAtivo = (Calls.isCameraAtiva() || semCameraTambem) && peers.length > 0;

    if (deveEstarAtivo !== ativo) {
      ativo = deveEstarAtivo;
      aplicarVisibilidade();
    }
    if (!ativo) return;

    // +1: voce. O texto so aparece com a grade recolhida (e no celular nem isso).
    if (textoMostrar) textoMostrar.textContent = 'Em chamada · ' + (peers.length + 1);

    const players = Game.getPlayers();

    const self = players.get(Game.getSelfId());
    selfNomeEl.textContent = nomeExibido(self) + ' (voce)';
    if (Calls.temVideoLocal()) {
      selfFallback.classList.add('oculto');
      videoLocal.classList.remove('oculto');
    } else {
      atualizarFallback(selfFallback, self);
      selfFallback.classList.remove('oculto');
      videoLocal.classList.add('oculto');
    }

    const idsAtuais = new Set(peers.map((p) => p.id));
    tilesRemotos.forEach((_, id) => { if (!idsAtuais.has(id)) removerTile(id); });

    peers.forEach((p) => {
      const player = players.get(p.id) || Calls.jogadorDe(p.id);
      const t = garantirTileRemoto(p.id);
      t.nomeEl.textContent = nomeExibido(player);

      if (p.temVideo && p.stream) {
        if (t.video.srcObject !== p.stream) t.video.srcObject = p.stream;
        t.video.classList.remove('oculto');
        t.fallback.classList.add('oculto');
      } else {
        t.video.classList.add('oculto');
        atualizarFallback(t.fallback, player);
        t.fallback.classList.remove('oculto');
      }
    });
  }

  function lerMinimizada() {
    try { return localStorage.getItem(CHAVE_MINIMIZADA) === '1'; } catch (e) { return false; }
  }

  function guardarMinimizada() {
    try { localStorage.setItem(CHAVE_MINIMIZADA, minimizada ? '1' : '0'); } catch (e) { /* sem armazenamento: vale so ate recarregar */ }
  }

  // Minimizada, a grade fica no DOM mas invisivel (os <video> dos outros levam o
  // audio, a chamada nao cai) e o seu video e os botoes de mic/camera voltam pra
  // barra de baixo, como quando nao ha grade.
  function aplicarVisibilidade() {
    const recolhida = ativo && minimizada;
    painel.classList.toggle('oculto', !ativo);
    painel.classList.toggle('minimizada', recolhida);
    if (botaoMostrar) botaoMostrar.classList.toggle('oculto', !recolhida);

    const deveMostrar = ativo && !minimizada;
    if (deveMostrar !== mostrando) {
      mostrando = deveMostrar;
      if (mostrando) {
        previewLocal.style.display = 'none';
        document.getElementById('chamada-tile-self').appendChild(videoLocal);
        document.getElementById('chamada-tile-self').appendChild(controlesLocais);
      } else {
        previewLocal.style.display = '';
        previewLocal.insertBefore(videoLocal, previewLocal.firstChild);
        previewLocal.appendChild(controlesLocais);
      }
    }
    if (!ativo) limparTilesRemotos();
  }

  function definirMinimizada(valor) {
    if (!podeMinimizar || minimizada === valor) return;
    minimizada = valor;
    guardarMinimizada();
    aplicarVisibilidade();
    // O botao em que a pessoa clicou acabou de sumir: o foco do teclado vai pro
    // que apareceu no lugar dele.
    const alvo = valor ? botaoMostrar : botaoMinimizar;
    if (alvo) alvo.focus();
  }

  function estaAtivo() { return ativo; }

  function init(opcoes) {
    semCameraTambem = !!(opcoes && opcoes.semCamera);
    painel = document.getElementById('grade-chamada');
    grade = document.getElementById('grade-chamada-tiles');
    previewLocal = document.getElementById('preview-local');
    videoLocal = document.getElementById('video-local');
    controlesLocais = document.getElementById('preview-local-controles');
    botaoMinimizar = document.getElementById('grade-chamada-minimizar');
    botaoMostrar = document.getElementById('chamada-mostrar');
    textoMostrar = document.getElementById('chamada-mostrar-texto');

    // A pagina da reuniao por link nao tem os dois botoes: la a grade e fixa.
    podeMinimizar = !!(botaoMinimizar && botaoMostrar);
    if (podeMinimizar) {
      minimizada = lerMinimizada();
      botaoMinimizar.addEventListener('click', () => definirMinimizada(true));
      botaoMostrar.addEventListener('click', () => definirMinimizada(false));
    }

    montarTileSelf();
    setInterval(atualizar, 500);
  }

  window.CallGrid = { init, estaAtivo };
})();

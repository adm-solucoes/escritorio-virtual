// Cartao de perfil (clique numa pessoa) e busca rapida (Ctrl+K), no espirito do
// Gather: achar alguem, acenar e caminhar ate la sem precisar marcar reuniao.
(function () {
  let cartao, busca, buscaInput, buscaLista;
  let idDoCartao = null;
  let indiceBusca = 0;
  let resultados = [];

  function salaDe(p) {
    const sala = OfficeMap.getRoomAt(p.displayX, p.displayY);
    return sala ? sala.nome : '-';
  }

  // ---------- cartao de perfil ----------
  function abrirCartao(id, clienteX, clienteY) {
    const p = Game.getPlayers().get(id);
    if (!p) return;
    idDoCartao = id;

    cartao.innerHTML = '';

    const topo = document.createElement('div');
    topo.className = 'cartao-topo';

    const avatar = document.createElement('div');
    avatar.className = 'cartao-avatar';
    avatar.style.background = (p.appearance && p.appearance.skin) || '#8b98a8';
    avatar.textContent = (p.name || '?').trim().slice(0, 2).toUpperCase();
    topo.appendChild(avatar);

    const info = document.createElement('div');
    const nome = document.createElement('div');
    nome.className = 'cartao-nome';
    nome.textContent = (p.isAdmin ? '👑 ' : '') + p.name;
    const sub = document.createElement('div');
    sub.className = 'cartao-sub';
    sub.textContent = (Game.STATUS_LABEL[p.status] || '') + ' · ' + salaDe(p);
    info.appendChild(nome);
    info.appendChild(sub);
    topo.appendChild(info);
    cartao.appendChild(topo);

    const acoes = document.createElement('div');
    acoes.className = 'cartao-acoes';

    const btnAcenar = document.createElement('button');
    btnAcenar.type = 'button';
    btnAcenar.className = 'btn btn-secundario btn-pequeno';
    btnAcenar.textContent = '👋 Acenar';
    btnAcenar.addEventListener('click', () => {
      Network.sendReaction('👋');
      fecharCartao();
    });
    acoes.appendChild(btnAcenar);

    const btnIr = document.createElement('button');
    btnIr.type = 'button';
    btnIr.className = 'btn btn-primario btn-pequeno';
    btnIr.textContent = 'Ir ate →';
    btnIr.addEventListener('click', () => {
      Game.irAte(id);
      fecharCartao();
    });
    acoes.appendChild(btnIr);

    cartao.appendChild(acoes);

    cartao.classList.remove('oculto');
    // mantem o cartao dentro da tela
    const largura = 226;
    const x = Math.min(Math.max(8, clienteX - largura / 2), window.innerWidth - largura - 8);
    const y = Math.min(clienteY + 14, window.innerHeight - 120);
    cartao.style.left = x + 'px';
    cartao.style.top = y + 'px';
  }

  function fecharCartao() {
    idDoCartao = null;
    cartao.classList.add('oculto');
  }

  // ---------- busca rapida (Ctrl+K) ----------
  function montarResultados() {
    const termo = buscaInput.value.trim().toLowerCase();
    const selfId = Game.getSelfId();
    resultados = Array.from(Game.getPlayers().values())
      .filter((p) => p.id !== selfId)
      .filter((p) => !termo || p.name.toLowerCase().includes(termo))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
    indiceBusca = 0;
    desenharResultados();
  }

  function desenharResultados() {
    buscaLista.innerHTML = '';
    if (resultados.length === 0) {
      const vazio = document.createElement('div');
      vazio.className = 'busca-vazio';
      vazio.textContent = 'Ninguem encontrado.';
      buscaLista.appendChild(vazio);
      return;
    }
    resultados.forEach((p, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'busca-item' + (i === indiceBusca ? ' ativo' : '');

      const ponto = document.createElement('span');
      ponto.className = 'busca-ponto';
      ponto.style.background = Game.STATUS_COR[p.status] || Game.STATUS_COR.livre;
      item.appendChild(ponto);

      const nome = document.createElement('span');
      nome.className = 'busca-nome';
      nome.textContent = p.name;
      item.appendChild(nome);

      const local = document.createElement('span');
      local.className = 'busca-local';
      local.textContent = salaDe(p);
      item.appendChild(local);

      item.addEventListener('click', () => escolher(p.id));
      buscaLista.appendChild(item);
    });
  }

  function escolher(id) {
    Game.irAte(id);
    fecharBusca();
  }

  function abrirBusca() {
    busca.classList.remove('oculto');
    buscaInput.value = '';
    montarResultados();
    buscaInput.focus();
  }

  function fecharBusca() {
    busca.classList.add('oculto');
  }

  function init() {
    cartao = document.getElementById('cartao-pessoa');
    busca = document.getElementById('busca-rapida');
    buscaInput = document.getElementById('busca-input');
    buscaLista = document.getElementById('busca-lista');

    document.getElementById('btn-busca').addEventListener('click', abrirBusca);
    buscaInput.addEventListener('input', montarResultados);

    busca.addEventListener('click', (e) => { if (e.target === busca) fecharBusca(); });
    document.addEventListener('click', (e) => {
      if (!cartao.classList.contains('oculto') && !cartao.contains(e.target)) fecharCartao();
    }, true);

    document.addEventListener('keydown', (e) => {
      const digitando = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        abrirBusca();
        return;
      }
      if (e.key === 'Escape') {
        fecharBusca();
        fecharCartao();
        return;
      }
      if (busca.classList.contains('oculto') || !digitando) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        indiceBusca = Math.min(indiceBusca + 1, resultados.length - 1);
        desenharResultados();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        indiceBusca = Math.max(indiceBusca - 1, 0);
        desenharResultados();
      } else if (e.key === 'Enter' && resultados[indiceBusca]) {
        e.preventDefault();
        escolher(resultados[indiceBusca].id);
      }
    });
  }

  window.Pessoas = { init, abrirCartao, abrirBusca };
})();

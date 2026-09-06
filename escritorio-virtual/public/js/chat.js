// Chat de texto da sede: uma sala so pra todo mundo (sem canais nem DMs),
// painel lateral estilo Slack. Historico guardado em memoria no servidor
// (mesma limitacao de "sem banco de dados" do resto do app: some se reiniciar).
(function () {
  let painel, lista, form, input, btnToggle, btnFechar, badge;
  let aberto = false;
  let naoLidas = 0;

  function formatarHora(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function estaNoFim() {
    return lista.scrollHeight - lista.scrollTop - lista.clientHeight < 40;
  }

  // Nunca usa innerHTML com dado vindo de outro jogador (nome/texto) - so
  // textContent, pra uma mensagem com "<script>" ou afins nao rodar na tela
  // de ninguem.
  function renderizarMensagem(msg) {
    const rolarDepois = estaNoFim();

    const item = document.createElement('div');
    item.className = 'chat-msg';

    const cabecalho = document.createElement('div');
    cabecalho.className = 'chat-msg-cabecalho';

    const nome = document.createElement('span');
    nome.className = 'chat-msg-nome';
    nome.style.color = Game.corDoId(msg.autorId);
    nome.textContent = (msg.autorIsAdmin ? '👑 ' : '') + msg.autorNome;
    cabecalho.appendChild(nome);

    const hora = document.createElement('span');
    hora.className = 'chat-msg-hora';
    hora.textContent = formatarHora(msg.ts);
    cabecalho.appendChild(hora);

    item.appendChild(cabecalho);

    const texto = document.createElement('div');
    texto.className = 'chat-msg-texto';
    texto.textContent = msg.texto;
    item.appendChild(texto);

    lista.appendChild(item);
    if (rolarDepois) lista.scrollTop = lista.scrollHeight;
  }

  function carregarHistorico(mensagens) {
    lista.innerHTML = '';
    mensagens.forEach(renderizarMensagem);
    lista.scrollTop = lista.scrollHeight;
  }

  function atualizarBadge() {
    if (naoLidas > 0) {
      badge.textContent = naoLidas > 9 ? '9+' : String(naoLidas);
      badge.classList.remove('oculto');
    } else {
      badge.classList.add('oculto');
    }
  }

  function receberMensagem(msg) {
    renderizarMensagem(msg);
    if (!aberto && msg.autorId !== Game.getSelfId()) {
      naoLidas += 1;
      atualizarBadge();
    }
  }

  function abrir() {
    aberto = true;
    painel.classList.remove('oculto');
    naoLidas = 0;
    atualizarBadge();
    lista.scrollTop = lista.scrollHeight;
    input.focus();
  }

  function fechar() {
    aberto = false;
    painel.classList.add('oculto');
  }

  function enviar(e) {
    e.preventDefault();
    const texto = input.value.trim();
    if (!texto) return;
    Network.sendChatMessage(texto);
    input.value = '';
  }

  function init() {
    painel = document.getElementById('painel-chat');
    lista = document.getElementById('chat-lista');
    form = document.getElementById('form-chat');
    input = document.getElementById('chat-input');
    btnToggle = document.getElementById('btn-chat');
    btnFechar = document.getElementById('btn-fechar-chat');
    badge = document.getElementById('chat-badge');

    btnToggle.addEventListener('click', () => (aberto ? fechar() : abrir()));
    btnFechar.addEventListener('click', fechar);
    form.addEventListener('submit', enviar);
  }

  window.Chat = { init, carregarHistorico, receberMensagem };
})();

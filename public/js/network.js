// Fina camada sobre o cliente Socket.io.
(function () {
  let socket = null;
  const listeners = {};

  function emitLocal(event, data) {
    (listeners[event] || []).forEach((cb) => cb(data));
  }

  function on(event, cb) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
  }

  function connect(profile) {
    // `?bot=1` entra como a segunda conta de desenvolvimento, pra dar pra testar
    // chamada e divisao de tela sozinho. O servidor so aceita isso com
    // SEM_LOGIN ligado, que nunca liga em producao. Ver public/js/bot.js.
    const ehBot = new URLSearchParams(location.search).get('bot') === '1';
    socket = io({
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      query: ehBot ? { bot: '1' } : {},
    });

    socket.on('connect', () => {
      emitLocal('conexao', 'conectado');
      socket.emit('join', profile);
    });
    socket.on('disconnect', () => emitLocal('conexao', 'desconectado'));
    socket.io.on('reconnect_attempt', () => emitLocal('conexao', 'reconectando'));
    socket.on('connect_error', (erro) => {
      // Sessao caiu (expirou ou saiu em outra aba): volta pro login em vez de
      // ficar tentando reconectar pra sempre.
      if (erro && erro.message === 'sem-sessao') {
        socket.close();
        location.reload();
        return;
      }
      emitLocal('conexao', 'reconectando');
    });

    socket.on('init', (data) => emitLocal('init', data));
    socket.on('player-joined', (data) => emitLocal('player-joined', data));
    socket.on('player-left', (data) => emitLocal('player-left', data));
    socket.on('player-moved', (data) => emitLocal('player-moved', data));
    socket.on('player-status', (data) => emitLocal('player-status', data));
    socket.on('reacao', (data) => emitLocal('reacao', data));
    socket.on('rtc-signal', (data) => emitLocal('rtc-signal', data));
    socket.on('chat-mensagem', (data) => emitLocal('chat-mensagem', data));
    socket.on('chat-historico', (data) => emitLocal('chat-historico', data));
    socket.on('chat-reacao', (data) => emitLocal('chat-reacao', data));
    socket.on('mesas-atualizadas', (data) => emitLocal('mesas-atualizadas', data));
    socket.on('mapa-atualizado', (data) => emitLocal('mapa-atualizado', data));
    socket.on('mapa-objeto-atualizado', (data) => emitLocal('mapa-objeto-atualizado', data));
    socket.on('mapa-conteudo-atualizado', (data) => emitLocal('mapa-conteudo-atualizado', data));
    socket.on('mapa-conteudo-recusado', (data) => emitLocal('mapa-conteudo-recusado', data));
    socket.on('agenda', (data) => emitLocal('agenda', data));
    socket.on('trello', (data) => emitLocal('trello', data));
  }

  function sendMove(state) {
    if (socket && socket.connected) socket.emit('move', state);
  }

  function sendStatus(status) {
    if (socket && socket.connected) socket.emit('status', { status });
  }

  function sendReaction(emoji) {
    if (socket && socket.connected) socket.emit('reagir', { emoji });
  }

  function sendRtcSignal(to, signal) {
    if (socket && socket.connected) socket.emit('rtc-signal', { to, signal });
  }

  function sendChatMessage(conversa, texto) {
    if (socket && socket.connected) socket.emit('chat-mensagem', { conversa, texto });
  }

  function pedirHistorico(conversa) {
    if (socket && socket.connected) socket.emit('chat-historico', { conversa });
  }

  function reagirMensagem(conversa, mensagemId, emoji) {
    if (socket && socket.connected) socket.emit('chat-reagir', { conversa, mensagemId, emoji });
  }

  function reivindicarMesa(col, row) {
    if (socket && socket.connected) socket.emit('mesa-reivindicar', { col, row });
  }

  // Largar sem precisar achar a mesa no mapa - e o "Unclaim my desk" da
  // referencia, que fica no proprio perfil.
  function largarMesa() {
    if (socket && socket.connected) socket.emit('mesa-largar');
  }

  // Poe/tira coisa em cima da PROPRIA mesa, na posicao exata do clique (x e y
  // sao tiles com fracao). O servidor recusa nas mesas dos outros.
  function itemNaMinhaMesa(x, y, o) {
    if (socket && socket.connected) socket.emit('mesa-item', { x, y, o });
  }

  // Mover e tirar apontam pelo id da coisa, nao pela posicao.
  function moverItemDaMesa(id, x, y) {
    if (socket && socket.connected) socket.emit('mesa-item-mover', { id, x, y });
  }

  function tirarItemDaMesa(id) {
    if (socket && socket.connected) socket.emit('mesa-item-tirar', { id });
  }

  function pedirAgenda() {
    if (socket && socket.connected) socket.emit('agenda-pedir');
  }

  function pedirTrello() {
    if (socket && socket.connected) socket.emit('trello-pedir');
  }

  function editarMapa(c, r, t) {
    if (socket && socket.connected) socket.emit('mapa-editar', { c, r, t });
  }

  function editarObjetoMapa(c, r, o) {
    if (socket && socket.connected) socket.emit('mapa-objeto', { c, r, o });
  }

  // Pendura (ou tira, com url vazia) um link num movel. Ver docs/plano-conteudo.md.
  function porConteudoNoMapa(c, r, titulo, url) {
    if (socket && socket.connected) socket.emit('mapa-conteudo', { c, r, titulo, url });
  }

  window.Network = {
    connect, on, sendMove, sendStatus, sendReaction, sendRtcSignal, sendChatMessage,
    pedirHistorico, reagirMensagem, reivindicarMesa, largarMesa, itemNaMinhaMesa, moverItemDaMesa, tirarItemDaMesa,
    editarMapa, editarObjetoMapa, porConteudoNoMapa,
    pedirAgenda, pedirTrello,
  };
})();

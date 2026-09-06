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
    socket = io({ reconnectionDelay: 500, reconnectionDelayMax: 3000 });

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

  function editarMapa(c, r, t) {
    if (socket && socket.connected) socket.emit('mapa-editar', { c, r, t });
  }

  function editarObjetoMapa(c, r, o) {
    if (socket && socket.connected) socket.emit('mapa-objeto', { c, r, o });
  }

  window.Network = {
    connect, on, sendMove, sendStatus, sendReaction, sendRtcSignal, sendChatMessage,
    pedirHistorico, reagirMensagem, reivindicarMesa, editarMapa, editarObjetoMapa,
  };
})();

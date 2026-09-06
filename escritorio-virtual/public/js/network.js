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
    socket.on('connect_error', () => emitLocal('conexao', 'reconectando'));

    socket.on('init', (data) => emitLocal('init', data));
    socket.on('player-joined', (data) => emitLocal('player-joined', data));
    socket.on('player-left', (data) => emitLocal('player-left', data));
    socket.on('player-moved', (data) => emitLocal('player-moved', data));
    socket.on('player-status', (data) => emitLocal('player-status', data));
    socket.on('reacao', (data) => emitLocal('reacao', data));
    socket.on('rtc-signal', (data) => emitLocal('rtc-signal', data));
    socket.on('chat-mensagem', (data) => emitLocal('chat-mensagem', data));
    socket.on('mesas-atualizadas', (data) => emitLocal('mesas-atualizadas', data));
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

  function sendChatMessage(texto) {
    if (socket && socket.connected) socket.emit('chat-mensagem', { texto });
  }

  function reivindicarMesa(col, row) {
    if (socket && socket.connected) socket.emit('mesa-reivindicar', { col, row });
  }

  window.Network = {
    connect, on, sendMove, sendStatus, sendReaction, sendRtcSignal, sendChatMessage,
    reivindicarMesa,
  };
})();

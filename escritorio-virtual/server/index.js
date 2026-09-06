const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const map = require('./map');

const PORT = process.env.PORT || 3500;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// Estado de presenca em memoria (sem banco de dados)
const players = new Map(); // socket.id -> player

// Chat da sede: uma unica sala pra todo mundo (sem canais/DMs), guardado so em
// memoria (some se o servidor reiniciar, igual ao resto da presenca).
const MENSAGENS_MAX = 200;
const MAX_MSG_LEN = 500;
const mensagensChat = [];
let proximoMsgId = 1;

// Mesas reivindicadas: "col,row" -> socket.id. Uma mesa por pessoa; some quando
// a pessoa sai (tudo em memoria, igual ao resto do estado).
const mesas = new Map();

function chaveMesa(col, row) {
  return col + ',' + row;
}

function ehTileDeMesa(col, row) {
  if (row < 0 || row >= map.ROWS || col < 0 || col >= map.COLS) return false;
  return map.tiles[row][col] === map.MESA_MONITOR;
}

function mesaDoJogador(id) {
  for (const [chave, dono] of mesas) if (dono === id) return chave;
  return null;
}

function mesasParaEnvio() {
  return Array.from(mesas.entries()).map(([chave, dono]) => {
    const jogador = players.get(dono);
    return { chave, donoId: dono, donoNome: jogador ? jogador.name : '' };
  });
}

const MAX_NAME_LEN = 18;
const STATUS_VALIDOS = ['livre', 'focado', 'reuniao'];
const EMOJIS_VALIDOS = ['👋', '👍', '🎉', '😂', '❤️', '👏'];
// Codigo simples compartilhado com a diretoria da ADM Solucoes (nao e uma senha
// forte de verdade - so evita que qualquer visitante marque a si mesmo como admin).
const ADMIN_CODE = process.env.ADMIN_CODE || 'adm-solucoes-2026';

function sanitizeName(name) {
  if (typeof name !== 'string') return 'Visitante';
  const trimmed = name.trim().slice(0, MAX_NAME_LEN);
  return trimmed.length > 0 ? trimmed : 'Visitante';
}

function sanitizeAppearance(appearance) {
  const a = appearance && typeof appearance === 'object' ? appearance : {};
  const allowedHex = (v, fallback) =>
    typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  const allowedEnum = (v, options, fallback) =>
    options.includes(v) ? v : fallback;

  return {
    skin: allowedHex(a.skin, '#e8b48c'),
    shirt: allowedHex(a.shirt, '#35bdf0'),
    bottom: allowedHex(a.bottom, '#6a7ce0'),
    shoes: allowedHex(a.shoes, '#2b2f38'),
    hairColor: allowedHex(a.hairColor, '#2b3038'),
    hairStyle: allowedEnum(a.hairStyle, ['curto', 'longo', 'moicano', 'careca'], 'curto'),
    glasses: !!a.glasses,
    glassesColor: allowedHex(a.glassesColor, '#2b3038'),
  };
}

io.on('connection', (socket) => {
  socket.on('join', (payload) => {
    if (players.has(socket.id)) return; // ja entrou

    const spawn = map.getSpawnPoint();
    const player = {
      id: socket.id,
      name: sanitizeName(payload && payload.name),
      appearance: sanitizeAppearance(payload && payload.appearance),
      x: spawn.x,
      y: spawn.y,
      dir: 'down',
      moving: false,
      status: 'livre',
      isAdmin: !!(payload && payload.adminCode && payload.adminCode === ADMIN_CODE),
    };
    players.set(socket.id, player);

    socket.emit('init', {
      selfId: socket.id,
      map: { cols: map.COLS, rows: map.ROWS, tile: map.TILE, tiles: map.tiles },
      players: Array.from(players.values()),
      mensagens: mensagensChat,
      mesas: mesasParaEnvio(),
    });

    socket.broadcast.emit('player-joined', player);
  });

  socket.on('move', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;

    const x = Number(data.x);
    const y = Number(data.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < 0 || y < 0 || x > map.COLS * map.TILE || y > map.ROWS * map.TILE) return;

    player.x = x;
    player.y = y;
    player.dir = ['up', 'down', 'left', 'right'].includes(data.dir) ? data.dir : player.dir;
    player.moving = !!data.moving;

    socket.broadcast.emit('player-moved', {
      id: socket.id,
      x: player.x,
      y: player.y,
      dir: player.dir,
      moving: player.moving,
    });
  });

  socket.on('status', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    if (!STATUS_VALIDOS.includes(data.status)) return;
    player.status = data.status;
    io.emit('player-status', { id: socket.id, status: player.status });
  });

  socket.on('reagir', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    if (!EMOJIS_VALIDOS.includes(data.emoji)) return;
    io.emit('reacao', { id: socket.id, emoji: data.emoji });
  });

  // Reivindicar/largar uma mesa. So vale em tile de mesa e cada pessoa fica com
  // no maximo uma - reivindicar outra libera a anterior.
  socket.on('mesa-reivindicar', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const col = Number(data.col);
    const row = Number(data.row);
    if (!Number.isInteger(col) || !Number.isInteger(row)) return;
    if (!ehTileDeMesa(col, row)) return;

    const chave = chaveMesa(col, row);
    const donoAtual = mesas.get(chave);
    if (donoAtual && donoAtual !== socket.id) return; // mesa de outra pessoa

    const anterior = mesaDoJogador(socket.id);
    if (anterior) mesas.delete(anterior);

    if (donoAtual === socket.id) {
      // clicou na propria mesa: larga
      io.emit('mesas-atualizadas', mesasParaEnvio());
      return;
    }
    mesas.set(chave, socket.id);
    io.emit('mesas-atualizadas', mesasParaEnvio());
  });

  socket.on('chat-mensagem', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const texto = typeof data.texto === 'string' ? data.texto.trim().slice(0, MAX_MSG_LEN) : '';
    if (!texto) return;

    const mensagem = {
      id: proximoMsgId++,
      autorId: socket.id,
      autorNome: player.name,
      autorIsAdmin: player.isAdmin,
      texto,
      ts: Date.now(),
    };
    mensagensChat.push(mensagem);
    if (mensagensChat.length > MENSAGENS_MAX) mensagensChat.shift();

    io.emit('chat-mensagem', mensagem);
  });

  // Sinalizacao WebRTC para chamada por proximidade: o servidor so repassa a
  // mensagem para o destinatario certo, sem entender/guardar o conteudo (offer/
  // answer/ICE candidate) nem mediar audio/video (isso e P2P entre os navegadores).
  socket.on('rtc-signal', (data) => {
    if (!data || typeof data.to !== 'string') return;
    if (!players.has(data.to) || !players.has(socket.id)) return;
    io.to(data.to).emit('rtc-signal', {
      from: socket.id,
      signal: data.signal,
    });
  });

  socket.on('disconnect', () => {
    if (players.has(socket.id)) {
      players.delete(socket.id);
      const mesa = mesaDoJogador(socket.id);
      if (mesa) {
        mesas.delete(mesa);
        io.emit('mesas-atualizadas', mesasParaEnvio());
      }
      io.emit('player-left', { id: socket.id });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Escritorio virtual ADM Solucoes rodando em http://localhost:${PORT}`);
});

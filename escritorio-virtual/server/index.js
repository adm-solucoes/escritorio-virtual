const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const map = require('./map');
const mapaEditado = require('./mapa-editado');
const usuariosStore = require('./usuarios');
const sessao = require('./sessao');
const auth = require('./auth');

const PORT = process.env.PORT || 3500;

const app = express();
const server = http.createServer(app);
// A sessao anda em cookie, entao a origem tem que ser a propria pagina.
const io = new Server(server);

// Atras do proxy do Render/Railway, pra `req.ip` ser o IP de verdade (o freio de
// forca bruta depende disso) e o cookie Secure funcionar.
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));

// Estado de presenca em memoria (sem banco de dados)
// A chave e o id do socket (some quando a aba fecha). Cada player tambem carrega
// um `uid` estavel - o id da conta logada: e ele que identifica a pessoa entre um
// F5 e outro, e ate entre computadores diferentes.
const players = new Map(); // socket.id -> player

// Ultimo nome visto de cada uid, pra uma DM antiga continuar mostrando "Maria"
// mesmo com a Maria offline.
const nomesPorUid = new Map(); // uid -> nome

// Chat da sede: canais fixos + mensagens diretas entre duas pessoas online.
// Tudo em memoria (some se o servidor reiniciar, igual ao resto da presenca).
// Ver docs/plano-chat.md.
const MENSAGENS_MAX = 200;
const MAX_MSG_LEN = 500;
const EMOJIS_REACAO = ['👍', '😂', '❤️', '🎉', '👏'];

const CANAIS = [
  { id: 'geral', nome: 'geral', descricao: 'Avisos e assuntos gerais da ADM Solucoes' },
  { id: 'social', nome: 'social', descricao: 'Conversa fiada, memes e combinados' },
  { id: 'projetos', nome: 'projetos', descricao: 'Andamento dos projetos e clientes' },
];

const conversas = new Map(); // conversaId -> [mensagem]
let proximoMsgId = 1;

function idCanal(canalId) {
  return 'canal:' + canalId;
}

// Os dois uids entram ordenados pra chave da DM ser a mesma dos dois lados - e,
// por serem estaveis, a conversa continua a mesma depois de recarregar a pagina.
function idDm(a, b) {
  return 'dm:' + [a, b].sort().join('|');
}

function participantesDaDm(conversaId) {
  return conversaId.slice(3).split('|');
}

function conversaExiste(conversaId) {
  if (typeof conversaId !== 'string') return false;
  if (conversaId.startsWith('canal:')) {
    return CANAIS.some((c) => idCanal(c.id) === conversaId);
  }
  if (conversaId.startsWith('dm:')) {
    const partes = participantesDaDm(conversaId);
    return partes.length === 2 && partes[0] !== partes[1];
  }
  return false;
}

// Canal e aberto; DM so vale pra quem esta nela.
function podeAcessar(conversaId, socketId) {
  if (!conversaExiste(conversaId)) return false;
  if (conversaId.startsWith('canal:')) return true;
  const player = players.get(socketId);
  return !!player && participantesDaDm(conversaId).includes(player.uid);
}

// A mesma pessoa pode estar em mais de uma aba: a DM vai pra todas elas.
function socketsDoUid(uid) {
  const ids = [];
  players.forEach((p, socketId) => {
    if (p.uid === uid) ids.push(socketId);
  });
  return ids;
}

// Pra quem esse evento vai: canal e pra todo mundo, DM so pros dois.
function entregar(conversaId, evento, dado) {
  if (conversaId.startsWith('canal:')) {
    io.emit(evento, dado);
    return;
  }
  participantesDaDm(conversaId).forEach((uid) => {
    socketsDoUid(uid).forEach((socketId) => io.to(socketId).emit(evento, dado));
  });
}

// DMs que esse uid ja tem historico, pra lista voltar montada depois do F5
// (inclusive com quem nao esta online agora).
function dmsDoUid(uid) {
  const lista = [];
  conversas.forEach((mensagens, conversaId) => {
    if (!conversaId.startsWith('dm:') || !mensagens.length) return;
    const partes = participantesDaDm(conversaId);
    if (!partes.includes(uid)) return;
    const outro = partes[0] === uid ? partes[1] : partes[0];
    lista.push({
      conversa: conversaId,
      uid: outro,
      nome: nomesPorUid.get(outro) || 'Alguem',
      ts: mensagens[mensagens.length - 1].ts,
    });
  });
  return lista.sort((a, b) => b.ts - a.ts);
}

function guardarMensagem(conversaId, mensagem) {
  if (!conversas.has(conversaId)) conversas.set(conversaId, []);
  const lista = conversas.get(conversaId);
  lista.push(mensagem);
  if (lista.length > MENSAGENS_MAX) lista.shift();
  return mensagem;
}

function mensagensDe(conversaId) {
  return conversas.get(conversaId) || [];
}

// Aviso de entrou/saiu no #geral, como o "fulano joined" da referencia.
function avisoDeSistema(texto) {
  const conversaId = idCanal('geral');
  const mensagem = guardarMensagem(conversaId, {
    id: proximoMsgId++,
    conversa: conversaId,
    autorId: null,
    autorNome: '',
    autorIsAdmin: false,
    texto,
    ts: Date.now(),
    sistema: true,
    reacoes: {},
  });
  io.emit('chat-mensagem', mensagem);
}

// Mesas reivindicadas: "col,row" -> socket.id. Uma mesa por pessoa; some quando
// a pessoa sai (tudo em memoria, igual ao resto do estado).
const mesas = new Map();

function chaveMesa(col, row) {
  return col + ',' + row;
}

// Tem alguem em pe nessa celula? (usado pra nao deixar decorar em cima de gente)
function alguemNoTile(col, row) {
  for (const p of players.values()) {
    if (Math.floor(p.x / map.TILE) === col && Math.floor(p.y / map.TILE) === row) return true;
  }
  return false;
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
// O `uid` do player e o id da conta (uuid), entregue pelo cookie assinado - nao
// vem mais do cliente. Ver server/auth.js e docs/plano-login.md.

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

// So conecta quem tem sessao valida. Como a identidade sai do cookie assinado, o
// cliente nao consegue mais se dizer outra pessoa (nem pra ler DM dos outros).
io.use((socket, next) => {
  const usuario = sessao.usuarioDoSocket(socket);
  if (!usuario) return next(new Error('sem-sessao'));
  socket.data.usuarioId = usuario.id;
  next();
});

io.on('connection', (socket) => {
  socket.on('join', (payload) => {
    if (players.has(socket.id)) return; // ja entrou

    const conta = usuariosStore.porId(socket.data.usuarioId);
    if (!conta) {
      socket.disconnect(true); // conta apagada no meio da sessao
      return;
    }

    // Aparencia e a unica coisa que ainda vem do cliente - e vai pra conta.
    const appearance = sanitizeAppearance(
      (payload && payload.appearance) || conta.appearance
    );
    usuariosStore.atualizarPerfil(conta.id, { appearance });

    const spawn = map.getSpawnPoint();
    const player = {
      id: socket.id,
      uid: conta.id,
      name: sanitizeName(conta.nome),
      appearance,
      x: spawn.x,
      y: spawn.y,
      dir: 'down',
      moving: false,
      sentado: false,
      status: 'livre',
      isAdmin: !!conta.isAdmin,
    };
    players.set(socket.id, player);
    nomesPorUid.set(player.uid, player.name);

    socket.emit('init', {
      selfId: socket.id,
      selfUid: player.uid,
      map: { cols: map.COLS, rows: map.ROWS, tile: map.TILE, tiles: map.tiles },
      players: Array.from(players.values()),
      canais: CANAIS,
      conversaPadrao: idCanal('geral'),
      mensagens: mensagensDe(idCanal('geral')),
      dms: dmsDoUid(player.uid),
      mesas: mesasParaEnvio(),
      mudancasMapa: mapaEditado.paraEnvio(),
      objetosMapa: mapaEditado.objetosParaEnvio(),
    });

    socket.broadcast.emit('player-joined', player);
    avisoDeSistema(player.name + ' entrou na sede');
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
    // So vale como sentado se a celula for mesmo um assento (o cliente decide,
    // o servidor confere - senao da pra "sentar" no meio do corredor).
    const tileAtual = map.tiles[Math.floor(y / map.TILE)];
    player.sentado = !!data.sentado && !!tileAtual
      && map.ASSENTOS.has(tileAtual[Math.floor(x / map.TILE)]);

    socket.broadcast.emit('player-moved', {
      id: socket.id,
      x: player.x,
      y: player.y,
      dir: player.dir,
      moving: player.moving,
      sentado: player.sentado,
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

  // Decorar o escritorio: so a diretoria. A checagem que vale e essa aqui - o
  // botao escondido no cliente e so conforto. Ver docs/plano-decorador.md.
  socket.on('mapa-editar', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.isAdmin || !data) return;

    const c = Number(data.c);
    const r = Number(data.r);
    const t = Number(data.t);
    if (!mapaEditado.posicaoValida(c, r) || !mapaEditado.tileValido(t)) return;
    // Nao deixa emparedar alguem: a celula onde tem gente em pe fica de fora.
    if (t !== 0 && alguemNoTile(c, r)) return;

    const resultado = mapaEditado.editar(c, r, t);
    if (!resultado.mudou) return;
    io.emit('mapa-atualizado', { c, r, t });
    if (resultado.objetoCaiu) io.emit('mapa-objeto-atualizado', { c, r, o: 0 });
  });

  // Camada de cima: monitor, caneca, papelada... apoiados numa celula.
  socket.on('mapa-objeto', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.isAdmin || !data) return;

    const c = Number(data.c);
    const r = Number(data.r);
    const o = Number(data.o);
    if (!mapaEditado.posicaoValida(c, r) || !mapaEditado.objetoValido(o)) return;
    if (!mapaEditado.editarObjeto(c, r, o)) return;
    io.emit('mapa-objeto-atualizado', { c, r, o });
  });

  socket.on('chat-historico', (data) => {
    const conversaId = data && data.conversa;
    if (!players.has(socket.id) || !podeAcessar(conversaId, socket.id)) return;
    socket.emit('chat-historico', { conversa: conversaId, mensagens: mensagensDe(conversaId) });
  });

  socket.on('chat-mensagem', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const conversaId = data.conversa;
    if (!podeAcessar(conversaId, socket.id)) return;
    const texto = typeof data.texto === 'string' ? data.texto.trim().slice(0, MAX_MSG_LEN) : '';
    if (!texto) return;

    const mensagem = guardarMensagem(conversaId, {
      id: proximoMsgId++,
      conversa: conversaId,
      autorId: player.uid,
      autorNome: player.name,
      autorIsAdmin: player.isAdmin,
      texto,
      ts: Date.now(),
      reacoes: {},
    });

    entregar(conversaId, 'chat-mensagem', mensagem);
  });

  socket.on('chat-reagir', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const conversaId = data.conversa;
    if (!podeAcessar(conversaId, socket.id)) return;
    if (!EMOJIS_REACAO.includes(data.emoji)) return;

    const mensagem = mensagensDe(conversaId).find((m) => m.id === data.mensagemId);
    if (!mensagem) return;

    // Guardado por uid: quem recarrega a pagina continua vendo a propria reacao.
    const quem = mensagem.reacoes[data.emoji] || [];
    const jaReagiu = quem.includes(player.uid);
    const atualizado = jaReagiu
      ? quem.filter((id) => id !== player.uid)
      : quem.concat(player.uid);

    if (atualizado.length) mensagem.reacoes[data.emoji] = atualizado;
    else delete mensagem.reacoes[data.emoji];

    entregar(conversaId, 'chat-reacao', {
      conversa: conversaId,
      mensagemId: mensagem.id,
      reacoes: mensagem.reacoes,
    });
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
      const saiu = players.get(socket.id);
      players.delete(socket.id);
      avisoDeSistema(saiu.name + ' saiu da sede');
      const mesa = mesaDoJogador(socket.id);
      if (mesa) {
        mesas.delete(mesa);
        io.emit('mesas-atualizadas', mesasParaEnvio());
      }
      io.emit('player-left', { id: socket.id });
    }
  });
});

// Rotas de conta antes do estatico: /api/... nunca cai no index.html.
app.use('/api', auth.criarRotas(sanitizeAppearance));
app.use(express.static(path.join(__dirname, '..', 'public')));

server.listen(PORT, () => {
  console.log(`Escritorio virtual ADM Solucoes rodando em http://localhost:${PORT}`);
  console.log(`Contas cadastradas: ${usuariosStore.totalDeContas()}`);
  if (auth.CODIGO_SEDE === 'adm-solucoes') {
    console.log('Aviso: usando o codigo da sede padrao. Defina CODIGO_SEDE no deploy.');
  }
});

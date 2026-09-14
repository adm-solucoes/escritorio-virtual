// Quem fala com quem: as duas regras que decidem se a chamada abre e se ela
// continua (`deveFalarCom` / `deveContinuarCom`, em public/js/calls.js).
//
// Existe por causa de um bug que ficou meses no ar sem ninguem ver: o botao de
// status (Livre / Focado / Em reuniao) existia, pintava o anel do avatar, e
// **nao era consultado em lugar nenhum**. Marcar "Em reuniao" nao impedia nada;
// bastava alguem passar perto pra chamada abrir no meio da reuniao.
//
// Conferir isso a olho custa duas pessoas, duas camera e uma chamada de verdade.
// Por isso as duas regras saem expostas em `window.Calls` e sao exercitadas aqui,
// contra o MAPA DE VERDADE - as paredes e as salas fechadas sao as do escritorio.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  if (veio === esperado) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + esperado + ', veio ' + veio);
}

// ---------------------------------------------------------------- o ambiente
// calls.js nao toca no DOM fora das funcoes, entao um `document` de mentira
// basta pra carregar. Se um dia tocar, este teste quebra alto - e melhor assim.
const contexto = {
  console,
  window: {},
  document: {
    getElementById: () => null,
    createElement: () => ({ classList: { add() {}, remove() {} }, style: {} }),
  },
  navigator: {},
  setTimeout,
  clearTimeout,
};
contexto.window.document = contexto.document;
vm.createContext(contexto);
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/map.js'), 'utf8'), contexto);
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/calls.js'), 'utf8'), contexto);

const M = contexto.window.OfficeMap;
const Calls = contexto.window.Calls;
const TILE = M.TILE;

// Centro do tile, que e onde o boneco fica de fato.
function em(c, r, status, chamada) {
  return {
    x: c * TILE + TILE / 2,
    y: r * TILE + TILE / 2,
    status,
    chamada: chamada ? { id: chamada, titulo: chamada } : null,
  };
}

console.log('\nQUEM FALA COM QUEM');

// ------------------------------------------- acha dois lugares abertos e perto
// Nao vale cravar coordenada: o mapa muda, e um teste preso a 12,5 vira mentira
// silenciosa. Procura no mapa de verdade dois tiles caminhaveis, vizinhos, fora
// de sala fechada.
let abertos = null;
for (let r = 1; r < M.ROWS - 1 && !abertos; r++) {
  for (let c = 1; c < M.COLS - 2; c++) {
    const livre = (cc, rr) => M.isWalkable(cc * TILE + TILE / 2, rr * TILE + TILE / 2);
    const sala = (cc, rr) => M.getRoomAtTile(cc, rr);
    if (!livre(c, r) || !livre(c + 1, r)) continue;
    const s1 = sala(c, r);
    const s2 = sala(c + 1, r);
    if ((s1 && (s1.privativa || s1.silenciosa)) || (s2 && (s2.privativa || s2.silenciosa))) continue;
    abertos = [[c, r], [c + 1, r]];
    break;
  }
}
if (!abertos) {
  console.log('  FALHOU nao achei dois tiles abertos e vizinhos no mapa');
  process.exit(1);
}
const [A, B] = abertos;

// --------------------------------------------------------------- o essencial
conferir('dois livres coladinhos conversam',
  Calls.deveFalarCom(em(A[0], A[1], 'livre'), em(B[0], B[1], 'livre')), true);

conferir('se o OUTRO esta focado, nao abre',
  Calls.deveFalarCom(em(A[0], A[1], 'livre'), em(B[0], B[1], 'focado')), false);

conferir('se o OUTRO esta em reuniao, nao abre',
  Calls.deveFalarCom(em(A[0], A[1], 'livre'), em(B[0], B[1], 'reuniao')), false);

conferir('se EU estou focado, tambem nao abre',
  Calls.deveFalarCom(em(A[0], A[1], 'focado'), em(B[0], B[1], 'livre')), false);

conferir('os dois ocupados, nao abre',
  Calls.deveFalarCom(em(A[0], A[1], 'reuniao'), em(B[0], B[1], 'focado')), false);

// Bot e cliente antigo chegam sem status. Tratar isso como "ocupado" deixaria
// gente muda no mapa sem ninguem entender por que.
conferir('sem status nenhum vale como livre',
  Calls.deveFalarCom(em(A[0], A[1]), em(B[0], B[1])), true);

// ------------------------------------------------ status nao derruba chamada
conferir('quem JA esta na chamada nao e derrubado por mudar o status',
  Calls.deveContinuarCom(em(A[0], A[1], 'focado'), em(B[0], B[1], 'reuniao')), true);

// ------------------------------------------------------- distancia e parede
conferir('longe nao abre, mesmo os dois livres',
  Calls.deveFalarCom(em(A[0], A[1], 'livre'), em(A[0] + 8, A[1], 'livre')), false);

// dois lados de uma parede, a um passo um do outro
let comParede = null;
for (let r = 1; r < M.ROWS - 1 && !comParede; r++) {
  for (let c = 1; c < M.COLS - 1; c++) {
    if (M.tiles[r][c] !== M.PAREDE) continue;
    const cima = M.isWalkable(c * TILE + TILE / 2, (r - 1) * TILE + TILE / 2);
    const baixo = M.isWalkable(c * TILE + TILE / 2, (r + 1) * TILE + TILE / 2);
    if (cima && baixo) { comParede = [c, r]; break; }
  }
}
if (comParede) {
  const [pc, pr] = comParede;
  conferir('parede no meio nao deixa conversar',
    Calls.deveFalarCom(em(pc, pr - 1, 'livre'), em(pc, pr + 1, 'livre')), false);
} else {
  console.log('  (pulei o teste de parede: nao achei parede com chao dos dois lados)');
}

// ------------------------------------------------------------ sala fechada
// Dentro da sala fechada o status NAO barra: entrar ali e ato deliberado, e
// travar a chamada deixaria a sala de reuniao muda.
const fechada = (M.ROOMS || []).find((s) => s.privativa && (s.c1 - s.c0) >= 2);
if (fechada) {
  const dentro = [];
  for (let r = fechada.r0; r <= fechada.r1 && dentro.length < 2; r++) {
    for (let c = fechada.c0; c <= fechada.c1; c++) {
      if (M.isWalkable(c * TILE + TILE / 2, r * TILE + TILE / 2)) dentro.push([c, r]);
      if (dentro.length === 2) break;
    }
  }
  if (dentro.length === 2) {
    conferir('na mesma sala fechada, "Em reuniao" NAO barra (' + fechada.nome + ')',
      Calls.deveFalarCom(em(dentro[0][0], dentro[0][1], 'reuniao'),
        em(dentro[1][0], dentro[1][1], 'reuniao')), true);
  }
} else {
  console.log('  (pulei o teste de sala fechada: nenhuma sala privativa larga o bastante)');
}

// ------------------------------------------------------- sala silenciosa
// Na biblioteca ninguem conversa - nem colado, nem os dois livres. E quem ja
// estava em chamada e entra nela sai da chamada.
const silenciosa = (M.ROOMS || []).find((s) => s.silenciosa);
if (silenciosa) {
  const dentro = [];
  for (let r = silenciosa.r0; r <= silenciosa.r1 && dentro.length < 2; r++) {
    for (let c = silenciosa.c0; c < silenciosa.c1 && dentro.length < 2; c++) {
      const livre = (cc) => M.isWalkable(cc * TILE + TILE / 2, r * TILE + TILE / 2);
      if (livre(c) && livre(c + 1)) { dentro.push([c, r], [c + 1, r]); }
    }
  }
  conferir('achei dois lugares vizinhos na ' + silenciosa.nome, dentro.length, 2);
  if (dentro.length === 2) {
    conferir('dois livres colados na biblioteca NAO conversam',
      Calls.deveFalarCom(em(dentro[0][0], dentro[0][1], 'livre'), em(dentro[1][0], dentro[1][1], 'livre')), false);
    conferir('e quem entra nela em chamada sai da chamada',
      Calls.deveContinuarCom(em(dentro[0][0], dentro[0][1], 'livre'), em(dentro[1][0], dentro[1][1], 'livre')), false);
  }
} else {
  conferir('o mapa tem uma sala silenciosa', false, true);
}

// ------------------------------------------------- chamada marcada
// A regra que ignora o mapa inteiro. Ela existe porque prender a reuniao a uma
// sala quebra no caso obvio - a sala esta ocupada - e porque ninguem deveria ter
// que largar o lugar onde trabalha pra entrar numa reuniao de quinze minutos.
//
// Estas checagens sao o contrario de todas as de cima: aqui o esperado e a
// chamada acontecer JUSTAMENTE onde a proximidade diria que nao.
const LONGE_A = [A[0], A[1]];
const LONGE_B = [A[0] + 20, A[1]];

conferir('na mesma chamada, do outro lado do escritorio, conversa',
  Calls.deveFalarCom(em(LONGE_A[0], LONGE_A[1], 'livre', 'reuniao:1'),
    em(LONGE_B[0], LONGE_B[1], 'livre', 'reuniao:1')), true);

conferir('  e continua conversando (nao cai por distancia)',
  Calls.deveContinuarCom(em(LONGE_A[0], LONGE_A[1], 'livre', 'reuniao:1'),
    em(LONGE_B[0], LONGE_B[1], 'livre', 'reuniao:1')), true);

conferir('nem "Focado" derruba: entrar na chamada foi ato deliberado',
  Calls.deveFalarCom(em(LONGE_A[0], LONGE_A[1], 'focado', 'reuniao:1'),
    em(LONGE_B[0], LONGE_B[1], 'reuniao', 'reuniao:1')), true);

conferir('chamadas DIFERENTES nao se misturam',
  Calls.deveFalarCom(em(LONGE_A[0], LONGE_A[1], 'livre', 'reuniao:1'),
    em(LONGE_B[0], LONGE_B[1], 'livre', 'canal:geral')), false);

conferir('so um na chamada nao basta - volta a valer a proximidade',
  Calls.deveFalarCom(em(LONGE_A[0], LONGE_A[1], 'livre', 'reuniao:1'),
    em(LONGE_B[0], LONGE_B[1], 'livre')), false);

// Parede no meio: a proximidade barra, a chamada marcada nao.
if (comParede) {
  const [pc, pr] = comParede;
  conferir('parede no meio NAO barra quem esta na mesma chamada',
    Calls.deveFalarCom(em(pc, pr - 1, 'livre', 'reuniao:7'),
      em(pc, pr + 1, 'livre', 'reuniao:7')), true);
}

// Biblioteca: a sala silenciosa ganha de tudo, MENOS da chamada marcada. Quem
// entrou na reuniao e foi buscar um livro continua na reuniao.
if (silenciosa) {
  conferir('quem esta em chamada marcada nao e calado pela biblioteca',
    Calls.deveFalarCom(em(silenciosa.c0, silenciosa.r0, 'livre', 'reuniao:9'),
      em(A[0], A[1], 'livre', 'reuniao:9')), true);
}

// ---------------------------------------------------- a posicao dos OUTROS
// Todas as regras acima leem `outro.x`/`outro.y`. No jogo, quem atualiza isso e
// o handler de 'player-moved' do game.js - e ate 13/09/2026 ele so atualizava
// `targetX`/`targetY` (o desenho). As regras enxergavam cada pessoa parada no
// ponto onde ela ENTROU na sede: a chamada abria perto do lugar em que o outro
// nasceu, nao de onde ele estava. Passou despercebido desde a primeira versao,
// porque todo mundo nasce na recepcao - de perto, parecia funcionar.
//
// Conferido no navegador na correcao (outro a 23 tiles: nao abre; a 1,6: abre).
// Aqui fica a trava barata: o handler tem que gravar x e y.
{
  const game = fs.readFileSync(path.join(__dirname, '../public/js/game.js'), 'utf8');
  const inicio = game.indexOf("Network.on('player-moved'");
  const handler = inicio >= 0 ? game.slice(inicio, game.indexOf('\n    });', inicio)) : '';
  conferir("o 'player-moved' do game.js atualiza x (lido pela chamada)", /\bp\.x = data\.x;/.test(handler), true);
  conferir('  e y', /\bp\.y = data\.y;/.test(handler), true);
}

console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
process.exit(falhou ? 1 : 0);

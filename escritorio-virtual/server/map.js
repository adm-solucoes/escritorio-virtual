// Mapa 2D da sede da ADM Solucoes (lado servidor: colisao e ponto de entrada).
// Mantido em sincronia manualmente com public/js/map.js (sem bundler no projeto).

const TILE = 32;
const COLS = 34;
const ROWS = 24;

const LIVRE = 0;
const PAREDE = 1;
const MESA = 2;
const MESA_MONITOR = 3;
const SOFA_CIMA = 4;
const SOFA_BAIXO = 5;
const MESA_CENTRO = 6;
const ESTANTE = 7;
const PLANTA = 8;
const ARVORE = 9;
const QUADRO = 10;
const LOUSA = 11;
const ARMARIO = 12;
const BALCAO = 13;
const CERCA = 14;
const CADEIRA = 15; // caminhavel
const TAPETE = 16; // caminhavel
const MESA_REUNIAO = 17;

const SOLID_TILES = new Set([
  PAREDE, MESA, MESA_MONITOR, SOFA_CIMA, SOFA_BAIXO, MESA_CENTRO, ESTANTE,
  PLANTA, ARVORE, QUADRO, LOUSA, ARMARIO, BALCAO, CERCA, MESA_REUNIAO,
]);

const ROOMS = [
  { id: 'entrada', nome: 'Entrada', r0: 1, c0: 1, r1: 8, c1: 8 },
  { id: 'sala-principal', nome: 'Sala Principal', r0: 1, c0: 10, r1: 8, c1: 19 },
  { id: 'salinha', nome: 'Salinha', r0: 1, c0: 21, r1: 8, c1: 26 },
  { id: 'area-aberta', nome: 'Area Aberta', r0: 9, c0: 1, r1: 22, c1: 19 },
  { id: 'lounge', nome: 'Lounge', r0: 9, c0: 20, r1: 22, c1: 27 },
  { id: 'jardim', nome: 'Jardim', r0: 0, c0: 28, r1: 23, c1: 33 },
];

function buildMap() {
  const tiles = [];
  for (let r = 0; r < ROWS; r++) tiles.push(new Array(COLS).fill(LIVRE));

  const dentro = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  const set = (r, c, t) => { if (dentro(r, c)) tiles[r][c] = t; };
  const rect = (r0, c0, r1, c1, t) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) set(r, c, t);
  };
  const linhaH = (r, c0, c1, t) => { for (let c = c0; c <= c1; c++) set(r, c, t); };
  const linhaV = (c, r0, r1, t) => { for (let r = r0; r <= r1; r++) set(r, c, t); };

  // ---------- estrutura do predio ----------
  linhaH(0, 0, 27, PAREDE);
  linhaH(23, 0, 27, PAREDE);
  linhaV(0, 0, 23, PAREDE);
  linhaV(27, 0, 23, PAREDE);

  linhaV(9, 1, 8, PAREDE);
  linhaV(20, 1, 8, PAREDE);

  linhaH(9, 1, 26, PAREDE);
  set(9, 4, LIVRE);
  set(9, 14, LIVRE); set(9, 15, LIVRE);
  set(9, 24, LIVRE);

  linhaV(19, 12, 22, PAREDE);

  set(16, 27, LIVRE); set(17, 27, LIVRE);

  linhaH(0, 28, 33, CERCA);
  linhaH(23, 28, 33, CERCA);
  linhaV(33, 0, 23, CERCA);

  // ---------- Entrada ----------
  linhaH(2, 2, 5, BALCAO);
  set(1, 7, QUADRO);
  set(2, 8, PLANTA);
  linhaH(6, 2, 4, SOFA_CIMA);
  set(7, 3, MESA_CENTRO);
  set(4, 8, ESTANTE);
  set(5, 8, ESTANTE);
  set(7, 7, PLANTA);

  // ---------- Sala Principal ----------
  linhaH(1, 13, 16, LOUSA);
  set(1, 10, ESTANTE); set(1, 11, ESTANTE);
  set(1, 18, QUADRO);
  rect(4, 13, 5, 16, MESA_REUNIAO);
  linhaH(3, 13, 16, CADEIRA);
  linhaH(6, 13, 16, CADEIRA);
  set(4, 12, CADEIRA); set(5, 12, CADEIRA);
  set(4, 17, CADEIRA); set(5, 17, CADEIRA);
  set(2, 19, PLANTA);
  set(7, 10, PLANTA);
  set(7, 19, PLANTA);

  // ---------- Salinha ----------
  set(1, 25, ESTANTE); set(1, 26, ESTANTE);
  set(1, 22, QUADRO);
  linhaH(4, 23, 24, MESA_MONITOR);
  set(5, 23, CADEIRA); set(5, 24, CADEIRA);
  set(7, 26, PLANTA);

  // ---------- Area aberta ----------
  linhaH(10, 1, 2, ARMARIO);
  linhaH(10, 6, 8, ARMARIO);
  linhaH(10, 12, 13, ARMARIO);
  linhaH(10, 16, 17, ARMARIO);

  [[13, 3], [13, 9], [19, 3], [19, 9]].forEach(([r, c]) => {
    rect(r, c, r + 1, c + 2, MESA_MONITOR);
    linhaH(r - 1, c, c + 2, CADEIRA);
    linhaH(r + 2, c, c + 2, CADEIRA);
  });

  set(16, 16, MESA_CENTRO);
  set(15, 16, CADEIRA); set(17, 16, CADEIRA);
  set(16, 15, CADEIRA); set(16, 17, CADEIRA);

  set(12, 17, PLANTA);
  set(20, 16, PLANTA);
  set(22, 1, PLANTA);
  set(22, 18, PLANTA);

  // ---------- Lounge ----------
  linhaH(13, 21, 23, SOFA_CIMA);
  linhaH(17, 21, 23, SOFA_BAIXO);
  set(15, 22, MESA_CENTRO);
  set(11, 25, ESTANTE); set(11, 26, ESTANTE);
  set(12, 20, PLANTA);
  set(21, 26, PLANTA);
  set(20, 21, MESA);
  set(21, 21, CADEIRA);

  // ---------- Jardim ----------
  [[2, 29], [4, 32], [7, 30], [10, 32], [13, 29], [19, 31], [21, 28], [22, 32]]
    .forEach(([r, c]) => set(r, c, ARVORE));
  set(16, 30, MESA_CENTRO);
  set(16, 29, CADEIRA); set(16, 31, CADEIRA);

  return tiles;
}

const tiles = buildMap();

function isWalkableTile(col, row) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  return !SOLID_TILES.has(tiles[row][col]);
}

// Verifica colisao usando a caixa do personagem (menor que o tile, para permitir
// passar por corredores estreitos e nao "grudar" nas quinas).
function isWalkable(x, y) {
  const half = 10;
  const points = [
    [x - half, y - half],
    [x + half, y - half],
    [x - half, y + half],
    [x + half, y + half],
  ];
  for (const [px, py] of points) {
    const col = Math.floor(px / TILE);
    const row = Math.floor(py / TILE);
    if (!isWalkableTile(col, row)) return false;
  }
  return true;
}

// Na recepcao, perto da porta de entrada
const SPAWN_POINTS = [
  { x: 3.5 * TILE, y: 4.5 * TILE },
  { x: 4.5 * TILE, y: 4.5 * TILE },
  { x: 3.5 * TILE, y: 5.5 * TILE },
];

function getSpawnPoint() {
  const p = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  return { x: p.x, y: p.y };
}

module.exports = {
  TILE,
  COLS,
  ROWS,
  tiles,
  ROOMS,
  MESA_MONITOR,
  isWalkable,
  getSpawnPoint,
};

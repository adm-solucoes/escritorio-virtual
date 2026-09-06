// Mapa 2D da sede da ADM Solucoes. Cada ambiente tem piso e cor de identidade
// propria; os moveis moram no proprio grid (um tile = um movel).
// ATENCAO: mantido em sincronia manualmente com server/map.js (sem bundler).
(function () {
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
  const CADEIRA = 15; // caminhavel: da pra "sentar" em cima
  const TAPETE = 16; // caminhavel: so decoracao de chao
  const MESA_REUNIAO = 17;

  const SOLID_TILES = new Set([
    PAREDE, MESA, MESA_MONITOR, SOFA_CIMA, SOFA_BAIXO, MESA_CENTRO, ESTANTE,
    PLANTA, ARVORE, QUADRO, LOUSA, ARMARIO, BALCAO, CERCA, MESA_REUNIAO,
  ]);

  // Ambientes da sede. "piso" define o desenho do chao de toda a area e "cor" e a
  // identidade visual usada na etiqueta do mapa e nos cards da Visao de salas.
  const ROOMS = [
    { id: 'entrada', nome: 'Entrada', r0: 1, c0: 1, r1: 8, c1: 8, piso: 'tijolo', cor: '#1f9c8a', labelR: 1, labelC: 1 },
    { id: 'sala-principal', nome: 'Sala Principal', r0: 1, c0: 10, r1: 8, c1: 19, piso: 'tijolo_quente', cor: '#7a5cd0', labelR: 2, labelC: 10 },
    { id: 'salinha', nome: 'Salinha', r0: 1, c0: 21, r1: 8, c1: 26, piso: 'cinza', cor: '#3f7fc4', labelR: 2, labelC: 21 },
    { id: 'area-aberta', nome: 'Area Aberta', r0: 9, c0: 1, r1: 22, c1: 19, piso: 'tijolo', cor: '#d98324', labelR: 11, labelC: 1 },
    { id: 'lounge', nome: 'Lounge', r0: 9, c0: 20, r1: 22, c1: 27, piso: 'tijolo', cor: '#c25a3f', labelR: 10, labelC: 20 },
    { id: 'jardim', nome: 'Jardim', r0: 0, c0: 28, r1: 23, c1: 33, piso: 'grama', cor: '#3f9e57', labelR: 1, labelC: 28 },
  ];

  // Ilhas de carpete por cima do piso de tijolinho, como no Gather: as baias de
  // trabalho ficam sobre carpete roxo e o lounge sobre carpete listrado escuro.
  const ZONAS_PISO = [
    { r0: 12, c0: 2, r1: 15, c1: 6, piso: 'carpete_roxo' },
    { r0: 12, c0: 8, r1: 15, c1: 12, piso: 'carpete_roxo' },
    { r0: 18, c0: 2, r1: 21, c1: 6, piso: 'carpete_roxo' },
    { r0: 18, c0: 8, r1: 21, c1: 12, piso: 'carpete_roxo' },
    { r0: 12, c0: 20, r1: 18, c1: 24, piso: 'carpete_azul' },
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

    linhaV(9, 1, 8, PAREDE); // Entrada | Sala Principal
    linhaV(20, 1, 8, PAREDE); // Sala Principal | Salinha

    linhaH(9, 1, 26, PAREDE); // faixa da frente | fundo
    set(9, 4, LIVRE); // porta da Entrada
    set(9, 14, LIVRE); set(9, 15, LIVRE); // porta da Sala Principal
    set(9, 24, LIVRE); // porta da Salinha (sai no Lounge)

    linhaV(19, 12, 22, PAREDE); // divisoria do Lounge (passagem em cima, linhas 10-11)

    set(16, 27, LIVRE); set(17, 27, LIVRE); // porta pro jardim

    // cerca do jardim
    linhaH(0, 28, 33, CERCA);
    linhaH(23, 28, 33, CERCA);
    linhaV(33, 0, 23, CERCA);

    // ---------- Entrada (recepcao) ----------
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

    // ---------- Area aberta (baias de trabalho) ----------
    linhaH(10, 1, 2, ARMARIO);
    linhaH(10, 6, 8, ARMARIO);
    linhaH(10, 12, 13, ARMARIO);
    linhaH(10, 16, 17, ARMARIO);

    [[13, 3], [13, 9], [19, 3], [19, 9]].forEach(([r, c]) => {
      rect(r, c, r + 1, c + 2, MESA_MONITOR);
      linhaH(r - 1, c, c + 2, CADEIRA);
      linhaH(r + 2, c, c + 2, CADEIRA);
    });

    // cantinho de conversa no meio da area aberta
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

  function getRoomAtTile(col, row) {
    return ROOMS.find((s) => row >= s.r0 && row <= s.r1 && col >= s.c0 && col <= s.c1) || null;
  }

  function getRoomAt(x, y) {
    return getRoomAtTile(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  // Estilo de chao de um tile: vem do ambiente em que ele esta (corredores e
  // paredes fora de qualquer sala caem no creme).
  function pisoEmTile(col, row) {
    const zona = ZONAS_PISO.find((z) => row >= z.r0 && row <= z.r1 && col >= z.c0 && col <= z.c1);
    if (zona) return zona.piso;
    const sala = getRoomAtTile(col, row);
    return sala ? sala.piso : 'tijolo';
  }

  function isWalkableTile(col, row) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
    return !SOLID_TILES.has(tiles[row][col]);
  }

  function isWalkable(x, y) {
    const half = 10;
    const points = [
      [x - half, y - half], [x + half, y - half],
      [x - half, y + half], [x + half, y + half],
    ];
    for (const [px, py] of points) {
      const col = Math.floor(px / TILE);
      const row = Math.floor(py / TILE);
      if (!isWalkableTile(col, row)) return false;
    }
    return true;
  }

  window.OfficeMap = {
    TILE, COLS, ROWS, tiles,
    LIVRE, PAREDE, MESA, MESA_MONITOR, SOFA_CIMA, SOFA_BAIXO, MESA_CENTRO,
    ESTANTE, PLANTA, ARVORE, QUADRO, LOUSA, ARMARIO, BALCAO, CERCA, CADEIRA,
    TAPETE, MESA_REUNIAO,
    ROOMS,
    isWalkable,
    isTileWalkable: isWalkableTile,
    getRoomAt,
    getRoomAtTile,
    pisoEmTile,
  };
})();

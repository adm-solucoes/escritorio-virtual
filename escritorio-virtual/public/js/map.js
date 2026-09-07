// Mapa 2D da sede da ADM Solucoes, no layout do Gather: predio cercado de area
// verde, faixa de salas privativas com janelao na frente, patio com lago no
// meio, corredor e area aberta atras.
// ATENCAO: mantido em sincronia manualmente com server/map.js (sem bundler).
(function () {
  const TILE = 32;
  const COLS = 48;
  const ROWS = 32;

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
  const JANELA = 18;
  const AGUA = 19;
  const PEDRA = 20;
  const ARBUSTO = 21;
  const BANCO = 22;
  const CABIDE = 23;
  const IMPRESSORA = 24;
  const CAVALETE = 25;
  // Variacoes do catalogo do decorador (ver docs/plano-decorador.md)
  const MESA_DUPLA = 26; // bancada com dois monitores, como a da referencia
  const MESA_NOTEBOOK = 27;
  const PLANTA_GRANDE = 28;
  const VASO_FLORES = 29;
  const CACTO = 30;
  const POLTRONA = 31; // caminhavel: da pra sentar
  const CADEIRA_VERMELHA = 32; // caminhavel: da pra sentar
  const BEBEDOURO = 33;
  const TV = 34;
  const RELOGIO = 35;
  const TAPETE_REDONDO = 36; // caminhavel
  // Cadeiras nas outras direcoes (a pessoa senta virada pro lado que a cadeira
  // aponta). Todas caminhaveis.
  const CADEIRA_BAIXO = 37;
  const CADEIRA_ESQ = 38;
  const CADEIRA_DIR = 39;
  const CADEIRA_VERMELHA_BAIXO = 40;
  const CADEIRA_VERMELHA_ESQ = 41;
  const CADEIRA_VERMELHA_DIR = 42;
  const MESA_BAIXO = 43;
  const MESA_ESQ = 44;
  const MESA_DIR = 45;
  const MESA_MONITOR_BAIXO = 46;
  const MESA_MONITOR_ESQ = 47;
  const MESA_MONITOR_DIR = 48;

  const SOLID_TILES = new Set([
    PAREDE, MESA, MESA_MONITOR, SOFA_CIMA, SOFA_BAIXO, MESA_CENTRO, ESTANTE,
    PLANTA, ARVORE, QUADRO, LOUSA, ARMARIO, BALCAO, CERCA, MESA_REUNIAO,
    JANELA, AGUA, PEDRA, ARBUSTO, BANCO, CABIDE, IMPRESSORA, CAVALETE,
    MESA_DUPLA, MESA_NOTEBOOK, PLANTA_GRANDE, VASO_FLORES, CACTO, BEBEDOURO,
    MESA_BAIXO, MESA_ESQ, MESA_DIR,
    MESA_MONITOR_BAIXO, MESA_MONITOR_ESQ, MESA_MONITOR_DIR,
    TV, RELOGIO,
  ]);

  // Onde o boneco senta ao parar em cima, e pra que lado ele fica virado.
  const DIRECAO_ASSENTO = {
    [CADEIRA]: 'up',
    [CADEIRA_BAIXO]: 'down',
    [CADEIRA_ESQ]: 'left',
    [CADEIRA_DIR]: 'right',
    [CADEIRA_VERMELHA]: 'up',
    [CADEIRA_VERMELHA_BAIXO]: 'down',
    [CADEIRA_VERMELHA_ESQ]: 'left',
    [CADEIRA_VERMELHA_DIR]: 'right',
    [POLTRONA]: 'up',
  };
  const ASSENTOS = new Set(Object.keys(DIRECAO_ASSENTO).map(Number));

  // Pra que lado a mesa esta virada = pra que lado olha quem senta nela. 'up' e
  // a mesa canonica (monitor no fundo, quem senta fica embaixo); as outras sao a
  // mesma arte girada.
  const DIRECAO_MESA = {
    [MESA]: 'up',
    [MESA_MONITOR]: 'up',
    [MESA_BAIXO]: 'down',
    [MESA_ESQ]: 'left',
    [MESA_DIR]: 'right',
    [MESA_MONITOR_BAIXO]: 'down',
    [MESA_MONITOR_ESQ]: 'left',
    [MESA_MONITOR_DIR]: 'right',
  };
  const MESAS_DIRECIONAIS = new Set(Object.keys(DIRECAO_MESA).map(Number));
  // Mesas com computador: sao essas que da pra reivindicar como lugar.
  const MESAS_DE_TRABALHO = new Set([
    MESA_MONITOR, MESA_MONITOR_BAIXO, MESA_MONITOR_ESQ, MESA_MONITOR_DIR,
  ]);

  // Superficies onde faz sentido apoiar coisa (a camada de objetos por cima).
  const SUPERFICIES = new Set([
    MESA, MESA_MONITOR, MESA_DUPLA, MESA_NOTEBOOK, MESA_REUNIAO, MESA_CENTRO,
    MESA_BAIXO, MESA_ESQ, MESA_DIR,
    MESA_MONITOR_BAIXO, MESA_MONITOR_ESQ, MESA_MONITOR_DIR,
    BALCAO, ESTANTE, ARMARIO,
  ]);

  // Camada de cima: coisinhas apoiadas na celula. Nao bloqueiam passagem - quem
  // bloqueia e o movel embaixo.
  const OBJETOS = {
    NENHUM: 0,
    MONITOR: 1,
    MONITOR_DUPLO: 2,
    NOTEBOOK: 3,
    TECLADO: 4,
    CANECA: 5,
    PAPELADA: 6,
    TELEFONE: 7,
    LUMINARIA: 8,
    PLANTINHA: 9,
    LIVROS: 10,
  };

  // Salas privativas da faixa da frente (cada uma com janelao, carpete roxo,
  // mesa e porta pro corredor). Compartilham parede com a vizinha.
  const SALAS_FRENTE = [
    { id: 'diretoria', nome: 'Diretoria', c0: 3, c1: 11 },
    { id: 'financeiro', nome: 'Financeiro', c0: 11, c1: 19 },
    { id: 'projetos', nome: 'Projetos', c0: 27, c1: 35 },
    { id: 'marketing', nome: 'Marketing', c0: 35, c1: 44 },
  ];

  const ROOMS = [
    { id: 'diretoria', nome: 'Diretoria', r0: 4, c0: 3, r1: 11, c1: 11, piso: 'carpete_roxo', cor: '#7a5cd0', labelR: 5, labelC: 4 },
    { id: 'financeiro', nome: 'Financeiro', r0: 4, c0: 12, r1: 11, c1: 19, piso: 'carpete_roxo', cor: '#3f7fc4', labelR: 5, labelC: 12 },
    { id: 'patio', nome: 'Patio', r0: 4, c0: 20, r1: 11, c1: 26, piso: 'grama', cor: '#3f9e57', labelR: 4, labelC: 20 },
    { id: 'projetos', nome: 'Projetos', r0: 4, c0: 27, r1: 35, c1: 35, piso: 'carpete_roxo', cor: '#c25a3f', labelR: 5, labelC: 28 },
    { id: 'marketing', nome: 'Marketing', r0: 4, c0: 36, r1: 11, c1: 44, piso: 'carpete_roxo', cor: '#d98324', labelR: 5, labelC: 36 },
    { id: 'corredor', nome: 'Corredor', r0: 12, c0: 3, r1: 15, c1: 44, piso: 'tijolo', cor: '#8b98a8', labelR: 14, labelC: 4 },
    { id: 'lounge', nome: 'Lounge', r0: 16, c0: 3, r1: 29, c1: 13, piso: 'tijolo', cor: '#1f9c8a', labelR: 17, labelC: 4 },
    { id: 'time', nome: 'Time', r0: 16, c0: 14, r1: 29, c1: 32, piso: 'tijolo', cor: '#7c5cd4', labelR: 17, labelC: 15 },
    { id: 'reuniao', nome: 'Sala de Reuniao', r0: 16, c0: 33, r1: 29, c1: 44, piso: 'ladrilho', cor: '#e0607e', labelR: 17, labelC: 34 },
    // pega tudo que sobrou: a area verde em volta do predio
    { id: 'jardim', nome: 'Jardim', r0: 0, c0: 0, r1: 31, c1: 47, piso: 'grama', cor: '#3f9e57', labelR: 1, labelC: 1 },
  ];

  // Ilhas de carpete por cima do piso da sala. "contorno" desenha a moldura fina
  // que o Gather usa pra marcar uma area.
  const ZONAS_PISO = [
    // uma faixa de carpete por fileira de postos (as baias novas sao 4 mesas
    // individuais lado a lado, nao dois blocos)
    { r0: 17, c0: 15, r1: 20, c1: 32, piso: 'carpete_roxo' },
    { r0: 23, c0: 15, r1: 26, c1: 32, piso: 'carpete_roxo' },
    { r0: 19, c0: 5, r1: 26, c1: 11, piso: 'carpete_azul' },
    { r0: 4, c0: 20, r1: 11, c1: 26, piso: 'grama', contorno: '#5fb87a' },
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

    // ---------- salas privativas da frente ----------
    SALAS_FRENTE.forEach(({ c0, c1 }) => {
      linhaH(4, c0, c1, PAREDE);
      linhaH(4, c0 + 1, c1 - 1, JANELA); // janelao dando pro jardim
      linhaH(11, c0, c1, PAREDE);
      linhaV(c0, 4, 11, PAREDE);
      linhaV(c1, 4, 11, PAREDE);
      set(11, Math.floor((c0 + c1) / 2), LIVRE); // porta pro corredor

      set(6, c0 + 2, MESA_MONITOR);
      set(6, c0 + 3, MESA_MONITOR);
      set(7, c0 + 2, CADEIRA);
      set(7, c0 + 3, CADEIRA);
      set(5, c1 - 1, PLANTA);
      set(9, c0 + 1, ESTANTE);
      set(9, c1 - 1, ARMARIO);
    });

    // ---------- patio com lago (entre Financeiro e Projetos) ----------
    // pedras e arbustos so nas bordas: o anel em volta do lago (col 21-25,
    // linha 5-9) fica livre, senao o jardim vira uma ilha inalcancavel
    rect(6, 22, 8, 24, AGUA);
    [[4, 22], [4, 24], [10, 21], [10, 25], [6, 20], [8, 26]]
      .forEach(([r, c]) => set(r, c, PEDRA));
    [[4, 20], [4, 26], [10, 20], [10, 26]]
      .forEach(([r, c]) => set(r, c, ARBUSTO));
    set(7, 20, BANCO);
    set(7, 26, BANCO);

    // ---------- predio: paredes externas do corredor pra baixo ----------
    linhaV(3, 12, 30, PAREDE);
    linhaV(44, 12, 30, PAREDE);
    linhaH(30, 3, 44, PAREDE);

    // ---------- corredor: mobilia encostada na parede ----------
    // (evita as colunas das portas: 7, 15, 31, 39)
    [[4, ESTANTE], [5, ESTANTE], [9, CAVALETE], [10, PLANTA],
      [12, LOUSA], [13, LOUSA], [17, IMPRESSORA], [18, PLANTA],
      [22, CABIDE], [28, ESTANTE], [29, ESTANTE], [33, IMPRESSORA],
      [34, PLANTA], [36, LOUSA], [37, LOUSA], [41, ARMARIO], [42, ARMARIO]]
      .forEach(([c, t]) => set(12, c, t));

    // ---------- divisorias da area de tras (passagem pela linha 16) ----------
    linhaV(14, 17, 29, PAREDE);
    linhaV(33, 17, 29, PAREDE);

    // ---------- Lounge ----------
    linhaH(20, 6, 8, SOFA_CIMA);
    linhaH(25, 6, 8, SOFA_BAIXO);
    set(22, 7, MESA_CENTRO);
    set(17, 4, ESTANTE); set(17, 5, ESTANTE);
    set(18, 12, PLANTA);
    set(28, 4, PLANTA);
    set(27, 11, MESA);
    set(28, 11, CADEIRA);

    // ---------- Time: baias de trabalho ----------
    // Postos individuais, com vao entre eles. Medindo a referencia
    // (referencias/10-MESA-closeup-gavetas-e-pe.png), UMA pessoa fica numa mesa
    // de ~4 tiles de largura. A versao anterior punha 6 pessoas numa placa de 3
    // tiles - meio tile por pessoa -, o que fazia o conjunto parecer uma mesa
    // gigante de refeitorio em vez das baias do Gather.
    [18, 24].forEach((r) => {
      [15, 20, 25, 30].forEach((c) => {
        rect(r, c, r + 1, c + 2, MESA_MONITOR);  // mesa 3x2
        set(r + 2, c + 1, CADEIRA);              // uma cadeira, centrada
      });
    });
    set(17, 31, PLANTA);
    set(29, 15, PLANTA);
    set(22, 22, MESA_CENTRO);
    set(21, 22, CADEIRA_BAIXO); set(23, 22, CADEIRA);

    // ---------- Sala de Reuniao ----------
    linhaH(17, 37, 40, LOUSA);
    rect(21, 37, 22, 41, MESA_REUNIAO);
    linhaH(20, 37, 41, CADEIRA_BAIXO);   // acima da mesa: olham pra baixo
    linhaH(23, 37, 41, CADEIRA);         // abaixo: olham pra cima
    set(21, 36, CADEIRA_DIR); set(22, 36, CADEIRA_DIR);   // a esquerda: olham pra direita
    set(21, 42, CADEIRA_ESQ); set(22, 42, CADEIRA_ESQ);   // a direita: olham pra esquerda
    set(18, 43, PLANTA);
    set(28, 34, PLANTA);
    set(28, 43, ARMARIO);

    // ---------- area verde em volta ----------
    [[1, 5], [2, 9], [1, 14], [2, 19], [1, 24], [2, 29], [1, 34], [2, 39], [1, 43],
      [6, 1], [12, 1], [20, 1], [27, 1], [6, 46], [13, 46], [21, 46], [28, 46],
      [31, 8], [31, 20], [31, 36], [1, 1], [1, 46]]
      .forEach(([r, c]) => set(r, c, ARVORE));

    return tiles;
  }

  const tiles = buildMap();
  // Grade da camada de cima, comeca vazia (o servidor manda o que estiver salvo).
  const objetos = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));

  function getRoomAtTile(col, row) {
    return ROOMS.find((s) => row >= s.r0 && row <= s.r1 && col >= s.c0 && col <= s.c1) || null;
  }

  function getRoomAt(x, y) {
    return getRoomAtTile(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  function zonaEmTile(col, row) {
    return ZONAS_PISO.find((z) => row >= z.r0 && row <= z.r1 && col >= z.c0 && col <= z.c1) || null;
  }

  function pisoEmTile(col, row) {
    const zona = zonaEmTile(col, row);
    if (zona) return zona.piso;
    const sala = getRoomAtTile(col, row);
    return sala ? sala.piso : 'grama';
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
    TAPETE, MESA_REUNIAO, JANELA, AGUA, PEDRA, ARBUSTO, BANCO, CABIDE,
    IMPRESSORA, CAVALETE,
    MESA_DUPLA, MESA_NOTEBOOK, PLANTA_GRANDE, VASO_FLORES, CACTO, POLTRONA,
    CADEIRA_VERMELHA, BEBEDOURO, TV, RELOGIO, TAPETE_REDONDO,
    CADEIRA_BAIXO, CADEIRA_ESQ, CADEIRA_DIR,
    CADEIRA_VERMELHA_BAIXO, CADEIRA_VERMELHA_ESQ, CADEIRA_VERMELHA_DIR,
    MESA_BAIXO, MESA_ESQ, MESA_DIR,
    MESA_MONITOR_BAIXO, MESA_MONITOR_ESQ, MESA_MONITOR_DIR,
    ASSENTOS,
    DIRECAO_ASSENTO,
    DIRECAO_MESA,
    MESAS_DIRECIONAIS,
    MESAS_DE_TRABALHO,
    SUPERFICIES,
    OBJETOS,
    objetos,
    ROOMS,
    ZONAS_PISO,
    isWalkable,
    isTileWalkable: isWalkableTile,
    getRoomAt,
    getRoomAtTile,
    pisoEmTile,
  };
})();

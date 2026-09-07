// Mapa 2D da sede da ADM Solucoes (lado servidor: colisao e ponto de entrada).
// Mantido em sincronia manualmente com public/js/map.js (sem bundler no projeto).

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
// Da referencia do lounge (172725) e das salas de huddle (172815).
const PUFE = 49;         // caminhavel: da pra sentar
const MESA_REDONDA = 50;

const SOLID_TILES = new Set([
  PAREDE, MESA, MESA_MONITOR, SOFA_CIMA, SOFA_BAIXO, MESA_CENTRO, ESTANTE,
  PLANTA, ARVORE, QUADRO, LOUSA, ARMARIO, BALCAO, CERCA, MESA_REUNIAO,
  JANELA, AGUA, PEDRA, ARBUSTO, BANCO, CABIDE, IMPRESSORA, CAVALETE,
  MESA_DUPLA, MESA_NOTEBOOK, PLANTA_GRANDE, VASO_FLORES, CACTO, BEBEDOURO,
  MESA_BAIXO, MESA_ESQ, MESA_DIR,
  MESA_MONITOR_BAIXO, MESA_MONITOR_ESQ, MESA_MONITOR_DIR,
  TV, RELOGIO, MESA_REDONDA,
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
  [PUFE]: 'up',
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
  BALCAO, ESTANTE, ARMARIO, MESA_REDONDA,
]);

// Camada de cima: coisinhas apoiadas na celula (monitor, caneca, papelada...).
// Nao bloqueiam passagem - quem bloqueia e o movel embaixo.
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
  MONITOR_ULTRAWIDE: 11,
  TORRE_PC: 12,
  SETUP_GAMER: 13,
  MONITOR_LADO: 14,
  MONITOR_COSTAS: 15,
  TABLET: 16,
  CAIXAS_SOM: 17,
  TECLADO_GAMER: 18,
  HEADSET: 19,
  WEBCAM: 20,
  COPO_CAFE: 21,
  GARRAFA: 22,
  DONUT: 23,
  TIGELA: 24,
  POTE_BISCOITO: 25,
  CAFETEIRA: 26,
  PORTA_LAPIS: 27,
  CADERNO: 28,
  CALENDARIO: 29,
  POST_ITS: 30,
  CACTINHO: 31,
  PORTA_RETRATO: 32,
  TROFEU: 33,
  BONECO: 34,
  FLORES: 35,
  BOLA: 36,
  VELA: 37,
};
// O maior id valido. **Todo item novo precisa entrar aqui**: o servidor
// descarta calado o que passa disso, e o item some sem deixar pista.
// testes/mesas.js tem uma trava justamente pra isso.
const OBJETO_MAX = 37;

const SALAS_FRENTE = [
  { c0: 3, c1: 11 },
  { c0: 11, c1: 19 },
  { c0: 27, c1: 35 },
  { c0: 35, c1: 44 },
];

const ROOMS = [
  { id: 'diretoria', nome: 'Diretoria', r0: 4, c0: 3, r1: 11, c1: 11 },
  { id: 'financeiro', nome: 'Financeiro', r0: 4, c0: 12, r1: 11, c1: 19 },
  { id: 'patio', nome: 'Patio', r0: 4, c0: 20, r1: 11, c1: 26 },
  { id: 'projetos', nome: 'Projetos', r0: 4, c0: 27, r1: 35, c1: 35 },
  { id: 'marketing', nome: 'Marketing', r0: 4, c0: 36, r1: 11, c1: 44 },
  { id: 'corredor', nome: 'Corredor', r0: 12, c0: 3, r1: 15, c1: 44 },
  { id: 'lounge', nome: 'Lounge', r0: 16, c0: 3, r1: 29, c1: 13 },
  { id: 'time', nome: 'Time', r0: 16, c0: 14, r1: 29, c1: 32 },
  { id: 'reuniao', nome: 'Sala de Reuniao', r0: 16, c0: 33, r1: 29, c1: 44 },
  { id: 'jardim', nome: 'Jardim', r0: 0, c0: 0, r1: 31, c1: 47 },
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
  SALAS_FRENTE.forEach(({ c0, c1 }, i) => {
    linhaH(4, c0, c1, PAREDE);
    linhaH(4, c0 + 1, c1 - 1, JANELA);
    linhaH(11, c0, c1, PAREDE);
    linhaV(c0, 4, 11, PAREDE);
    linhaV(c1, 4, 11, PAREDE);
    set(11, Math.floor((c0 + c1) / 2), LIVRE);

    set(6, c0 + 2, MESA_MONITOR);
    set(6, c0 + 3, MESA_MONITOR);
    set(7, c0 + 2, CADEIRA);
    set(7, c0 + 3, CADEIRA);
    // Na referencia (172719) a sala privativa nao e mesa+cadeira num quadrado
    // vazio: tem quadro na parede, planta de porte e armario. As quatro salas
    // sao iguais no mapa, entao a variacao vem do `i`: cada uma ganha uma peca
    // de parede diferente, pra nao parecerem quatro copias.
    set(5, c0 + 1, [QUADRO, LOUSA, RELOGIO, QUADRO][i % 4]);
    set(5, c1 - 1, PLANTA_GRANDE);
    set(9, c0 + 1, ESTANTE);
    set(9, c0 + 2, ESTANTE);
    set(9, c1 - 1, ARMARIO);
    set(8, c1 - 1, [CACTO, VASO_FLORES, CACTO, VASO_FLORES][i % 4]);
  });

  // ---------- patio com lago ----------
  // pedras e arbustos so nas bordas: o anel em volta do lago fica livre
  // Na referencia (172749) o lago nao e um retangulo azul: e uma poca redonda
  // **cercada de pedra por todos os lados**, com arbusto em volta e assento
  // olhando pra ela. O anel de fora fica livre pra dar a volta.
  rect(6, 22, 8, 24, AGUA);
  set(5, 23, AGUA); set(9, 23, AGUA);          // arredonda em cruz
  // pedra fechando o contorno inteiro do lago
  // A pedra fecha o contorno da AGUA e mais nada. Fechar o retangulo inteiro
  // (linha 4 de ponta a ponta) selou o patio por cima - e era por ali que o
  // jardim de fora se ligava ao resto do mapa. testes/mapa.js pega isso agora.
  [[4, 23],
    [5, 22], [5, 24],
    [6, 21], [6, 25], [7, 21], [7, 25], [8, 21], [8, 25],
    [9, 22], [9, 24],
    [10, 23]]
    .forEach(([r, c]) => set(r, c, PEDRA));
  [[4, 20], [4, 26], [10, 20], [10, 26], [6, 19], [8, 27], [5, 27], [9, 19]]
    .forEach(([r, c]) => set(r, c, ARBUSTO));
  // O anel em volta do lago tem UM tile de largura. Banco e solido: posto ali,
  // ele parte o caminho e o jardim de fora fica sem ligacao com o resto do mapa.
  // Poltrona e assento CAMINHAVEL, entao da pra sentar olhando a agua sem
  // fechar a volta.
  set(6, 20, POLTRONA); set(8, 20, POLTRONA);
  set(6, 26, POLTRONA); set(8, 26, POLTRONA);

  // ---------- paredes externas ----------
  linhaV(3, 12, 30, PAREDE);
  linhaV(44, 12, 30, PAREDE);
  linhaH(30, 3, 44, PAREDE);

  // ---------- corredor ----------
  // A parede do corredor na referencia (172652) e continua de estante, quadro e
  // planta - quase nao sobra parede nua. Aqui vai a mesma ideia, alternando
  // estante / peca de parede / verde pra nao virar um paredao de estante.
  // As colunas 7, 15, 31 e 39 sao as PORTAS das salas da frente (o vao que o
    // `set(11, meio, LIVRE)` abre). Movel ali sela a sala: foi o que eu fiz na
    // primeira tentativa e deixou tres salas inalcancaveis. Ficam livres.
    [[4, ESTANTE], [5, ESTANTE], [6, QUADRO],
    [9, CAVALETE], [10, PLANTA], [11, TV],
    [12, LOUSA], [13, LOUSA], [16, PLANTA_GRANDE],
    [17, IMPRESSORA], [18, PLANTA], [19, QUADRO], [20, ESTANTE], [21, ESTANTE],
    [22, CABIDE], [24, RELOGIO], [25, QUADRO], [26, PLANTA_GRANDE],
    [28, ESTANTE], [29, ESTANTE], [30, QUADRO],
    [33, IMPRESSORA], [34, PLANTA], [35, TV],
    [36, LOUSA], [37, LOUSA], [40, PLANTA_GRANDE],
    [41, ARMARIO], [42, ARMARIO]]
    .forEach(([c, t]) => set(12, c, t));

  // ---------- divisorias ----------
  linhaV(14, 17, 29, PAREDE);
  linhaV(33, 17, 29, PAREDE);

  // ---------- Lounge ----------
  // Montado pela referencia (172725): estante cheia no fundo, sofa de um lado,
  // banco de madeira do outro, mesa redonda no meio e **pufe em cada canto** -
  // e o pufe que da a cara de lounge, mais que o sofa.
  linhaH(17, 4, 8, ESTANTE);
  linhaH(20, 6, 8, SOFA_CIMA);
  linhaH(25, 6, 8, SOFA_BAIXO);
  set(22, 7, MESA_CENTRO);
  set(21, 5, PUFE); set(21, 9, PUFE);
  set(24, 5, PUFE); set(24, 9, PUFE);
  set(22, 5, TAPETE_REDONDO);                    // tapete redondo sob a mesa
  set(18, 4, PLANTA_GRANDE); set(18, 10, PLANTA_GRANDE);
  set(26, 4, VASO_FLORES); set(26, 10, PLANTA_GRANDE);
  set(18, 12, PLANTA);
  set(28, 4, PLANTA);
  set(20, 12, QUADRO); set(24, 12, QUADRO);
  set(27, 11, MESA);
  set(28, 11, CADEIRA);
  set(29, 8, POLTRONA); set(29, 6, POLTRONA);

  // ---------- Time ----------
  // Postos individuais, com vao entre eles. Medindo a referencia
  // (referencias/10-MESA-closeup-gavetas-e-pe.png), UMA pessoa fica numa mesa de
  // ~4 tiles de largura. A versao anterior punha 6 pessoas numa placa de 3 tiles
  // - meio tile por pessoa -, o que fazia o conjunto parecer uma mesa gigante de
  // refeitorio em vez das baias do Gather.
  [18, 24].forEach((r) => {
    [15, 20, 25, 30].forEach((c) => {
      // 2 de largura por 1 de profundidade: a mesa da referencia e bem mais
      // larga do que funda. Com 2x2 ela virava um quadrado.
      // 3 blocos de largura por 2 de profundidade (medido pelo Caio na
      // referencia). As 2 fileiras dao a profundidade; o tampo da fileira da
      // frente e curto porque a de tras ja entregou uma celula inteira.
      rect(r, c, r + 1, c + 2, MESA_MONITOR);
      set(r + 2, c + 1, CADEIRA);
    });
  });
  set(17, 31, PLANTA);
  set(29, 15, PLANTA);
  set(22, 22, MESA_CENTRO);
  set(21, 22, CADEIRA_BAIXO); set(23, 22, CADEIRA);
  // parede da sala, que estava nua
  set(17, 16, QUADRO); set(17, 21, ESTANTE); set(17, 22, ESTANTE);
  set(17, 26, QUADRO); set(17, 30, TV);
  set(29, 20, PLANTA_GRANDE); set(29, 26, IMPRESSORA); set(29, 31, CACTO);
  set(22, 15, PLANTA_GRANDE); set(22, 32, PLANTA_GRANDE);

  // ---------- Sala de Reuniao ----------
  // Cadeira VERMELHA em volta da mesa grande: e o que a referencia mostra na
  // sala de conferencia (172825), e o vermelho e o unico ponto de cor forte no
  // andar - com cadeira escura a sala sumia no roxo do carpete.
  linhaH(17, 37, 40, LOUSA);
  rect(21, 37, 22, 41, MESA_REUNIAO);
  linhaH(20, 37, 41, CADEIRA_VERMELHA_BAIXO);
  linhaH(23, 37, 41, CADEIRA_VERMELHA);
  set(21, 36, CADEIRA_VERMELHA_DIR); set(22, 36, CADEIRA_VERMELHA_DIR);
  set(21, 42, CADEIRA_VERMELHA_ESQ); set(22, 42, CADEIRA_VERMELHA_ESQ);
  set(17, 42, TV);
  set(18, 43, PLANTA_GRANDE);
  // Sala de huddle da referencia (172815): mesa redonda com um assento em cada
  // lado, num canto separado da mesa grande de conferencia.
  set(27, 39, MESA_REDONDA);
  set(26, 39, CADEIRA_BAIXO); set(28, 39, CADEIRA);
  set(27, 38, CADEIRA_DIR); set(27, 40, CADEIRA_ESQ);
  set(26, 36, BEBEDOURO); set(26, 43, ARMARIO);
  set(28, 34, PLANTA);
  set(28, 43, ARMARIO);
  set(28, 37, TAPETE); set(28, 38, TAPETE); set(28, 39, TAPETE);

  // ---------- area verde ----------
  [[1, 5], [2, 9], [1, 14], [2, 19], [1, 24], [2, 29], [1, 34], [2, 39], [1, 43],
    [6, 1], [12, 1], [20, 1], [27, 1], [6, 46], [13, 46], [21, 46], [28, 46],
    [31, 8], [31, 20], [31, 36], [1, 1], [1, 46]]
    .forEach(([r, c]) => set(r, c, ARVORE));

  return tiles;
}

const tiles = buildMap();

// Todas as celulas do mesmo movel de mesa, a partir de qualquer uma delas.
// E o que faz "pegar a mesa" pegar a mesa inteira em vez de um bloco: uma mesa
// da sala Time tem 6 celulas (3 de largura por 2 de fundo).
//
// A ordem e estavel (de cima pra baixo, da esquerda pra direita), entao a
// primeira celula serve de chave da mesa: clicar em qualquer canto cai sempre
// na mesma chave. Le `tiles`, que o decorador altera em tempo de execucao.
function celulasDaMesa(col, row) {
  const ehMesa = (c, r) => (
    Number.isInteger(c) && Number.isInteger(r)
    && r >= 0 && r < ROWS && c >= 0 && c < COLS
    && MESAS_DE_TRABALHO.has(tiles[r][c])
  );
  if (!ehMesa(col, row)) return null;

  const vistos = new Set([col + ',' + row]);
  const fila = [[col, row]];
  const celulas = [];
  while (fila.length) {
    const [c, r] = fila.shift();
    celulas.push([c, r]);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
      const nc = c + dc;
      const nr = r + dr;
      if (vistos.has(nc + ',' + nr) || !ehMesa(nc, nr)) return;
      vistos.add(nc + ',' + nr);
      fila.push([nc, nr]);
    });
  }
  celulas.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  return celulas;
}

// Ate onde vai o TAMPO nesta celula, em unidades finas (0-128). Abaixo disso e
// a face vertical do movel, nao superficie: pousar ali faria a coisa flutuar na
// frente da gaveteira.
//
// Espelha exatamente o que `tampoDeMesa` desenha: numa mesa com face, o tampo
// acaba em 64 e os 64 de baixo sao a face; a fileira de TRAS de uma bancada de
// duas nao tem face nenhuma, entao vale a celula inteira.
function tampoAte(col, row) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return 0;
  const t = tiles[row][col];
  const temFace = MESAS_DIRECIONAIS.has(t) || t === MESA_DUPLA || t === MESA_NOTEBOOK;
  if (!temFace) return SUPERFICIES.has(t) ? 128 : 0;
  // tem mesa igual embaixo: esta e a fileira de tras, o tampo vai ate o fim
  if (tiles[row + 1] && tiles[row + 1][col] === t) return 128;
  return 64;
}

// O ponto (em tiles com fracao) cai no tampo de uma mesa?
function noTampo(x, y) {
  const col = Math.floor(x);
  const row = Math.floor(y);
  const limite = tampoAte(col, row);
  if (!limite) return false;
  return (y - row) * 128 <= limite;
}

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

// No corredor, em frente ao patio
const SPAWN_POINTS = [
  { x: 21.5 * TILE, y: 13.5 * TILE },
  { x: 22.5 * TILE, y: 13.5 * TILE },
  { x: 21.5 * TILE, y: 14.5 * TILE },
];

function getSpawnPoint() {
  const p = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  return { x: p.x, y: p.y };
}

// Copia da planta original. O decorador escreve em `tiles`; guardar o original
// deixa a gente saber quando uma celula voltou ao que era (e sai do arquivo de
// diferencas). Ver server/mapa-editado.js.
const baseTiles = tiles.map((linha) => linha.slice());

// Grade da camada de cima, comeca vazia (o que tiver e decoracao salva).
const objetos = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));

module.exports = {
  TILE,
  COLS,
  ROWS,
  tiles,
  baseTiles,
  objetos,
  ROOMS,
  ASSENTOS,
  DIRECAO_ASSENTO,
  SUPERFICIES,
  OBJETOS,
  OBJETO_MAX,
  isWalkable,
  celulasDaMesa,
  tampoAte,
  noTampo,
  getSpawnPoint,
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
  PUFE, MESA_REDONDA,
  DIRECAO_MESA,
  MESAS_DIRECIONAIS,
  MESAS_DE_TRABALHO,
};

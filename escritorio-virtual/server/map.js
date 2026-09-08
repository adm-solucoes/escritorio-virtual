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
// Da copa (172742) e da sala de huddle (172815).
const GELADEIRA = 51;
const AQUARIO = 52;
const LUMINARIA_PE = 53;

const SOLID_TILES = new Set([
  PAREDE, MESA, MESA_MONITOR, SOFA_CIMA, SOFA_BAIXO, MESA_CENTRO, ESTANTE,
  PLANTA, ARVORE, QUADRO, LOUSA, ARMARIO, BALCAO, CERCA, MESA_REUNIAO,
  JANELA, AGUA, PEDRA, ARBUSTO, BANCO, CABIDE, IMPRESSORA, CAVALETE,
  MESA_DUPLA, MESA_NOTEBOOK, PLANTA_GRANDE, VASO_FLORES, CACTO, BEBEDOURO,
  MESA_BAIXO, MESA_ESQ, MESA_DIR,
  MESA_MONITOR_BAIXO, MESA_MONITOR_ESQ, MESA_MONITOR_DIR,
  TV, RELOGIO, MESA_REDONDA, GELADEIRA, AQUARIO, LUMINARIA_PE,
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

const PODS = [9, 15, 28, 34]; // coluna de partida de cada sala privativa

const ROOMS = [
  { id: 'diretoria', nome: 'Diretoria', r0: 3, c0: 9, r1: 7, c1: 13 },
  { id: 'financeiro', nome: 'Financeiro', r0: 3, c0: 15, r1: 7, c1: 19 },
  { id: 'patio', nome: 'Patio', r0: 3, c0: 21, r1: 8, c1: 26 },
  { id: 'projetos', nome: 'Projetos', r0: 3, c0: 28, r1: 7, c1: 32 },
  { id: 'marketing', nome: 'Marketing', r0: 3, c0: 34, r1: 7, c1: 38 },
  { id: 'copa', nome: 'Copa', r0: 9, c0: 3, r1: 14, c1: 7 },
  { id: 'reuniao', nome: 'Sala de Reuniao', r0: 16, c0: 3, r1: 21, c1: 7 },
  { id: 'treinamento', nome: 'Treinamento', r0: 9, c0: 40, r1: 14, c1: 44 },
  { id: 'huddle', nome: 'Huddle', r0: 16, c0: 40, r1: 21, c1: 44 },
  { id: 'time', nome: 'Time', r0: 10, c0: 9, r1: 17, c1: 32 },
  { id: 'lounge', nome: 'Lounge', r0: 22, c0: 3, r1: 28, c1: 11 },
  { id: 'recepcao', nome: 'Recepcao', r0: 22, c0: 12, r1: 28, c1: 19 },
  { id: 'conferencia', nome: 'Conferencia', r0: 22, c0: 20, r1: 28, c1: 29 },
  // pega o resto do predio, e so depois o verde de fora
  { id: 'hall', nome: 'Hall', r0: 8, c0: 2, r1: 29, c1: 45 },
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

  // ---------- 1. faixa norte: quatro salas privativas e o patio ----------
  // Na referencia a sala privativa e um POD de 5x5 que avanca pra fora do bloco,
  // com janelao no fundo, uma arvore no canto, a mesa encostada na janela e a
  // cadeira na linha de baixo. Nada mais. Antes a gente tinha uma caixa de 8x8
  // cheia de movel pra disfarcar o tamanho.
  linhaH(2, 8, 39, PAREDE);
  [8, 14, 20, 27, 33, 39].forEach((c) => linhaV(c, 2, 8, PAREDE));
  PODS.forEach((c0) => {
    linhaH(2, c0 + 1, c0 + 3, JANELA);
    set(3, c0 + 4, PLANTA_GRANDE);
    linhaH(4, c0 + 1, c0 + 3, MESA_MONITOR);   // mesa 3x1
    set(5, c0 + 2, CADEIRA);                   // cadeira na linha de baixo
  });

  // ---------- 2. o bloco principal ----------
  linhaH(8, 2, 45, PAREDE);
  linhaH(29, 2, 45, PAREDE);
  linhaV(2, 8, 29, PAREDE);
  linhaV(45, 8, 29, PAREDE);
  // as duas colunas de salas fechadas so vao ate a linha 21: dai pra baixo o
  // salao abre na largura inteira, como na referencia
  linhaV(8, 8, 21, PAREDE);
  linhaV(39, 8, 21, PAREDE);
  linhaH(15, 3, 7, PAREDE); linhaH(22, 3, 7, PAREDE);
  linhaH(15, 40, 44, PAREDE); linhaH(22, 40, 44, PAREDE);

  // portas: vao de DOIS tiles, nao de um. E o que a referencia usa, e e o que
  // impede que um vaso mal posto sele a sala.
  PODS.forEach((c0) => { set(8, c0 + 2, LIVRE); set(8, c0 + 3, LIVRE); });
  linhaH(8, 21, 26, LIVRE);                    // o patio desagua no hall
  // entrada principal, embaixo da recepcao: e por ela que se chega do jardim
  set(29, 16, LIVRE); set(29, 17, LIVRE);
  [11, 12, 18, 19].forEach((r) => { set(r, 8, LIVRE); set(r, 39, LIVRE); });

  // ---------- 3. patio: o lago do Koi Pond ----------
  // Anel de pedra fechado em volta da agua e mais nada dentro. A volta de fora
  // fica limpa: da pra dar a volta no lago inteiro pelos dois lados.
  rect(4, 22, 7, 25, AGUA);
  [[4, 22], [4, 25], [7, 22], [7, 25]].forEach(([r, c]) => set(r, c, PEDRA));
  set(3, 22, CADEIRA_BAIXO); set(3, 24, CADEIRA_BAIXO);
  set(8, 23, CADEIRA); set(8, 25, CADEIRA);
  set(5, 21, CADEIRA_DIR); set(6, 26, CADEIRA_ESQ);
  // So um arbusto, e no canto: dois deles tapavam as duas pontas do corredor
  // de fora e o anel virava um bolso de nove celulas sem saida.
  set(3, 26, ARBUSTO);

  // ---------- 4. a parede norte do hall, coberta de movel ----------
  // Na referencia sao 15 pecas em 24 tiles: quase nao sobra parede nua. As
  // colunas de porta (c0+2 e c0+3 de cada pod) e o vao do patio ficam livres.
  [[9, PLANTA_GRANDE], [10, ESTANTE], [13, ESTANTE], [14, QUADRO], [15, CACTO],
    [16, ESTANTE], [19, GELADEIRA], [20, BALCAO],
    [27, PLANTA], [28, ESTANTE], [29, ESTANTE], [32, RELOGIO], [33, LOUSA],
    [34, CAVALETE], [35, ESTANTE], [38, PLANTA_GRANDE]]
    .forEach(([c, t]) => set(8, c, t));

  // ---------- 5. Copa ----------
  // Bancada com cafeteira embutida na parede, mesa redonda no meio e uma
  // cadeira por lado. Sem mesa de trabalho: copa e copa.
  [[3, ARMARIO], [4, BALCAO], [5, BALCAO], [6, GELADEIRA], [7, PLANTA]]
    .forEach(([c, t]) => set(8, c, t));
  set(11, 5, MESA_REDONDA);
  set(10, 5, CADEIRA_BAIXO); set(12, 5, CADEIRA);
  set(11, 4, CADEIRA_DIR); set(11, 6, CADEIRA_ESQ);
  set(9, 3, PLANTA_GRANDE); set(14, 7, VASO_FLORES);

  // ---------- 6. Sala de Reuniao (huddle de 4, coluna oeste) ----------
  [[3, ESTANTE], [4, ESTANTE], [5, QUADRO], [6, QUADRO], [7, PLANTA]]
    .forEach(([c, t]) => set(15, c, t));
  set(18, 5, MESA_REDONDA);
  set(17, 5, CADEIRA_BAIXO); set(19, 5, CADEIRA);
  set(18, 4, CADEIRA_DIR); set(18, 6, CADEIRA_ESQ);
  set(21, 3, ARMARIO); set(21, 7, IMPRESSORA);

  // ---------- 7. Treinamento (huddle do quadro branco, coluna leste) ----------
  [[40, LOUSA], [41, LOUSA], [42, JANELA], [43, CAVALETE], [44, ARMARIO]]
    .forEach(([c, t]) => set(8, c, t));
  set(11, 42, MESA_REDONDA);
  set(10, 42, CADEIRA_BAIXO); set(12, 42, CADEIRA);
  set(11, 41, CADEIRA_DIR); set(11, 43, CADEIRA_ESQ);
  set(9, 44, PLANTA_GRANDE); set(14, 40, CACTO);

  // ---------- 8. Huddle (o do aquario, coluna leste) ----------
  [[40, AQUARIO], [41, PLANTA], [42, ESTANTE], [43, ESTANTE], [44, LUMINARIA_PE]]
    .forEach(([c, t]) => set(15, c, t));
  set(18, 42, MESA_REDONDA);
  set(17, 42, CADEIRA_BAIXO); set(19, 42, POLTRONA);
  set(18, 41, CADEIRA_DIR); set(18, 43, CADEIRA_ESQ);
  set(21, 43, TV); set(21, 44, TV);

  // ---------- 9. baias de trabalho: duas ilhas de carpete ----------
  // Mesa de 3 de largura por UMA de profundidade, cadeira na linha de baixo -
  // essa e a medida da referencia. A profundidade 2 que a gente usava era o que
  // fazia a baia parecer mesa de refeitorio.
  //
  // O tile de vao entre uma mesa e a vizinha nao e enfeite: celulasDaMesa()
  // junta celulas de mesa que se tocam, entao mesa colada na outra viraria um
  // movel so e uma pessoa reivindicaria as tres de uma vez.
  [9, 21].forEach((c0) => {
    [11, 15].forEach((r) => {
      [0, 4, 8].forEach((d) => {
        linhaH(r, c0 + d, c0 + d + 2, MESA_MONITOR);
        set(r + 1, c0 + d + 1, CADEIRA);
      });
    });
  });

  // ---------- 10. huddle solto no meio do salao ----------
  set(14, 35, MESA_REDONDA);
  set(13, 35, CADEIRA_BAIXO); set(15, 35, CADEIRA);
  set(14, 34, CADEIRA_DIR); set(14, 36, CADEIRA_ESQ);
  set(12, 34, PLANTA_GRANDE); set(16, 36, PLANTA);

  // ---------- 10b. o canto direito do salao ----------
  // Um respiro de estar entre a baia e a sala da ponta, senao sobrava um
  // quarteirao de piso liso do lado direito inteiro.
  set(19, 35, MESA_CENTRO);
  set(19, 34, POLTRONA); set(19, 36, POLTRONA);
  set(18, 33, PLANTA_GRANDE); set(20, 37, PLANTA);
  set(25, 36, MESA_REDONDA);
  set(24, 36, CADEIRA_BAIXO); set(26, 36, CADEIRA);
  set(25, 35, CADEIRA_DIR); set(25, 37, CADEIRA_ESQ);
  set(23, 34, PLANTA_GRANDE); set(27, 39, VASO_FLORES);

  // ---------- 11. Lounge ----------
  // Composicao simetrica da referencia: estante e estante no fundo, sofa no
  // meio, um par de pufe em cada lateral e dois bancos na frente.
  linhaH(23, 4, 5, ESTANTE); linhaH(23, 9, 10, ESTANTE);
  set(24, 4, PLANTA_GRANDE); set(24, 10, PLANTA_GRANDE);
  // SOFA_BAIXO e o sofa inteiro (3x2): a arte sobe pra linha de cima sozinha.
  // SOFA_CIMA nao tem desenho proprio - posto sozinho, o sofa simplesmente
  // nao aparecia.
  linhaH(24, 6, 8, SOFA_BAIXO);
  set(25, 7, MESA_CENTRO);
  set(25, 4, PUFE); set(25, 10, PUFE);
  set(26, 4, PUFE); set(26, 10, PUFE);
  linhaH(26, 6, 8, BANCO);
  set(27, 4, VASO_FLORES); set(27, 10, PUFE);

  // ---------- 12. Recepcao ----------
  linhaH(24, 15, 17, BALCAO);
  set(23, 16, CADEIRA_BAIXO);                  // quem atende, virado pro balcao
  set(23, 12, PLANTA_GRANDE); set(23, 19, CABIDE);
  rect(25, 14, 27, 16, TAPETE);                // o tapete de losangos do lobby
  set(27, 13, POLTRONA); set(27, 17, POLTRONA);
  set(26, 19, PLANTA_GRANDE);

  // ---------- 13. mesa de conferencia, solta no salao ----------
  // Na referencia ela nao mora numa sala: fica no meio do tijolinho, com dez
  // poltronas vermelhas em volta. O vermelho e o unico ponto de cor forte do
  // andar.
  rect(25, 24, 26, 26, MESA_REUNIAO);
  linhaH(24, 24, 26, CADEIRA_VERMELHA_BAIXO);
  linhaH(27, 24, 26, CADEIRA_VERMELHA);
  set(25, 23, CADEIRA_VERMELHA_DIR); set(26, 23, CADEIRA_VERMELHA_DIR);
  set(25, 27, CADEIRA_VERMELHA_ESQ); set(26, 27, CADEIRA_VERMELHA_ESQ);
  set(23, 21, PLANTA_GRANDE); set(23, 29, PLANTA_GRANDE);

  // ---------- 14. a parede sul, tambem coberta ----------
  // A TV do pacote e larga: vai em par de celulas, senao a arte corta no meio.
  [[4, PLANTA_GRANDE], [6, TV], [7, TV], [8, QUADRO], [9, QUADRO], [10, QUADRO],
    [12, CABIDE], [14, ESTANTE], [15, ESTANTE], [17, LOUSA], [19, PLANTA],
    [21, ARMARIO], [22, ARMARIO], [24, IMPRESSORA], [26, BEBEDOURO],
    [28, PLANTA_GRANDE], [30, TV], [31, TV], [32, ESTANTE], [33, ESTANTE],
    [35, QUADRO], [37, RELOGIO], [39, PLANTA], [41, ARMARIO], [42, ARMARIO],
    [44, CACTO]]
    .forEach(([c, t]) => set(28, c, t));

  // ---------- 15. o verde em volta do predio ----------
  [[0, 4], [1, 12], [0, 20], [1, 28], [0, 36], [1, 44], [0, 0], [1, 47],
    [4, 0], [11, 1], [18, 0], [25, 1], [4, 47], [11, 46], [18, 47], [25, 46],
    [31, 6], [30, 16], [31, 26], [30, 36], [31, 43]]
    .forEach(([r, c]) => set(r, c, ARVORE));
  [[2, 3], [2, 45], [6, 46], [20, 46], [6, 1], [20, 1], [30, 10], [30, 30]]
    .forEach(([r, c]) => set(r, c, ARBUSTO));

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

// No salao, logo abaixo do vao do patio
const SPAWN_POINTS = [
  { x: 22.5 * TILE, y: 9.5 * TILE },
  { x: 23.5 * TILE, y: 9.5 * TILE },
  { x: 24.5 * TILE, y: 9.5 * TILE },
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
  PUFE, MESA_REDONDA, GELADEIRA, AQUARIO, LUMINARIA_PE,
  DIRECAO_MESA,
  MESAS_DIRECIONAIS,
  MESAS_DE_TRABALHO,
};

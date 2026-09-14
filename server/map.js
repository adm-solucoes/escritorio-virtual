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
// Porta que abre quando alguem chega perto. CAMINHAVEL de proposito: ela nao
// fecha passagem, so mostra que ali e passagem. Ver o desenho em game.js
// (`desenharPortas`), que roda a cada quadro - porta animada nao cabe no
// pre-render, que e estatico.
const PORTA = 54;

const SOLID_TILES = new Set([
  // SOFA_BAIXO NAO entra aqui: e onde a pessoa senta. Ver DIRECAO_ASSENTO.
  // SOFA_CIMA continua solido - aquela celula e o ENCOSTO, nao o assento.
  PAREDE, MESA, MESA_MONITOR, SOFA_CIMA, MESA_CENTRO, ESTANTE,
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
  // O sofa da copa e do lobby e UMA peca de 3x2 ancorada na linha de BAIXO:
  // a arte sobe e cobre a celula de cima. Entao a celula de baixo e o
  // ASSENTO (almofada e bracos) e a de cima e o ENCOSTO. Por isso so
  // SOFA_BAIXO senta, e senta virado pra 'down' - o sofa abre pro sul.
  [SOFA_BAIXO]: 'down',
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
// ---------------------------------------------------------------- as salas
//
// A planta segue o partido de EIXO DE CIRCULACAO (docs/plano-redesenho.md):
// uma espinha leste-oeste de 3 tiles atravessa o andar, a banda de salas
// fechadas fica ao norte dela e os bairros de trabalho ao sul.
//
// A ordem das zonas no eixo nao e arbitraria: e um GRADIENTE ACUSTICO.
// Oeste = cabine de chamada e sala de reuniao (silencio). Leste = copa e
// lounge (barulho). A regra de projeto e nunca encostar zona barulhenta em
// zona de foco, e aqui isso nao e metafora - o calls.js propaga som por
// proximidade de verdade.
//
// Faixas de linha, de cima pra baixo:
//    2       parede norte
//    3..13   banda de salas (11 de profundidade)
//    14      parede sul da banda, com as portas
//    15..17  EIXO PRINCIPAL (3 tiles = ~1,5 m: duas pessoas se cruzam)
//    18..29  bairros de trabalho e recepcao
//    30      parede sul
  // --- banda norte, de oeste (silencio) para leste (barulho) ---
  { id: 'cabine1', nome: 'Cabine 1', r0: 3, c0: 3, r1: 5, c1: 7, privativa: true },
  { id: 'cabine2', nome: 'Cabine 2', r0: 7, c0: 3, r1: 9, c1: 7, privativa: true },
  { id: 'cabine3', nome: 'Cabine 3', r0: 11, c0: 3, r1: 13, c1: 7, privativa: true },
  { id: 'reuniao', nome: 'Sala de Reuniao', r0: 3, c0: 12, r1: 13, c1: 18, privativa: true },
  { id: 'huddle1', nome: 'Huddle 1', r0: 3, c0: 20, r1: 7, c1: 25, privativa: true },
  { id: 'huddle2', nome: 'Huddle 2', r0: 9, c0: 20, r1: 13, c1: 25, privativa: true },
  // Silenciosa: dentro dela a chamada por proximidade nao abre (calls.js).
  { id: 'biblioteca', nome: 'Biblioteca', r0: 3, c0: 29, r1: 13, c1: 35, silenciosa: true },
  { id: 'copa', nome: 'Copa e Lounge', r0: 3, c0: 36, r1: 13, c1: 44 },

  // --- sul: recepcao e os quatro bairros ---
  { id: 'recepcao', nome: 'Recepcao', r0: 18, c0: 3, r1: 29, c1: 9 },
  { id: 'bairro_a', nome: 'Foco A', r0: 18, c0: 11, r1: 23, c1: 26 },
  { id: 'bairro_b', nome: 'Foco B', r0: 24, c0: 11, r1: 29, c1: 26 },
  { id: 'bairro_c', nome: 'Projetos', r0: 18, c0: 28, r1: 23, c1: 43 },
  { id: 'bairro_d', nome: 'Marketing', r0: 24, c0: 28, r1: 29, c1: 43 },

  // Pega o RESTO do predio inteiro, nao so o eixo: os corredores da banda
  // norte nao cabem em nenhuma sala nomeada, e sem isto caem no piso padrao,
  // que e grama - chao de jardim brotando dentro do escritorio.
  { id: 'hall', nome: 'Hall', r0: 3, c0: 3, r1: 29, c1: 44 },
  { id: 'jardim', nome: 'Jardim', r0: 0, c0: 0, r1: 31, c1: 47 },

// parede. Cada bairro tem a sua, e as duas duplas ganham tom diferente pra
// pessoa saber onde esta sem ler etiqueta (principio de "bairro" com
// identidade visual propria).
  // Tapete da sala de reuniao, como PLACA DE CARPETE. Comeca em linha e
  // coluna multiplas de 3 de proposito: `desenharPiso` escolhe a fatia por
  // `c % 3`, e fora desse alinhamento a borda do bloco sai fora de ordem.
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

  // ---------------------------------------------------------------- 1. casca
  // Janela nao e enfeite: e o principio biofilico mais barato que existe -
  // luz e vista pra fora. Por isso a fachada norte e quase toda envidracada.
  linhaH(2, 2, 45, PAREDE);
  linhaH(30, 2, 45, PAREDE);
  linhaV(2, 2, 30, PAREDE);
  linhaV(45, 2, 30, PAREDE);
  [4, 5, 6, 13, 14, 15, 16, 22, 23, 24, 30, 31, 32, 33, 38, 39, 40, 41]
    .forEach((c) => set(2, c, JANELA));
  // JANELA so na parede NORTE, que e horizontal.
  //
  // O muro daqui e visto de cima: da fileira horizontal a gente ve a FACE
  // (a faixa clara do topo), e e nela que uma janela desenhada de frente faz
  // sentido. Na parede lateral a gente ve o lado do muro, e a mesma arte fica
  // flutuando num painel escuro - foi o que o Caio viu.
  //
  // Preferi a lateral cega a uma janela errada. Janela de parede lateral
  // exigiria a projecao de 3 tiles do LPC, que e o mesmo pendente da parede e
  // do balcao.
  // porta da rua, no sul, dando direto na recepcao (folha dupla)
  set(30, 5, PORTA); set(30, 6, PORTA);

  // -------------------------------------------- 2. banda norte: as divisorias
  // Parede sul da banda, SO no trecho fechado (a leste dela o jardim e a copa
  // sao zonas abertas, que dao direto no eixo - cafe aberto pra circulacao e
  // padrao reconhecido, nao descuido).
  linhaH(14, 2, 28, PAREDE);

  // cabines de chamada: tres modulos de 5x3, empilhados
  linhaH(6, 2, 8, PAREDE);
  linhaH(10, 2, 8, PAREDE);
  linhaV(8, 3, 13, PAREDE);
  // SO EM PAREDE HORIZONTAL.
    //
    // A folha do pacote e uma porta vista DE FRENTE, e a sede a ve de cima: isso
    // so funciona no muro deitado, onde a gente enxerga a face dele. Em muro em pe
    // a gente ve o LADO, e ali a mesma arte fica virada pro lugar errado. Girar 90
    // graus foi tentado e ficou pior - a porta vira uma tabua deitada no corredor.
    //
    // Entao cabine e huddle continuam com vao aberto, que e honesto, ate existir
    // arte de porta vista de lado. Sexta peca a esbarrar nessa mesma
    // incompatibilidade de projecao (parede, janela, balcao, bancada, marco).
  [4, 8, 12].forEach((r) => set(r, 8, LIVRE)); // vao de cada cabine

  // corredor vertical oeste (cols 9-10) desce ate o eixo
  set(14, 9, LIVRE); set(14, 10, LIVRE);

  // sala de reuniao grande
  linhaV(11, 3, 13, PAREDE);
  linhaV(19, 3, 13, PAREDE);
  set(14, 15, PORTA); // porta pro eixo

  // dois huddles, um sobre o outro, servidos pelo corredor leste (cols 26-27)
  linhaH(8, 20, 25, PAREDE);
  linhaV(26, 3, 13, PAREDE);
  set(5, 26, LIVRE); set(11, 26, LIVRE);  // vao de cada huddle
  linhaV(28, 3, 13, PAREDE);
  set(14, 26, LIVRE); set(14, 27, LIVRE); // corredor leste desce pro eixo

  // ------------------------------------------------ 3. dentro das cabines
  // Cabine de chamada e o movel minimo: uma poltrona, um apoio e uma planta.
  // Tres delas atendem 32 postos na razao de 1 pra 10-15 pessoas.
  [3, 7, 11].forEach((r0) => {
    set(r0 + 1, 4, MESA_CENTRO);   // linha r0 livre pra arte subir
    set(r0 + 2, 4, POLTRONA);
    set(r0 + 2, 6, PLANTA);
    set(r0 + 2, 7, LUMINARIA_PE);
  });

  // --------------------------------------------- 4. dentro da sala de reuniao
  // Mesa de 3 tiles com cadeira dos quatro lados, lousa e TV na parede do
  // fundo. 8 lugares - a sala grande da razao 1:10.
  rect(7, 14, 8, 16, MESA_REUNIAO);
  [14, 15, 16].forEach((c) => { set(6, c, CADEIRA_VERMELHA_BAIXO); set(9, c, CADEIRA_VERMELHA); });
  set(8, 18, PLANTA);
  set(3, 13, LOUSA);
  rect(3, 15, 3, 17, TV);
  // A planta desce uma linha: em 4,12 ela fechava um canto de UM tile entre
  // a lousa e a parede, e o mapa nao pode ter bolsao nem de um tile.
  set(5, 12, PLANTA_GRANDE); set(13, 17, PLANTA);


  // ------------------------------------------------------ 5. dentro dos huddles
  // 60% ou mais das salas tem que ser de 2 a 6 lugares, porque 80% das
  // reunioes sao desse tamanho. Duas de quatro lugares cumprem a cota.
  [3, 9].forEach((r0) => {
    set(r0 + 2, 22, MESA_REDONDA);
    set(r0 + 1, 22, CADEIRA_BAIXO);
    set(r0 + 3, 22, CADEIRA);
    set(r0 + 2, 21, CADEIRA_DIR);
    set(r0 + 2, 23, CADEIRA_ESQ);
    set(r0, 25, PLANTA);
  });
  set(3, 20, QUADRO); set(9, 20, QUADRO);

  // ---------------------------------------------------------- 6. biblioteca
  // Ocupa o antigo jardim inteiro (docs/plano-biblioteca.md). Por dentro ela
  // segue a regra de zoneamento de biblioteca: do barulho pro silencio, da porta
  // pro fundo. E o fundo e a fachada norte envidracada - onde a leitura quer
  // estar, com luz de norte, difusa e sem sol direto no papel.
  //
  //   linha 13      entrada, vinda do eixo
  //   linhas 9-12   acervo: duas fileiras de estante e o corredor entre elas
  //   linhas 3-8    leitura: mesa debaixo da janela e canto de poltrona
  //
  // A copa, a zona mais barulhenta da sede, fica colada a leste. Por isso:
  // parede CHEIA entre as duas, e a regra de silencio no calls.js
  // (`silenciosa: true`) - dentro dela a chamada nao abre.
  linhaV(36, 3, 14, PAREDE);                 // parede com a copa, sem porta
  linhaH(14, 29, 36, PAREDE);                // parede com o eixo...
  // ...e a porta, no canto oeste. Era LIVRE (um vao aberto) porque quando a
  // biblioteca foi feita a porta animada ainda nao existia; agora existe, e
  // PORTA e o que fecha a sala de verdade. Importa aqui mais que nas outras:
  // a biblioteca e `silenciosa`, e sala de silencio com buraco na parede nao
  // convence ninguem.
  set(14, 29, PORTA);

  // Mesa de leitura DEBAIXO da janela: a luz chega de cima e de lado, nao de
  // frente pro olho. A linha 3 fica livre de proposito - e a faixa de luz.
  rect(4, 30, 5, 32, MESA_REUNIAO);
  [30, 31, 32].forEach((c) => set(6, c, CADEIRA));   // viradas pra janela
  set(5, 29, CADEIRA_DIR); set(5, 33, CADEIRA_ESQ);  // uma em cada ponta

  // Canto de leitura: o SEGUNDO tipo de lugar. Mesa e pra quem estuda de caderno
  // aberto; poltrona com luminaria e pra quem so le.
  set(4, 35, POLTRONA);
  // Luminaria de pe AO LADO da poltrona, e nao atras: a arte dela tem 2 tiles e
  // sobe - na linha 3 ela subia pra cima do muro e virava arandela. Na 4 ela
  // sobe pro tapete. E a luz de tarefa, a camada que a luz da janela nao da.
  // Sem mesinha de apoio: a do pacote sai como duas caixas empilhadas.
  set(4, 34, LUMINARIA_PE);

  // Acervo: duas fileiras de 5 estantes, SOLTAS das paredes dos lados. As colunas
  // 29 e 35 ficam livres de ponta a ponta, entao da pra dar a volta nas duas - e
  // da porta, no canto oeste, a vista corre pela coluna 29 ate a janela. Estante
  // alta no meio de sala tapa a linha de visao; posta assim ela tapa o acervo,
  // nao o caminho.
  //
  // Cada fileira tem a linha de CIMA livre, porque a arte da estante sobe um
  // tile. Corredor entre as duas: linhas 10-11 = 1,0 m, acima dos 0,91 m minimos
  // de corredor de acervo.
  linhaH(9, 30, 34, ESTANTE);
  linhaH(12, 30, 34, ESTANTE);
  set(3, 29, PLANTA);
  set(13, 35, PLANTA);                       // a arte sobe pra (12,35), que esta livre

  // -------------------------------------------------------- 7. copa e lounge
  // Extremo LESTE do gradiente acustico: e a zona barulhenta, e fica o mais
  // longe possivel das cabines de chamada, que estao no extremo oeste.
  // A bancada do pacote tem 3 de largura por 2 de altura: o balcao ocupa
  // duas linhas e um multiplo de tres colunas, pra arte nao ser cortada.
  // TRES GRUPOS, e nada solto entre eles.
  //
  // A versao anterior tinha as pecas certas e nenhuma composicao: mesinha de
  // canto sozinha, pufe sozinho, luminaria no meio do chao, poltronas
  // desencontradas. Cada movel parecia ter caido ali. E o mesmo erro que a
  // recepcao tinha, e a correcao e a mesma: movel de escritorio anda em grupo,
  // e o que sobra vira ruido.
  //
  //   1. BANCADA, colada na parede norte, com a geladeira na ponta.
  //   2. DUAS MESAS de cafe, de dois lugares, simetricas.
  //   3. LOUNGE, um bloco so: sofa de tres, mesa de centro na frente e um pufe
  //      de cada lado dela.
  //
  // O chao entre os grupos fica VAZIO de proposito - e por onde se anda.
  //
  // POR QUE AS MESAS PERDERAM AS CADEIRAS DE LADO
  // O Caio disse que a copa estava "muito cheia de coisas". Contando, o
  // problema nao era a quantidade de movel - era CIRCULACAO. A sala tem 8
  // colunas uteis (37 a 44). Cada mesa de quatro lugares ocupava 3 delas
  // (cadeira, mesa, cadeira), e as duas lado a lado tomavam as colunas
  // 37-39 e 41-43: SEIS das oito, formando uma parede de movel atravessada
  // na sala. Sobrava a coluna 40 e a 44 pra passar.
  //
  // Tirando so as duas cadeiras LATERAIS de cada mesa, a faixa das mesas
  // passa a ocupar 2 colunas das 8. Mesmo numero de mesas, mesma simetria,
  // e a sala volta a ter por onde andar. Mesa redonda com duas cadeiras de
  // frente uma pra outra e o arranjo de bistro - nao fica faltando nada.
  //
  // O vaso de 3 tiles de altura tambem saiu: num pe-direito de 11 linhas
  // ele era a maior massa visual da sala, colado no lounge. Ficou o vaso
  // baixo do canto.

  // 1. bancada
  // UMA linha. O balcao e desenhado a mao e cabe na propria celula; as duas
  // linhas aqui eram resto da tentativa com a bancada do pacote, que foi
  // revertida. Empilhado em duas ele virava uma pilha de prateleiras brancas -
  // reverter a arte sem desfazer o mapa deixa esse tipo de rastro.
  // Ate a coluna 43, e nao 42: sobrava um tile de chao entre a ponta do
  // balcao e a geladeira, e aquele buraco fazia a geladeira ler como movel
  // solto no canto em vez de fim da bancada. Cozinha e uma FILEIRA continua.
  linhaH(3, 37, 43, BALCAO);
  set(3, 44, GELADEIRA);   // a da coluna 36 saiu: ali e a parede da biblioteca

  // 2. duas mesas de cafe, mesma altura, mesmo espacamento
  [38, 42].forEach((c) => {
    set(7, c, MESA_REDONDA);
    set(6, c, CADEIRA_BAIXO);
    set(8, c, CADEIRA);
  });

  // 3. lounge, em bloco: sofa, mesa de centro e um pufe de cada lado
  rect(10, 38, 10, 40, SOFA_CIMA);
  rect(11, 38, 11, 40, SOFA_BAIXO);
  // A mesinha encostada no sofa e os pufes de frente pra ele: sofa, mesa e
  // dois lugares em 3 colunas, alinhados com o sofa. Antes a mesa ficava na
  // linha 13 porque a arte dela subia um tile - nao sobe mais (a peca e de
  // 1 tile; ver MESA_CENTRO em sprites.js), e solta duas linhas abaixo do
  // sofa ela lia como movel perdido no meio da sala.
  set(12, 39, MESA_CENTRO);
  set(13, 38, PUFE); set(13, 40, PUFE);

  // verde so nos cantos, pra nao competir com os grupos
  set(13, 44, PLANTA);

  // ------------------------------------------------------------ 8. recepcao
  // Piso de espinha de peixe: a entrada e onde o material bom aparece.
  //
  // A recepcao e DOIS GRUPOS e nada solto no meio. Foi assim que ela ficou
  // ruim antes: cadeira aqui, mesinha ali, poltrona no canto - cada peca
  // certa sozinha e o conjunto sem leitura nenhuma. Movel em escritorio anda
  // em grupo, e o que sobra vira ruido.
  //
  //   1. ATENDIMENTO, colado na porta da rua (linha 30, colunas 5-6):
  //      bancada de 3x2 com quem atende sentado atras dela.
  //   2. ESPERA, do outro lado: sofa de 3, mesinha na frente e planta.
  //
  // O resto do piso fica VAZIO de proposito - e por onde a visita entra e
  // caminha ate o eixo.
  // Quem atende senta ATRAS do balcao, virado pra porta da rua (linha 30).
  // Antes a cadeira ficava na linha 29, entre o balcao e a porta, e virada pra
  // cima: a recepcionista recebia a visita de costas.
  linhaH(28, 5, 7, BALCAO);
  set(27, 6, CADEIRA_BAIXO);

  rect(20, 4, 20, 6, SOFA_CIMA);
  rect(21, 4, 21, 6, SOFA_BAIXO);
  set(22, 5, MESA_CENTRO);   // encostada no sofa: a mesinha e de 1 tile so
  set(19, 3, PLANTA_GRANDE);
  set(23, 3, PLANTA);

  set(18, 8, RELOGIO);
  rect(26, 8, 26, 9, CABIDE);   // espelho de pe, 2x2: linha 25 fica livre
  linhaV(10, 18, 29, LIVRE); // corredor vertical entre recepcao e bairros

  // ------------------------------------------------------------- 9. bairros
  // O modulo do posto: mesa de 3 tiles, vao de 1, cadeira centrada. Duas
  // fileiras de costas uma pra outra formam a bancada - 8 postos por bairro,
  // 32 no total, que e o que 384 m² comporta a 12 m² por pessoa.
  // Fileira simples: mesa, UMA cadeira colada nela, e uma linha livre antes da
  // proxima fileira.
  //
  // A versao de costas (duas fileiras de cadeira encostadas) foi desenhada e
  // descartada na tela: as cadeiras ficavam grudadas e nao dava pra ver onde
  // terminava um posto e comecava o outro. Fileira simples com respiro entre
  // os grupos e o que se le - e e arranjo comum em escritorio de verdade.
  function fileira(r, c0) {
    for (let i = 0; i < 4; i++) {
      const c = c0 + 1 + i * 4;
      rect(r, c, r, c + 2, MESA_MONITOR);
      set(r + 1, c + 1, CADEIRA);
    }
  }
  [18, 21, 24, 27].forEach((r) => { fileira(r, 11); fileira(r, 28); });

  // Planta entre as bancadas: divisoria verde em vez de divisoria de acrilico.
  // E o jeito de quebrar a linha de visao sem levantar parede - e some com
  // aquele efeito de "fileira de mesas sem fim".
  [[20, 15], [20, 23], [23, 19], [26, 15], [26, 23],
    [20, 32], [20, 40], [23, 36], [26, 32], [26, 40]]
    .forEach(([r, c]) => set(r, c, PLANTA));
  [[20, 27], [26, 27]].forEach(([r, c]) => set(r, c, PLANTA_GRANDE));
  // Tudo isto vai na linha 29, que e a linha LIVRE do ultimo grupo. Na 28
  // estao as cadeiras da fileira de cima, e movel ali faria duas coisas
  // erradas de uma vez: apagaria a cadeira (o `set` sobrescreve, calado) e o
  // armario, que tem 2 tiles de altura, desenharia por cima da mesa da 27.
  rect(29, 11, 29, 12, IMPRESSORA); rect(29, 31, 29, 32, IMPRESSORA);
  set(29, 20, PUFE); set(29, 38, PUFE);
  set(29, 22, PUFE); set(29, 24, PUFE);
  set(29, 40, PUFE); set(29, 42, PUFE);
  set(18, 44, PLANTA_GRANDE); set(24, 44, PLANTA);
  set(21, 10, BEBEDOURO);

  // ------------------------------------------------------- 10. area externa
  // Verde em volta do predio. Arvore encostada na parede de proposito: o
  // predio nao pode parecer largado num campo raso.
  // REGRA DA VOLTA EM TORNO DO PREDIO: a faixa verde tem 2 tiles de largura no
  // norte, no oeste e no leste, e o sul e a linha 31, de UM tile so. Logo:
  // nada de solido na linha 31, e no norte nunca dois solidos na MESMA coluna
  // (um em cima do outro fecha a passagem). Foi assim que 53 tiles de jardim
  // ficaram ilhados na primeira tentativa desta planta.
  // A VOLTA EM TORNO DO PREDIO tem que ficar inteira, e ela e estreita:
  // 2 colunas no oeste e no leste, 2 linhas no norte, 1 linha no sul. Como nao
  // existe passo na diagonal, um solido na coluna de fora numa linha mais outro
  // na coluna de dentro na linha seguinte TRANCA a faixa - foi assim que 26
  // tiles do lado leste ficaram ilhados.
  //
  // Entao a regra e simples: decoracao so na coluna/linha DE FORA (0, 47 e a
  // linha 0), deixando a de dentro sempre livre como corredor. Nada na linha
  // 31, que e de um tile so.
  [[0, 4], [0, 12], [0, 20], [0, 28], [0, 36], [0, 44], [0, 0], [0, 47],
    [5, 0], [12, 0], [19, 0], [26, 0], [5, 47], [12, 47], [19, 47], [26, 47],
    [0, 26], [0, 16], [0, 32], [0, 43]]
    .forEach(([r, c]) => set(r, c, ARVORE));
  [[2, 0], [2, 47], [8, 47], [22, 47], [8, 0], [22, 0], [1, 10], [0, 30]]
    .forEach(([r, c]) => set(r, c, ARBUSTO));
  [[0, 24], [0, 34], [1, 40]].forEach(([r, c]) => set(r, c, PEDRA));

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

// Na recepcao, logo dentro da porta da rua. Quem chega entra por onde uma
// visita entraria - e nao no meio de uma sala de reuniao, que e onde o spawn
// antigo caiu quando a planta mudou.
const SPAWN_POINTS = [
  { x: 5.5 * TILE, y: 26.5 * TILE },
  { x: 6.5 * TILE, y: 26.5 * TILE },
  { x: 7.5 * TILE, y: 26.5 * TILE },
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
  PUFE, MESA_REDONDA, GELADEIRA, AQUARIO, LUMINARIA_PE, PORTA,
  DIRECAO_MESA,
  MESAS_DIRECIONAIS,
  MESAS_DE_TRABALHO,
};

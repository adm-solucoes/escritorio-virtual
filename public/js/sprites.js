// Camada de sprites: desenha os moveis com a arte do pacote LPC Revised
// (ElizaWy), em vez de desenhar tudo no braco com retangulos.
//
// Creditos e licenca: public/assets/lpc-moveis/CREDITS.md (OGA-BY 3.0).
//
// COMO FUNCIONA
// O `game.js` pergunta `Sprites.desenhar(...)` antes de cair no desenho a mao.
// Se a peca tem sprite, ele desenha e devolve `true`; se nao tem (ou a imagem
// ainda nao carregou), devolve `false` e o desenho antigo entra no lugar. Ou
// seja: adotar o pacote peca por peca, sem quebrar o que ja funciona.
//
// DOIS MODOS
//   'ladrilho' - a arte tem o mesmo tamanho do movel no mapa. Cada celula pega
//                a sua fatia da folha: (dx % w, dy % h) contando do canto de
//                cima-esquerda do bloco de celulas iguais. E o que faz uma
//                bancada de 5 tiles emendar sem repetir a lateral.
//   'alto'     - a arte e MAIS ALTA que o movel no mapa (geladeira, estante,
//                luminaria: 1 celula no chao, 2 ou 3 tiles de desenho). So a
//                celula de baixo desenha, e a arte sobe pra fora dela.
//
// A altura extra sobe porque o chao da peca e embaixo: e assim que a estante
// tapa a parede atras dela em vez de flutuar.
(function () {
  const BASE = 'assets/lpc-moveis/';

  const folhas = {};      // caminho -> { img, ok }
  let pendentes = 0;
  let avisado = false;
  const ouvintes = [];

  function folha(caminho) {
    if (folhas[caminho]) return folhas[caminho];
    const reg = { img: new Image(), ok: false };
    folhas[caminho] = reg;
    pendentes++;
    reg.img.onload = () => { reg.ok = true; menosUm(); };
    reg.img.onerror = () => {
      console.warn('[sprites] nao carregou: ' + caminho);
      menosUm();
    };
    reg.img.src = BASE + caminho;
    return reg;
  }

  function menosUm() {
    pendentes--;
    if (pendentes > 0 || avisado) return;
    avisado = true;
    ouvintes.forEach((fn) => fn());
  }

  // ------------------------------------------------------- cadeira por sala
  // "Tem cadeira e cadeiras": na referencia o salao de trabalho tem cadeira de
  // escritorio, e copa, hall, patio e as salas de reuniao tem cadeira comum, em
  // cores diferentes. O mapa tem UM tile de cadeira por direcao — criar um tile
  // novo pra cada modelo custaria caro (sao cinco lugares pra registrar cada um,
  // ver testes/itens.js). Entao o modelo e escolhido na hora de desenhar, pela
  // sala em que a celula esta.
  //
  // A folha `chair-dining-a` tem 7 colunas x 8 cores. As colunas que interessam:
  //   0 = de frente (encosto atras do assento, pessoa olhando pra ca)
  //   1 = de perfil com o encosto a esquerda  -> quem senta olha pra DIREITA
  //   4 = de perfil com o encosto a direita   -> quem senta olha pra ESQUERDA
  //   6 = de costas (so o encosto e os pes)   -> quem senta olha pra CIMA
  // As colunas 2, 3 e 5 sao pedacos de sobreposicao, nao cadeira inteira.
  const FOLHA_JANTAR = 'furniture-seating/chair-dining-a.png';
  // De costas a folha separa a cadeira em DUAS camadas, pra caber gente no meio:
  // a coluna 5 e so o assento (fica atras de quem senta) e a 6 e so o encosto e
  // os pes (fica na frente). Desenhar so a 6 dava um esqueleto sem assento, que
  // na tela parecia uma mesinha. Por isso `up` pede as duas, uma sobre a outra.
  const COLUNA_JANTAR = { down: 0, right: 1, left: 4, up: 5 };
  const CAMADA_DE_CIMA = { up: 6 };
  const CADEIRA_DA_SALA = {
    copa:        3,   // verde
    hall:        2,   // azul
    patio:       3,   // verde, combinando com a area externa
    reuniao:     2,   // azul
    treinamento: 0,   // amarelo
    huddle:      1,   // vermelho, junto da poltrona
  };

  function cadeiraDaSala(direcao) {
    return (c, r) => {
      const M = window.OfficeMap;
      const sala = M && M.getRoomAtTile && M.getRoomAtTile(c, r);
      const linha = sala && CADEIRA_DA_SALA[sala.id];
      if (linha === undefined) return null;   // salao e salas privativas: a de escritorio
      const acima = CAMADA_DE_CIMA[direcao];
      // w/h/modo vem explicitos: sem isso a cadeira de refeitorio herdaria o
      // 1x2 'alto' da de escritorio e sairia com o dobro da altura.
      return {
        f: FOLHA_JANTAR,
        c: COLUNA_JANTAR[direcao],
        r: linha,
        w: 1,
        h: 1,
        modo: 'ladrilho',
        porCima: acima === undefined ? null : { c: acima, r: linha },
      };
    };
  }

  // ---------------------------------------------------------------- catalogo
  // Chaves sao NOMES de constante do OfficeMap, resolvidos depois que o map.js
  // carregou. Assim este arquivo nao depende da ordem dos <script>.
  //
  //   f  = folha            c,r = canto da arte na folha (em tiles de 32px)
  //   w,h = tamanho da arte em tiles
  //   modo = 'ladrilho' (padrao quando a arte tem 1 tile de altura ou casa com
  //          o movel) ou 'alto'
  const CATALOGO = {
    // --- assentos -----------------------------------------------------------
    // Cadeira de escritorio do pacote, nas quatro direcoes. A folha e 3x3:
    // coluna 0 traz as vistas de frente e de tras, coluna 1 os dois perfis.
    //
    // Ela ja saiu daqui uma vez, por medo de quebrar o encosto que volta por
    // cima de quem senta. Nao quebra: `desenharEncostoPorCima` recorta o tile e
    // chama `drawObstacleTile`, que pergunta ao pacote antes de desenhar a mao.
    // O sprite entra no recorte igualzinho.
    CADEIRA:       { f: 'furniture-seating/chair-office.png', c: 0, r: 0, w: 1, h: 1, variar: cadeiraDaSala('up') },
    // De frente a cadeira ocupa DUAS linhas na folha (encosto em cima,
    // assento embaixo): pegando so a de baixo, 24 dos 32 pixels do topo eram
    // cortados e a cadeira saia sem encosto.
    CADEIRA_BAIXO: { f: 'furniture-seating/chair-office.png', c: 0, r: 1, w: 1, h: 2, modo: 'alto', variar: cadeiraDaSala('down') },
    CADEIRA_DIR:   { f: 'furniture-seating/chair-office.png', c: 1, r: 0, w: 1, h: 1, variar: cadeiraDaSala('right') },
    CADEIRA_ESQ:   { f: 'furniture-seating/chair-office.png', c: 1, r: 1, w: 1, h: 1, variar: cadeiraDaSala('left') },

    // poltrona vermelha da sala de reuniao: 4 direcoes na mesma linha de cor
    CADEIRA_VERMELHA:       { f: 'furniture-seating/chair-sofa-a.png', c: 3, r: 1, w: 1, h: 1 },
    CADEIRA_VERMELHA_BAIXO: { f: 'furniture-seating/chair-sofa-a.png', c: 0, r: 1, w: 1, h: 1 },
    CADEIRA_VERMELHA_DIR:   { f: 'furniture-seating/chair-sofa-a.png', c: 1, r: 1, w: 1, h: 1 },
    CADEIRA_VERMELHA_ESQ:   { f: 'furniture-seating/chair-sofa-a.png', c: 2, r: 1, w: 1, h: 1 },

    POLTRONA: { f: 'furniture-seating/chair-sofa-a.png', c: 3, r: 2, w: 1, h: 1 },
    PUFE:     { f: 'furniture-seating/ottoman-small-a.png', c: 2, r: 0, w: 1, h: 1 },

    // O sofa e uma peca so de 3x2: a fileira de cima do mapa (SOFA_CIMA) fica
    // sem desenho proprio e quem pinta tudo e a de baixo, subindo a arte.
    SOFA_BAIXO: { f: 'furniture-seating/sofa-casual-a.png', c: 0, r: 0, w: 3, h: 2, modo: 'alto' },
    SOFA_CIMA:  { vazio: true },

    // --- mesas --------------------------------------------------------------
    // MESA fica FORA do catalogo de proposito.
    //
    // A mesa do mapa e 3x1 e toda arte de mesa do pacote e 3x2: em modo alto o
    // tampo sobe pra linha DE CIMA, que nao e celula da mesa. Ou seja: o que a
    // pessoa ve como mesa nao e clicavel, e o sistema de reivindicar mesa para
    // de funcionar. Alem disso `tampoAte` diz que a superficie e a metade de
    // cima da celula - com a arte deslocada, o item ia pousar em cima do pe.
    //
    // A mesa desenhada a mao (`tampoDeMesa`) cabe na propria celula, com tampo,
    // faixa da frente, gaveteira e pe, e ja segue a medida da referencia. Ela
    // continua sendo a mesa.

    MESA_CENTRO: { f: 'furniture/end-table.png', c: 0, r: 0, w: 1, h: 2, modo: 'alto' },

    // --- armazenagem --------------------------------------------------------
    // Estante ALTA, de dois tiles - e a estante cheia de livro, que e a peca que
    // da cara de escritorio na parede. Ela nao cabia enquanto o mapa encostava
    // movel DENTRO da linha do muro; agora o movel de pe fica no chao, colado na
    // parede, e sobra a linha inteira do muro pra ela subir.
    //
    // `atravessa` porque ela DEVE tapar a parede atras: estante encostada na
    // parede esconde a parede, e num mapa visto de cima e assim que se le
    // profundidade. Sem isso o recorte cortava a estante na altura do muro e
    // sobrava meia estante.
    // `emenda` = esta arte foi feita pra ficar em FILEIRA. Na folha as estantes
    // de rows 3-4 sao uma parede corrida de estanteria, e a linha escura da
    // lateral pertence as duas vizinhas ao mesmo tempo. Recortar uma celula
    // corta essa linha - o que o testes/cenario.js chama de vazamento -, mas
    // aqui isso e o desenho, nao um erro: cada fatia sai uma estante inteira.
    // Sem a marca, o teste acusaria a peca toda vez.
    ESTANTE: { f: 'furniture/cabinet.png', c: 2, r: 3, w: 1, h: 2, modo: 'alto', atravessa: true, emenda: true },
    // BALCAO tambem fica de fora: o `countertop` do pacote e balcao de taverna,
    // madeira escura com painel almofadado. Recepcao de escritorio e clara.

    // --- eletro e utilidades ------------------------------------------------
    // A folha tem TRES geladeiras de 1 tile, nao uma de tres: a coluna 0 tem a
    // dobradica virada pra um lado e a 2 pro outro. A 1 e a de frente, que e a
    // que serve encostada na parede - com a 0 a geladeira saia torta.
    GELADEIRA:    { f: 'furniture/fridge.png', c: 1, r: 0, w: 1, h: 2, modo: 'alto', atravessa: true },
    BEBEDOURO:    { f: 'furniture/water-cooler.png', c: 0, r: 0, w: 1, h: 2, modo: 'alto', atravessa: true },
    // IMPRESSORA fica fora: a copiadora do pacote e UMA maquina de 3 tiles de
    // largura, e o mapa reserva 1 celula pra ela (e uma delas tem parede do
    // lado). Recortar 1 tile do meio dava um pedaco de maquina.
    LUMINARIA_PE: { f: 'furniture/lighting-floor.png', c: 0, r: 0, w: 1, h: 2, modo: 'alto', atravessa: true },

    // --- plantas ------------------------------------------------------------
    PLANTA:        { f: 'furniture/planter.png', c: 4, r: 1, w: 1, h: 2, modo: 'alto', atravessa: true },
    PLANTA_GRANDE: { f: 'furniture/planter.png', c: 2, r: 0, w: 1, h: 3, modo: 'alto', atravessa: true },
    // CACTO fica fora: no pacote a planta espinhosa vem num vaso de PORCELANA
    // azul-e-branca, que puxa pra antiquario chines. Cacto de escritorio e vaso
    // simples em cima da mesa, e e o que a versao desenhada faz.
    // 0,0 e uma florzinha solta: pintava 5% da celula e no mapa o vaso ficava
    // praticamente invisivel. 4,2 e um vaso inteiro (33% da celula).
    VASO_FLORES:   { f: 'small-items/flowers.png', c: 4, r: 2, w: 1, h: 1 },

    // --- parede e chao ------------------------------------------------------
    // Quadro emoldurado do pacote, no lugar da moldurinha desenhada a mao.
    // QUADRO fica FORA do catalogo.
    //
    // As colunas 0 a 3 desta folha sao UM mural de 4x2, nao quatro quadros. Os
    // quadros emoldurados estao nas colunas 4 e 5 - mas NAO estao alinhados a
    // grade de 32px: cada moldura tem cerca de 0,76 tile e sangra pra celula
    // vizinha. Qualquer celula inteira que a gente peca corta a borda da
    // moldura, e e por isso que o quadro saia pela metade. Nao e coordenada
    // errada: recortar certo exigiria origem em pixel, e o desenho aqui e todo
    // por tile. O quadro desenhado a mao cabe num tile e fica.
    // TV fica FORA do catalogo.
    //
    // Duas coisas erradas com a do pacote. A coordenada estava em 12,0, que e
    // celula VAZIA: a folha traz cinco TVs em tamanhos decrescentes e fora de
    // grade regular (0-3, 4-6, 7-9, 10-11, 12-13), e a menor so ocupa a linha 1
    // - por isso a TV aparecia como dois retangulos pretos partidos.
    //
    // Corrigir a coordenada nao resolve o que importa: TODAS as telas da folha
    // estao DESLIGADAS, pretas. Numa parede de escritorio isso vira um vao
    // escuro. A TV desenhada a mao tem tela acesa com conteudo, que e o que faz
    // ler como tela de apresentacao. Ela fica.
    // TAPETE fica fora do pacote.
    //
    // A folha `diamond-tiling` nao e um tapete de 12x6: sao VARIOS tapetes
    // encostados um no outro. Montar a peca de 3x3 pelas quinas da folha pegou
    // quina de tapetes diferentes, e o resultado foi um tapete de quatro cores.
    // Nao ha como saber onde um acaba e o outro comeca sem olhar cor a cor.
    //
    // O tapete desenhado a mao ja tem trama e debrum, e se ajusta a qualquer
    // formato de bloco - inclusive o 3x3 da recepcao.

    // --- area verta la fora -------------------------------------------------
    // A arvore e maior que o tile dela: 3 de largura por 4 de altura, plantada
    // no tile e transbordando pros lados e pra cima. `solto` porque cada
    // arvore e uma so — sem ele, duas arvores vizinhas viravam uma peca de
    // duas celulas e a segunda sumia.
    ARVORE:   { f: 'terrain/trees-summer.png', c: 4, r: 0, w: 3, h: 4, modo: 'alto', desloca: -1, solto: true, atravessa: true },
    // 2,0 encostava nos arbustos vizinhos da folha e saia cortado dos dois
    // lados; 6,0 e um arbusto que cabe inteiro na celula.
    ARBUSTO:  { f: 'terrain/plants-summer.png', c: 6, r: 0, w: 1, h: 1, solto: true },
    // 3,2 pegava a lasca da pedra grande ao lado. 4,2 e uma pedra inteira.
    PEDRA:    { f: 'terrain/rocks-grasslands.png', c: 4, r: 2, w: 1, h: 1, solto: true },
  };

  // ------------------------------------------------------------------ pisos
  // Chao e mais simples que movel: a folha ja vem em tiles de 32px que emendam
  // sozinhos. Cada piso pega um bloco w*h e a celula escolhe (c % w, r % h),
  // que e o que da o desencontro das tabuas em vez de um carimbo repetido.
  //
  // A grama fica de fora de proposito: no pacote ela vem em folha de autotile
  // (borda, quina, transicao pra terra), que e outro problema — o desenho a
  // mao continua ate isso ser resolvido.
  const PISOS = {
    // O salao da referencia e tijolinho creme em fiada alternada, nao tabua.
    // A folha `tile-a` e a que chega mais perto: creme claro e de junta miuda.
    tijolo:        { f: 'structure-floor/tile-a.png', c: 0, r: 0, w: 1, h: 1 },
    ladrilho:      { f: 'structure-floor/tile-c.png', c: 0, r: 0, w: 2, h: 2 },
    // Carpete NAO sai do pacote. O `geometric-carpet` e tapete de medalhao, tipo
    // persa: bonito, e cobrindo o salao inteiro faz o escritorio virar salao de
    // castelo. O desenhado a mao (`pisoCarpete`) e carpete em PLACAS, em dois
    // tons - que e o que escritorio tem de verdade, e o que a referencia mostra.
    // Com a paleta do pacote aplicada, ele ja nao destoa dos moveis.
  };

  // Resolvido em `preparar()`: id do tile -> peca.
  let PECAS = null;

  function preparar() {
    if (PECAS) return PECAS;
    const M = window.OfficeMap;
    if (!M) return null;
    PECAS = {};
    Object.keys(CATALOGO).forEach((nome) => {
      const id = M[nome];
      if (id === undefined) {
        console.warn('[sprites] tile inexistente no mapa: ' + nome);
        return;
      }
      const peca = CATALOGO[nome];
      PECAS[id] = peca;
      if (peca.f) {
        peca.modo = peca.modo || 'ladrilho';
        folha(peca.f);
      }
    });
    Object.keys(PISOS).forEach((nome) => folha(PISOS[nome].f));
    folha(FOLHA_JANTAR);   // usada so pelo `variar`, nao aparece no CATALOGO
    return PECAS;
  }

  // Desenha o chao da celula. Mesmo contrato do `desenhar`: true = deu conta.
  function desenharPiso(ctx, c, r, TILE, piso) {
    preparar();
    const p = PISOS[piso];
    if (!p) return false;
    const reg = folhas[p.f];
    if (!reg || !reg.ok) return false;
    const T = 32;
    // `% w` com c negativo daria indice negativo; o mapa nao tem, mas o
    // catalogo do decorador desenha em grade falsa e pode chegar aqui com 0.
    const dx = ((c % p.w) + p.w) % p.w;
    const dy = ((r % p.h) + p.h) % p.h;
    ctx.drawImage(reg.img, (p.c + dx) * T, (p.r + dy) * T, T, T, c * TILE, r * TILE, TILE, TILE);
    return true;
  }

  // Onde esta esta celula dentro do bloco de celulas do mesmo tipo. Conta pra
  // esquerda e pra cima ate mudar de tipo — e o mesmo criterio que o desenho a
  // mao ja usava pra saber onde por gaveta e emenda.
  function posicaoNoBloco(tiles, c, r, tipo) {
    let dx = 0;
    while (tiles[r] && tiles[r][c - dx - 1] === tipo) dx++;
    let dy = 0;
    while (tiles[r - dy - 1] && tiles[r - dy - 1][c] === tipo) dy++;
    let abaixo = 0;
    while (tiles[r + abaixo + 1] && tiles[r + abaixo + 1][c] === tipo) abaixo++;
    return { dx, dy, abaixo };
  }

  // Desenha a celula (c,r). Devolve true se a arte do pacote deu conta.
  // `naLinhaDoMuro` chega do game.js: significa que esta celula E um pedaco do
  // muro, e nao um lugar dentro da sala.
  function desenhar(ctx, c, r, tipo, TILE, tiles, naLinhaDoMuro) {
    const pecas = preparar();
    if (!pecas) return false;
    let peca = pecas[tipo];
    if (!peca) return false;
    if (peca.vazio) return true;          // quem pinta e a celula vizinha

    // A peca pode trocar de folha/celula conforme onde esta (ver `cadeiraDaSala`).
    if (peca.variar) {
      const alt = peca.variar(c, r);
      if (alt) peca = Object.assign({}, peca, alt);
    }

    // REGRA: na linha do muro so entra peca de UM tile de altura.
    //
    // A celula do muro tem 1 tile. Peca mais alta que isso, plantada ali, sobe
    // pra FORA do predio - a planta grande ia parar no meio da grama - e ainda
    // por cima leva um corte da faixa do muro que vem por cima dela. Nao ha
    // coordenada que conserte: o pacote nao tem planta nem geladeira de 1 tile.
    // Entao nesses casos o desenho a mao assume, que foi feito pra caber num
    // tile e por isso encosta na parede em vez de atravessar.
    if (naLinhaDoMuro && (peca.h || 1) > 1) return false;

    const reg = folhas[peca.f];
    if (!reg || !reg.ok) return false;    // ainda carregando: cai no desenho antigo

    const grade = tiles || (window.OfficeMap && window.OfficeMap.tiles);
    // `solto` = cada celula e uma peca inteira, nao pedaco de um bloco. Vale
    // pra decoracao espalhada (arvore, pedra, arbusto), onde duas vizinhas sao
    // duas coisas e nao uma coisa larga.
    const pos = (grade && !peca.solto)
      ? posicaoNoBloco(grade, c, r, tipo)
      : { dx: 0, dy: 0, abaixo: 0 };
    const T = 32;                          // tamanho do tile na folha
    const desloca = peca.desloca || 0;      // centraliza arte mais larga que o tile

    if (peca.modo === 'alto') {
      // So a fileira de baixo desenha, e a arte sobe pra fora da celula.
      if (pos.abaixo > 0) return true;
      if (pos.dx % peca.w !== 0) return true;
      const sobe = peca.h - 1;

      // A arte que sobe NAO pode pintar em cima de parede nem de janela.
      //
      // Sem isto, geladeira, estante, planta - qualquer peca mais alta que a
      // propria celula - apagava a parede logo acima dela: o pre-render desenha
      // linha por linha, de cima pra baixo, entao a peca (linha de baixo) era
      // desenhada DEPOIS da parede e passava por cima. Na tela a parede
      // simplesmente sumia atras do movel.
      //
      // O recorte deixa a peca ser cortada na linha da parede, que e o certo
      // num mapa visto de cima: a parede esta atras e continua inteira.
      // `atravessa` = esta peca PODE passar por cima da parede. Vale pra duas
      // familias: o que pendura na parede (TV, que sem isso vira um retangulo
      // preto cortado) e o que e organico e alto (arvore, planta grande), onde a
      // copa cobrindo a parede le como profundidade, e nao como buraco. Movel de
      // silhueta quadrada - geladeira, estante, impressora - continua cortado,
      // porque ali o corte na parede aparece como falha.
      const grade2 = peca.atravessa ? null : grade;
      let recortou = false;
      if (sobe > 0 && grade2) {
        const M = window.OfficeMap;
        ctx.save();
        ctx.beginPath();
        for (let dy = 0; dy < peca.h; dy++) {
          for (let dx = 0; dx < peca.w; dx++) {
            const cc = c + desloca + dx;
            const rr = r - sobe + dy;
            const t = grade2[rr] && grade2[rr][cc];
            if (t === M.PAREDE || t === M.JANELA) continue;
            ctx.rect(cc * TILE, rr * TILE, TILE, TILE);
          }
        }
        ctx.clip();
        recortou = true;
      }

      ctx.drawImage(
        reg.img,
        peca.c * T, peca.r * T, peca.w * T, peca.h * T,
        (c + desloca) * TILE, (r - sobe) * TILE, peca.w * TILE, peca.h * TILE
      );
      if (recortou) ctx.restore();
      return true;
    }

    // ladrilho: cada celula pega a sua fatia. Com `montar`, a fatia nao vem de
    // um bloco corrido da folha - cada posicao dentro da peca escolhe a sua
    // parte, que e como o tapete se arma com as quinas certas (ver TAPETE).
    let sx;
    let sy;
    if (peca.montar) {
      const parte = peca.montar(pos.dx % peca.w, pos.dy % peca.h);
      sx = parte.c * T;
      sy = parte.r * T;
    } else {
      sx = (peca.c + (pos.dx % peca.w)) * T;
      sy = (peca.r + (pos.dy % peca.h)) * T;
    }
    ctx.drawImage(reg.img, sx, sy, T, T, c * TILE, r * TILE, TILE, TILE);
    // Segunda camada, quando a peca vem partida na folha (ver COLUNA_JANTAR).
    if (peca.porCima) {
      ctx.drawImage(reg.img, peca.porCima.c * T, peca.porCima.r * T, T, T,
        c * TILE, r * TILE, TILE, TILE);
    }
    return true;
  }

  window.Sprites = {
    desenhar,
    desenharPiso,
    // roda `fn` quando todas as folhas pedidas terminarem (pra refazer o
    // pre-render, que corre antes das imagens chegarem).
    // O `preparar()` aqui nao e detalhe: sem ele, quem chama antes do primeiro
    // desenho pega `pendentes === 0` porque NINGUEM pediu folha ainda, e o
    // callback roda na hora — com as imagens todas vazias.
    aoCarregar(fn) {
      preparar();
      if (avisado || pendentes === 0) fn();
      else ouvintes.push(fn);
    },
    preparar,
    CATALOGO,
    PISOS,
    temSprite(tipo) {
      const p = preparar();
      return !!(p && p[tipo] && !p[tipo].vazio);
    },
  };
})();

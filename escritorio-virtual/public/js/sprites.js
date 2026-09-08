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
    // A cadeira de escritorio tambem fica fora: a do pacote e um bloco escuro
    // visto de cima, e a da referencia tem encosto de TELA, duas barras laranja
    // na altura dos bracos e apoio de cabeca - os tres detalhes que fazem a
    // gente reconhecer a cadeira do Gather. A versao desenhada tem os tres, e e
    // ela que volta por cima de quem senta (senao a pessoa aparece flutuando na
    // frente do encosto).

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
    ESTANTE: { f: 'furniture/cabinet.png', c: 2, r: 3, w: 1, h: 2, modo: 'alto' },
    ARMARIO: { f: 'furniture/cabinet.png', c: 0, r: 0, w: 1, h: 2, modo: 'alto' },
    BALCAO:  { f: 'furniture/countertop.png', c: 3, r: 4, w: 1, h: 2, modo: 'alto' },

    // --- eletro e utilidades ------------------------------------------------
    GELADEIRA:    { f: 'furniture/fridge.png', c: 0, r: 0, w: 1, h: 2, modo: 'alto' },
    BEBEDOURO:    { f: 'furniture/water-cooler.png', c: 0, r: 0, w: 1, h: 2, modo: 'alto' },
    IMPRESSORA:   { f: 'furniture/copy-machine.png', c: 0, r: 0, w: 1, h: 2, modo: 'alto' },
    LUMINARIA_PE: { f: 'furniture/lighting-floor.png', c: 0, r: 0, w: 1, h: 2, modo: 'alto' },

    // --- plantas ------------------------------------------------------------
    PLANTA:        { f: 'furniture/planter.png', c: 4, r: 1, w: 1, h: 2, modo: 'alto' },
    PLANTA_GRANDE: { f: 'furniture/planter.png', c: 2, r: 0, w: 1, h: 3, modo: 'alto' },
    CACTO:         { f: 'furniture/planter.png', c: 3, r: 0, w: 1, h: 3, modo: 'alto' },
    VASO_FLORES:   { f: 'small-items/flowers.png', c: 0, r: 0, w: 1, h: 1 },

    // --- parede e chao ------------------------------------------------------
    // Quadro emoldurado do pacote, no lugar da moldurinha desenhada a mao.
    QUADRO: { f: 'wall-items/paintings-abstract.png', c: 4, r: 1, w: 1, h: 1, solto: true },
    // A TV do pacote e larga: ocupa DUAS celulas do mapa. Por isso no mapa ela
    // vai sempre em par - uma TV de uma celula so nao existe na folha.
    TV: { f: 'furniture/tv-widescreen.png', c: 12, r: 0, w: 2, h: 2, modo: 'alto' },
    // Tapete de losangos, o mesmo do lobby da referencia. Tem borda propria,
    // entao so fecha certo em bloco de 3x3.
    TAPETE: { f: 'furniture-rugs/diamond-rug-tiling.png', c: 9, r: 3, w: 3, h: 3 },

    // --- area verta la fora -------------------------------------------------
    // A arvore e maior que o tile dela: 3 de largura por 4 de altura, plantada
    // no tile e transbordando pros lados e pra cima. `solto` porque cada
    // arvore e uma so — sem ele, duas arvores vizinhas viravam uma peca de
    // duas celulas e a segunda sumia.
    ARVORE:   { f: 'terrain/trees-summer.png', c: 4, r: 0, w: 3, h: 4, modo: 'alto', desloca: -1, solto: true },
    ARBUSTO:  { f: 'terrain/plants-summer.png', c: 2, r: 0, w: 1, h: 1, solto: true },
    PEDRA:    { f: 'terrain/rocks-grasslands.png', c: 3, r: 2, w: 1, h: 1, solto: true },
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
    carpete_roxo:  { f: 'structure-floor/geometric-carpet-c.png', c: 3, r: 0, w: 1, h: 1 },
    carpete_azul:  { f: 'structure-floor/geometric-carpet-c.png', c: 4, r: 0, w: 1, h: 1 },
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
  function desenhar(ctx, c, r, tipo, TILE, tiles) {
    const pecas = preparar();
    if (!pecas) return false;
    const peca = pecas[tipo];
    if (!peca) return false;
    if (peca.vazio) return true;          // quem pinta e a celula vizinha

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
      ctx.drawImage(
        reg.img,
        peca.c * T, peca.r * T, peca.w * T, peca.h * T,
        (c + desloca) * TILE, (r - sobe) * TILE, peca.w * TILE, peca.h * TILE
      );
      return true;
    }

    // ladrilho: cada celula pega a sua fatia
    const sx = (peca.c + (pos.dx % peca.w)) * T;
    const sy = (peca.r + (pos.dy % peca.h)) * T;
    ctx.drawImage(reg.img, sx, sy, T, T, c * TILE, r * TILE, TILE, TILE);
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

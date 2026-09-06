// Loop principal do jogo: mapa, movimento, multiplayer e chamada por proximidade.
(function () {
  const SPEED = 150; // px/s
  const MOVE_SEND_INTERVAL = 45; // ms
  // Resolucao interna do mapa: cada tile de 32 e desenhado em 128 pixels de
  // verdade. E o que da espaco pra detalhe (moldura de monitor, trama da
  // cadeira, brilho de 1px) em vez de blocao.
  const RENDER_SCALE = 4;
  let escalaDoMapa = RENDER_SCALE; // vira 2 ou 1 se o canvas 4x nao couber

  let ctx, canvas, mapCanvas;
  let players = new Map();
  let selfId = null; // id da conexao: muda a cada recarregar
  let selfUid = null; // id da pessoa: sobrevive ao recarregar (usado nas DMs)
  let lastFrameTime = 0;
  let lastMoveSent = 0;
  let localWalkTime = 0;
  let lastSentState = { x: null, y: null, dir: null, moving: null };

  const STATUS_ORDEM = ['livre', 'focado', 'reuniao'];
  const STATUS_LABEL = { livre: 'Livre', focado: 'Focado', reuniao: 'Em reuniao' };
  const STATUS_COR = { livre: '#63d9c4', focado: '#ffb454', reuniao: '#e0607e' };

  let mesas = new Map(); // "col,row" -> { chave, donoId, donoNome }
  let mesaHover = null; // { col, row } da mesa sob o cursor
  let celulaAlvo = null; // { col, row } sob o cursor enquanto decora

  function aplicarMesas(lista) {
    mesas = new Map((lista || []).map((m) => [m.chave, m]));
  }

  // Contorno da mesa, como no Gather: branco quando voce passa o mouse, teal na
  // mesa que e sua.
  function contornoMesa(ctx, col, row, cor, largura) {
    const TILE = OfficeMap.TILE;
    ctx.save();
    ctx.strokeStyle = cor;
    ctx.lineWidth = largura;
    ctx.beginPath();
    ctx.roundRect(col * TILE + 1, row * TILE + 1, TILE - 2, TILE - 2, 4);
    ctx.stroke();
    ctx.restore();
  }

  // Balaozinho escuro de contexto ("Mesa livre", "Mesa de fulano"), igual ao que
  // o Gather mostra em cima do movel apontado.
  function dicaContexto(ctx, x, y, texto) {
    ctx.save();
    ctx.font = '700 9px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(texto).width + 16;
    ctx.fillStyle = 'rgba(30,33,41,0.92)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 8, w, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(texto, x, y + 0.5);
    ctx.restore();
  }

  // Plaquinha com o nome de quem reivindicou cada mesa.
  function desenharMesas(ctx) {
    const TILE = OfficeMap.TILE;
    ctx.save();
    ctx.font = '700 8px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    mesas.forEach((m) => {
      const partes = m.chave.split(',');
      const col = Number(partes[0]);
      const row = Number(partes[1]);
      const x = col * TILE + TILE / 2;
      const y = row * TILE + TILE - 7;
      const texto = (m.donoNome || '').split(' ')[0] || '?';
      const w = ctx.measureText(texto).width + 10;
      ctx.fillStyle = m.donoId === selfId ? 'rgba(124,92,212,0.95)' : 'rgba(45,50,62,0.85)';
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 6, w, 12, 6);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(texto, x, y + 0.5);

      if (m.donoId === selfId) contornoMesa(ctx, col, row, 'rgba(99,217,196,0.95)', 2);
    });
    ctx.restore();

    if (mesaHover) {
      const m = mesas.get(mesaHover.col + ',' + mesaHover.row);
      contornoMesa(ctx, mesaHover.col, mesaHover.row, 'rgba(255,255,255,0.95)', 2);
      const texto = !m ? 'Mesa livre'
        : (m.donoId === selfId ? 'Sua mesa (clique pra largar)' : 'Mesa de ' + m.donoNome);
      dicaContexto(
        ctx,
        mesaHover.col * TILE + TILE / 2,
        mesaHover.row * TILE + TILE + 12,
        texto
      );
    }

    // Fantasma da celula que vai receber o objeto (decorador aberto).
    if (celulaAlvo && Decorador.estaPintando()) {
      const podeAqui = Decorador.podeColocarEm(celulaAlvo.col, celulaAlvo.row);
      ctx.save();
      ctx.globalAlpha = 0.75;
      Decorador.desenharPreviaNoMapa(ctx, celulaAlvo.col, celulaAlvo.row, TILE);
      ctx.globalAlpha = 1;
      contornoMesa(
        ctx, celulaAlvo.col, celulaAlvo.row,
        podeAqui ? 'rgba(74,222,128,0.95)' : 'rgba(248,113,113,0.95)', 2
      );
      ctx.restore();
    }
  }

  const cores = new Map();
  function corDoId(id) {
    if (!cores.has(id)) {
      let hash = 0;
      for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
      const hue = hash % 360;
      cores.set(id, `hsl(${hue}, 70%, 60%)`);
    }
    return cores.get(id);
  }

  function prerenderMap() {
    const { COLS, ROWS, TILE, tiles } = OfficeMap;
    // O mapa inteiro em 4x da ~96MB de canvas. Se o navegador nao aguentar
    // (maquina fraca, aba com pouca memoria), cai pra 2x em vez de ficar com a
    // tela em branco. O `escala` fica guardado porque o desenho depende dele.
    for (const tentativa of [RENDER_SCALE, 2, 1]) {
      mapCanvas = document.createElement('canvas');
      mapCanvas.width = COLS * TILE * tentativa;
      mapCanvas.height = ROWS * TILE * tentativa;
      const teste = mapCanvas.getContext('2d');
      // um canvas grande demais nasce em branco: testa escrevendo 1 pixel
      if (teste) {
        teste.fillStyle = '#000';
        teste.fillRect(0, 0, 1, 1);
        if (teste.getImageData(0, 0, 1, 1).data[3] === 255) {
          escalaDoMapa = tentativa;
          break;
        }
      }
      if (tentativa !== 1) console.warn('[mapa] ' + tentativa + 'x nao coube, tentando menor');
    }

    const mctx = mapCanvas.getContext('2d');
    mctx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    mctx.imageSmoothingEnabled = false;
    mctx.scale(escalaDoMapa, escalaDoMapa);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) drawFloorTile(mctx, c, r, TILE, OfficeMap.pisoEmTile(c, r));
    }
    // moldura fina marcando as areas (o Gather usa isso pra delimitar zonas:
    // toda ilha de carpete aparece com um contorno claro em volta)
    OfficeMap.ZONAS_PISO.forEach((z) => {
      const cor = z.contorno || (String(z.piso).startsWith('carpete') ? 'rgba(255,255,255,0.8)' : null);
      if (!cor) return;
      mctx.save();
      mctx.strokeStyle = cor;
      mctx.lineWidth = 2;
      mctx.beginPath();
      mctx.roundRect(
        z.c0 * TILE + 2, z.r0 * TILE + 2,
        (z.c1 - z.c0 + 1) * TILE - 4, (z.r1 - z.r0 + 1) * TILE - 4, 6
      );
      mctx.stroke();
      mctx.restore();
    });

    // arvores ficam por ultimo: a copa passa do proprio tile e nao pode ser
    // cortada pelo tile desenhado depois
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const type = tiles[r][c];
        if (type !== OfficeMap.LIVRE && type !== OfficeMap.ARVORE) {
          drawObstacleTile(mctx, c, r, type, TILE, tiles);
        }
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (tiles[r][c] === OfficeMap.ARVORE) drawObstacleTile(mctx, c, r, OfficeMap.ARVORE, TILE, tiles);
      }
    }
    // camada de cima por ultimo: o que esta apoiado fica visivel sobre o movel
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const obj = OfficeMap.objetos[r][c];
        if (obj) drawObjectTile(mctx, c, r, obj, TILE);
      }
    }
    OfficeMap.ROOMS.forEach((sala) => desenharEtiquetaSala(mctx, sala, TILE));
  }

  // Cada ambiente tem seu proprio chao (duas tonalidades alternadas, em xadrez
  // sutil), no lugar do piso de madeira unico que valia pro escritorio inteiro.
  const CORES_PISO = {
    tijolo: { base: '#ece0cb', junta: '#c9b696', luz: '#f6efe1', sombra: '#dccdb2' },
    tijolo_quente: { base: '#e6d3b4', junta: '#c0a37c', luz: '#f2e5cd', sombra: '#d6bf9a' },
    cinza: { base: '#d2d6dd', junta: '#adb4c0', luz: '#e4e7ec', sombra: '#c2c7d1' },
    ladrilho: { base: '#e4e7ee', junta: '#b6bece', luz: '#f2f4f8', sombra: '#d3d8e3' },
    carpete_roxo: { base: '#8b7fd0', claro: '#a294de' },
    carpete_azul: { base: '#5d6577', claro: '#6e7789' },
    grama: { base: '#8ecb7c', claro: 'rgba(58,124,58,0.28)' },
  };

  // Piso de tijolinho em fiada alternada (a fiada usa a linha global, senao a
  // emenda entre tiles fica visivel).
  // Na grade fina, a junta e 1 unidade (= 1 pixel de verdade no canvas 4x), em vez
  // do traco de lineWidth 1 que virava 4 pixels e engrossava o piso todo. Cada
  // tijolo ganha um fio de luz em cima e sombra embaixo, dando relevo.
  function pisoTijolo(ctx, x, y, TILE, c, r, cores) {
    // A junta tem 2 unidades: com 1 ela vira 1 pixel no canvas 4x e some quando a
    // tela desenha esse canvas em zoom 2 (metade). Com 2, sobra 1 pixel na tela.
    q(ctx, x, y, 0, 0, 128, 128, cores.base);
    for (let i = 0; i < 4; i++) {
      const fy = i * 32;
      q(ctx, x, y, 0, fy, 128, 2, cores.junta);
      q(ctx, x, y, 0, fy + 2, 128, 2, cores.luz);
      q(ctx, x, y, 0, fy + 29, 128, 3, cores.sombra);
      // fiada alternada pela linha global, senao a emenda entre tiles aparece
      const desloc = ((r * 4 + i) % 2 === 0) ? 0 : 32;
      for (let vx = desloc; vx < 128; vx += 64) {
        q(ctx, x, y, vx, fy, 2, 32, cores.junta);
        q(ctx, x, y, vx + 2, fy + 2, 2, 27, cores.luz);
      }
    }
  }

  function pisoCarpete(ctx, x, y, TILE, c, r, cores, listrado) {
    q(ctx, x, y, 0, 0, 128, 128, cores.base);

    if (listrado) {
      for (let vx = 0; vx < 128; vx += 36) {
        q(ctx, x, y, vx, 0, 16, 128, cores.claro);
        q(ctx, x, y, vx, 0, 4, 128, 'rgba(255,255,255,0.10)');
      }
      return;
    }

    // Mosaico de pecas encaixadas em dois tons, como o carpete da referencia
    // (`referencias/...154025.png`) - a versao antiga era manchinha aleatoria,
    // que de longe virava ruido em vez de padrao.
    const BL = 32; // peca de 1/4 de tile
    for (let by = 0; by < 128; by += BL) {
      for (let bx = 0; bx < 128; bx += BL) {
        // xadrez continuo entre tiles: usa a posicao global da peca
        const gx = c * 4 + bx / BL;
        const gy = r * 4 + by / BL;
        if ((gx + gy) % 2 !== 0) continue;
        q(ctx, x, y, bx + 1, by + 1, BL - 2, BL - 2, cores.claro);
        // dente pra cima e encaixe embaixo, que e o que da o ar de quebra-cabeca
        q(ctx, x, y, bx + 11, by - 5, 10, 6, cores.claro);
        q(ctx, x, y, bx + 11, by + BL - 6, 10, 6, cores.base);
        q(ctx, x, y, bx + 1, by + 1, BL - 2, 2, 'rgba(255,255,255,0.10)');
      }
    }
  }

  function drawFloorTile(ctx, c, r, TILE, piso) {
    const x = c * TILE, y = r * TILE;
    const meioTile = TILE / 2;
    const cores = CORES_PISO[piso] || CORES_PISO.tijolo;

    if (piso === 'carpete_roxo') return pisoCarpete(ctx, x, y, TILE, c, r, cores, false);
    if (piso === 'carpete_azul') return pisoCarpete(ctx, x, y, TILE, c, r, cores, true);

    if (piso === 'ladrilho') {
      // ladrilho em losango, em degraus (a linha diagonal do ctx.stroke saia
      // borrada e fugia da cara de pixel do resto)
      q(ctx, x, y, 0, 0, 128, 128, cores.base);
      for (let i = 0; i < 16; i++) {
        const d = i * 4;
        q(ctx, x, y, d, 60 - d, 4, 4, cores.junta);
        q(ctx, x, y, 64 + d, d, 4, 4, cores.junta);
        q(ctx, x, y, 124 - d, 64 + d, 4, 4, cores.junta);
        q(ctx, x, y, 60 - d, 124 - d, 4, 4, cores.junta);
      }
      q(ctx, x, y, 60, 60, 8, 8, cores.luz); // brilho no centro do losango
      return;
    }

    if (piso === 'grama') {
      q(ctx, x, y, 0, 0, 128, 128, cores.base);
      // tufos estaveis (dependem so de c/r), em dois tons
      for (let i = 0; i < 5; i++) {
        const gx = ((c * 29 + r * 53 + i * 37) % 104) + 8;
        const gy = ((c * 41 + r * 23 + i * 43) % 104) + 8;
        q(ctx, x, y, gx, gy, 4, 10, cores.claro);
        q(ctx, x, y, gx + 5, gy + 3, 4, 7, cores.claro);
        q(ctx, x, y, gx - 4, gy + 4, 3, 6, 'rgba(120,190,110,0.45)');
      }
      return;
    }

    pisoTijolo(ctx, x, y, TILE, c, r, cores);
  }

  // Etiqueta flutuante com o nome do ambiente (mesma ideia das "salas" do Gather
  // 2.0: cada zona se identifica por nome e cor logo de cara, sem precisar abrir
  // a Visao de salas).
  function desenharEtiquetaSala(ctx, sala, TILE) {
    const col = sala.labelC != null ? sala.labelC : sala.c0;
    const row = sala.labelR != null ? sala.labelR : sala.r0;
    const x = col * TILE + 5;
    const y = row * TILE + 5;
    const cor = sala.cor || '#8b98a8';
    const texto = sala.nome;

    ctx.save();
    ctx.font = '700 10px Manrope, sans-serif';
    ctx.textBaseline = 'middle';
    const largura = ctx.measureText(texto).width;
    const padX = 8, ponto = 12, h = 17;
    const w = padX * 2 + ponto + largura;

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,40,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.arc(x + padX + 3, y + h / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3c4453';
    ctx.fillText(texto, x + padX + ponto, y + h / 2 + 0.5);
    ctx.restore();
  }

  // Parede e janela formam um muro so: pra decidir a borda, as duas contam como
  // parede (senao aparece um traco entre a parede e o janelao ao lado).
  function ehParede(t) {
    return t === OfficeMap.PAREDE || t === OfficeMap.JANELA;
  }

  function bordasParede(tiles, r, c) {
    return {
      cima: !(tiles[r - 1] && ehParede(tiles[r - 1][c])),
      baixo: !(tiles[r + 1] && ehParede(tiles[r + 1][c])),
      esq: !ehParede(tiles[r][c - 1]),
      dir: !ehParede(tiles[r][c + 1]),
    };
  }

  // Moveis que ocupam varios tiles (mesa de reuniao, sofa, tapete) so desenham
  // a borda no lado em que o vizinho e de outro tipo, pra virarem uma peca so.
  // ---- utilitarios de pixel art ----
  // Tudo em retangulos inteiros: e o que da a cara de sprite da referencia, no
  // lugar de forma vetorial lisa. Cada movel usa contorno escuro + 3 tons.
  const TRACO = '#252a36';

  // ---- grid fino de 128 unidades por tile ----
  // O mapa e pre-renderizado em RENDER_SCALE = 4, entao 1/4 de unidade de tile e
  // exatamente 1 pixel de verdade. A arte dos moveis e desenhada nessa grade de
  // 128x128 por tile - quatro vezes o detalhe que dava pra ter antes.
  const U = 32 / 128; // = 0.25

  function q(ctx, x, y, ax, ay, aw, ah, cor) {
    ctx.fillStyle = cor;
    ctx.fillRect(x + ax * U, y + ay * U, aw * U, ah * U);
  }

  // Retangulo com canto arredondado, em unidades finas.
  function qArred(ctx, x, y, ax, ay, aw, ah, raio, cor) {
    for (let i = 0; i < ah; i++) {
      const d = Math.min(i, ah - 1 - i);
      const recuo = d < raio ? raio - d : 0;
      q(ctx, x, y, ax + recuo, ay + i, aw - recuo * 2, 1, cor);
    }
  }

  // Elipse em degraus, na grade fina. Serve pra copa de arvore, arbusto e pedra:
  // circulo de verdade (ctx.arc) sai liso e vetorial, que e o que destoava do
  // resto da arte. Em degraus de `passo` unidades fica com cara de sprite.
  function blob(ctx, x, y, cx, cy, rw, rh, cor, passo) {
    const p2 = passo || 6;
    for (let dy = -rh; dy < rh; dy += p2) {
      const t = (dy + p2 / 2) / rh;
      const larg = Math.round((rw * Math.sqrt(Math.max(0, 1 - t * t))) / p2) * p2;
      if (larg <= 0) continue;
      q(ctx, x, y, cx - larg, cy + dy, larg * 2, p2, cor);
    }
  }

  // Contorno arredondado (so a casca), pra dar o traco escuro dos sprites.
  function qContorno(ctx, x, y, ax, ay, aw, ah, raio, cor) {
    for (let i = 0; i < ah; i++) {
      const d = Math.min(i, ah - 1 - i);
      const recuo = d < raio ? raio - d : 0;
      const larg = aw - recuo * 2;
      const dProx = Math.min(i + 1, ah - 2 - i);
      const recuoProx = dProx < raio ? raio - dProx : 0;
      if (i === 0 || i === ah - 1 || recuo !== recuoProx) {
        q(ctx, x, y, ax + recuo, ay + i, larg, 1, cor);
      } else {
        q(ctx, x, y, ax + recuo, ay + i, 1, 1, cor);
        q(ctx, x, y, ax + aw - recuo - 1, ay + i, 1, 1, cor);
      }
    }
  }

  // Caixa com contorno de 1px, tampo claro em cima e sombra embaixo.
  // Na grade fina: contorno arredondado, corpo, fio de luz no topo e sombra na
  // base. `ax..ah` em unidades de 0..128.
  function caixa(ctx, x, y, ax, ay, aw, ah, base, claro, escuro, raio) {
    const rr = raio == null ? 4 : raio;
    qContorno(ctx, x, y, ax, ay, aw, ah, rr, TRACO);
    qArred(ctx, x, y, ax + 2, ay + 2, aw - 4, ah - 4, Math.max(0, rr - 1), base);
    if (claro) q(ctx, x, y, ax + 5, ay + 3, aw - 10, 3, claro);
    if (escuro) q(ctx, x, y, ax + 5, ay + ah - 7, aw - 10, 3, escuro);
  }

  // Monitor no grid fino. `ax/ay` sao o canto em unidades de 1/64 do tile.
  // `inclinacao` -1/1 abaixa o lado de fora, dando o "V" dos dois monitores da
  // referencia; 0 desenha reto.
  function monitor(ctx, x, y, ax, ay, aw, ah, tema, inclinacao) {
    const t = tema || {};
    const telaEscura = t.telaEscura || '#2f8fc4';
    const telaClara = t.tela || '#4fb3dd';
    const bloco = t.bloco || '#f4fcff';
    const inc = inclinacao || 0;
    // quanto cada coluna desce (o lado de fora fica mais baixo)
    const queda = (col) => (inc === 0 ? 0 : Math.round((inc > 0 ? col : (aw - 1 - col)) * 5 / aw));

    const bordaTela = 7;              // espessura da moldura
    const alturaTela = ah - 20;       // sobra pra aba de baixo do monitor

    for (let i = 0; i < aw; i++) {
      const oy = ay + queda(i);
      // canto arredondado: as colunas das pontas comecam mais abaixo
      const dPonta = Math.min(i, aw - 1 - i);
      const recuo = dPonta < 3 ? 3 - dPonta : 0;

      q(ctx, x, y, ax + i, oy + recuo, 1, ah - recuo * 2, '#4e5a72');            // contorno
      if (i >= 2 && i < aw - 2) {
        const r2 = Math.max(0, recuo - 1);
        q(ctx, x, y, ax + i, oy + 2 + r2, 1, ah - 4 - r2 * 2, '#dee4ee');        // moldura
        q(ctx, x, y, ax + i, oy + 2 + r2, 1, 2, '#f8fafd');                      // luz no topo
        q(ctx, x, y, ax + i, oy + ah - 4 - r2, 1, 2, '#aeb8c8');                 // sombra na base
      }
      if (i >= bordaTela && i < aw - bordaTela) {
        q(ctx, x, y, ax + i, oy + bordaTela, 1, alturaTela, telaEscura);
        q(ctx, x, y, ax + i, oy + bordaTela, 1, Math.round(alturaTela * 0.5), telaClara);
        q(ctx, x, y, ax + i, oy + bordaTela, 1, 1, '#1f6c99');                   // sombra interna
      }
    }

    // "interface" na tela: barra de titulo com bolinhas, painel grande e coluna
    const t0 = bordaTela + 3;
    const tw = aw - bordaTela * 2 - 6;
    for (let i = t0; i < t0 + tw; i++) {
      const oy = ay + queda(i);
      const rel = i - t0;
      q(ctx, x, y, ax + i, oy + bordaTela + 3, 1, 5, bloco);                     // barra de titulo
      if (rel < tw * 0.62) {
        q(ctx, x, y, ax + i, oy + bordaTela + 11, 1, 10, bloco);                 // painel grande
        if (rel < tw * 0.45) q(ctx, x, y, ax + i, oy + bordaTela + 24, 1, 4, bloco);
        if (rel < tw * 0.3) q(ctx, x, y, ax + i, oy + bordaTela + 30, 1, 4, bloco);
      } else if (rel > tw * 0.68) {
        q(ctx, x, y, ax + i, oy + bordaTela + 11, 1, 23, bloco);                 // coluna lateral
      }
    }
    // pontinhos da barra de titulo
    [0, 4, 8].forEach((d, k) => {
      const col = t0 + 2 + d;
      q(ctx, x, y, ax + col, ay + queda(col) + bordaTela + 4, 3, 3,
        ['#e0705a', '#f0b45a', '#6cc07d'][k]);
    });
    // brilho diagonal no vidro
    for (let i = bordaTela + 1; i < Math.min(aw - bordaTela, bordaTela + 22); i++) {
      const oy = ay + queda(i);
      q(ctx, x, y, ax + i, oy + bordaTela + (i - bordaTela), 1, 5, 'rgba(255,255,255,0.16)');
    }

    // pescoco e base
    const meio = Math.round(aw / 2);
    const baseY = ay + queda(meio) + ah;
    q(ctx, x, y, ax + meio - 4, baseY - 2, 8, 11, '#a7b1c2');
    q(ctx, x, y, ax + meio - 4, baseY - 2, 2, 11, '#ccd3de');
    q(ctx, x, y, ax + meio + 2, baseY - 2, 2, 11, '#8793a6');
    qArred(ctx, x, y, ax + meio - 19, baseY + 9, 38, 6, 2, '#8e99ad');
    q(ctx, x, y, ax + meio - 17, baseY + 9, 34, 2, '#bcc4d1');
  }

  // Teclado com fileiras de teclas e barra de espaco.
  function teclado(ctx, x, y, ax, ay, aw) {
    const ah = 26;
    qContorno(ctx, x, y, ax, ay, aw, ah, 3, '#7b8699');
    qArred(ctx, x, y, ax + 1, ay + 1, aw - 2, ah - 2, 3, '#e5eaf2');
    q(ctx, x, y, ax + 3, ay + 2, aw - 6, 2, '#f9fbfd');       // luz no topo
    q(ctx, x, y, ax + 3, ay + ah - 4, aw - 6, 2, '#c3cbd8');  // sombra na base
    for (let fila = 0; fila < 3; fila++) {
      for (let i = 5; i < aw - 6; i += 6) {
        q(ctx, x, y, ax + i, ay + 5 + fila * 5, 4, 4, '#b5bfcd');
        q(ctx, x, y, ax + i, ay + 5 + fila * 5, 4, 1, '#d3dae4');
      }
    }
    q(ctx, x, y, ax + 12, ay + 20, aw - 24, 4, '#b5bfcd'); // barra de espaco
    q(ctx, x, y, ax + 12, ay + 20, aw - 24, 1, '#d3dae4');
  }

  function mouse(ctx, x, y, ax, ay) {
    qContorno(ctx, x, y, ax, ay, 14, 20, 5, '#7b8699');
    qArred(ctx, x, y, ax + 1, ay + 1, 12, 18, 5, '#eef1f6');
    q(ctx, x, y, ax + 3, ay + 3, 3, 10, '#ffffff');   // brilho
    q(ctx, x, y, ax + 6, ay + 4, 2, 6, '#b5bfcd');    // rodinha
    q(ctx, x, y, ax + 2, ay + 9, 10, 1, '#cdd4df');   // divisao dos botoes
  }

  function caneca(ctx, x, y, ax, ay, cor) {
    const c = cor || '#e0705a';
    qContorno(ctx, x, y, ax, ay, 20, 20, 3, TRACO);
    qArred(ctx, x, y, ax + 2, ay + 2, 16, 16, 2, c);
    q(ctx, x, y, ax + 4, ay + 4, 4, 9, 'rgba(255,255,255,0.32)'); // brilho
    q(ctx, x, y, ax + 4, ay + 3, 12, 2, 'rgba(255,255,255,0.20)');
    q(ctx, x, y, ax + 20, ay + 5, 6, 10, TRACO); // asa
    q(ctx, x, y, ax + 22, ay + 7, 2, 6, c);
  }

  // Tampo compartilhado por todas as mesas, no padrao da referencia: superficie
  // branca e, na frente, o gaveteiro cinza com os puxadores. Sem contorno entre
  // celulas vizinhas, pra duas mesas encostadas virarem uma bancada so.
  // Medido na referencia (referencias/...154025.png): a mesa e uma placa lilas
  // clara e a faixa da frente ocupa ~1/4 da altura dela - bem mais grossa do que
  // eu tinha feito. Nela ficam uma gaveta larga de um lado e um armarinho do
  // outro, nao um puxador por celula.
  const MESA_TAMPO = '#eceaf6';
  const MESA_TAMPO_LUZ = '#f7f6fc';
  const MESA_FRENTE = '#828da8';
  const MESA_FRENTE_LUZ = '#98a2ba';
  const MESA_FRENTE_SOMBRA = '#5f6880';
  const MESA_BORDA = '#a9b0c4';

  function tampoDeMesa(ctx, x, y, TILE, b) {
    // Tudo em unidades de 1/128 do tile. `b.baixo` false = tem mesa na celula de
    // baixo, entao esta e uma fileira do *fundo*: so tampo, sem faixa. A faixa
    // sai uma vez so, na fileira da frente - e o que faz o bloco de 2 fileiras
    // virar uma mesa grande unica.
    const topo = b.cima ? 8 : 0;
    const alturaFrente = b.baixo ? 64 : 0;
    const fimTampo = 128 - alturaFrente;

    if (b.baixo) q(ctx, x, y, 0, 122, 128, 6, 'rgba(45,50,64,0.16)'); // sombra no chao

    // tampo, com veio sutil e luz na borda de tras
    q(ctx, x, y, 0, topo, 128, fimTampo - topo, MESA_TAMPO);
    if (b.cima) {
      q(ctx, x, y, 0, topo, 128, 5, MESA_TAMPO_LUZ);
      q(ctx, x, y, 0, topo + 5, 128, 2, '#e2dff0');
    }
    for (let i = 6; i < 128; i += 26) {
      q(ctx, x, y, i, topo + 10, 1, fimTampo - topo - 14, 'rgba(255,255,255,0.35)');
    }

    if (b.baixo) {
      q(ctx, x, y, 0, fimTampo - 3, 128, 3, MESA_BORDA);          // quina do tampo
      q(ctx, x, y, 0, fimTampo, 128, alturaFrente - 4, MESA_FRENTE);
      q(ctx, x, y, 0, fimTampo, 128, 4, MESA_FRENTE_LUZ);         // luz na quina
      q(ctx, x, y, 0, 120, 128, 4, MESA_FRENTE_SOMBRA);           // sombra no rodape

      // Gaveta larga numa ponta, armarinho na outra - uma vez por mesa, como na
      // referencia, e nao um puxador por celula.
      if (b.esq) {
        qArred(ctx, x, y, 14, fimTampo + 16, 100, 22, 3, '#c8cedd');
        q(ctx, x, y, 16, fimTampo + 18, 96, 3, '#e4e8f0');
        q(ctx, x, y, 40, fimTampo + 25, 48, 4, '#7b8399');        // puxador
        q(ctx, x, y, 40, fimTampo + 25, 48, 1, '#a9b0c4');
      }
      if (b.dir) {
        qArred(ctx, x, y, 86, fimTampo + 12, 30, 30, 3, '#c8cedd');
        q(ctx, x, y, 88, fimTampo + 14, 26, 3, '#e4e8f0');
        q(ctx, x, y, 96, fimTampo + 25, 12, 4, '#7b8399');        // puxador quadrado
        q(ctx, x, y, 96, fimTampo + 25, 12, 1, '#a9b0c4');
      }
    }

    // contorno so onde a bancada termina
    if (b.cima) q(ctx, x, y, 0, topo, 128, 2, MESA_BORDA);
    if (b.baixo) q(ctx, x, y, 0, 126, 128, 2, MESA_FRENTE_SOMBRA);
    if (b.esq) {
      q(ctx, x, y, 0, topo, 2, fimTampo - topo, MESA_BORDA);
      if (b.baixo) q(ctx, x, y, 0, fimTampo, 2, alturaFrente, MESA_FRENTE_SOMBRA);
    }
    if (b.dir) {
      q(ctx, x, y, 126, topo, 2, fimTampo - topo, MESA_BORDA);
      if (b.baixo) q(ctx, x, y, 126, fimTampo, 2, alturaFrente, MESA_FRENTE_SOMBRA);
    }
  }

  function bordasDoMovel(tiles, r, c, tipo) {
    return {
      cima: !(tiles[r - 1] && tiles[r - 1][c] === tipo),
      baixo: !(tiles[r + 1] && tiles[r + 1][c] === tipo),
      esq: tiles[r][c - 1] !== tipo,
      dir: tiles[r][c + 1] !== tipo,
    };
  }

  function drawObstacleTile(ctx, c, r, type, TILE, tiles) {
    const x = c * TILE, y = r * TILE;
    const M = OfficeMap;
    const meio = TILE / 2;

    if (type === M.PAREDE) {
      // parede cinza-azulada escura, como as divisorias do Gather.
      // O contorno so sai na borda do bloco de parede: desenhar em todo tile
      // riscava uma grade por cima do muro inteiro.
      const b = bordasParede(tiles, r, c);
      q(ctx, x, y, 0, 0, 128, 128, '#4a5162');
      // face de cima e rodape so nas pontas do muro: desenhar em todo tile
      // listrava a parede vertical de faixas horizontais repetidas
      if (b.cima) {
        q(ctx, x, y, 0, 0, 128, 30, '#5b6376');
        q(ctx, x, y, 0, 0, 128, 3, '#6f7889'); // luz na quina
        q(ctx, x, y, 0, 30, 128, 2, '#3c4354'); // sombra sob a face de cima
      }
      if (b.baixo) {
        q(ctx, x, y, 0, 104, 128, 24, '#343a48'); // rodape
        q(ctx, x, y, 0, 104, 128, 2, '#59617a'); // fio de luz
      }
      // emenda de painel: vertical no muro deitado, horizontal no muro em pe
      if (b.cima || b.baixo) q(ctx, x, y, 63, 34, 2, 68, 'rgba(38,43,56,0.35)');
      else q(ctx, x, y, 0, 63, 128, 2, 'rgba(38,43,56,0.30)');
      if (b.cima) q(ctx, x, y, 0, 0, 128, 2, TRACO);
      if (b.baixo) q(ctx, x, y, 0, 126, 128, 2, TRACO);
      if (b.esq) q(ctx, x, y, 0, 0, 2, 128, TRACO);
      if (b.dir) q(ctx, x, y, 126, 0, 2, 128, TRACO);

    } else if (type === M.MESA_MONITOR || type === M.MESA) {
      const b = bordasDoMovel(tiles, r, c, type);
      tampoDeMesa(ctx, x, y, TILE, b);

      if (type === M.MESA_MONITOR) {
        monitor(ctx, x, y, 20, -18, 88, 68);
        teclado(ctx, x, y, 30, 60, 68);
        mouse(ctx, x, y, 104, 62);
      }
      // MESA e so a superficie: o que vai em cima entra pela camada de objetos.

    } else if (type === M.MESA_REUNIAO) {
      const b = bordasDoMovel(tiles, r, c, type);
      // sem emenda entre tiles vizinhos: so a fileira de baixo ganha sombra/borda
      const altura = b.baixo ? 116 : 128;
      if (b.baixo) q(ctx, x, y, 4, 116, 120, 8, 'rgba(120,90,50,0.20)');
      q(ctx, x, y, 0, 0, 128, altura, '#e6cba4'); // tampo
      q(ctx, x, y, 0, 0, 128, altura, 'rgba(0,0,0,0)');
      // veio da madeira, so na horizontal, pra nao virar xadrez
      for (let i = 12; i < altura - 8; i += 26) {
        q(ctx, x, y, 6, i, 116, 2, 'rgba(176,138,90,0.28)');
      }
      if (b.cima) q(ctx, x, y, 0, 0, 128, 8, '#f3e0c4');
      if (b.baixo) q(ctx, x, y, 0, altura - 10, 128, 6, '#d3b287');
      const contorno = 'rgba(150,110,65,0.65)';
      if (b.cima) q(ctx, x, y, 0, 0, 128, 3, contorno);
      if (b.baixo) q(ctx, x, y, 0, altura - 3, 128, 3, contorno);
      if (b.esq) q(ctx, x, y, 0, 0, 3, altura, contorno);
      if (b.dir) q(ctx, x, y, 125, 0, 3, altura, contorno);

    } else if (type === M.SOFA_CIMA || type === M.SOFA_BAIXO) {
      const b = bordasDoMovel(tiles, r, c, type);
      const encostoEmCima = type === M.SOFA_CIMA;
      // recepcao usa sofa azul (como o Lobby do Gather); o lounge, marrom
      const sala = OfficeMap.getRoomAtTile(c, r);
      const paleta = (sala && sala.id === 'entrada')
        ? { base: '#7d93bf', escuro: '#41537a', encosto: '#5a6f9e', claro: '#9db0d3' }
        : { base: '#c99566', escuro: '#8a5931', encosto: '#a97244', claro: '#dcab7c' };

      const corpoY = 8; // topo do sofa na grade fina
      const corpoH = 108;
      q(ctx, x, y, 4, 120, 120, 6, 'rgba(45,50,64,0.18)'); // sombra no chao

      q(ctx, x, y, 0, corpoY, 128, corpoH, paleta.base);

      // encosto: faixa bem mais escura que o assento, senao o sofa vira balcao
      const encY = encostoEmCima ? corpoY : corpoY + corpoH - 46;
      q(ctx, x, y, 0, encY, 128, 46, paleta.escuro);
      q(ctx, x, y, 0, encostoEmCima ? encY + 3 : encY + 41, 128, 3, paleta.claro);
      // almofadas do encosto, uma por tile, com vinco entre elas
      qArred(ctx, x, y, 8, encY + 8, 112, 30, 6, paleta.encosto);
      q(ctx, x, y, 12, encY + 10, 104, 2, 'rgba(255,255,255,0.18)');

      // uma almofada de assento por tile: o vao cai na emenda entre os tiles,
      // que e o que faz parecer sofa e nao uma frente de gavetas
      const assY = encostoEmCima ? corpoY + 50 : corpoY + 10;
      q(ctx, x, y, 6, assY + 44, 116, 6, 'rgba(0,0,0,0.16)'); // sombra sob a almofada
      qArred(ctx, x, y, 6, assY, 116, 46, 10, paleta.base);
      q(ctx, x, y, 16, assY + 3, 96, 3, 'rgba(255,255,255,0.26)'); // luz na quina

      // bracos so nas pontas livres do sofa
      if (b.esq) {
        qArred(ctx, x, y, 0, corpoY, 22, corpoH, 5, paleta.escuro);
        q(ctx, x, y, 3, corpoY + 4, 16, 3, paleta.claro);
      }
      if (b.dir) {
        qArred(ctx, x, y, 106, corpoY, 22, corpoH, 5, paleta.escuro);
        q(ctx, x, y, 109, corpoY + 4, 16, 3, paleta.claro);
      }

      // contorno so onde o sofa termina
      if (b.cima) q(ctx, x, y, 0, corpoY, 128, 2, TRACO);
      if (b.baixo) q(ctx, x, y, 0, corpoY + corpoH - 2, 128, 2, TRACO);
      if (b.esq) q(ctx, x, y, 0, corpoY, 2, corpoH, TRACO);
      if (b.dir) q(ctx, x, y, 126, corpoY, 2, corpoH, TRACO);

    } else if (type === M.TAPETE) {
      const b = bordasDoMovel(tiles, r, c, type);
      q(ctx, x, y, 0, 0, 128, 128, '#dfbca6');
      // trama do tecido, em pontinhos estaveis
      for (let i = 0; i < 128; i += 16) {
        for (let j = ((i / 16) % 2) * 8; j < 128; j += 16) {
          q(ctx, x, y, j, i, 6, 6, 'rgba(198,152,120,0.35)');
        }
      }
      const debrum = '#c08a6c';
      if (b.cima) { q(ctx, x, y, 0, 0, 128, 6, debrum); q(ctx, x, y, 0, 8, 128, 3, 'rgba(255,255,255,0.20)'); }
      if (b.baixo) { q(ctx, x, y, 0, 122, 128, 6, debrum); q(ctx, x, y, 0, 117, 128, 3, 'rgba(255,255,255,0.20)'); }
      if (b.esq) { q(ctx, x, y, 0, 0, 6, 128, debrum); q(ctx, x, y, 8, 0, 3, 128, 'rgba(255,255,255,0.20)'); }
      if (b.dir) { q(ctx, x, y, 122, 0, 6, 128, debrum); q(ctx, x, y, 117, 0, 3, 128, 'rgba(255,255,255,0.20)'); }

    } else if (type === M.MESA_CENTRO) {
      q(ctx, x, y, 28, 100, 72, 10, 'rgba(120,100,70,0.18)'); // sombra
      q(ctx, x, y, 58, 76, 12, 28, '#a97c52'); // pe central
      q(ctx, x, y, 44, 100, 40, 8, '#8a6242'); // base do pe
      blob(ctx, x, y, 64, 56, 48, 46, '#a97c52', 4); // contorno do tampo
      blob(ctx, x, y, 64, 54, 44, 42, '#dcb98f', 4); // tampo
      blob(ctx, x, y, 52, 42, 20, 16, '#f0dcc0', 4); // luz
      q(ctx, x, y, 26, 62, 76, 3, 'rgba(150,110,65,0.25)'); // veio

    } else if (type === M.ESTANTE) {
      const LIVROS = ['#e05a5a', '#5a86d0', '#e0a25a', '#5ab07a', '#a76fd0', '#4ec0c0'];
      q(ctx, x, y, 6, 118, 116, 6, 'rgba(45,50,64,0.18)'); // sombra no chao

      qContorno(ctx, x, y, 2, 6, 124, 116, 4, TRACO);
      qArred(ctx, x, y, 4, 8, 120, 112, 3, '#5e6678'); // caixa
      q(ctx, x, y, 6, 10, 116, 3, '#79839a'); // luz no topo
      q(ctx, x, y, 6, 10, 4, 108, '#6b7488'); // lateral iluminada
      q(ctx, x, y, 118, 10, 4, 108, '#4b5266'); // lateral na sombra

      // tres prateleiras, cada uma com fundo escuro e livros de altura variada
      [16, 52, 88].forEach((prat, nivel) => {
        q(ctx, x, y, 10, prat, 108, 28, '#3b4152'); // vao escuro
        let bx = 13;
        let i = 0;
        while (bx < 112) {
          const larg = 7 + ((c + r + nivel + i) % 3) * 3;
          const alt = 20 + ((c * 3 + r + nivel + i) % 4) * 2;
          const cor = LIVROS[(i + c + r + nivel) % LIVROS.length];
          q(ctx, x, y, bx, prat + 28 - alt, larg, alt, cor);
          q(ctx, x, y, bx, prat + 28 - alt, larg, 2, 'rgba(255,255,255,0.30)');
          q(ctx, x, y, bx + larg - 1, prat + 28 - alt, 1, alt, 'rgba(0,0,0,0.22)');
          bx += larg + 2;
          i++;
        }
        q(ctx, x, y, 8, prat + 28, 112, 4, '#474e5e'); // tabua
        q(ctx, x, y, 8, prat + 28, 112, 1, '#7d879d');
      });

    } else if (type === M.PLANTA) {
      // vasos coloridos (rosa/azul/roxo/teal), como a decoracao do Gather
      const VASOS = [['#e26aa5', '#f08cbd', '#b8477f'], ['#5a9fe0', '#7bb8ee', '#3f77b0'],
        ['#9b6fd6', '#b48ee6', '#7449b0'], ['#3fb0a5', '#5cc7bd', '#2d867e']];
      const vaso = VASOS[(c * 3 + r * 5) % VASOS.length];
      q(ctx, x, y, 38, 106, 52, 8, 'rgba(45,50,64,0.20)');
      // folhagem em blocos com contorno, no lugar dos circulos lisos
      [[36, 42], [72, 42], [54, 22], [54, 58]].forEach(([fx, fy]) => {
        blob(ctx, x, y, fx + 10, fy + 10, 18, 15, '#215a2f', 4);
        blob(ctx, x, y, fx + 10, fy + 9, 14, 11, '#3f8a4a', 4);
        blob(ctx, x, y, fx + 7, fy + 6, 7, 5, '#55a862', 4);
      });
      q(ctx, x, y, 61, 56, 5, 24, '#215a2f'); // caule
      caixa(ctx, x, y, 38, 76, 52, 38, vaso[0], vaso[1], vaso[2]);
      q(ctx, x, y, 42, 80, 44, 4, vaso[1]);

    } else if (type === M.ARVORE) {
      // arvore grande: a copa passa do tile (por isso e desenhada por ultimo)
      const CX = 64, BASE = 122;
      q(ctx, x, y, 24, BASE - 8, 80, 12, 'rgba(46,84,46,0.20)'); // sombra no chao
      q(ctx, x, y, 34, BASE - 4, 60, 4, 'rgba(46,84,46,0.14)');

      q(ctx, x, y, CX - 14, BASE - 54, 28, 54, '#7a5636'); // tronco
      q(ctx, x, y, CX - 14, BASE - 54, 8, 54, '#93694230'); // luz na esquerda
      q(ctx, x, y, CX + 4, BASE - 54, 10, 54, 'rgba(60,40,24,0.45)'); // sombra
      q(ctx, x, y, CX - 14, BASE - 34, 28, 3, 'rgba(60,40,24,0.35)'); // no da casca

      // copa em tres camadas: contorno escuro, corpo e luz em cima a esquerda
      blob(ctx, x, y, CX, BASE - 108, 66, 46, '#2c6636', 6);
      blob(ctx, x, y, CX - 34, BASE - 74, 40, 30, '#2c6636', 6);
      blob(ctx, x, y, CX + 34, BASE - 74, 40, 30, '#2c6636', 6);
      blob(ctx, x, y, CX, BASE - 108, 58, 39, '#3f8a4a', 6);
      blob(ctx, x, y, CX - 30, BASE - 74, 33, 24, '#3f8a4a', 6);
      blob(ctx, x, y, CX + 30, BASE - 74, 33, 24, '#3f8a4a', 6);
      blob(ctx, x, y, CX - 18, BASE - 122, 30, 20, '#5cae67', 6);
      blob(ctx, x, y, CX + 22, BASE - 100, 20, 14, '#5cae67', 6);
      blob(ctx, x, y, CX - 26, BASE - 96, 14, 10, '#74c47e', 6);

    } else if (type === M.QUADRO) {
      // moldura com paisagem: ceu, morro e sol
      qContorno(ctx, x, y, 12, 12, 104, 82, 3, '#6f5334');
      qArred(ctx, x, y, 14, 14, 100, 78, 2, '#a97f52'); // moldura
      q(ctx, x, y, 22, 22, 84, 62, '#f3efe6'); // passe-partout
      q(ctx, x, y, 26, 26, 76, 54, '#7fb3dd'); // ceu
      q(ctx, x, y, 26, 26, 76, 14, '#a3cdea');
      blob(ctx, x, y, 84, 40, 10, 10, '#f7d97a', 4); // sol
      // morros em degraus
      for (let i = 0; i < 9; i++) {
        q(ctx, x, y, 26 + i * 4, 62 - i * 4, 8, 4 + i * 4, '#5ba86a');
      }
      for (let i = 0; i < 8; i++) {
        q(ctx, x, y, 62 + i * 5, 54 + i * 3, 6, 26 - i * 3, '#468a55');
      }
      q(ctx, x, y, 26, 74, 76, 6, '#3f7a4a'); // chao
      q(ctx, x, y, 22, 84, 84, 4, '#8a6242'); // sombra sob o quadro

    } else if (type === M.LOUSA) {
      const b = bordasDoMovel(tiles, r, c, type);
      q(ctx, x, y, 0, 8, 128, 88, '#b5ab9b'); // moldura
      q(ctx, x, y, 0, 16, 128, 72, '#f8f7f2'); // quadro branco
      q(ctx, x, y, 0, 16, 128, 4, '#ffffff');
      q(ctx, x, y, 10, 30, 108, 5, '#7fb3dd'); // rabiscos
      q(ctx, x, y, 10, 44, 76, 5, '#d0785a');
      q(ctx, x, y, 10, 58, 92, 5, '#7fb3dd');
      q(ctx, x, y, 10, 72, 54, 5, '#8f97a8');
      q(ctx, x, y, 0, 88, 128, 8, '#9d9384'); // calha dos marcadores
      q(ctx, x, y, 24, 90, 18, 4, '#d0785a');
      q(ctx, x, y, 50, 90, 18, 4, '#4da3d6');
      const cont = 'rgba(110,100,88,0.7)';
      if (b.cima) q(ctx, x, y, 0, 8, 128, 3, cont);
      if (b.baixo) q(ctx, x, y, 0, 93, 128, 3, cont);
      if (b.esq) q(ctx, x, y, 0, 8, 3, 88, cont);
      if (b.dir) q(ctx, x, y, 125, 8, 3, 88, cont);

    } else if (type === M.ARMARIO) {
      // armario de duas portas, com puxadores e pes
      q(ctx, x, y, 8, 116, 112, 8, 'rgba(45,50,64,0.20)'); // sombra
      qContorno(ctx, x, y, 2, 6, 124, 112, 4, TRACO);
      qArred(ctx, x, y, 4, 8, 120, 108, 3, '#6a7286');
      q(ctx, x, y, 6, 10, 116, 4, '#8a94aa'); // luz no topo
      q(ctx, x, y, 6, 10, 5, 104, '#7d879d'); // lateral iluminada
      q(ctx, x, y, 117, 10, 5, 104, '#545b6d'); // lateral na sombra
      q(ctx, x, y, 62, 12, 4, 100, '#464d5e'); // fresta entre as portas
      // painel rebaixado de cada porta
      q(ctx, x, y, 14, 22, 42, 76, '#5f6779');
      q(ctx, x, y, 72, 22, 42, 76, '#5f6779');
      q(ctx, x, y, 14, 22, 42, 3, '#7d879d');
      q(ctx, x, y, 72, 22, 42, 3, '#7d879d');
      q(ctx, x, y, 48, 56, 6, 18, '#cfd5e2'); // puxadores
      q(ctx, x, y, 74, 56, 6, 18, '#cfd5e2');
      q(ctx, x, y, 12, 116, 14, 8, TRACO); // pes
      q(ctx, x, y, 102, 116, 14, 8, TRACO);

    } else if (type === M.BALCAO) {
      const b = bordasDoMovel(tiles, r, c, type);
      q(ctx, x, y, 0, 116, 128, 8, 'rgba(45,50,64,0.20)'); // sombra
      q(ctx, x, y, 0, 32, 128, 84, '#dfe2ea'); // corpo
      q(ctx, x, y, 0, 26, 128, 12, '#f7f9fc'); // tampo saliente
      q(ctx, x, y, 0, 38, 128, 3, '#b9c0cd'); // sombra sob o tampo
      q(ctx, x, y, 0, 100, 128, 12, '#a8aebd'); // rodape
      q(ctx, x, y, 0, 100, 128, 2, '#ffffff40');
      for (let i = 8; i < 128; i += 26) { // ripas verticais
        q(ctx, x, y, i, 48, 3, 46, '#c3c9d6');
        q(ctx, x, y, i + 3, 48, 2, 46, '#eef1f6');
      }
      if (b.cima) q(ctx, x, y, 0, 26, 128, 2, TRACO);
      if (b.baixo) q(ctx, x, y, 0, 114, 128, 2, TRACO);
      if (b.esq) q(ctx, x, y, 0, 26, 2, 90, TRACO);
      if (b.dir) q(ctx, x, y, 126, 26, 2, 90, TRACO);

    } else if (type === M.CERCA) {
      ctx.fillStyle = '#c99f70';
      q(ctx, x, y, 0, 42, 128, 14, '#c99f70'); // travessas
      q(ctx, x, y, 0, 42, 128, 3, '#ddb98c');
      q(ctx, x, y, 0, 53, 128, 3, '#a67f55');
      q(ctx, x, y, 0, 74, 128, 14, '#c99f70');
      q(ctx, x, y, 0, 74, 128, 3, '#ddb98c');
      q(ctx, x, y, 0, 85, 128, 3, '#a67f55');
      [14, 94].forEach((px) => { // mourões
        q(ctx, x, y, px, 18, 20, 94, '#a97f52');
        q(ctx, x, y, px, 18, 6, 94, '#c09062');
        q(ctx, x, y, px + 16, 18, 4, 94, '#8a6642');
        q(ctx, x, y, px, 18, 20, 4, '#d0a476'); // topo do mourão
      });
      q(ctx, x, y, 10, 108, 28, 6, 'rgba(60,66,82,0.18)');
      q(ctx, x, y, 90, 108, 28, 6, 'rgba(60,66,82,0.18)');

    } else if (type === M.JANELA) {
      // janelao: mesma parede, com vidro, caixilho branco e reflexo em diagonal
      const b = bordasParede(tiles, r, c);
      q(ctx, x, y, 0, 0, 128, 128, '#4a5162');
      if (b.cima) {
        q(ctx, x, y, 0, 0, 128, 24, '#5b6376');
        q(ctx, x, y, 0, 0, 128, 3, '#6f7889');
      }
      q(ctx, x, y, 0, 26, 128, 76, '#eef2f5'); // caixilho
      q(ctx, x, y, 0, 26, 128, 3, '#ffffff');
      q(ctx, x, y, 6, 32, 116, 64, '#8fcdd8'); // vidro
      q(ctx, x, y, 6, 32, 116, 22, '#b3e0e7'); // ceu refletido no alto
      // reflexo diagonal, em degraus
      for (let i = 0; i < 14; i++) {
        q(ctx, x, y, 18 + i * 4, 88 - i * 4, 10, 4, 'rgba(255,255,255,0.30)');
        q(ctx, x, y, 44 + i * 4, 88 - i * 4, 5, 4, 'rgba(255,255,255,0.20)');
      }
      q(ctx, x, y, 60, 32, 6, 64, '#eef2f5'); // montante
      q(ctx, x, y, 6, 60, 116, 5, '#eef2f5'); // travessa
      q(ctx, x, y, 6, 92, 116, 4, '#c9d2da'); // sombra do peitoril
      if (b.baixo) {
        q(ctx, x, y, 0, 104, 128, 24, '#343a48');
        q(ctx, x, y, 0, 104, 128, 2, '#59617a');
      }

    } else if (type === M.AGUA) {
      const b = bordasDoMovel(tiles, r, c, type);
      q(ctx, x, y, 0, 0, 128, 128, '#3f8fc9'); // fundo mais escuro
      q(ctx, x, y, 0, 0, 128, 64, '#4fa3da'); // agua mais clara no alto
      // marolas: tracinhos estaveis, dependem so de c/r
      for (let i = 0; i < 5; i++) {
        const ox = ((c * 41 + r * 23 + i * 37) % 96) + 8;
        const oy = ((c * 29 + r * 53 + i * 43) % 104) + 10;
        q(ctx, x, y, ox, oy, 22, 3, 'rgba(255,255,255,0.28)');
        q(ctx, x, y, ox + 6, oy + 5, 12, 2, 'rgba(255,255,255,0.16)');
      }
      // carpa: corpo, cabeca clara e cauda
      if ((c + r) % 3 === 0) {
        const px = 40, py = 54;
        q(ctx, x, y, px, py, 34, 14, '#ef8a34');
        q(ctx, x, y, px + 4, py - 4, 22, 6, '#f6a75c');
        q(ctx, x, y, px + 30, py + 2, 12, 4, '#ef8a34');
        q(ctx, x, y, px + 38, py - 2, 8, 12, '#f6a75c');
        q(ctx, x, y, px + 8, py + 2, 8, 4, '#ffffff');
        q(ctx, x, y, px + 2, py + 4, 4, 4, TRACO);
      }
      // borda da agua so onde o lago termina
      if (b.cima) q(ctx, x, y, 0, 0, 128, 4, '#2f6f9e');
      if (b.baixo) q(ctx, x, y, 0, 124, 128, 4, '#2f6f9e');
      if (b.esq) q(ctx, x, y, 0, 0, 4, 128, '#2f6f9e');
      if (b.dir) q(ctx, x, y, 124, 0, 4, 128, '#2f6f9e');

    } else if (type === M.PEDRA) {
      q(ctx, x, y, 20, 96, 88, 12, 'rgba(52,62,52,0.20)'); // sombra no chao
      blob(ctx, x, y, 64, 62, 50, 40, '#6f767e', 6); // contorno escuro
      blob(ctx, x, y, 64, 60, 44, 34, '#9aa0a6', 6); // corpo
      blob(ctx, x, y, 52, 48, 24, 16, '#bcc2c8', 6); // facet iluminada
      q(ctx, x, y, 74, 62, 22, 4, 'rgba(60,68,76,0.35)'); // trinca
      q(ctx, x, y, 46, 74, 30, 4, 'rgba(60,68,76,0.25)');

    } else if (type === M.ARBUSTO) {
      q(ctx, x, y, 22, 104, 84, 10, 'rgba(46,84,46,0.18)');
      blob(ctx, x, y, 44, 76, 32, 26, '#2c6636', 6);
      blob(ctx, x, y, 86, 76, 32, 26, '#2c6636', 6);
      blob(ctx, x, y, 64, 56, 40, 32, '#2c6636', 6);
      blob(ctx, x, y, 44, 74, 26, 21, '#3f8a4a', 6);
      blob(ctx, x, y, 86, 74, 26, 21, '#3f8a4a', 6);
      blob(ctx, x, y, 64, 54, 33, 26, '#3f8a4a', 6);
      blob(ctx, x, y, 52, 44, 17, 12, '#5cae67', 6);
      q(ctx, x, y, 70, 62, 8, 6, '#e8577f'); // florzinha
      q(ctx, x, y, 88, 82, 6, 6, '#f0c65a');

    } else if (type === M.BANCO) {
      // banco de ripas com encosto, tipo praca
      q(ctx, x, y, 12, 106, 104, 8, 'rgba(45,50,64,0.20)');
      caixa(ctx, x, y, 8, 20, 112, 30, '#41639e', '#6f8fc8', '#2f4a79'); // encosto
      q(ctx, x, y, 14, 30, 100, 3, '#2f4a79'); // fresta do encosto
      caixa(ctx, x, y, 8, 48, 112, 42, '#5a86d0', '#8bafe8', '#41639e'); // assento
      q(ctx, x, y, 14, 62, 100, 3, '#41639e'); // ripas
      q(ctx, x, y, 14, 65, 100, 2, '#7ba3e0');
      q(ctx, x, y, 14, 76, 100, 3, '#41639e');
      q(ctx, x, y, 14, 79, 100, 2, '#7ba3e0');
      q(ctx, x, y, 16, 88, 12, 22, TRACO); // pes
      q(ctx, x, y, 100, 88, 12, 22, TRACO);

    } else if (type === M.CABIDE) {
      q(ctx, x, y, 44, 106, 40, 8, 'rgba(60,66,82,0.18)');
      q(ctx, x, y, 52, 100, 24, 8, '#3b4152'); // base
      q(ctx, x, y, 60, 24, 8, 78, '#4a5162'); // haste
      q(ctx, x, y, 60, 24, 3, 78, '#626b80'); // luz na haste
      // ganchos com casacos pendurados
      q(ctx, x, y, 34, 34, 26, 6, '#4a5162');
      q(ctx, x, y, 68, 38, 26, 6, '#4a5162');
      blob(ctx, x, y, 34, 52, 16, 18, '#f0c65a', 4);
      blob(ctx, x, y, 94, 56, 16, 18, '#e05a5a', 4);
      blob(ctx, x, y, 64, 20, 14, 12, '#5a86d0', 4);

    } else if (type === M.IMPRESSORA) {
      q(ctx, x, y, 12, 106, 104, 8, 'rgba(45,50,64,0.20)');
      caixa(ctx, x, y, 10, 38, 108, 70, '#7d879d', '#a5b0c4', '#5b6376');
      q(ctx, x, y, 22, 62, 84, 16, '#2c3240'); // fenda de saida
      q(ctx, x, y, 22, 62, 84, 3, '#1e232e');
      q(ctx, x, y, 26, 78, 76, 6, '#f7f8fc'); // papel saindo
      // bandeja de cima com pilha de papel
      q(ctx, x, y, 28, 22, 72, 18, '#f7f8fc');
      q(ctx, x, y, 28, 22, 72, 3, '#ffffff');
      q(ctx, x, y, 28, 38, 72, 3, '#c3c9d6');
      q(ctx, x, y, 92, 46, 12, 8, '#5ab07a'); // luz verde
      q(ctx, x, y, 20, 46, 34, 6, '#5b6376'); // painel

    } else if (type === M.CAVALETE) {
      q(ctx, x, y, 20, 112, 88, 8, 'rgba(45,50,64,0.18)');
      q(ctx, x, y, 22, 72, 10, 46, '#8a6242'); // pernas
      q(ctx, x, y, 96, 72, 10, 46, '#8a6242');
      q(ctx, x, y, 22, 72, 4, 46, '#a67c56');
      q(ctx, x, y, 30, 94, 68, 6, '#8a6242'); // travessa
      qContorno(ctx, x, y, 12, 10, 104, 66, 3, '#7d746a');
      q(ctx, x, y, 14, 12, 100, 62, '#f7f8fc'); // folha
      q(ctx, x, y, 14, 12, 100, 4, '#ffffff');
      // rabiscos do grafico
      q(ctx, x, y, 26, 48, 14, 20, '#4da3d6');
      q(ctx, x, y, 46, 36, 14, 32, '#4da3d6');
      q(ctx, x, y, 66, 26, 14, 42, '#e07a5f');
      q(ctx, x, y, 86, 42, 14, 26, '#f0c65a');
      q(ctx, x, y, 22, 68, 82, 3, '#b5ab9b'); // linha de base

    } else if (M.ASSENTOS.has(type) && type !== M.POLTRONA) {
      const vermelha = type === M.CADEIRA_VERMELHA || type === M.CADEIRA_VERMELHA_BAIXO
        || type === M.CADEIRA_VERMELHA_ESQ || type === M.CADEIRA_VERMELHA_DIR;
      const cores = vermelha
        ? ['#8f3b30', '#c0574a', '#5e211a']
        : ['#4a5162', '#6b7488', '#2b3040'];
      cadeiraDeEscritorio(ctx, x, y, TILE, cores[0], cores[1], cores[2], M.DIRECAO_ASSENTO[type]);

    // ---- variacoes do catalogo do decorador ----

    } else if (type === M.MESA_DUPLA) {
      // A mesa da referencia: dois monitores lado a lado, teclado e caneca.
      tampoDeMesa(ctx, x, y, TILE, bordasDoMovel(tiles, r, c, type));
      monitor(ctx, x, y, -6, -16, 70, 62, { tela: '#4fb3dd' }, -1);
      monitor(ctx, x, y, 64, -16, 70, 62, { tela: '#4aaad4' }, 1);
      teclado(ctx, x, y, 28, 56, 72);
      mouse(ctx, x, y, 106, 58);

    } else if (type === M.MESA_NOTEBOOK) {
      tampoDeMesa(ctx, x, y, TILE, bordasDoMovel(tiles, r, c, type));
      // tampa levantada
      qContorno(ctx, x, y, 32, 14, 68, 50, 3, TRACO);
      q(ctx, x, y, 34, 16, 64, 46, '#5b6376');
      q(ctx, x, y, 38, 20, 56, 38, '#3f7fb5');
      q(ctx, x, y, 42, 24, 32, 4, '#a7d8f0');
      q(ctx, x, y, 42, 32, 20, 4, '#a7d8f0');
      q(ctx, x, y, 42, 40, 26, 4, '#7fc0e8');
      q(ctx, x, y, 38, 20, 4, 38, 'rgba(255,255,255,0.32)'); // brilho na tela
      // base com teclado e trackpad
      qContorno(ctx, x, y, 28, 64, 76, 26, 3, TRACO);
      q(ctx, x, y, 30, 66, 72, 22, '#c9cfdd');
      for (let i = 34; i < 98; i += 8) q(ctx, x, y, i, 70, 5, 4, '#8f97a8');
      for (let i = 38; i < 94; i += 8) q(ctx, x, y, i, 76, 5, 4, '#8f97a8');
      q(ctx, x, y, 56, 82, 20, 4, '#8f97a8'); // trackpad
      caneca(ctx, x, y, 8, 72, '#e0705a');

    } else if (type === M.PLANTA_GRANDE) {
      // vaso alto, folhas grandes recortadas (estilo costela-de-adao)
      q(ctx, x, y, 28, 108, 72, 8, 'rgba(45,50,64,0.20)');
      q(ctx, x, y, 60, 48, 8, 32, '#1f5c30'); // caule
      [[22, 50], [76, 50], [46, 22], [18, 26], [78, 26], [48, 58]].forEach(([fx, fy]) => {
        blob(ctx, x, y, fx + 15, fy + 12, 22, 17, '#215a2f', 4); // contorno
        blob(ctx, x, y, fx + 15, fy + 11, 18, 13, '#2f7a41', 4);
        blob(ctx, x, y, fx + 11, fy + 7, 9, 6, '#49a35c', 4);
        q(ctx, x, y, fx + 14, fy + 4, 3, 16, '#1f5c30'); // nervura
      });
      caixa(ctx, x, y, 34, 76, 60, 40, '#b1704a', '#e0a07a', '#8a5334');
      q(ctx, x, y, 38, 80, 52, 5, '#c98358');

    } else if (type === M.VASO_FLORES) {
      q(ctx, x, y, 38, 104, 52, 8, 'rgba(45,50,64,0.20)');
      caixa(ctx, x, y, 38, 72, 52, 40, '#d8dde8', '#f6f8fb', '#aeb4c4');
      q(ctx, x, y, 61, 38, 6, 36, '#3f8a4a'); // caule central
      q(ctx, x, y, 44, 52, 18, 4, '#3f8a4a');
      q(ctx, x, y, 66, 52, 18, 4, '#3f8a4a');
      [['#e8657f', 64, 26], ['#f0a83c', 38, 40], ['#c77fe0', 90, 40]].forEach(([cor, fx, fy]) => {
        blob(ctx, x, y, fx, fy, 15, 15, TRACO, 4);
        blob(ctx, x, y, fx, fy, 12, 12, cor, 4);
        q(ctx, x, y, fx - 4, fy - 4, 8, 8, '#fff3c4'); // miolo
      });

    } else if (type === M.CACTO) {
      q(ctx, x, y, 38, 104, 52, 8, 'rgba(45,50,64,0.20)');
      qContorno(ctx, x, y, 48, 16, 32, 72, 6, TRACO);
      qArred(ctx, x, y, 50, 18, 28, 68, 5, '#4f9e5c'); // corpo
      q(ctx, x, y, 52, 22, 8, 60, '#6bbd78'); // luz
      qContorno(ctx, x, y, 20, 42, 26, 38, 6, TRACO);
      qArred(ctx, x, y, 22, 44, 22, 34, 5, '#4f9e5c'); // braco esquerdo
      qContorno(ctx, x, y, 82, 34, 26, 40, 6, TRACO);
      qArred(ctx, x, y, 84, 36, 22, 36, 5, '#4f9e5c'); // braco direito
      for (let i = 26; i < 84; i += 12) q(ctx, x, y, 62, i, 3, 5, '#2f6b3a'); // espinhos
      blob(ctx, x, y, 64, 14, 10, 8, '#e8657f', 4); // florzinha
      caixa(ctx, x, y, 38, 82, 52, 34, '#c98358', '#e6ab84', '#9c6340');

    } else if (type === M.POLTRONA) {
      // poltrona estofada com costura e bracos (da pra sentar)
      q(ctx, x, y, 18, 108, 92, 8, 'rgba(45,50,64,0.20)');
      caixa(ctx, x, y, 12, 12, 104, 96, '#9c6b4f', '#c48a68', '#7a5039', 6);
      qArred(ctx, x, y, 30, 38, 68, 52, 6, '#b98263'); // assento
      q(ctx, x, y, 34, 40, 60, 3, '#cf9878');
      q(ctx, x, y, 62, 44, 3, 40, '#8a5c43'); // costura do meio
      qArred(ctx, x, y, 14, 44, 20, 50, 5, '#8a5c43'); // bracos
      qArred(ctx, x, y, 94, 44, 20, 50, 5, '#8a5c43');
      q(ctx, x, y, 17, 46, 14, 3, '#a87a5c');
      q(ctx, x, y, 97, 46, 14, 3, '#a87a5c');

    } else if (type === M.BEBEDOURO) {
      q(ctx, x, y, 30, 108, 68, 8, 'rgba(45,50,64,0.20)');
      caixa(ctx, x, y, 34, 44, 60, 68, '#d8dde8', '#f6f8fb', '#aeb4c4');
      // galao azul em cima, com nivel de agua
      qContorno(ctx, x, y, 42, 8, 44, 40, 5, TRACO);
      qArred(ctx, x, y, 44, 10, 40, 36, 4, '#63b6e0');
      q(ctx, x, y, 44, 10, 40, 10, '#8fd0ec'); // ar em cima
      q(ctx, x, y, 48, 14, 6, 26, 'rgba(255,255,255,0.40)'); // brilho
      q(ctx, x, y, 54, 62, 20, 6, TRACO); // torneiras
      q(ctx, x, y, 58, 76, 12, 14, TRACO);
      q(ctx, x, y, 60, 78, 8, 8, '#8fd6ee');
      q(ctx, x, y, 44, 96, 40, 4, '#aeb4c4');

    } else if (type === M.TV) {
      q(ctx, x, y, 24, 104, 80, 8, 'rgba(45,50,64,0.20)');
      qContorno(ctx, x, y, 6, 18, 116, 74, 4, TRACO);
      q(ctx, x, y, 8, 20, 112, 70, '#39404f'); // moldura
      q(ctx, x, y, 16, 28, 96, 54, '#2f5e86'); // tela
      q(ctx, x, y, 16, 28, 96, 16, '#3d76a4'); // ceu da imagem
      q(ctx, x, y, 22, 34, 32, 5, '#8fd6ee');
      q(ctx, x, y, 22, 44, 20, 5, '#8fd6ee');
      q(ctx, x, y, 84, 62, 18, 12, '#f0a83c');
      q(ctx, x, y, 16, 28, 5, 54, 'rgba(255,255,255,0.26)'); // brilho
      q(ctx, x, y, 52, 92, 24, 12, TRACO); // pe
      q(ctx, x, y, 40, 104, 48, 6, TRACO);

    } else if (type === M.RELOGIO) {
      blob(ctx, x, y, 64, 64, 34, 34, TRACO, 4);
      blob(ctx, x, y, 64, 64, 30, 30, '#f7f8fc', 4);
      blob(ctx, x, y, 64, 62, 22, 20, '#ffffff', 4);
      q(ctx, x, y, 61, 38, 6, 6, '#8f97a8'); // marcas das horas
      q(ctx, x, y, 61, 84, 6, 6, '#8f97a8');
      q(ctx, x, y, 38, 61, 6, 6, '#8f97a8');
      q(ctx, x, y, 84, 61, 6, 6, '#8f97a8');
      q(ctx, x, y, 62, 44, 4, 22, '#2c3240'); // ponteiro das horas
      q(ctx, x, y, 64, 62, 22, 4, '#e0705a'); // ponteiro dos minutos
      q(ctx, x, y, 60, 60, 8, 8, '#2c3240'); // eixo

    } else if (type === M.TAPETE_REDONDO) {
      // tapete em aneis, em degraus pra ficar pixelado como a referencia
      [[60, '#a58ede'], [44, '#c9b6e8'], [28, '#e5dbf7']].forEach(([raio, cor]) => {
        blob(ctx, x, y, 64, 64, raio, raio, cor, 4);
      });
    }
  }

  // Camada de cima: o que fica apoiado na celula. Desenhado depois dos moveis,
  // entao um monitor pousa em cima da mesa em vez de virar parte dela.
  function drawObjectTile(ctx, c, r, obj, TILE) {
    const O = OfficeMap.OBJETOS;
    const x = c * TILE, y = r * TILE;
    const meio = TILE / 2;

    // Os monitores sao altos e **passam do tile pra cima**, como na referencia:
    // o pe apoia no tampo e a tela sobe por cima da mesa. Da certo porque a
    // camada de cima e desenhada depois de tudo.
    if (obj === O.MONITOR) {
      monitor(ctx, x, y, 10, -36, 108, 80);

    } else if (obj === O.MONITOR_DUPLO) {
      // os dois em "V", como na foto: o de fora de cada lado cai um pouco
      monitor(ctx, x, y, -8, -32, 74, 70, { tela: '#4fb3dd' }, -1);
      monitor(ctx, x, y, 62, -32, 74, 70, { tela: '#4aaad4' }, 1);

    } else if (obj === O.NOTEBOOK) {
      // tampa levantada com dobradica, base com teclado e trackpad
      qContorno(ctx, x, y, 26, 4, 76, 52, 4, '#242935');
      qArred(ctx, x, y, 27, 5, 74, 50, 4, '#5b6376');
      qArred(ctx, x, y, 32, 10, 64, 40, 2, '#2f7fb5');
      qArred(ctx, x, y, 32, 10, 64, 20, 2, '#4198cf');
      q(ctx, x, y, 36, 15, 34, 4, '#bfe6fa');
      q(ctx, x, y, 36, 23, 22, 3, '#bfe6fa');
      q(ctx, x, y, 36, 31, 44, 3, '#bfe6fa');
      q(ctx, x, y, 32, 10, 3, 40, 'rgba(255,255,255,0.30)');
      q(ctx, x, y, 26, 54, 76, 4, '#242935');                 // dobradica
      qContorno(ctx, x, y, 18, 58, 92, 30, 4, '#242935');      // base
      qArred(ctx, x, y, 19, 59, 90, 28, 4, '#ccd3e0');
      q(ctx, x, y, 21, 60, 86, 2, '#eef1f7');
      for (let i = 24; i < 104; i += 6) q(ctx, x, y, i, 64, 4, 4, '#98a2b4');
      qArred(ctx, x, y, 52, 74, 24, 9, 2, '#aab4c4');          // trackpad

    } else if (obj === O.TECLADO) {
      teclado(ctx, x, y, 20, 52, 78);
      mouse(ctx, x, y, 106, 56);

    } else if (obj === O.CANECA) {
      q(ctx, x, y, 48, 82, 34, 6, 'rgba(45,50,64,0.20)');      // sombra
      qContorno(ctx, x, y, 44, 44, 36, 42, 5, '#7a2c1f');      // corpo
      qArred(ctx, x, y, 45, 45, 34, 40, 5, '#e0705a');
      q(ctx, x, y, 48, 48, 6, 32, '#f2917d');                  // luz
      q(ctx, x, y, 72, 48, 5, 32, '#b8503c');                  // sombra
      qContorno(ctx, x, y, 78, 54, 16, 20, 5, '#7a2c1f');      // asa
      qArred(ctx, x, y, 82, 58, 8, 12, 3, '#e0705a');
      qArred(ctx, x, y, 47, 43, 30, 7, 3, '#5b2417');          // cafe
      qArred(ctx, x, y, 50, 45, 24, 4, 2, '#7a3a24');
      q(ctx, x, y, 56, 30, 3, 10, 'rgba(255,255,255,0.55)');   // vapor
      q(ctx, x, y, 66, 26, 3, 12, 'rgba(255,255,255,0.40)');

    } else if (obj === O.PAPELADA) {
      q(ctx, x, y, 30, 82, 66, 5, 'rgba(45,50,64,0.16)');
      qContorno(ctx, x, y, 26, 40, 66, 46, 2, '#9aa2b4');      // folha de baixo
      qArred(ctx, x, y, 27, 41, 64, 44, 2, '#e8eaf0');
      qContorno(ctx, x, y, 32, 34, 66, 46, 2, '#8f97a8');      // folha de cima
      qArred(ctx, x, y, 33, 35, 64, 44, 2, '#fbfbfd');
      q(ctx, x, y, 40, 44, 42, 3, '#aeb6c6');                  // linhas de texto
      q(ctx, x, y, 40, 52, 32, 3, '#c3c9d6');
      q(ctx, x, y, 40, 60, 46, 3, '#c3c9d6');
      q(ctx, x, y, 40, 68, 24, 3, '#c3c9d6');
      qArred(ctx, x, y, 88, 30, 8, 40, 3, '#e0705a');          // caneta em cima
      q(ctx, x, y, 89, 32, 3, 34, '#f2917d');
      q(ctx, x, y, 88, 66, 8, 6, '#2c3240');

    } else if (obj === O.TELEFONE) {
      q(ctx, x, y, 28, 84, 68, 5, 'rgba(45,50,64,0.18)');
      qContorno(ctx, x, y, 24, 48, 76, 40, 4, '#1d222c');      // base
      qArred(ctx, x, y, 25, 49, 74, 38, 4, '#4a5162');
      q(ctx, x, y, 27, 50, 70, 2, '#68718a');
      for (let i = 0; i < 3; i++) {                            // teclado
        for (let j = 0; j < 3; j++) {
          q(ctx, x, y, 32 + i * 9, 60 + j * 8, 6, 5, '#98a2b4');
        }
      }
      qArred(ctx, x, y, 62, 58, 30, 22, 3, '#39404f');         // visor
      q(ctx, x, y, 65, 61, 24, 3, '#7ad39a');
      qContorno(ctx, x, y, 24, 34, 76, 16, 6, '#1d222c');      // fone no gancho
      qArred(ctx, x, y, 25, 35, 74, 14, 5, '#5f6a80');
      q(ctx, x, y, 28, 36, 68, 2, '#8f97a8');

    } else if (obj === O.LUMINARIA) {
      q(ctx, x, y, 44, 92, 42, 5, 'rgba(45,50,64,0.20)');
      qArred(ctx, x, y, 42, 82, 44, 10, 4, '#4a5162');         // base
      q(ctx, x, y, 45, 83, 38, 2, '#6b7488');
      q(ctx, x, y, 60, 44, 8, 40, '#5f6a80');                  // haste
      q(ctx, x, y, 60, 44, 2, 40, '#828da8');
      q(ctx, x, y, 60, 44, 26, 6, '#5f6a80');                  // braco
      qContorno(ctx, x, y, 74, 20, 40, 28, 6, '#8a5a12');      // cupula
      qArred(ctx, x, y, 75, 21, 38, 26, 5, '#f0a83c');
      qArred(ctx, x, y, 78, 24, 30, 8, 3, '#ffd98a');
      qArred(ctx, x, y, 78, 44, 32, 6, 2, '#fff3c4');          // luz saindo

    } else if (obj === O.PLANTINHA) {
      q(ctx, x, y, 44, 90, 42, 5, 'rgba(45,50,64,0.18)');
      [[26, 34], [70, 34], [48, 18], [34, 52], [66, 52]].forEach(([fx, fy]) => {
        qContorno(ctx, x, y, fx, fy, 34, 26, 8, '#1e5c33');
        qArred(ctx, x, y, fx + 1, fy + 1, 32, 24, 7, '#3f8a4a');
        qArred(ctx, x, y, fx + 4, fy + 4, 18, 7, 3, '#5fb06c');
        q(ctx, x, y, fx + 15, fy + 6, 3, 14, '#1e5c33');       // nervura
      });
      qContorno(ctx, x, y, 42, 62, 44, 30, 4, '#1f6b64');      // vaso
      qArred(ctx, x, y, 43, 63, 42, 28, 4, '#3fb0a5');
      q(ctx, x, y, 45, 64, 38, 3, '#6ad4c9');
      q(ctx, x, y, 43, 70, 42, 3, '#2d8b82');

    } else if (obj === O.LIVROS) {
      q(ctx, x, y, 26, 86, 76, 5, 'rgba(45,50,64,0.18)');
      const cores = [
        ['#c0392b', '#e0705a', '#8f2418'],
        ['#3f7fb5', '#69a6d8', '#2b5c88'],
        ['#f0a83c', '#ffd08a', '#c07d1c'],
        ['#7449b0', '#a37fd6', '#4f2d80'],
      ];
      cores.forEach((cor, i) => {
        const bx = 24 + i * 17;
        const alt = 44 + (i % 2) * 10;
        qContorno(ctx, x, y, bx, 86 - alt, 15, alt, 2, '#20242e');
        qArred(ctx, x, y, bx + 1, 87 - alt, 13, alt - 2, 2, cor[0]);
        q(ctx, x, y, bx + 2, 89 - alt, 4, alt - 6, cor[1]);      // lombada clara
        q(ctx, x, y, bx + 11, 89 - alt, 2, alt - 6, cor[2]);     // sombra
        q(ctx, x, y, bx + 3, 95 - alt, 9, 3, 'rgba(255,255,255,0.55)'); // faixa
        q(ctx, x, y, bx + 3, 78, 9, 2, 'rgba(255,255,255,0.35)');
      });
      q(ctx, x, y, 22, 84, 80, 4, '#20242e');                    // apoio
    }
  }

  // Cadeira de escritorio como na referencia: vista **por tras**, com o encosto
  // de tela (a pessoa senta de costas pra gente, virada pra mesa). O encosto e
  // desenhado por cima de quem senta, entao so a cabeca fica aparecendo.
  // Painel de tela do encosto (grade de 128), com trama em losango e volume.
  function painelDeTela(ctx, x, y, ax, ay, aw, ah, base, claro, escuro) {
    qContorno(ctx, x, y, ax - 3, ay - 3, aw + 6, ah + 6, 8, escuro);
    qArred(ctx, x, y, ax - 2, ay - 2, aw + 4, ah + 4, 7, base);
    qArred(ctx, x, y, ax, ay, aw, ah, 6, '#343b49');
    // trama diagonal nos dois sentidos
    for (let d = -ah; d < aw; d += 9) {
      for (let j = 3; j < ah - 3; j++) {
        const i1 = d + j;
        const i2 = d + (ah - j);
        if (i1 > 3 && i1 < aw - 3) q(ctx, x, y, ax + i1, ay + j, 2, 1, claro);
        if (i2 > 3 && i2 < aw - 3) q(ctx, x, y, ax + i2, ay + j, 2, 1, claro);
      }
    }
    // volume: luz em cima/esquerda, sombra embaixo/direita
    qArred(ctx, x, y, ax, ay, aw, 3, 2, 'rgba(255,255,255,0.30)');
    q(ctx, x, y, ax + 1, ay + 4, 2, ah - 8, 'rgba(255,255,255,0.16)');
    qArred(ctx, x, y, ax, ay + ah - 4, aw, 4, 2, 'rgba(0,0,0,0.30)');
    q(ctx, x, y, ax + aw - 3, ay + 4, 2, ah - 8, 'rgba(0,0,0,0.22)');
  }

  // Base em estrela de 5 pernas com rodinhas, vista de cima.
  function baseDaCadeira(ctx, x, y) {
    q(ctx, x, y, 30, 112, 68, 8, 'rgba(45,50,64,0.20)'); // sombra no chao
    const pernas = [[-38, 6], [38, 6], [-24, 16], [24, 16], [0, 20]];
    pernas.forEach(([dx, dy]) => {
      const px0 = 64 + Math.round(dx * 0.55) - 4;
      qArred(ctx, x, y, px0, 96, 9, dy + 6, 3, '#2f3542');
      qArred(ctx, x, y, 64 + dx - 5, 96 + dy, 11, 9, 4, '#454c5c');   // rodinha
      q(ctx, x, y, 64 + dx - 3, 96 + dy + 1, 6, 2, '#6b7488');
    });
    qArred(ctx, x, y, 58, 84, 12, 20, 3, '#59617a');                  // coluna
    q(ctx, x, y, 59, 84, 3, 20, '#79839c');
  }

  // Cadeira de escritorio nas quatro direcoes. `direcao` e pra que lado a pessoa
  // que senta fica virada: 'up' mostra o encosto de costas (como na referencia),
  // 'down' mostra o assento de frente, 'left'/'right' de perfil.
  function cadeiraDeEscritorio(ctx, x, y, TILE, base, claro, escuro, direcao) {
    // Sobe um pouco dentro da celula: na referencia a cadeira encosta na mesa,
    // invadindo a borda da frente dela, em vez de ficar solta embaixo.
    y -= 5;
    baseDaCadeira(ctx, x, y);

    // Apoio de braco com a barra laranja da referencia.
    function braco(ax, ay, aw, ah) {
      qContorno(ctx, x, y, ax, ay, aw, ah, 3, '#20242e');
      qArred(ctx, x, y, ax + 1, ay + 1, aw - 2, ah - 2, 3, escuro);
      qArred(ctx, x, y, ax + 1, ay + 7, aw - 2, ah - 16, 2, '#e8934a');
      q(ctx, x, y, ax + 2, ay + 8, 2, ah - 18, '#f6b877');
      q(ctx, x, y, ax + aw - 4, ay + 8, 2, ah - 18, '#c4732f');
    }

    if (direcao === 'down') {
      // de frente: encosto atras (visto de topo, mais fino) e assento na frente
      qContorno(ctx, x, y, 28, 14, 72, 26, 8, '#20242e');
      qArred(ctx, x, y, 29, 15, 70, 24, 7, base);
      qArred(ctx, x, y, 31, 17, 66, 8, 4, claro);
      braco(14, 44, 16, 40);
      braco(98, 44, 16, 40);
      qContorno(ctx, x, y, 26, 38, 76, 52, 10, '#20242e');
      qArred(ctx, x, y, 27, 39, 74, 50, 9, base);
      qArred(ctx, x, y, 30, 42, 68, 14, 6, claro);       // borda do assento
      q(ctx, x, y, 63, 46, 3, 40, 'rgba(0,0,0,0.22)');   // costura do meio
      qArred(ctx, x, y, 27, 82, 74, 7, 5, 'rgba(0,0,0,0.28)');
      return;
    }

    if (direcao === 'left' || direcao === 'right') {
      const paraEsq = direcao === 'left';
      qContorno(ctx, x, y, 26, 44, 76, 44, 9, '#20242e');
      qArred(ctx, x, y, 27, 45, 74, 42, 8, base);        // assento de perfil
      qArred(ctx, x, y, 30, 48, 68, 10, 5, claro);
      // encosto do lado das costas
      painelDeTela(ctx, x, y, paraEsq ? 74 : 22, 20, 32, 66, base, claro, escuro);
      braco(paraEsq ? 20 : 92, 48, 16, 34);
      return;
    }

    // 'up': de costas pra gente, como na foto da referencia
    braco(10, 42, 16, 46);
    braco(102, 42, 16, 46);
    painelDeTela(ctx, x, y, 26, 30, 76, 62, base, claro, escuro);
    qArred(ctx, x, y, 24, 88, 80, 10, 4, escuro);        // apoio lombar
    q(ctx, x, y, 27, 89, 74, 2, 'rgba(255,255,255,0.20)');
    qContorno(ctx, x, y, 40, 8, 48, 26, 8, '#20242e');   // encosto de cabeca
    qArred(ctx, x, y, 41, 9, 46, 24, 7, base);
    qArred(ctx, x, y, 44, 12, 40, 7, 3, claro);
    q(ctx, x, y, 44, 27, 40, 4, 'rgba(0,0,0,0.25)');
  }

  // Encosto redesenhado por cima de quem esta sentado. Como na referencia, a
  // pessoa fica de costas: so a cabeca aparece acima do encosto.
  function desenharEncostoPorCima(ctx, px, py) {
    const TILE = OfficeMap.TILE;
    const col = Math.floor(px / TILE);
    const row = Math.floor(py / TILE);
    const tile = OfficeMap.tiles[row] && OfficeMap.tiles[row][col];
    if (!OfficeMap.ASSENTOS.has(tile)) return;

    const direcao = OfficeMap.DIRECAO_ASSENTO[tile] || 'up';
    // Virado pra baixo o encosto fica **atras** da pessoa: nao volta por cima.
    if (direcao === 'down') return;

    const x = col * TILE;
    const y = row * TILE;
    // Só a parte onde ficam as costas: pra cima cobre tudo (a cabeca esta acima
    // do tile), de perfil cobre so a metade de tras.
    let recorte = [x, y + 1, TILE, TILE - 1];
    if (direcao === 'left') recorte = [x + TILE / 2, y + 1, TILE / 2, TILE - 1];
    if (direcao === 'right') recorte = [x, y + 1, TILE / 2, TILE - 1];

    ctx.save();
    ctx.beginPath();
    ctx.rect(recorte[0], recorte[1], recorte[2], recorte[3]);
    ctx.clip();
    drawObstacleTile(ctx, col, row, tile, TILE, OfficeMap.tiles);
    ctx.restore();
  }

  // Camera que segue a pessoa, com zoom fixo (o mapa e maior que a tela). Antes
  // o mapa inteiro era espremido pra caber, o que deixava tudo minusculo.
  let ZOOM = 2;
  const ZOOM_MIN = 1.25;
  const ZOOM_MAX = 3.5;
  let camX = 0;
  let camY = 0;

  function ajustarZoom(passo) {
    ZOOM = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((ZOOM + passo) * 100) / 100));
  }

  function setCanvasSize() {
    const wrap = document.querySelector('.area-jogo');
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = wrap.clientWidth + 'px';
    canvas.style.height = wrap.clientHeight + 'px';
    canvas.width = Math.round(wrap.clientWidth * dpr);
    canvas.height = Math.round(wrap.clientHeight * dpr);
    ctx.imageSmoothingEnabled = false;
  }

  function tamanhoDaVista() {
    return {
      w: canvas.clientWidth / ZOOM,
      h: canvas.clientHeight / ZOOM,
    };
  }

  function atualizarCamera() {
    const self = players.get(selfId);
    if (!self) return;
    const vista = tamanhoDaVista();
    const worldW = OfficeMap.COLS * OfficeMap.TILE;
    const worldH = OfficeMap.ROWS * OfficeMap.TILE;
    // centraliza na pessoa, mas sem passar da borda do mapa
    camX = worldW <= vista.w
      ? (worldW - vista.w) / 2
      : Math.max(0, Math.min(worldW - vista.w, self.displayX - vista.w / 2));
    camY = worldH <= vista.h
      ? (worldH - vista.h) / 2
      : Math.max(0, Math.min(worldH - vista.h, self.displayY - vista.h / 2));
  }

  function tryMove(px, py, dx, dy) {
    let x = px, y = py;
    if (dx !== 0 && OfficeMap.isWalkable(px + dx, py)) x = px + dx;
    if (dy !== 0 && OfficeMap.isWalkable(x, py + dy)) y = py + dy;
    return { x, y };
  }

  function criarJogadorLocal(data) {
    return Object.assign(criarJogadorRemoto(data), {
      moveTarget: null,
      path: [],
      destinoFinal: null,
    });
  }

  function criarJogadorRemoto(data) {
    return {
      id: data.id,
      uid: data.uid, // identidade estavel da pessoa: e por ela que a DM anda
      name: data.name,
      appearance: data.appearance,
      x: data.x,
      y: data.y,
      displayX: data.x,
      displayY: data.y,
      targetX: data.x,
      targetY: data.y,
      dir: data.dir || 'down',
      moving: !!data.moving,
      sentado: !!data.sentado,
      status: STATUS_ORDEM.includes(data.status) ? data.status : 'livre',
      isAdmin: !!data.isAdmin,
      reacao: null,
    };
  }

  function ajustarBotaoStatus(status) {
    const btn = document.getElementById('btn-status');
    STATUS_ORDEM.forEach((s) => btn.classList.remove('status-' + s));
    btn.classList.add('status-' + status);
    btn.querySelector('.texto-status').textContent = STATUS_LABEL[status];
  }

  function setIndicador(estado) {
    const el = document.getElementById('indicador-conexao');
    const texto = el.querySelector('.texto-indicador');
    el.classList.remove('indicador-conectado', 'indicador-conectando');
    if (estado === 'conectado') {
      el.classList.add('indicador-conectado');
      texto.textContent = 'Conectado';
    } else {
      el.classList.add('indicador-conectando');
      texto.textContent = 'Reconectando...';
    }
  }

  // Cracha do ambiente atual no topo esquerdo (o Gather mostra em que sala voce
  // esta). So mexe no DOM quando a sala muda de verdade.
  let salaExibida = null;
  function atualizarBadgeSala() {
    const self = players.get(selfId);
    if (!self) return;
    const sala = OfficeMap.getRoomAt(self.x, self.y);
    const nome = sala ? sala.nome : 'Escritorio';
    if (nome === salaExibida) return;
    salaExibida = nome;
    const el = document.getElementById('badge-sala-nome');
    if (el) el.textContent = nome;
  }

  function loop(now) {
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;
    localWalkTime += dt;

    atualizarJogadorLocal(dt);
    interpolarRemotos(dt);
    Calls.updateProximity(players);
    atualizarBadgeSala();
    render(now);
  }

  function atualizarJogadorLocal(dt) {
    const self = players.get(selfId);
    if (!self) return;

    let moving = false;
    if (self.moveTarget) {
      const dxTotal = self.moveTarget.x - self.x;
      const dyTotal = self.moveTarget.y - self.y;
      const dist = Math.hypot(dxTotal, dyTotal);

      if (dist < 3) {
        self.moveTarget = (self.path && self.path.length) ? self.path.shift() : null;
        if (!self.moveTarget) self.destinoFinal = null;
      } else {
        const passo = Math.min(SPEED * dt, dist);
        const stepX = (dxTotal / dist) * passo;
        const stepY = (dyTotal / dist) * passo;
        const antes = { x: self.x, y: self.y };
        const result = tryMove(self.x, self.y, stepX, stepY);
        self.x = result.x;
        self.y = result.y;

        const percorrido = Math.hypot(self.x - antes.x, self.y - antes.y);
        if (percorrido < 0.05) {
          self.moveTarget = null;
          self.path = [];
          self.destinoFinal = null;
        } else {
          moving = true;
          if (Math.abs(dxTotal) > Math.abs(dyTotal)) self.dir = dxTotal > 0 ? 'right' : 'left';
          else self.dir = dyTotal > 0 ? 'down' : 'up';
        }
      }
    }
    self.moving = moving;

    // Parou em cima de uma cadeira? Senta: encaixa no centro da celula e vira
    // pra mesa (a cadeira sempre olha pra cima no desenho).
    const TILE = OfficeMap.TILE;
    const col = Math.floor(self.x / TILE);
    const row = Math.floor(self.y / TILE);
    const emAssento = !moving && !self.moveTarget
      && OfficeMap.tiles[row] && OfficeMap.ASSENTOS.has(OfficeMap.tiles[row][col]);

    if (emAssento) {
      if (!self.sentado) {
        self.x = col * TILE + TILE / 2;
        self.y = row * TILE + TILE / 2;
        // vira pro lado que a cadeira aponta
        self.dir = OfficeMap.DIRECAO_ASSENTO[OfficeMap.tiles[row][col]] || 'up';
        self.sentado = true;
      }
    } else {
      self.sentado = false;
    }

    self.displayX = self.x;
    self.displayY = self.y;

    const agora = performance.now();
    const mudou =
      lastSentState.x !== self.x || lastSentState.y !== self.y ||
      lastSentState.dir !== self.dir || lastSentState.moving !== self.moving ||
      lastSentState.sentado !== self.sentado;
    if (mudou && agora - lastMoveSent > MOVE_SEND_INTERVAL) {
      Network.sendMove({
        x: self.x, y: self.y, dir: self.dir, moving: self.moving, sentado: self.sentado,
      });
      lastMoveSent = agora;
      lastSentState = {
        x: self.x, y: self.y, dir: self.dir, moving: self.moving, sentado: self.sentado,
      };
    }
  }

  function interpolarRemotos(dt) {
    const fator = Math.min(1, dt * 12);
    players.forEach((p) => {
      if (p.id === selfId) return;
      p.displayX += (p.targetX - p.displayX) * fator;
      p.displayY += (p.targetY - p.displayY) * fator;
    });
  }

  function desenharBolhaVideo(ctx, x, y, videoEl, corAnel) {
    const raio = 21;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, raio, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#0d1117';
    ctx.fill();
    ctx.clip();
    const vw = videoEl.videoWidth || 4, vh = videoEl.videoHeight || 3;
    const escalaV = Math.max((raio * 2) / vw, (raio * 2) / vh);
    const dw = vw * escalaV, dh = vh * escalaV;
    ctx.drawImage(videoEl, x - dw / 2, y - dh / 2, dw, dh);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, raio, 0, Math.PI * 2);
    ctx.strokeStyle = corAnel;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Chamada so de audio (sem camera): bolha com um iconezinho de microfone.
  function desenharBolhaAudio(ctx, x, y, corAnel) {
    const raio = 21;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, raio, 0, Math.PI * 2);
    ctx.fillStyle = '#1c2430';
    ctx.fill();
    ctx.strokeStyle = corAnel;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = corAnel;
    ctx.beginPath();
    ctx.roundRect(x - 4, y - 10, 8, 13, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y + 3, 7, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = corAnel;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + 10);
    ctx.lineTo(x, y + 13);
    ctx.stroke();
    ctx.restore();
  }

  function desenharAnelStatus(ctx, x, y, status) {
    ctx.save();
    ctx.strokeStyle = STATUS_COR[status] || STATUS_COR.livre;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 13, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function desenharIconeFone(ctx, x, y, cor) {
    ctx.save();
    ctx.strokeStyle = cor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, 4, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = cor;
    ctx.fillRect(x - 5.5, y - 1, 2.5, 4.5);
    ctx.fillRect(x + 3, y - 1, 2.5, 4.5);
    ctx.restore();
  }

  // Cracha do jogador no estilo Gather: pilula escura com bolinha de status
  // (ou fone, quando a pessoa esta numa chamada) e o nome do lado.
  function desenharCracha(ctx, x, y, texto, corStatus, emChamada, isSelf) {
    ctx.save();
    ctx.font = '700 11px Manrope, sans-serif';
    ctx.textBaseline = 'middle';
    const larguraTexto = ctx.measureText(texto).width;
    const padX = 8, icone = 14, h = 19;
    const w = padX * 2 + icone + larguraTexto;
    const px = x - w / 2;
    const py = y - h;

    ctx.fillStyle = isSelf ? '#6d4fc4' : '#7c5cd4';
    ctx.beginPath();
    ctx.roundRect(px, py, w, h, 9.5);
    ctx.fill();
    if (isSelf) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const cx = px + padX + 4;
    const cy = py + h / 2;
    if (emChamada) {
      desenharIconeFone(ctx, cx, cy, '#ffffff');
    } else {
      // quadradinho arredondado de status, como na referencia do Gather
      ctx.fillStyle = corStatus;
      ctx.beginPath();
      ctx.roundRect(cx - 3.5, cy - 3.5, 7, 7, 2);
      ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(texto, px + padX + icone, cy + 0.5);
    ctx.restore();
  }

  function desenharReacao(ctx, x, y, reacao, now) {
    const DURACAO = 2200;
    const decorrido = DURACAO - (reacao.expiresAt - now);
    const t = Math.min(1, Math.max(0, decorrido / DURACAO));
    const bounce = Math.sin(Math.min(1, t * 2) * Math.PI) * 8;
    ctx.save();
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.25) : 1;
    ctx.fillText(reacao.emoji, x, y - bounce);
    ctx.restore();
  }

  function desenharMinimapa() {
    const mini = document.getElementById('minimapa');
    if (!mini) return;
    const mctx = mini.getContext('2d');
    const w = mini.width, h = mini.height;
    const { COLS, ROWS, TILE, tiles, LIVRE, CADEIRA, TAPETE } = OfficeMap;
    const worldW = COLS * TILE, worldH = ROWS * TILE;
    const escala = Math.min(w / worldW, h / worldH);
    const offX = (w - worldW * escala) / 2;
    const offY = (h - worldH * escala) / 2;
    const lado = TILE * escala + 0.6;

    mctx.clearRect(0, 0, w, h);

    // minimapa escuro, como o do Gather: o predio aparece claro sobre o fundo
    // escuro da propria caixinha e as paredes/moveis viram um cinza mais forte.
    mctx.fillStyle = 'rgba(255,255,255,0.10)';
    mctx.fillRect(offX, offY, worldW * escala, worldH * escala);
    OfficeMap.ROOMS.forEach((sala) => {
      // o "jardim" e o retangulo que sobra cobrindo o mapa inteiro: pintar ele
      // aqui deixaria o minimapa todo verde e escondia as salas de verdade
      if (sala.id === 'jardim') return;
      mctx.fillStyle = sala.cor;
      mctx.globalAlpha = 0.30;
      mctx.fillRect(
        offX + sala.c0 * TILE * escala, offY + sala.r0 * TILE * escala,
        (sala.c1 - sala.c0 + 1) * TILE * escala, (sala.r1 - sala.r0 + 1) * TILE * escala
      );
      mctx.globalAlpha = 1;
    });

    mctx.fillStyle = 'rgba(255,255,255,0.34)';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = tiles[r][c];
        if (t !== LIVRE && t !== CADEIRA && t !== TAPETE) {
          mctx.fillRect(offX + c * TILE * escala, offY + r * TILE * escala, lado, lado);
        }
      }
    }

    players.forEach((p) => {
      mctx.beginPath();
      mctx.arc(offX + p.displayX * escala, offY + p.displayY * escala, p.id === selfId ? 3 : 2.2, 0, Math.PI * 2);
      mctx.fillStyle = p.id === selfId ? '#ffb454' : corDoId(p.id);
      mctx.fill();
    });
  }

  function render(now) {
    atualizarCamera();
    const dpr = window.devicePixelRatio || 1;
    const vista = tamanhoDaVista();
    ctx.setTransform(ZOOM * dpr, 0, 0, ZOOM * dpr, -camX * ZOOM * dpr, -camY * ZOOM * dpr);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(camX, camY, vista.w, vista.h);
    ctx.drawImage(mapCanvas, 0, 0, OfficeMap.COLS * OfficeMap.TILE, OfficeMap.ROWS * OfficeMap.TILE);

    const self = players.get(selfId);
    if (self && self.destinoFinal) {
      const pulso = 3 + Math.sin(now / 120) * 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,180,84,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(self.destinoFinal.x, self.destinoFinal.y, 6 + pulso, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    desenharMesas(ctx);

    const lista = Array.from(players.values()).sort((a, b) => a.displayY - b.displayY);
    lista.forEach((p) => {
      // Sentado: desce uns pixels pra encaixar no assento e nao subir em cima da
      // mesa que esta na celula de tras. Tambem para a animacao de caminhada.
      const py = p.displayY + (p.sentado ? 2 : 0);

      desenharAnelStatus(ctx, p.displayX, p.displayY, p.status);

      Character.draw(ctx, p.displayX, py, p.appearance, {
        dir: p.dir,
        moving: p.sentado ? false : p.moving,
        walkTime: localWalkTime,
      });

      // Sentado: o encosto volta por cima do corpo, senao o boneco fica "em pe
      // em cima" da cadeira em vez de sentado nela.
      if (p.sentado) desenharEncostoPorCima(ctx, p.displayX, p.displayY);

      const labelY = py - 44;
      const nomeExibido = (p.isAdmin ? '👑 ' : '') + p.name;
      const emChamada = p.id === selfId
        ? (Calls.isCameraAtiva() && Calls.getPeersConectados().length > 0)
        : Calls.temChamadaAtiva(p.id);
      desenharCracha(
        ctx, p.displayX, labelY, nomeExibido,
        STATUS_COR[p.status] || STATUS_COR.livre, emChamada, p.id === selfId
      );

      // a bolha flutuante so aparece quando o grid de chamada NAO esta cobrindo
      // esse mesmo participante (o grid vira a visao principal da chamada).
      if (p.id !== selfId && Calls.temChamadaAtiva(p.id) && !CallGrid.estaAtivo()) {
        const video = Calls.getVideoRemoto(p.id);
        if (video && Calls.temVideoRemoto(p.id)) {
          desenharBolhaVideo(ctx, p.displayX, labelY - 26, video, corDoId(p.id));
        } else {
          desenharBolhaAudio(ctx, p.displayX, labelY - 26, corDoId(p.id));
        }
      }

      if (p.reacao) {
        if (p.reacao.expiresAt > now) {
          desenharReacao(ctx, p.displayX, p.displayY - 78, p.reacao, now);
        } else {
          p.reacao = null;
        }
      }
    });

    desenharMinimapa();
  }

  function moverPara(destinoX, destinoY) {
    const self = players.get(selfId);
    if (!self) return false;
    const TILE = OfficeMap.TILE;
    const destino = Pathfinding.nearestWalkable(Math.floor(destinoX / TILE), Math.floor(destinoY / TILE), 4);
    if (!destino) return false;

    const celulas = Pathfinding.findPath(
      Math.floor(self.x / TILE), Math.floor(self.y / TILE), destino.col, destino.row
    );
    if (!celulas || celulas.length === 0) return false;

    // se o ponto exato clicado for caminhavel, termina nele; senao, no centro do
    // tile caminhavel mais proximo
    const exato = OfficeMap.isWalkable(destinoX, destinoY);
    const alvoX = exato ? destinoX : destino.col * TILE + TILE / 2;
    const alvoY = exato ? destinoY : destino.row * TILE + TILE / 2;

    const pontos = celulas.map((cel, i) => {
      if (i === 0) return { x: self.x, y: self.y };
      if (i === celulas.length - 1) return { x: alvoX, y: alvoY };
      return { x: cel.col * TILE + TILE / 2, y: cel.row * TILE + TILE / 2 };
    });

    self.path = suavizarCaminho(pontos).slice(1);
    self.moveTarget = self.path.shift() || null;
    self.destinoFinal = self.moveTarget ? { x: alvoX, y: alvoY } : null;
    return true;
  }

  // "Walk over" do Gather: caminha ate ficar do lado da pessoa.
  function irAte(id) {
    const alvo = players.get(id);
    if (!alvo || id === selfId) return false;
    const TILE = OfficeMap.TILE;
    const col = Math.floor(alvo.displayX / TILE);
    const row = Math.floor(alvo.displayY / TILE);
    const vizinhos = [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]];
    for (const [vc, vr] of vizinhos) {
      if (OfficeMap.isTileWalkable(vc, vr)) {
        return moverPara(vc * TILE + TILE / 2, vr * TILE + TILE / 2);
      }
    }
    return moverPara(alvo.displayX, alvo.displayY);
  }

  function coordsDoEvento(e) {
    const rect = canvas.getBoundingClientRect();
    const TILE = OfficeMap.TILE;
    const maxX = OfficeMap.COLS * TILE - 1;
    const maxY = OfficeMap.ROWS * TILE - 1;
    return {
      x: Math.max(0, Math.min(maxX, camX + (e.clientX - rect.left) / ZOOM)),
      y: Math.max(0, Math.min(maxY, camY + (e.clientY - rect.top) / ZOOM)),
    };
  }

  // Quem foi clicado: caixa aproximada do boneco (o sprite fica acima dos pes).
  function jogadorEm(x, y) {
    let achado = null;
    players.forEach((p) => {
      if (p.id === selfId) return;
      if (Math.abs(x - p.displayX) < 16 && y > p.displayY - 46 && y < p.displayY + 6) achado = p;
    });
    return achado;
  }

  function onCanvasClick(e) {
    const self = players.get(selfId);
    if (!self) return;
    const { x: clickX, y: clickY } = coordsDoEvento(e);

    // Com o decorador aberto e um item na mao, o clique coloca em vez de andar.
    if (Decorador.estaPintando()) {
      Decorador.pintarEm(Math.floor(clickX / OfficeMap.TILE), Math.floor(clickY / OfficeMap.TILE));
      return;
    }

    const pessoa = jogadorEm(clickX, clickY);
    if (pessoa) {
      Pessoas.abrirCartao(pessoa.id, e.clientX, e.clientY);
      return;
    }

    const TILE = OfficeMap.TILE;
    const col = Math.floor(clickX / TILE);
    const row = Math.floor(clickY / TILE);
    if (OfficeMap.tiles[row] && OfficeMap.tiles[row][col] === OfficeMap.MESA_MONITOR) {
      Network.reivindicarMesa(col, row);
      return;
    }

    moverPara(clickX, clickY);
  }

  function temLinhaDeVisao(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const passos = Math.max(1, Math.ceil(dist / 8));
    for (let i = 1; i <= passos; i++) {
      const t = i / passos;
      if (!OfficeMap.isWalkable(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  function suavizarCaminho(pontos) {
    if (pontos.length <= 2) return pontos;
    const resultado = [pontos[0]];
    let atual = 0;
    while (atual < pontos.length - 1) {
      let proximo = atual + 1;
      for (let i = pontos.length - 1; i > atual; i--) {
        if (temLinhaDeVisao(pontos[atual].x, pontos[atual].y, pontos[i].x, pontos[i].y)) {
          proximo = i;
          break;
        }
      }
      resultado.push(pontos[proximo]);
      atual = proximo;
    }
    return resultado;
  }

  function init(profile) {
    canvas = document.getElementById('canvas-jogo');
    ctx = canvas.getContext('2d');
    prerenderMap();
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    canvas.addEventListener('click', onCanvasClick);

    canvas.addEventListener('mousemove', (e) => {
      const { x, y } = coordsDoEvento(e);
      const TILE = OfficeMap.TILE;
      const col = Math.floor(x / TILE);
      const row = Math.floor(y / TILE);

      if (Decorador.estaPintando()) {
        celulaAlvo = { col, row };
        mesaHover = null;
        canvas.style.cursor = 'crosshair';
        // arrastar com o botao pressionado pinta uma sequencia
        if (e.buttons === 1) Decorador.pintarEm(col, row);
        return;
      }
      celulaAlvo = null;

      const ehMesa = OfficeMap.tiles[row] && OfficeMap.tiles[row][col] === OfficeMap.MESA_MONITOR;
      mesaHover = ehMesa ? { col, row } : null;
      canvas.style.cursor = (ehMesa || jogadorEm(x, y)) ? 'pointer' : 'default';
    });
    canvas.addEventListener('mouseleave', () => { mesaHover = null; celulaAlvo = null; });

    document.getElementById('btn-status').addEventListener('click', () => {
      const self = players.get(selfId);
      if (!self) return;
      const proximo = STATUS_ORDEM[(STATUS_ORDEM.indexOf(self.status) + 1) % STATUS_ORDEM.length];
      self.status = proximo;
      ajustarBotaoStatus(proximo);
      Network.sendStatus(proximo);
    });

    const barraReacoes = document.getElementById('barra-reacoes');
    document.querySelectorAll('.btn-reacao').forEach((btn) => {
      btn.addEventListener('click', () => {
        Network.sendReaction(btn.dataset.emoji);
        barraReacoes.classList.add('oculto');
      });
    });
    document.getElementById('btn-emojis').addEventListener('click', (ev) => {
      ev.stopPropagation();
      barraReacoes.classList.toggle('oculto');
    });
    document.getElementById('btn-aceno').addEventListener('click', () => Network.sendReaction('👋'));
    document.addEventListener('click', (ev) => {
      if (!barraReacoes.contains(ev.target)) barraReacoes.classList.add('oculto');
    });

    document.getElementById('btn-zoom-mais').addEventListener('click', () => ajustarZoom(0.25));
    document.getElementById('btn-zoom-menos').addEventListener('click', () => ajustarZoom(-0.25));

    // a dica de controle some sozinha depois dos primeiros segundos (a referencia
    // nao tem nada fixo em cima da barra)
    setTimeout(() => {
      const dica = document.getElementById('dica-controles');
      if (dica) dica.classList.add('oculto');
    }, 9000);

    Network.on('conexao', (estado) => setIndicador(estado));

    Network.on('init', (data) => {
      selfId = data.selfId;
      selfUid = data.selfUid || null;
      players.clear();
      data.players.forEach((p) => {
        players.set(p.id, p.id === selfId ? criarJogadorLocal(p) : criarJogadorRemoto(p));
      });
      ajustarBotaoStatus(players.get(selfId).status);
      // A decoracao guardada no servidor entra antes de qualquer coisa desenhar.
      const temDecoracao = (data.mudancasMapa && data.mudancasMapa.length)
        || (data.objetosMapa && data.objetosMapa.length);
      (data.mudancasMapa || []).forEach((m) => {
        if (OfficeMap.tiles[m.r]) OfficeMap.tiles[m.r][m.c] = m.t;
      });
      (data.objetosMapa || []).forEach((o) => {
        if (OfficeMap.objetos[o.r]) OfficeMap.objetos[o.r][o.c] = o.o;
      });
      if (temDecoracao) prerenderMap();
      Decorador.init(players.get(selfId).isAdmin);
      Calls.init(selfId);
      Chat.carregarHistorico(data);
      aplicarMesas(data.mesas);
    });

    Network.on('mesas-atualizadas', (lista) => aplicarMesas(lista));

    // Alguem decorou: escreve o tile e redesenha o mapa inteiro (48x32, e barato).
    Network.on('mapa-atualizado', (m) => {
      if (!OfficeMap.tiles[m.r]) return;
      OfficeMap.tiles[m.r][m.c] = m.t;
      prerenderMap();
    });

    Network.on('mapa-objeto-atualizado', (m) => {
      if (!OfficeMap.objetos[m.r]) return;
      OfficeMap.objetos[m.r][m.c] = m.o;
      prerenderMap();
    });

    Network.on('player-joined', (data) => {
      players.set(data.id, criarJogadorRemoto(data));
      Chat.pessoasMudaram();
    });

    Network.on('player-left', (data) => {
      players.delete(data.id);
      Chat.pessoasMudaram();
    });

    Network.on('player-moved', (data) => {
      const p = players.get(data.id);
      if (!p) return;
      p.targetX = data.x;
      p.targetY = data.y;
      p.dir = data.dir;
      p.moving = data.moving;
      p.sentado = !!data.sentado;
    });

    Network.on('player-status', (data) => {
      const p = players.get(data.id);
      if (!p || !STATUS_ORDEM.includes(data.status)) return;
      p.status = data.status;
      if (data.id === selfId) ajustarBotaoStatus(data.status);
    });

    Network.on('reacao', (data) => {
      const p = players.get(data.id);
      if (!p) return;
      p.reacao = { emoji: data.emoji, expiresAt: performance.now() + 2200 };
    });

    Network.on('chat-mensagem', (data) => Chat.receberMensagem(data));
    Network.on('chat-historico', (data) => Chat.receberHistorico(data));
    Network.on('chat-reacao', (data) => Chat.receberReacao(data));

    Rooms.init();
    CallGrid.init();
    Chat.init();
    Calendario.init();
    Trello.init();
    Pessoas.init();
    Network.connect(profile);

    lastFrameTime = performance.now();
    setInterval(() => loop(performance.now()), 1000 / 60);
  }

  window.Game = {
    init,
    getPlayers: () => players,
    getSelfId: () => selfId,
    getSelfUid: () => selfUid,
    // usados pelo decorador: desenhar as miniaturas do catalogo com a mesma
    // funcao que desenha no mapa, e redesenhar depois de uma edicao
    desenharObjeto: drawObstacleTile,
    desenharApoiado: drawObjectTile,
    desenharPiso: drawFloorTile,
    redesenharMapa: prerenderMap,
    STATUS_COR,
    STATUS_LABEL,
    corDoId,
    irAte,
    moverPara,
  };
})();

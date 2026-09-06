// Loop principal do jogo: mapa, movimento, multiplayer e chamada por proximidade.
(function () {
  const SPEED = 150; // px/s
  const MOVE_SEND_INTERVAL = 45; // ms
  const RENDER_SCALE = 2; // resolucao interna do mapa (mais nitido ao ampliar em tela cheia)

  let ctx, canvas, mapCanvas;
  let players = new Map();
  let selfId = null;
  let lastFrameTime = 0;
  let lastMoveSent = 0;
  let localWalkTime = 0;
  let lastSentState = { x: null, y: null, dir: null, moving: null };

  const STATUS_ORDEM = ['livre', 'focado', 'reuniao'];
  const STATUS_LABEL = { livre: 'Livre', focado: 'Focado', reuniao: 'Em reuniao' };
  const STATUS_COR = { livre: '#63d9c4', focado: '#ffb454', reuniao: '#e0607e' };

  let mesas = new Map(); // "col,row" -> { chave, donoId, donoNome }

  function aplicarMesas(lista) {
    mesas = new Map((lista || []).map((m) => [m.chave, m]));
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
    });
    ctx.restore();
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
    mapCanvas = document.createElement('canvas');
    mapCanvas.width = COLS * TILE * RENDER_SCALE;
    mapCanvas.height = ROWS * TILE * RENDER_SCALE;
    const mctx = mapCanvas.getContext('2d');
    mctx.imageSmoothingEnabled = false;
    mctx.scale(RENDER_SCALE, RENDER_SCALE);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) drawFloorTile(mctx, c, r, TILE, OfficeMap.pisoEmTile(c, r));
    }
    // moldura fina marcando as areas (o Gather usa isso pra delimitar zonas)
    OfficeMap.ZONAS_PISO.forEach((z) => {
      if (!z.contorno) return;
      mctx.save();
      mctx.strokeStyle = z.contorno;
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
    OfficeMap.ROOMS.forEach((sala) => desenharEtiquetaSala(mctx, sala, TILE));
  }

  // Cada ambiente tem seu proprio chao (duas tonalidades alternadas, em xadrez
  // sutil), no lugar do piso de madeira unico que valia pro escritorio inteiro.
  const CORES_PISO = {
    tijolo: { base: '#ece0cb', junta: 'rgba(186,166,136,0.55)' },
    tijolo_quente: { base: '#e6d3b4', junta: 'rgba(176,146,110,0.5)' },
    cinza: { base: '#d2d6dd', junta: 'rgba(146,152,164,0.45)' },
    ladrilho: { base: '#e4e7ee', junta: 'rgba(150,158,178,0.45)' },
    carpete_roxo: { base: '#8b7fd0', claro: '#a294de' },
    carpete_azul: { base: '#5d6577', claro: '#6e7789' },
    grama: { base: '#8ecb7c', claro: 'rgba(58,124,58,0.28)' },
  };

  // Piso de tijolinho em fiada alternada (a fiada usa a linha global, senao a
  // emenda entre tiles fica visivel).
  function pisoTijolo(ctx, x, y, TILE, c, r, cores) {
    ctx.fillStyle = cores.base;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = cores.junta;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const fy = y + i * 8;
      ctx.moveTo(x, fy + 0.5);
      ctx.lineTo(x + TILE, fy + 0.5);
      const desloc = ((r * 4 + i) % 2 === 0) ? 0 : 8;
      for (let vx = desloc; vx < TILE; vx += 16) {
        ctx.moveTo(x + vx + 0.5, fy);
        ctx.lineTo(x + vx + 0.5, fy + 8);
      }
    }
    ctx.stroke();
  }

  function pisoCarpete(ctx, x, y, TILE, c, r, cores, listrado) {
    ctx.fillStyle = cores.base;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = cores.claro;
    if (listrado) {
      for (let vx = 0; vx < TILE; vx += 9) ctx.fillRect(x + vx, y, 4, TILE);
      return;
    }
    // manchinhas estaveis (dependem so de c/r), pra dar textura de carpete
    for (let i = 0; i < 7; i++) {
      const px = x + ((c * 13 + r * 7 + i * 11) % (TILE - 3));
      const py = y + ((c * 5 + r * 17 + i * 23) % (TILE - 3));
      ctx.fillRect(px, py, 3, 3);
    }
  }

  function drawFloorTile(ctx, c, r, TILE, piso) {
    const x = c * TILE, y = r * TILE;
    const meioTile = TILE / 2;
    const cores = CORES_PISO[piso] || CORES_PISO.tijolo;

    if (piso === 'carpete_roxo') return pisoCarpete(ctx, x, y, TILE, c, r, cores, false);
    if (piso === 'carpete_azul') return pisoCarpete(ctx, x, y, TILE, c, r, cores, true);

    if (piso === 'ladrilho') {
      // ladrilho em losango, como o piso das salas de reuniao do Gather
      ctx.fillStyle = cores.base;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = cores.junta;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + meioTile); ctx.lineTo(x + meioTile, y);
      ctx.moveTo(x + meioTile, y); ctx.lineTo(x + TILE, y + meioTile);
      ctx.moveTo(x + TILE, y + meioTile); ctx.lineTo(x + meioTile, y + TILE);
      ctx.moveTo(x + meioTile, y + TILE); ctx.lineTo(x, y + meioTile);
      ctx.stroke();
      return;
    }

    if (piso === 'grama') {
      ctx.fillStyle = cores.base;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = cores.claro;
      for (let i = 0; i < 3; i++) {
        const gx = x + ((c * 7 + r * 13 + i * 11) % (TILE - 8)) + 4;
        const gy = y + ((c * 5 + r * 17 + i * 9) % (TILE - 8)) + 4;
        ctx.fillRect(gx, gy, 2, 3);
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

  function sombra(ctx, x, y, TILE, altura) {
    ctx.fillStyle = 'rgba(120,100,70,0.16)';
    ctx.fillRect(x + 2, y + TILE - altura, TILE - 4, altura);
  }

  // Moveis que ocupam varios tiles (mesa de reuniao, sofa, tapete) so desenham
  // a borda no lado em que o vizinho e de outro tipo, pra virarem uma peca so.
  function bordasDoMovel(tiles, r, c, tipo) {
    return {
      cima: !(tiles[r - 1] && tiles[r - 1][c] === tipo),
      baixo: !(tiles[r + 1] && tiles[r + 1][c] === tipo),
      esq: tiles[r][c - 1] !== tipo,
      dir: tiles[r][c + 1] !== tipo,
    };
  }

  function contornoParcial(ctx, x, y, w, h, b, cor, largura) {
    ctx.strokeStyle = cor;
    ctx.lineWidth = largura || 1;
    ctx.beginPath();
    if (b.cima) { ctx.moveTo(x, y + 0.5); ctx.lineTo(x + w, y + 0.5); }
    if (b.baixo) { ctx.moveTo(x, y + h - 0.5); ctx.lineTo(x + w, y + h - 0.5); }
    if (b.esq) { ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + h); }
    if (b.dir) { ctx.moveTo(x + w - 0.5, y); ctx.lineTo(x + w - 0.5, y + h); }
    ctx.stroke();
  }

  function drawObstacleTile(ctx, c, r, type, TILE, tiles) {
    const x = c * TILE, y = r * TILE;
    const M = OfficeMap;
    const meio = TILE / 2;

    if (type === M.PAREDE) {
      // parede cinza-azulada escura, como as divisorias do Gather
      ctx.fillStyle = '#4a5162';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#5b6376';
      ctx.fillRect(x, y, TILE, 8);
      ctx.fillStyle = '#343a48';
      ctx.fillRect(x, y + TILE - 6, TILE, 6);
      ctx.strokeStyle = 'rgba(24,28,36,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);

    } else if (type === M.MESA_MONITOR || type === M.MESA) {
      const b = bordasDoMovel(tiles, r, c, type);
      // bancada clara continua, com a borda escura na frente (estilo Gather)
      ctx.fillStyle = 'rgba(60,66,82,0.18)';
      ctx.fillRect(x, y + TILE - 6, TILE, 5);
      ctx.fillStyle = '#e9ebf2';
      ctx.fillRect(x, y + 4, TILE, TILE - 10);
      ctx.fillStyle = '#f7f8fc';
      ctx.fillRect(x, y + 4, TILE, 3);
      ctx.fillStyle = '#aeb4c4';
      ctx.fillRect(x, y + TILE - 9, TILE, 4);
      contornoParcial(ctx, x, y + 4, TILE, TILE - 10, b, 'rgba(120,128,148,0.55)', 1);

      if (type === M.MESA_MONITOR) {
        ctx.fillStyle = '#39404f';
        ctx.fillRect(x + 9, y + 2, 15, 10);
        ctx.fillStyle = '#8fd6ee';
        ctx.fillRect(x + 11, y + 4, 11, 6);
        ctx.fillStyle = '#2c3240';
        ctx.fillRect(x + 15, y + 12, 3, 2);
        ctx.fillStyle = '#cfd5e2';
        ctx.fillRect(x + 10, y + 16, 12, 4);
        ctx.fillStyle = '#e0705a';
        ctx.fillRect(x + 24, y + 15, 5, 5);
      } else {
        ctx.fillStyle = '#fbfbfd';
        ctx.fillRect(x + 9, y + 11, 11, 8);
        ctx.strokeStyle = 'rgba(120,128,148,0.5)';
        ctx.strokeRect(x + 9.5, y + 11.5, 10, 7);
      }

    } else if (type === M.MESA_REUNIAO) {
      const b = bordasDoMovel(tiles, r, c, type);
      // sem emenda entre tiles vizinhos: so a fileira de baixo ganha sombra/borda
      const altura = b.baixo ? TILE - 3 : TILE;
      if (b.baixo) sombra(ctx, x, y, TILE, 3);
      ctx.fillStyle = '#e6cba4';
      ctx.fillRect(x, y, TILE, altura);
      if (b.cima) { ctx.fillStyle = '#f3e0c4'; ctx.fillRect(x, y, TILE, 3); }
      contornoParcial(ctx, x, y, TILE, altura, b, 'rgba(150,110,65,0.55)', 1.5);

    } else if (type === M.SOFA_CIMA || type === M.SOFA_BAIXO) {
      const b = bordasDoMovel(tiles, r, c, type);
      const encostoEmCima = type === M.SOFA_CIMA;
      // recepcao usa sofa azul (como o Lobby do Gather); o lounge, marrom
      const sala = OfficeMap.getRoomAtTile(c, r);
      const p = (sala && sala.id === 'entrada')
        ? { base: '#6d84b4', escuro: '#5a719e', claro: '#8fa3ca', contorno: 'rgba(60,80,120,0.5)' }
        : { base: '#c08a5a', escuro: '#a97449', claro: '#d6a173', contorno: 'rgba(130,85,45,0.5)' };
      sombra(ctx, x, y, TILE, 3);
      ctx.fillStyle = p.base;
      ctx.fillRect(x, y + 2, TILE, TILE - 5);
      ctx.fillStyle = p.escuro;
      ctx.fillRect(x, encostoEmCima ? y + 2 : y + TILE - 12, TILE, 10);
      ctx.fillStyle = p.claro;
      ctx.fillRect(x + 3, encostoEmCima ? y + 14 : y + 6, TILE - 6, 10);
      if (b.esq) { ctx.fillStyle = p.escuro; ctx.fillRect(x, y + 2, 5, TILE - 5); }
      if (b.dir) { ctx.fillStyle = p.escuro; ctx.fillRect(x + TILE - 5, y + 2, 5, TILE - 5); }
      contornoParcial(ctx, x, y + 2, TILE, TILE - 5, b, p.contorno, 1);

    } else if (type === M.TAPETE) {
      const b = bordasDoMovel(tiles, r, c, type);
      ctx.fillStyle = '#dfbca6';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(190,140,110,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (b.cima) { ctx.moveTo(x, y + 3); ctx.lineTo(x + TILE, y + 3); }
      if (b.baixo) { ctx.moveTo(x, y + TILE - 3); ctx.lineTo(x + TILE, y + TILE - 3); }
      if (b.esq) { ctx.moveTo(x + 3, y); ctx.lineTo(x + 3, y + TILE); }
      if (b.dir) { ctx.moveTo(x + TILE - 3, y); ctx.lineTo(x + TILE - 3, y + TILE); }
      ctx.stroke();

    } else if (type === M.MESA_CENTRO) {
      ctx.fillStyle = 'rgba(120,100,70,0.18)';
      ctx.beginPath();
      ctx.ellipse(x + meio, y + TILE - 6, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dcb98f';
      ctx.beginPath();
      ctx.arc(x + meio, y + meio, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,110,65,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#f0dcc0';
      ctx.beginPath();
      ctx.arc(x + meio - 2, y + meio - 3, 5, 0, Math.PI * 2);
      ctx.fill();

    } else if (type === M.ESTANTE) {
      sombra(ctx, x, y, TILE, 3);
      ctx.fillStyle = '#5e6678';
      ctx.fillRect(x + 1, y + 2, TILE - 2, TILE - 5);
      ctx.fillStyle = '#474e5e';
      ctx.fillRect(x + 1, y + 12, TILE - 2, 2);
      ctx.fillRect(x + 1, y + 22, TILE - 2, 2);
      const livros = ['#e05a5a', '#5a86d0', '#e0a25a', '#5ab07a', '#a76fd0'];
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = livros[(i + c + r) % livros.length];
        ctx.fillRect(x + 3 + i * 5, y + 4, 4, 7);
        ctx.fillStyle = livros[(i + c + r + 2) % livros.length];
        ctx.fillRect(x + 3 + i * 5, y + 15, 4, 6);
      }
      ctx.strokeStyle = 'rgba(35,40,52,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, y + 2.5, TILE - 3, TILE - 6);

    } else if (type === M.PLANTA) {
      // vasos coloridos (rosa/azul/roxo/teal), como a decoracao do Gather
      const VASOS = [['#e26aa5', '#f08cbd'], ['#5a9fe0', '#7bb8ee'], ['#9b6fd6', '#b48ee6'], ['#3fb0a5', '#5cc7bd']];
      const vaso = VASOS[(c * 3 + r * 5) % VASOS.length];
      ctx.fillStyle = 'rgba(120,100,70,0.18)';
      ctx.beginPath();
      ctx.ellipse(x + meio, y + 27, 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = vaso[0];
      ctx.fillRect(x + 10, y + 19, 12, 9);
      ctx.fillStyle = vaso[1];
      ctx.fillRect(x + 10, y + 19, 12, 3);
      ctx.fillStyle = '#3f8a4a';
      ctx.beginPath(); ctx.arc(x + meio - 5, y + 15, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + meio + 5, y + 15, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#55a862';
      ctx.beginPath(); ctx.arc(x + meio, y + 10, 8, 0, Math.PI * 2); ctx.fill();

    } else if (type === M.ARVORE) {
      // arvore grande: a copa passa do tile (por isso e desenhada por ultimo)
      const cx = x + meio;
      const base = y + TILE - 2;
      ctx.fillStyle = 'rgba(50,90,50,0.20)';
      ctx.beginPath();
      ctx.ellipse(cx, base, 17, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a6242';
      ctx.fillRect(cx - 4, base - 14, 8, 14);
      ctx.fillStyle = '#6f4d33';
      ctx.fillRect(cx - 4, base - 14, 3, 14);
      ctx.fillStyle = '#3f8a4a';
      ctx.beginPath(); ctx.arc(cx - 13, base - 22, 13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 13, base - 22, 13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, base - 32, 16, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 7, base - 14, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 7, base - 14, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#57a862';
      ctx.beginPath(); ctx.arc(cx - 6, base - 34, 10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 8, base - 26, 7, 0, Math.PI * 2); ctx.fill();

    } else if (type === M.QUADRO) {
      ctx.fillStyle = '#a97f52';
      ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 12);
      ctx.fillStyle = '#f3efe6';
      ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 16);
      ctx.fillStyle = '#7fb3dd';
      ctx.fillRect(x + 6, y + 6, TILE - 12, 7);
      ctx.fillStyle = '#5ba86a';
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 18);
      ctx.lineTo(x + 13, y + 11);
      ctx.lineTo(x + TILE - 6, y + 18);
      ctx.closePath();
      ctx.fill();

    } else if (type === M.LOUSA) {
      const b = bordasDoMovel(tiles, r, c, type);
      ctx.fillStyle = '#b5ab9b';
      ctx.fillRect(x, y + 2, TILE, TILE - 10);
      ctx.fillStyle = '#f8f7f2';
      ctx.fillRect(x, y + 4, TILE, TILE - 14);
      ctx.strokeStyle = '#7fb3dd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 9); ctx.lineTo(x + TILE - 5, y + 9);
      ctx.stroke();
      ctx.strokeStyle = '#d0785a';
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 15); ctx.lineTo(x + TILE - 12, y + 15);
      ctx.stroke();
      contornoParcial(ctx, x, y + 2, TILE, TILE - 10, b, 'rgba(110,100,88,0.6)', 1.5);

    } else if (type === M.ARMARIO) {
      sombra(ctx, x, y, TILE, 3);
      ctx.fillStyle = '#6a7286';
      ctx.fillRect(x + 1, y + 2, TILE - 2, TILE - 5);
      ctx.fillStyle = '#7d879d';
      ctx.fillRect(x + 1, y + 2, TILE - 2, 3);
      ctx.strokeStyle = 'rgba(35,40,52,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, y + 2.5, TILE - 3, TILE - 6);
      ctx.beginPath();
      ctx.moveTo(x + meio, y + 3); ctx.lineTo(x + meio, y + TILE - 4);
      ctx.stroke();
      ctx.fillStyle = '#cfd5e2';
      ctx.beginPath();
      ctx.arc(x + meio - 4, y + meio, 1.6, 0, Math.PI * 2);
      ctx.arc(x + meio + 4, y + meio, 1.6, 0, Math.PI * 2);
      ctx.fill();

    } else if (type === M.BALCAO) {
      const b = bordasDoMovel(tiles, r, c, type);
      sombra(ctx, x, y, TILE, 4);
      ctx.fillStyle = '#dfe2ea';
      ctx.fillRect(x, y + 8, TILE, TILE - 12);
      ctx.fillStyle = '#f2f4f8';
      ctx.fillRect(x, y + 8, TILE, 5);
      ctx.fillStyle = '#a8aebd';
      ctx.fillRect(x, y + 19, TILE, 3);
      contornoParcial(ctx, x, y + 8, TILE, TILE - 12, b, 'rgba(120,128,148,0.55)', 1.5);

    } else if (type === M.CERCA) {
      ctx.fillStyle = '#c99f70';
      ctx.fillRect(x, y + 10, TILE, 4);
      ctx.fillRect(x, y + 18, TILE, 4);
      ctx.fillStyle = '#a97f52';
      ctx.fillRect(x + 4, y + 5, 5, 22);
      ctx.fillRect(x + TILE - 9, y + 5, 5, 22);

    } else if (type === M.JANELA) {
      // janelao: mesma parede, com vidro e caixilho branco
      ctx.fillStyle = '#4a5162';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#5b6376';
      ctx.fillRect(x, y, TILE, 6);
      ctx.fillStyle = '#eef2f5';
      ctx.fillRect(x + 1, y + 7, TILE - 2, 17);
      ctx.fillStyle = '#a8dbe2';
      ctx.fillRect(x + 3, y + 9, TILE - 6, 13);
      ctx.fillStyle = '#c9ebef';
      ctx.fillRect(x + 3, y + 9, TILE - 6, 5);
      ctx.strokeStyle = '#eef2f5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + meio, y + 9); ctx.lineTo(x + meio, y + 22);
      ctx.moveTo(x + 3, y + 15.5); ctx.lineTo(x + TILE - 3, y + 15.5);
      ctx.stroke();
      ctx.fillStyle = '#343a48';
      ctx.fillRect(x, y + TILE - 6, TILE, 6);

    } else if (type === M.AGUA) {
      const b = bordasDoMovel(tiles, r, c, type);
      ctx.fillStyle = '#4d9fd6';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#69b4e4';
      for (let i = 0; i < 3; i++) {
        const ox = x + ((c * 11 + r * 5 + i * 9) % (TILE - 10)) + 4;
        const oy = y + ((c * 7 + r * 13 + i * 11) % (TILE - 8)) + 4;
        ctx.fillRect(ox, oy, 7, 2);
      }
      // carpinha
      if ((c + r) % 3 === 0) {
        ctx.fillStyle = '#f08a3a';
        ctx.beginPath();
        ctx.ellipse(x + meio, y + meio, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      contornoParcial(ctx, x, y, TILE, TILE, b, 'rgba(40,90,130,0.5)', 2);

    } else if (type === M.PEDRA) {
      ctx.fillStyle = 'rgba(60,70,60,0.2)';
      ctx.beginPath();
      ctx.ellipse(x + meio, y + 24, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9aa0a6';
      ctx.beginPath();
      ctx.ellipse(x + meio, y + 18, 12, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b6bcc2';
      ctx.beginPath();
      ctx.ellipse(x + meio - 3, y + 15, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();

    } else if (type === M.ARBUSTO) {
      ctx.fillStyle = '#3f8a4a';
      ctx.beginPath(); ctx.arc(x + meio - 6, y + 20, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + meio + 6, y + 20, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + meio, y + 15, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#57a862';
      ctx.beginPath(); ctx.arc(x + meio - 3, y + 13, 5, 0, Math.PI * 2); ctx.fill();

    } else if (type === M.BANCO) {
      sombra(ctx, x, y, TILE, 3);
      ctx.fillStyle = '#5a86d0';
      ctx.fillRect(x + 2, y + 12, TILE - 4, 9);
      ctx.fillStyle = '#7ba3e0';
      ctx.fillRect(x + 2, y + 12, TILE - 4, 3);
      ctx.fillStyle = '#41639e';
      ctx.fillRect(x + 2, y + 6, TILE - 4, 5);
      ctx.fillRect(x + 4, y + 21, 3, 5);
      ctx.fillRect(x + TILE - 7, y + 21, 3, 5);

    } else if (type === M.CABIDE) {
      ctx.fillStyle = 'rgba(60,66,82,0.16)';
      ctx.beginPath();
      ctx.ellipse(x + meio, y + 27, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a5162';
      ctx.fillRect(x + meio - 1.5, y + 6, 3, 21);
      ctx.fillStyle = '#f0c65a';
      ctx.beginPath(); ctx.arc(x + meio - 7, y + 9, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e05a5a';
      ctx.beginPath(); ctx.arc(x + meio + 7, y + 10, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a86d0';
      ctx.beginPath(); ctx.arc(x + meio, y + 6, 3.5, 0, Math.PI * 2); ctx.fill();

    } else if (type === M.IMPRESSORA) {
      sombra(ctx, x, y, TILE, 3);
      ctx.fillStyle = '#7d879d';
      ctx.fillRect(x + 3, y + 10, TILE - 6, 16);
      ctx.fillStyle = '#98a3b8';
      ctx.fillRect(x + 3, y + 10, TILE - 6, 4);
      ctx.fillStyle = '#2c3240';
      ctx.fillRect(x + 6, y + 16, TILE - 12, 4);
      ctx.fillStyle = '#f7f8fc';
      ctx.fillRect(x + 8, y + 6, TILE - 16, 5);
      ctx.fillStyle = '#5ab07a';
      ctx.fillRect(x + TILE - 9, y + 12, 3, 3);

    } else if (type === M.CAVALETE) {
      ctx.fillStyle = '#8a6242';
      ctx.fillRect(x + 6, y + 18, 2.5, 10);
      ctx.fillRect(x + TILE - 9, y + 18, 2.5, 10);
      ctx.fillStyle = '#f7f8fc';
      ctx.fillRect(x + 4, y + 3, TILE - 8, 16);
      ctx.strokeStyle = '#b5ab9b';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 4.5, y + 3.5, TILE - 9, 15);
      ctx.fillStyle = '#4da3d6';
      ctx.fillRect(x + 7, y + 12, 4, 5);
      ctx.fillRect(x + 13, y + 9, 4, 8);
      ctx.fillStyle = '#e07a5f';
      ctx.fillRect(x + 19, y + 6, 4, 11);

    } else if (type === M.CADEIRA) {
      // poltrona de escritorio vista de tras, escura como no Gather
      ctx.fillStyle = 'rgba(40,45,58,0.16)';
      ctx.beginPath();
      ctx.ellipse(x + meio, y + 26, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3d4356';
      ctx.beginPath();
      ctx.roundRect(x + meio - 9, y + 9, 18, 16, 6);
      ctx.fill();
      ctx.fillStyle = '#4d5468';
      ctx.beginPath();
      ctx.roundRect(x + meio - 7, y + 6, 14, 9, 5);
      ctx.fill();
      ctx.fillStyle = '#2b3040';
      ctx.fillRect(x + meio - 9, y + 17, 18, 2.5);
      ctx.fillStyle = '#5c6478';
      ctx.beginPath();
      ctx.roundRect(x + meio - 4, y + 9, 8, 5, 2.5);
      ctx.fill();
    }
  }

  // Camera que segue a pessoa, com zoom fixo (o mapa e maior que a tela). Antes
  // o mapa inteiro era espremido pra caber, o que deixava tudo minusculo.
  const ZOOM = 2;
  let camX = 0;
  let camY = 0;

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

  function loop(now) {
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;
    localWalkTime += dt;

    atualizarJogadorLocal(dt);
    interpolarRemotos(dt);
    Calls.updateProximity(players);
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
    self.displayX = self.x;
    self.displayY = self.y;

    const agora = performance.now();
    const mudou =
      lastSentState.x !== self.x || lastSentState.y !== self.y ||
      lastSentState.dir !== self.dir || lastSentState.moving !== self.moving;
    if (mudou && agora - lastMoveSent > MOVE_SEND_INTERVAL) {
      Network.sendMove({ x: self.x, y: self.y, dir: self.dir, moving: self.moving });
      lastMoveSent = agora;
      lastSentState = { x: self.x, y: self.y, dir: self.dir, moving: self.moving };
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
      ctx.fillStyle = corStatus;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
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

    // chao de cada ambiente na cor de identidade dele, bem clarinho
    mctx.fillStyle = '#f3ece1';
    mctx.fillRect(offX, offY, worldW * escala, worldH * escala);
    OfficeMap.ROOMS.forEach((sala) => {
      mctx.fillStyle = sala.cor;
      mctx.globalAlpha = 0.22;
      mctx.fillRect(
        offX + sala.c0 * TILE * escala, offY + sala.r0 * TILE * escala,
        (sala.c1 - sala.c0 + 1) * TILE * escala, (sala.r1 - sala.r0 + 1) * TILE * escala
      );
      mctx.globalAlpha = 1;
    });

    mctx.fillStyle = 'rgba(95,105,125,0.45)';
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
      desenharAnelStatus(ctx, p.displayX, p.displayY, p.status);

      Character.draw(ctx, p.displayX, p.displayY, p.appearance, {
        dir: p.dir,
        moving: p.moving,
        walkTime: localWalkTime,
      });

      const labelY = p.displayY - 44;
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

    document.getElementById('btn-status').addEventListener('click', () => {
      const self = players.get(selfId);
      if (!self) return;
      const proximo = STATUS_ORDEM[(STATUS_ORDEM.indexOf(self.status) + 1) % STATUS_ORDEM.length];
      self.status = proximo;
      ajustarBotaoStatus(proximo);
      Network.sendStatus(proximo);
    });

    document.querySelectorAll('.btn-reacao').forEach((btn) => {
      btn.addEventListener('click', () => Network.sendReaction(btn.dataset.emoji));
    });

    Network.on('conexao', (estado) => setIndicador(estado));

    Network.on('init', (data) => {
      selfId = data.selfId;
      players.clear();
      data.players.forEach((p) => {
        players.set(p.id, p.id === selfId ? criarJogadorLocal(p) : criarJogadorRemoto(p));
      });
      ajustarBotaoStatus(players.get(selfId).status);
      Calls.init(selfId);
      Chat.carregarHistorico(data.mensagens || []);
      aplicarMesas(data.mesas);
    });

    Network.on('mesas-atualizadas', (lista) => aplicarMesas(lista));

    Network.on('player-joined', (data) => {
      players.set(data.id, criarJogadorRemoto(data));
    });

    Network.on('player-left', (data) => {
      players.delete(data.id);
    });

    Network.on('player-moved', (data) => {
      const p = players.get(data.id);
      if (!p) return;
      p.targetX = data.x;
      p.targetY = data.y;
      p.dir = data.dir;
      p.moving = data.moving;
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

    Rooms.init();
    CallGrid.init();
    Chat.init();
    Pessoas.init();
    Network.connect(profile);

    lastFrameTime = performance.now();
    setInterval(() => loop(performance.now()), 1000 / 60);
  }

  window.Game = {
    init,
    getPlayers: () => players,
    getSelfId: () => selfId,
    STATUS_COR,
    STATUS_LABEL,
    corDoId,
    irAte,
    moverPara,
  };
})();

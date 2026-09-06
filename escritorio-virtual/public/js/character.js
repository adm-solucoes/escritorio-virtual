// Boneco com sprites LPC (Liberated Pixel Cup - CC-BY-SA/GPL/OGA-BY, ver ASSETS_CREDITS.md)
// compostos em camadas (corpo, roupa, cabelo) e recoloridos por canvas para dar as
// opcoes de personalizacao (tom de pele, cor da camisa, cor do cabelo).
(function () {
  const SKIN_TONES = ['#ffe0bd', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5a3825'];
  // paletas no espirito do editor do Gather: poucas opcoes de pele, muitas de
  // cabelo e uma paleta cheia pras roupas
  const HAIR_COLORS = [
    '#ffffff', '#2b3038', '#d2683a', '#a8642e', '#9a8b4a', '#f0c65a',
    '#a03028', '#ef8a2a', '#f0609a', '#b06ad8', '#45c3ee', '#3aa050',
  ];
  const ROUPA_COLORS = [
    '#e03a3a', '#f0862a', '#f5c518', '#6b8c3a', '#3aa84a', '#1f7a6a',
    '#35bdf0', '#6a7ce0', '#9a5cd0', '#e83ab5', '#f06aa0', '#b06a3a',
    '#e8d4b0', '#ffffff', '#9aa0ad', '#2b2f38',
  ];
  const SHIRT_COLORS = ROUPA_COLORS;
  const HAIR_STYLES = ['curto', 'longo', 'moicano', 'careca'];

  const PADROES = {
    skin: '#f1c27d',
    shirt: '#35bdf0',
    bottom: '#6a7ce0',
    shoes: '#2b2f38',
    hairColor: '#2b3038',
    hairStyle: 'curto',
    glassesColor: '#2b3038',
  };

  // Perfis antigos (salvos no navegador antes de existirem calca/sapato/cor de
  // oculos) caem nos padroes em vez de quebrar o desenho.
  function resolver(a) {
    const ap = a || {};
    return {
      skin: ap.skin || PADROES.skin,
      shirt: ap.shirt || PADROES.shirt,
      bottom: ap.bottom || PADROES.bottom,
      shoes: ap.shoes || PADROES.shoes,
      hairColor: ap.hairColor || PADROES.hairColor,
      hairStyle: HAIR_STYLES.includes(ap.hairStyle) ? ap.hairStyle : PADROES.hairStyle,
      glasses: !!ap.glasses,
      glassesColor: ap.glassesColor || PADROES.glassesColor,
    };
  }

  const FRAME = 64;
  const SHEET_W = FRAME * 9;
  const SHEET_H = FRAME * 4;
  const ROW_POR_DIR = { up: 0, left: 1, down: 2, right: 3 };
  // pes do personagem dentro do quadro 64x64 (medido nos sprites originais)
  const PE_X = 32, PE_Y = 61;

  const ASSET_BASE = 'assets/lpc/';
  const ARQ_HAIR = { curto: 'hair_curto.png', longo: 'hair_longo.png', moicano: 'hair_moicano.png' };

  function randomOf(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function randomAppearance() {
    return {
      skin: randomOf(SKIN_TONES),
      shirt: randomOf(ROUPA_COLORS),
      bottom: randomOf(ROUPA_COLORS),
      shoes: randomOf(ROUPA_COLORS),
      hairColor: randomOf(HAIR_COLORS),
      hairStyle: randomOf(HAIR_STYLES),
      glasses: Math.random() < 0.5,
      glassesColor: randomOf(ROUPA_COLORS),
    };
  }

  function carregarImagem(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  const imagens = {};
  const ready = (async () => {
    const nomes = {
      body: 'body.png',
      head: 'head.png',
      legs: 'legs.png',
      feet: 'feet.png',
      torso: 'torso.png',
      glasses: 'glasses.png',
      hair_curto: ARQ_HAIR.curto,
      hair_longo: ARQ_HAIR.longo,
      hair_moicano: ARQ_HAIR.moicano,
    };
    const entradas = Object.entries(nomes);
    const carregadas = await Promise.all(entradas.map(([, arq]) => carregarImagem(ASSET_BASE + arq)));
    entradas.forEach(([chave], i) => { imagens[chave] = carregadas[i]; });
  })();

  // Recolore uma spritesheet preservando sombra/luz (canvas blend "color" + mascara de alpha original).
  function recolorir(img, corAlvo) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'color';
    ctx.fillStyle = corAlvo;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    return c;
  }

  const cacheSprites = new Map();

  function chaveAparencia(a) {
    return [a.skin, a.shirt, a.bottom, a.shoes, a.hairColor, a.hairStyle, a.glasses ? 1 : 0, a.glassesColor].join('|');
  }

  // Monta (e guarda em cache) a spritesheet 576x256 final de um jogador, com todas
  // as camadas ja compostas e recoloridas.
  function getSpriteSheet(aparenciaCrua) {
    const appearance = resolver(aparenciaCrua);
    const chave = chaveAparencia(appearance);
    if (cacheSprites.has(chave)) return cacheSprites.get(chave);

    const corpoR = recolorir(imagens.body, appearance.skin);
    const cabecaR = recolorir(imagens.head, appearance.skin);
    const torsoR = recolorir(imagens.torso, appearance.shirt);
    const pernasR = recolorir(imagens.legs, appearance.bottom);
    const pesR = recolorir(imagens.feet, appearance.shoes);

    const out = document.createElement('canvas');
    out.width = SHEET_W;
    out.height = SHEET_H;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(corpoR, 0, 0);
    ctx.drawImage(pernasR, 0, 0);
    ctx.drawImage(pesR, 0, 0);
    ctx.drawImage(torsoR, 0, 0);
    ctx.drawImage(cabecaR, 0, 0);
    if (appearance.glasses) ctx.drawImage(recolorir(imagens.glasses, appearance.glassesColor), 0, 0);
    if (appearance.hairStyle !== 'careca') {
      const hairImg = imagens['hair_' + appearance.hairStyle];
      if (hairImg) ctx.drawImage(recolorir(hairImg, appearance.hairColor), 0, 0);
    }

    cacheSprites.set(chave, out);
    return out;
  }

  // Desenha o personagem centrado em (x, y), com y sendo o ponto dos pes.
  // opts: { dir: 'down'|'up'|'left'|'right', moving: bool, walkTime: seconds, scale }
  function draw(ctx, x, y, appearance, opts) {
    if (!imagens.body) return; // sprites ainda carregando

    const dir = (opts && opts.dir) || 'down';
    const moving = !!(opts && opts.moving);
    const t = (opts && opts.walkTime) || 0;
    const escala = (opts && opts.scale) || 0.72;

    const sheet = getSpriteSheet(appearance);
    const row = ROW_POR_DIR[dir] != null ? ROW_POR_DIR[dir] : 2;
    const col = moving ? 1 + Math.floor((t * 9) % 8) : 0;

    const larguraDestino = FRAME * escala;
    const alturaDestino = FRAME * escala;
    const destX = x - PE_X * escala;
    const destY = y - PE_Y * escala;

    // sombra no chao
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sheet,
      col * FRAME, row * FRAME, FRAME, FRAME,
      destX, destY, larguraDestino, alturaDestino
    );
  }

  window.Character = {
    SKIN_TONES,
    SHIRT_COLORS,
    ROUPA_COLORS,
    HAIR_COLORS,
    HAIR_STYLES,
    PADROES,
    resolver,
    randomAppearance,
    draw,
    ready,
  };
})();

// Decorador do escritorio, no formato do painel "Decorator" do Gather: busca,
// abas de categoria e grade de objetos. Decorar = escrever um tile na grade, o
// que ja resolve colisao e desenho. Ver docs/plano-decorador.md.
(function () {
  const M = () => OfficeMap;

  // As abas da referencia. Um item pode ser:
  //   { t }           - um tile de movel
  //   { t, w, h }     - peca grande: escreve varias celulas de uma vez
  //   { o }           - coisa apoiada em cima (camada de objetos)
  function construirCategorias() {
    const m = M();
    const O = m.OBJETOS;
    return [
      {
        // A mesa da referencia tem **duas fileiras**: o fundo (onde os monitores
        // apoiam) e a frente (com o gaveteiro). Por isso as pecas padrao sao 2
        // de altura - com 1 fileira so fica aquela mesinha estreita.
        id: 'mesas', nome: 'Mesas', icone: '🪟', itens: [
          { t: m.MESA, w: 2, h: 2, nome: 'Mesa 2x2' },
          { t: m.MESA, w: 3, h: 2, nome: 'Mesa grande 3x2' },
          { t: m.MESA, w: 4, h: 2, nome: 'Bancada 4x2' },
          { t: m.MESA, w: 6, h: 2, nome: 'Bancada longa 6x2' },
          { t: m.MESA_REUNIAO, w: 4, h: 3, nome: 'Mesa de reuniao 4x3' },
          { t: m.MESA, w: 2, h: 1, nome: 'Mesa rasa 2x1' },
          { t: m.MESA, nome: 'Mesa 1x1' },
          { t: m.BALCAO, w: 3, h: 1, nome: 'Balcao 3x1' },
          { t: m.MESA_CENTRO, nome: 'Mesa de centro' },
          { t: m.MESA_MONITOR, nome: 'Posto de trabalho' },
        ],
      },
      {
        id: 'emcima', nome: 'Em cima da mesa', icone: '🖥️', itens: [
          { o: O.MONITOR, nome: 'Monitor' },
          { o: O.MONITOR_DUPLO, nome: 'Dois monitores' },
          { o: O.NOTEBOOK, nome: 'Notebook' },
          { o: O.TECLADO, nome: 'Teclado e mouse' },
          { o: O.CANECA, nome: 'Caneca' },
          { o: O.PAPELADA, nome: 'Papelada' },
          { o: O.TELEFONE, nome: 'Telefone' },
          { o: O.LUMINARIA, nome: 'Luminaria' },
          { o: O.PLANTINHA, nome: 'Plantinha' },
          { o: O.LIVROS, nome: 'Livros' },
          { o: O.NENHUM, nome: 'Tirar o que esta em cima' },
        ],
      },
      {
        // Uma cadeira por direcao: a pessoa senta virada pro lado que ela aponta.
        id: 'trabalho', nome: 'Cadeiras', icone: '🪑', itens: [
          { t: m.CADEIRA, nome: 'Cadeira ↑ (de costas)' },
          { t: m.CADEIRA_BAIXO, nome: 'Cadeira ↓ (de frente)' },
          { t: m.CADEIRA_ESQ, nome: 'Cadeira ← (perfil)' },
          { t: m.CADEIRA_DIR, nome: 'Cadeira → (perfil)' },
          { t: m.CADEIRA_VERMELHA, nome: 'Vermelha ↑' },
          { t: m.CADEIRA_VERMELHA_BAIXO, nome: 'Vermelha ↓' },
          { t: m.CADEIRA_VERMELHA_ESQ, nome: 'Vermelha ←' },
          { t: m.CADEIRA_VERMELHA_DIR, nome: 'Vermelha →' },
          { t: m.POLTRONA, nome: 'Poltrona (senta)' },
          // Mesas por direcao: a seta e pro lado que olha quem senta nela, entao
          // e so casar com a cadeira que voce puser do lado. Todas vem vazias -
          // "posto de trabalho" e a que da pra reivindicar e personalizar; a
          // "mesa" comum e so movel.
          { t: m.MESA_MONITOR, nome: 'Posto ↑ (da pra pegar)' },
          { t: m.MESA_MONITOR_BAIXO, nome: 'Posto ↓ (da pra pegar)' },
          { t: m.MESA_MONITOR_ESQ, nome: 'Posto ← (da pra pegar)' },
          { t: m.MESA_MONITOR_DIR, nome: 'Posto → (da pra pegar)' },
          { t: m.MESA, nome: 'Mesa ↑' },
          { t: m.MESA_BAIXO, nome: 'Mesa ↓' },
          { t: m.MESA_ESQ, nome: 'Mesa ←' },
          { t: m.MESA_DIR, nome: 'Mesa →' },
          { t: m.MESA_NOTEBOOK, nome: 'Mesa pronta (notebook)' },
          { t: m.IMPRESSORA, nome: 'Impressora' },
          { t: m.LOUSA, nome: 'Lousa' },
        ],
      },
      {
        id: 'decoracao', nome: 'Decoracao', icone: '🪴', itens: [
          { t: m.PLANTA, nome: 'Planta' },
          { t: m.PLANTA_GRANDE, nome: 'Planta grande' },
          { t: m.VASO_FLORES, nome: 'Vaso de flores' },
          { t: m.CACTO, nome: 'Cacto' },
          { t: m.QUADRO, nome: 'Quadro' },
          { t: m.RELOGIO, nome: 'Relogio' },
          { t: m.TV, nome: 'Televisao' },
          { t: m.CAVALETE, nome: 'Cavalete' },
          { t: m.CABIDE, nome: 'Cabide' },
          { t: m.TAPETE, nome: 'Tapete' },
          { t: m.TAPETE_REDONDO, nome: 'Tapete redondo' },
        ],
      },
      {
        id: 'estar', nome: 'Estar', icone: '🛋️', itens: [
          { t: m.SOFA_CIMA, w: 2, h: 1, nome: 'Sofa 2x1 (encosto)' },
          { t: m.SOFA_CIMA, nome: 'Sofa (encosto)' },
          { t: m.SOFA_BAIXO, nome: 'Sofa (assento)' },
          { t: m.BANCO, nome: 'Banco' },
          { t: m.ESTANTE, nome: 'Estante' },
          { t: m.ARMARIO, nome: 'Armario' },
          { t: m.BALCAO, nome: 'Balcao' },
          { t: m.BEBEDOURO, nome: 'Bebedouro' },
        ],
      },
      {
        id: 'estrutura', nome: 'Estrutura', icone: '🧱', itens: [
          { t: m.PAREDE, nome: 'Parede' },
          { t: m.JANELA, nome: 'Janela' },
          { t: m.CERCA, nome: 'Cerca' },
        ],
      },
      {
        id: 'externo', nome: 'Area externa', icone: '🌳', itens: [
          { t: m.ARVORE, nome: 'Arvore' },
          { t: m.ARBUSTO, nome: 'Arbusto' },
          { t: m.PEDRA, nome: 'Pedra' },
          { t: m.AGUA, nome: 'Agua' },
        ],
      },
      {
        id: 'apagar', nome: 'Borracha', icone: '🧽', itens: [
          { t: m.LIVRE, nome: 'Apagar (volta o chao)' },
        ],
      },
    ];
  }

  // Montado uma vez so: o item selecionado e comparado por identidade.
  // Quem nao e da diretoria so ve a aba "Em cima da mesa": o resto e mobilia da
  // casa, que ele nao mexe.
  function soAbaDaMesa() {
    return !souAdmin;
  }

  // De que camada e essa celula. Decide pela CELULA, nao pelo cargo: a
  // diretoria tambem tem mesa, e o que ela poe na propria mesa e dela, nao
  // decoracao da casa. Fora da sua mesa, so a diretoria mexe.
  function ehMinhaMesa(col, row) {
    return Game.celulaEhMinha(col, row);
  }

  let CATEGORIAS = null;
  function categorias() {
    if (!CATEGORIAS) CATEGORIAS = construirCategorias();
    if (soAbaDaMesa()) return CATEGORIAS.filter((c) => c.id === 'emcima');
    return CATEGORIAS;
  }

  let painel, gradeEl, buscaEl, abasEl;
  let souAdmin = false;
  // Sem ser da diretoria, o painel ainda abre pra quem tem mesa - so que
  // mostrando a aba "Em cima da mesa" e deixando pousar coisa **so na sua
  // mesa**. E o que faz a personalizacao ser da pessoa e nao da casa.
  let tenhoMesa = false;
  let aberto = false;
  let selecionado = null; // { t, nome }
  let filtro = '';
  let abaAtual = 'mesas';
  const feitos = []; // pilha de desfazer: { c, r, de, para }
  const refazer = [];

  // ---------- desenho ----------

  function larguraDe(item) { return item.w || 1; }
  function alturaDe(item) { return item.h || 1; }
  function ehObjeto(item) { return item && item.o !== undefined; }

  // Grade falsa do tamanho da peca (mais uma borda), pra funcao de desenho poder
  // olhar os vizinhos e as pecas grandes sairem emendadas na miniatura.
  function gradeFalsa(tile, w, h) {
    return Array.from({ length: h + 2 }, (_, r) => Array.from({ length: w + 2 }, (_, c) => (
      (r === 0 || c === 0 || r === h + 1 || c === w + 1) ? 0 : tile
    )));
  }

  // Miniatura: a peca inteira desenhada e encolhida pra caber no quadradinho.
  function desenharItem(canvas, item) {
    const TILE = M().TILE;
    const w = larguraDe(item);
    const h = alturaDe(item);
    const escala = 2 / Math.max(w, h);

    canvas.width = TILE * 2;
    canvas.height = TILE * 2;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // centraliza a peca no quadrado da miniatura
    ctx.translate((TILE * 2 - w * TILE * escala) / 2, (TILE * 2 - h * TILE * escala) / 2);
    ctx.scale(escala, escala);

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) Game.desenharPiso(ctx, c, r, TILE, 'cinza');
    }

    if (ehObjeto(item)) {
      if (item.o) Game.desenharApoiado(ctx, 0, 0, item.o, TILE);
      else riscoDeBorracha(ctx, TILE);
      return;
    }
    if (item.t === M().LIVRE) {
      riscoDeBorracha(ctx, TILE);
      return;
    }

    const grade = gradeFalsa(item.t, w, h);
    ctx.save();
    ctx.translate(-TILE, -TILE); // a grade falsa tem uma borda de folga
    for (let r = 1; r <= h; r++) {
      for (let c = 1; c <= w; c++) Game.desenharObjeto(ctx, c, r, item.t, TILE, grade);
    }
    ctx.restore();
  }

  function riscoDeBorracha(ctx, TILE) {
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(7, 7); ctx.lineTo(TILE - 7, TILE - 7);
    ctx.moveTo(TILE - 7, 7); ctx.lineTo(7, TILE - 7);
    ctx.stroke();
  }

  // Previa translucida sob o cursor. Escreve na grade so pelo tempo do desenho:
  // assim a peca ja aparece emendada com os vizinhos, igual ao resultado.
  function desenharPreviaNoMapa(ctx, col, row, TILE, x, y) {
    if (!selecionado) return;

    if (ehObjeto(selecionado)) {
      if (!selecionado.o) return;
      // Na sua mesa a previa segue o cursor de verdade (posicao livre); na
      // camada da casa ela encaixa na celula.
      if (ehMinhaMesa(col, row) && x !== undefined) {
        Game.desenharApoiado(ctx, x, y, selecionado.o, TILE, M().tiles, true);
      } else {
        Game.desenharApoiado(ctx, col, row, selecionado.o, TILE, M().tiles);
      }
      return;
    }
    if (selecionado.t === M().LIVRE) return; // borracha nao mostra nada

    const tiles = M().tiles;
    const antes = [];
    celulasDa(col, row).forEach(([c, r]) => {
      if (!tiles[r] || tiles[r][c] === undefined) return;
      antes.push([c, r, tiles[r][c]]);
      tiles[r][c] = selecionado.t;
    });
    antes.forEach(([c, r]) => Game.desenharObjeto(ctx, c, r, selecionado.t, TILE, tiles));
    antes.forEach(([c, r, valor]) => { tiles[r][c] = valor; });
  }

  // Celulas que a peca ocupa a partir do canto sob o cursor.
  function celulasDa(col, row) {
    const lista = [];
    for (let dr = 0; dr < alturaDe(selecionado); dr++) {
      for (let dc = 0; dc < larguraDe(selecionado); dc++) lista.push([col + dc, row + dr]);
    }
    return lista;
  }

  // ---------- catalogo ----------

  function itensVisiveis() {
    const termo = filtro.trim().toLowerCase();
    if (termo) {
      return categorias()
        .flatMap((c) => c.itens)
        .filter((i) => i.nome.toLowerCase().includes(termo));
    }
    const cat = categorias().find((c) => c.id === abaAtual);
    return cat ? cat.itens : [];
  }

  function renderAbas() {
    abasEl.innerHTML = '';
    categorias().forEach((cat) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'decor-aba' + (cat.id === abaAtual && !filtro ? ' ativa' : '');
      b.textContent = cat.icone;
      b.title = cat.nome;
      b.addEventListener('click', () => {
        abaAtual = cat.id;
        filtro = '';
        buscaEl.value = '';
        render();
      });
      abasEl.appendChild(b);
    });
  }

  function renderGrade() {
    gradeEl.innerHTML = '';
    const itens = itensVisiveis();
    if (!itens.length) {
      const vazio = document.createElement('p');
      vazio.className = 'decor-vazio';
      vazio.textContent = 'Nada com esse nome.';
      gradeEl.appendChild(vazio);
      return;
    }
    itens.forEach((item) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'decor-item' + (selecionado === item ? ' ativa' : '');
      b.title = item.nome;

      const canvas = document.createElement('canvas');
      desenharItem(canvas, item);
      b.appendChild(canvas);

      const legenda = document.createElement('span');
      legenda.textContent = item.nome;
      b.appendChild(legenda);

      b.addEventListener('click', () => {
        selecionado = (selecionado === item) ? null : item;
        render();
      });
      gradeEl.appendChild(b);
    });
  }

  function render() {
    renderAbas();
    renderGrade();
    const dica = document.getElementById('decor-dica');
    // Com um item de apoiar na mao a dica muda: e o unico caso em que existe
    // um lugar certo pra clicar (a malha verde), e nao adianta descobrir isso
    // no erro.
    dica.textContent = !selecionado
      ? 'Escolha um objeto e clique no escritorio.'
      : ehObjeto(selecionado)
        ? 'Coloque "' + selecionado.nome + '" em cima de uma mesa - a malha verde mostra onde da.'
        : 'Clique no mapa pra colocar "' + selecionado.nome + '". Esc pra soltar.';
  }

  // ---------- edicao ----------

  function estaPintando() {
    return aberto && !!selecionado;
  }

  function temGenteEm(col, row) {
    const TILE = M().TILE;
    let ocupado = false;
    Game.getPlayers().forEach((pl) => {
      if (Math.floor(pl.x / TILE) === col && Math.floor(pl.y / TILE) === row) ocupado = true;
    });
    return ocupado;
  }

  function podeColocarEm(col, row) {
    const m = M();
    if (ehObjeto(selecionado)) {
      // Apoiar em cima nao depende de gente - depende de ter em que apoiar.
      // A regra e a mesma do servidor: so vale em SUPERFICIES, que sao
      // exatamente as celulas que a malha verde acende.
      if (!m.objetos[row] || m.objetos[row][col] === undefined) return false;
      if (selecionado.o && !m.SUPERFICIES.has(m.tiles[row][col])) return false;
      // Na sua mesa vale pra qualquer um; fora dela, so a diretoria. E a mesma
      // regra que o servidor aplica nos dois eventos.
      //
      // Na propria mesa nao ha "ja tem isso aqui": a coisa pousa onde voce
      // clicar, e podem conviver varias na mesma celula.
      if (ehMinhaMesa(col, row)) return true;
      if (!souAdmin) return false;
      return m.objetos[row][col] !== selecionado.o;
    }
    // peca grande: todas as celulas tem que caber e estar livres de gente
    return celulasDa(col, row).every(([c, r]) => (
      m.tiles[r] && m.tiles[r][c] !== undefined
      && (selecionado.t === m.LIVRE || !temGenteEm(c, r))
    )) && celulasDa(col, row).some(([c, r]) => m.tiles[r][c] !== selecionado.t);
  }

  function pintarEm(col, row, x, y) {
    if (!estaPintando() || !podeColocarEm(col, row)) return;
    const m = M();
    refazer.length = 0;

    if (ehObjeto(selecionado)) {
      if (ehMinhaMesa(col, row)) {
        // Posicao livre: o desfazer guarda o ponto, nao a celula.
        const px = x === undefined ? col + 0.5 : x;
        const py = y === undefined ? row + 0.5 : y;
        feitos.push({ obj: true, minha: true, x: px, y: py, para: selecionado.o });
        Network.itemNaMinhaMesa(px, py, selecionado.o);
        return;
      }
      feitos.push({ obj: true, c: col, r: row, de: m.objetos[row][col], para: selecionado.o });
      Network.editarObjetoMapa(col, row, selecionado.o);
      return;
    }

    // Uma peca grande vira um passo so no desfazer.
    const passo = { celulas: [] };
    celulasDa(col, row).forEach(([c, r]) => {
      if (m.tiles[r][c] === selecionado.t) return;
      passo.celulas.push({ c, r, de: m.tiles[r][c], para: selecionado.t });
      Network.editarMapa(c, r, selecionado.t);
    });
    if (passo.celulas.length) feitos.push(passo);
  }

  function aplicar(passo, voltando) {
    if (passo.obj) {
      // O passo lembra de que camada veio: a sua mesa ou a decoracao da casa.
      // Na mesa, desfazer e tirar de volta o que foi posto naquele ponto; nao
      // existe "valor anterior", porque varias coisas convivem no mesmo lugar.
      if (passo.minha) {
        Network.itemNaMinhaMesa(passo.x, passo.y, voltando ? 0 : passo.para);
        return;
      }
      Network.editarObjetoMapa(passo.c, passo.r, voltando ? passo.de : passo.para);
      return;
    }
    passo.celulas.forEach((cel) => {
      Network.editarMapa(cel.c, cel.r, voltando ? cel.de : cel.para);
    });
  }

  function desfazer() {
    const ultimo = feitos.pop();
    if (!ultimo) return;
    refazer.push(ultimo);
    aplicar(ultimo, true);
  }

  function refazerUltimo() {
    const passo = refazer.pop();
    if (!passo) return;
    feitos.push(passo);
    aplicar(passo, false);
  }

  // ---------- abrir/fechar ----------

  function abrir() {
    if (!souAdmin && !tenhoMesa) return;
    aberto = true;
    painel.classList.remove('oculto');
    document.getElementById('btn-decorar').classList.add('ativo');
    render();
  }

  function fechar() {
    aberto = false;
    selecionado = null;
    painel.classList.add('oculto');
    document.getElementById('btn-decorar').classList.remove('ativo');
    // Se o painel foi aberto pela plantinha do cartao, a camera ficou colada na
    // mesa. Fechar aqui e o fim daquele passeio.
    Game.soltarFoco();
  }

  function init(ehAdmin) {
    souAdmin = !!ehAdmin;
    painel = document.getElementById('painel-decorador');
    gradeEl = document.getElementById('decor-grade');
    buscaEl = document.getElementById('decor-busca');
    abasEl = document.getElementById('decor-abas');

    const botao = document.getElementById('btn-decorar');
    const titulo = document.getElementById('decor-titulo');

    // A diretoria decora a casa toda; quem tem mesa decora a propria. Quem nao
    // e nem uma coisa nem outra nao ve o botao (o servidor recusa de qualquer
    // jeito - o botao escondido e so conforto).
    function atualizarBotao() {
      const podeAbrir = souAdmin || tenhoMesa;
      botao.classList.toggle('oculto', !podeAbrir);
      botao.title = souAdmin ? 'Decorar o escritorio' : 'Personalizar a minha mesa';
      if (titulo) titulo.textContent = souAdmin ? 'Decorador' : 'Minha mesa';
      // Perdeu a mesa com o painel aberto: fecha, senao ficaria um painel que
      // nao deixa fazer nada.
      if (!podeAbrir && aberto) fechar();
      if (aberto) render();
    }

    Game.aoMudarMinhaMesa((tem) => {
      tenhoMesa = tem;
      atualizarBotao();
    });
    atualizarBotao();

    botao.addEventListener('click', () => (aberto ? fechar() : abrir()));
    document.getElementById('btn-fechar-decorador').addEventListener('click', fechar);
    document.getElementById('decor-desfazer').addEventListener('click', desfazer);
    document.getElementById('decor-refazer').addEventListener('click', refazerUltimo);

    buscaEl.addEventListener('input', () => {
      filtro = buscaEl.value;
      render();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && selecionado) {
        selecionado = null;
        render();
      }
    });
  }

  // true quando o item na mao e de apoiar em cima de movel - e quando faz
  // sentido mostrar a malha das superficies.
  function pintandoEmCima() {
    return estaPintando() && ehObjeto(selecionado) && !!selecionado.o;
  }

  // Atalho do menu da mesa: abre ja na aba certa, com a busca limpa, pra quem
  // clicou em "Personalizar" nao cair numa aba de parede.
  function abrirEmCima() {
    abaAtual = 'emcima';
    filtro = '';
    if (buscaEl) buscaEl.value = '';
    abrir();
  }

  window.Decorador = {
    init, estaPintando, pintarEm, podeColocarEm, desenharPreviaNoMapa, pintandoEmCima,
    abrirEmCima,
  };
})();

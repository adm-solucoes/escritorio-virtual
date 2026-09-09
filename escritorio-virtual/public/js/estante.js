// A estante: chegar perto de uma no mapa abre o acervo de livros da sede.
//
// O ponto e nao ter que ir atras do link. A pasta do Drive existe, mas mora num
// lugar que ninguem lembra; aqui ela fica onde faz sentido procurar por um
// livro - na estante. Encostou, abriu.
//
// Painel LATERAL, nao tela cheia, e de proposito: ele abre sozinho quando voce
// passa perto, entao nao pode tapar o mapa nem impedir de continuar andando.
(function () {
  const RAIO_ENTRAR = 46;   // px. Pouco mais de um tile: precisa encostar mesmo.
  const RAIO_SAIR = 78;     // maior que o de entrar, senao fica abrindo e fechando

  let painel, listaEl, avisoEl, pastaBtn, contaEl, buscaEl;
  let formEl, campoPasta, blocoPasta;
  let aberto = false;
  let porProximidade = false;   // aberto sozinho? entao fechar sozinho tambem
  let dispensado = false;       // fechou na mao: nao reabre ate sair de perto
  let dados = { pasta: '', livros: [] };
  let carregado = false;
  let filtro = '';
  let euSouAdmin = false;
  let meuUid = null;

  // Centro de cada celula de estante, em pixels. Refeito de vez em quando
  // porque o decorador pode por (ou tirar) estante com o jogo rodando.
  let pontos = [];
  let quadrosAteRefazer = 0;

  function mapearEstantes() {
    const M = window.OfficeMap;
    if (!M) return;
    const T = M.TILE;
    const novos = [];
    for (let r = 0; r < M.ROWS; r++) {
      for (let c = 0; c < M.COLS; c++) {
        if (M.tiles[r][c] === M.ESTANTE) novos.push([c * T + T / 2, r * T + T / 2]);
      }
    }
    pontos = novos;
  }

  // ------------------------------------------------------------------ dados

  async function buscar() {
    try {
      const r = await fetch('/api/estante');
      if (!r.ok) throw new Error('estante indisponivel');
      dados = await r.json();
      carregado = true;
      avisar('');
    } catch (e) {
      avisar('Nao consegui abrir a estante agora.');
    }
    render();
  }

  async function mandar(caminho, metodo, corpo) {
    try {
      const r = await fetch(caminho, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) { avisar(json.erro || 'Nao deu certo.'); return false; }
      dados = json;
      avisar('');
      render();
      return true;
    } catch (e) {
      avisar('Sem conexao com o servidor.');
      return false;
    }
  }

  // ------------------------------------------------------------------- tela

  function avisar(texto) {
    if (!avisoEl) return;
    avisoEl.textContent = texto;
    avisoEl.classList.toggle('oculto', !texto);
  }

  function cartaoDeLivro(l) {
    const el = document.createElement('div');
    el.className = 'estante-livro';

    const link = document.createElement('a');
    link.className = 'estante-livro-abrir';
    link.href = l.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const titulo = document.createElement('span');
    titulo.className = 'estante-livro-titulo';
    titulo.textContent = l.titulo;
    link.appendChild(titulo);

    const linha = document.createElement('span');
    linha.className = 'estante-livro-linha';
    linha.textContent = [l.autor, l.tag].filter(Boolean).join(' · ');
    if (linha.textContent) link.appendChild(linha);
    el.appendChild(link);

    // So quem pos (ou a diretoria) ve o botao de tirar. O servidor confere de
    // novo - esconder na tela e conveniencia, nao seguranca.
    if (l.porUid === meuUid || euSouAdmin) {
      const tirar = document.createElement('button');
      tirar.type = 'button';
      tirar.className = 'estante-tirar';
      tirar.title = 'Tirar da estante';
      tirar.innerHTML = '&#10005;';
      tirar.addEventListener('click', () => {
        mandar('/api/estante/livro/' + encodeURIComponent(l.id), 'DELETE');
      });
      el.appendChild(tirar);
    }
    return el;
  }

  // Quem sou eu vem do Game a cada desenho, e nao de um parametro guardado no
  // init: quando a estante inicia, a conexao ainda nao respondeu quem entrou -
  // guardar ali dava `undefined` pra sempre, e ninguem via o botao de tirar.
  function quemSouEu() {
    if (!window.Game || !Game.getSelfUid) return;
    meuUid = Game.getSelfUid();
    const eu = Game.getPlayers && Game.getPlayers().get(Game.getSelfId());
    euSouAdmin = !!(eu && eu.isAdmin);
  }

  function render() {
    if (!listaEl) return;
    quemSouEu();

    pastaBtn.classList.toggle('oculto', !dados.pasta);
    if (dados.pasta) pastaBtn.href = dados.pasta;
    if (blocoPasta) blocoPasta.classList.toggle('oculto', !euSouAdmin);
    if (campoPasta && document.activeElement !== campoPasta) campoPasta.value = dados.pasta || '';

    const busca = filtro.toLowerCase();
    const visiveis = dados.livros.filter((l) => !busca
      || (l.titulo + ' ' + (l.autor || '') + ' ' + (l.tag || '')).toLowerCase().includes(busca));

    contaEl.textContent = dados.livros.length
      ? (visiveis.length === dados.livros.length
        ? dados.livros.length + (dados.livros.length === 1 ? ' livro' : ' livros')
        : visiveis.length + ' de ' + dados.livros.length)
      : '';

    listaEl.innerHTML = '';
    if (!carregado) return;

    if (!dados.livros.length) {
      const vazio = document.createElement('p');
      vazio.className = 'estante-vazia';
      vazio.textContent = euSouAdmin
        ? 'A estante esta vazia. Cole aqui embaixo o link da pasta do Drive e va somando os livros.'
        : 'A estante esta vazia. Assim que a diretoria ligar a pasta do Drive, os livros aparecem aqui.';
      listaEl.appendChild(vazio);
      return;
    }
    if (!visiveis.length) {
      const nada = document.createElement('p');
      nada.className = 'estante-vazia';
      nada.textContent = 'Nenhum livro com "' + filtro + '".';
      listaEl.appendChild(nada);
      return;
    }
    visiveis.forEach((l) => listaEl.appendChild(cartaoDeLivro(l)));
  }

  // ------------------------------------------------------------ abrir/fechar

  function abrir(deProximidade) {
    if (aberto) return;
    aberto = true;
    porProximidade = !!deProximidade;
    painel.classList.remove('oculto');
    // Desenha o que ja tem e SEMPRE vai buscar de novo. A primeira versao so
    // buscava uma vez ("ja carregou, entao ja sei"): livro que outra pessoa
    // punha na estante nao aparecia pra mais ninguem ate recarregar a pagina -
    // numa estante compartilhada, isso e a coisa toda.
    render();
    buscar();
  }

  function fechar(naMao) {
    if (!aberto) return;
    aberto = false;
    painel.classList.add('oculto');
    if (naMao) dispensado = true;   // so volta a abrir depois de sair de perto
    porProximidade = false;
  }

  // Chamado pelo laco do jogo, com a pessoa local.
  function verProximidade(self) {
    if (!self || !painel) return;
    if (quadrosAteRefazer-- <= 0) { mapearEstantes(); quadrosAteRefazer = 60; }
    if (!pontos.length) return;

    let menor = Infinity;
    for (let i = 0; i < pontos.length; i++) {
      const d = Math.hypot(pontos[i][0] - self.x, pontos[i][1] - self.y);
      if (d < menor) menor = d;
    }

    if (menor < RAIO_ENTRAR) {
      if (!aberto && !dispensado) abrir(true);
    } else if (menor > RAIO_SAIR) {
      dispensado = false;
      if (aberto && porProximidade) fechar(false);
    }
  }

  // ------------------------------------------------------------------ init

  function iniciar() {
    painel = document.getElementById('painel-estante');
    if (!painel) return;

    listaEl = document.getElementById('estante-lista');
    avisoEl = document.getElementById('estante-aviso');
    pastaBtn = document.getElementById('estante-pasta-link');
    contaEl = document.getElementById('estante-conta');
    buscaEl = document.getElementById('estante-busca');
    formEl = document.getElementById('estante-form');
    campoPasta = document.getElementById('estante-pasta-campo');
    blocoPasta = document.getElementById('estante-pasta-bloco');

    document.getElementById('btn-fechar-estante')
      .addEventListener('click', () => fechar(true));
    const botao = document.getElementById('btn-estante');
    if (botao) botao.addEventListener('click', () => (aberto ? fechar(true) : abrir(false)));

    buscaEl.addEventListener('input', () => { filtro = buscaEl.value.trim(); render(); });

    formEl.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const corpo = {
        titulo: document.getElementById('estante-titulo').value,
        autor: document.getElementById('estante-autor').value,
        url: document.getElementById('estante-url').value,
        tag: document.getElementById('estante-tag').value,
      };
      if (await mandar('/api/estante/livro', 'POST', corpo)) formEl.reset();
    });

    if (blocoPasta) {
      document.getElementById('estante-pasta-salvar').addEventListener('click', () => {
        mandar('/api/estante/pasta', 'PUT', { url: campoPasta.value });
      });
    }

    mapearEstantes();
    buscar();
  }

  window.Estante = { iniciar, verProximidade, abrir, fechar };
})();

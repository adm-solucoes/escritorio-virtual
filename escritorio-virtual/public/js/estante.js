// A estante: clicar numa estante do mapa abre o acervo de livros da sede.
//
// COMO ABRE E COMO FECHA
// Abre no CLIQUE, e so no clique. A primeira versao abria por proximidade e era
// irritante do jeito mais bobo: voce fechava o painel, dava um passo, e ele
// voltava - o mapa tem estante em quase toda parede. Agora e uma decisao sua.
//
// E fecha quando voce vai embora: clicar no chao pra andar, `Esc`, ou o X. Sair
// dali e sair dali.
//
// O QUE APARECE
// So a CAPA. Nao e economia de tela, e o jeito que a gente procura livro:
// bate o olho na lombada e reconhece. Titulo e autor ficam pro passar o mouse.
// Aqui nao se cadastra livro nem se mexe na pasta - estante e pra pegar e ler.
// Livro entra pelo `server/data/estante.json` (ver docs/estante.md).
(function () {
  let painel, gradeEl, avisoEl, pastaBtn, contaEl;
  let aberto = false;
  let dados = { pasta: '', livros: [] };
  let carregado = false;

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

  // ------------------------------------------------------------------- tela

  function avisar(texto) {
    if (!avisoEl) return;
    avisoEl.textContent = texto;
    avisoEl.classList.toggle('oculto', !texto);
  }

  // Cor estavel a partir do titulo: o mesmo livro tem sempre a mesma capa
  // falsa. Sorteio na hora daria uma capa diferente a cada abertura, e a
  // estante deixaria de ser reconhecivel de relance - que e todo o ponto dela.
  function tomDoTitulo(titulo) {
    let h = 0;
    for (let i = 0; i < titulo.length; i++) h = (h * 31 + titulo.charCodeAt(i)) % 360;
    return h;
  }

  function capaFalsa(l) {
    const div = document.createElement('div');
    div.className = 'estante-capa-desenhada';
    const tom = tomDoTitulo(l.titulo);
    div.style.setProperty('--tom', tom);
    const t = document.createElement('span');
    t.className = 'estante-capa-desenhada-titulo';
    t.textContent = l.titulo;
    div.appendChild(t);
    if (l.autor) {
      const a = document.createElement('span');
      a.className = 'estante-capa-desenhada-autor';
      a.textContent = l.autor;
      div.appendChild(a);
    }
    return div;
  }

  function cartaoDeLivro(l) {
    const el = document.createElement('a');
    el.className = 'estante-capa';
    el.href = l.url;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.title = [l.titulo, l.autor].filter(Boolean).join(' — ');

    if (l.capa) {
      const img = document.createElement('img');
      img.src = l.capa;
      img.alt = l.titulo;
      img.loading = 'lazy';
      // Capa que nao carrega deixaria um buraco branco no meio da grade; a
      // desenhada entra no lugar e a fileira continua inteira.
      img.addEventListener('error', () => {
        if (img.parentNode === el) el.replaceChild(capaFalsa(l), img);
      });
      el.appendChild(img);
    } else {
      el.appendChild(capaFalsa(l));
    }

    const faixa = document.createElement('span');
    faixa.className = 'estante-capa-faixa';
    faixa.textContent = l.titulo;
    el.appendChild(faixa);
    return el;
  }

  function render() {
    if (!gradeEl) return;

    pastaBtn.classList.toggle('oculto', !dados.pasta);
    if (dados.pasta) pastaBtn.href = dados.pasta;
    contaEl.textContent = dados.livros.length
      ? dados.livros.length + (dados.livros.length === 1 ? ' livro' : ' livros')
      : '';

    gradeEl.innerHTML = '';
    if (!carregado) return;

    if (!dados.livros.length) {
      const vazio = document.createElement('p');
      vazio.className = 'estante-vazia';
      vazio.textContent = dados.pasta
        ? 'Nada na estante ainda. A pasta do Drive esta ali em cima.'
        : 'Nada na estante ainda.';
      gradeEl.appendChild(vazio);
      return;
    }
    dados.livros.forEach((l) => gradeEl.appendChild(cartaoDeLivro(l)));
  }

  // ------------------------------------------------------------ abrir/fechar

  function abrir() {
    if (!painel || aberto) return;
    aberto = true;
    painel.classList.remove('oculto');
    // Desenha o que ja tem e busca de novo: numa estante compartilhada, livro
    // posto por outra pessoa precisa aparecer sem recarregar a pagina.
    render();
    buscar();
  }

  function fechar() {
    if (!painel || !aberto) return;
    aberto = false;
    painel.classList.add('oculto');
  }

  // ------------------------------------------------------------------ init

  function iniciar() {
    painel = document.getElementById('painel-estante');
    if (!painel) return;

    gradeEl = document.getElementById('estante-lista');
    avisoEl = document.getElementById('estante-aviso');
    pastaBtn = document.getElementById('estante-pasta-link');
    contaEl = document.getElementById('estante-conta');

    document.getElementById('btn-fechar-estante').addEventListener('click', fechar);
    const botao = document.getElementById('btn-estante');
    if (botao) botao.addEventListener('click', () => (aberto ? fechar() : abrir()));

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && aberto) fechar();
    });
  }

  window.Estante = { iniciar, abrir, fechar, estaAberta: () => aberto };
})();

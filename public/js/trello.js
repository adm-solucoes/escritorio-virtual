// Aba do Trello: mostra o quadro da ADM Solucoes, o mesmo que o CRM le.
// Ver docs/plano-trello.md.
//
// Somente leitura: o quadro continua sendo editado no Trello. Aqui e pra bater
// o olho sem sair da sede.
(function () {
  // Cores das etiquetas do Trello -> cor de tela. Sao os nomes que a API manda.
  const COR_ETIQUETA = {
    green: '#1f9c58', yellow: '#d9a800', orange: '#e07b20', red: '#d64541',
    purple: '#8b5cd6', blue: '#2f74d0', sky: '#33a3c4', lime: '#61bd4f',
    pink: '#e56ba8', black: '#4a5162',
  };

  let painel, colunasEl, tituloEl, linkEl, avisoEl;
  let aberto = false;
  let carregado = false;

  function textoPrazo(iso) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return null;
    const dias = Math.round((d - new Date()) / 86400000);
    const data = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    if (dias < 0) return { texto: data + ' (atrasado)', atrasado: true };
    if (dias === 0) return { texto: 'hoje', atrasado: false };
    if (dias === 1) return { texto: 'amanha', atrasado: false };
    return { texto: data, atrasado: false };
  }

  function montarCartao(c) {
    const el = document.createElement('a');
    el.className = 'trello-cartao';
    el.href = c.url;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';

    if (c.etiquetas.length) {
      const faixa = document.createElement('div');
      faixa.className = 'trello-etiquetas';
      c.etiquetas.forEach((e) => {
        const t = document.createElement('span');
        t.className = 'trello-etiqueta';
        t.style.background = COR_ETIQUETA[e.cor] || '#8b98a8';
        t.textContent = e.nome;
        faixa.appendChild(t);
      });
      el.appendChild(faixa);
    }

    const nome = document.createElement('div');
    nome.className = 'trello-cartao-nome';
    nome.textContent = c.nome;
    el.appendChild(nome);

    const rodape = document.createElement('div');
    rodape.className = 'trello-cartao-rodape';

    if (c.prazo) {
      const p = textoPrazo(c.prazo);
      if (p) {
        const badge = document.createElement('span');
        badge.className = 'trello-prazo'
          + (c.prazoConcluido ? ' concluido' : (p.atrasado ? ' atrasado' : ''));
        badge.textContent = p.texto;
        rodape.appendChild(badge);
      }
    }

    if (c.membros.length) {
      const m = document.createElement('span');
      m.className = 'trello-membros';
      // so as iniciais: o cartao e estreito
      m.textContent = c.membros
        .map((n) => n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase())
        .join(' ');
      m.title = c.membros.join(', ');
      rodape.appendChild(m);
    }

    if (rodape.childNodes.length) el.appendChild(rodape);
    return el;
  }

  function receber(quadro) {
    carregado = true;
    avisoEl.classList.add('oculto');
    colunasEl.innerHTML = '';

    if (quadro.indisponivel) {
      avisoEl.textContent = quadro.indisponivel;
      avisoEl.classList.remove('oculto');
    }

    tituloEl.textContent = quadro.nome || 'Quadro';
    if (quadro.url) {
      linkEl.href = quadro.url;
      linkEl.classList.remove('oculto');
    } else {
      linkEl.classList.add('oculto');
    }

    (quadro.listas || []).forEach((lista) => {
      const col = document.createElement('div');
      col.className = 'trello-coluna';

      const topo = document.createElement('div');
      topo.className = 'trello-coluna-topo';
      const nome = document.createElement('span');
      nome.textContent = lista.nome;
      const conta = document.createElement('b');
      conta.textContent = lista.cartoes.length;
      topo.appendChild(nome);
      topo.appendChild(conta);
      col.appendChild(topo);

      const corpo = document.createElement('div');
      corpo.className = 'trello-coluna-corpo';
      if (lista.cartoes.length === 0) {
        const vazio = document.createElement('div');
        vazio.className = 'trello-vazio';
        vazio.textContent = 'Nada aqui';
        corpo.appendChild(vazio);
      } else {
        lista.cartoes.forEach((c) => corpo.appendChild(montarCartao(c)));
      }
      col.appendChild(corpo);

      colunasEl.appendChild(col);
    });
  }

  function abrir() {
    aberto = true;
    painel.classList.remove('oculto');
    if (!carregado) {
      avisoEl.textContent = 'Carregando o quadro...';
      avisoEl.classList.remove('oculto');
    }
    Network.pedirTrello();
  }

  function fechar() {
    aberto = false;
    painel.classList.add('oculto');
  }

  function init() {
    painel = document.getElementById('painel-trello');
    colunasEl = document.getElementById('trello-colunas');
    tituloEl = document.getElementById('trello-titulo');
    linkEl = document.getElementById('trello-link');
    avisoEl = document.getElementById('trello-aviso');

    document.getElementById('btn-trello').addEventListener('click', () => (aberto ? fechar() : abrir()));
    document.getElementById('btn-fechar-trello').addEventListener('click', fechar);
    document.getElementById('btn-atualizar-trello').addEventListener('click', () => {
      avisoEl.textContent = 'Atualizando...';
      avisoEl.classList.remove('oculto');
      Network.pedirTrello();
    });

    Network.on('trello', receber);
  }

  window.Trello = { init, abrir };
})();

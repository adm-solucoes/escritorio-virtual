// Painel de "Convidar visitante", so pra diretoria. Gera o link, copia, e
// permite matar todos os links de uma vez.
// Ver docs/plano-convidado.md.
(function () {
  let painel, campoLink, validadeEl, btnAbrir;

  async function pedir(rota, corpo) {
    const resposta = await fetch('/api' + rota, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(corpo || {}),
    });
    let dados = null;
    try { dados = await resposta.json(); } catch (e) { dados = null; }
    if (!resposta.ok) throw new Error((dados && dados.erro) || 'Nao consegui falar com o servidor.');
    return dados;
  }

  function quando(ms) {
    const d = new Date(ms);
    return d.toLocaleDateString('pt-BR') + ' as ' + d.toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit',
    });
  }

  async function abrir() {
    painel.classList.remove('oculto');
    campoLink.value = 'gerando...';
    validadeEl.textContent = '';
    try {
      const r = await pedir('/convite');
      // `caminho` vem do servidor, a origem vem do navegador: assim o link sai
      // certo tanto em localhost quanto no endereco publico, sem o servidor
      // precisar adivinhar em que dominio ele esta atendendo.
      campoLink.value = location.origin + r.caminho;
      validadeEl.textContent = 'Vale ate ' + quando(r.expiraEm) + '.';
      campoLink.focus();
      campoLink.select();
    } catch (e) {
      campoLink.value = '';
      validadeEl.textContent = e.message;
    }
  }

  function fechar() {
    painel.classList.add('oculto');
  }

  async function copiar() {
    const botao = document.getElementById('btn-copiar-convite');
    if (!campoLink.value) return;
    campoLink.select();
    try {
      await navigator.clipboard.writeText(campoLink.value);
    } catch (e) {
      // Sem HTTPS (ou sem permissao) a area de transferencia nao existe. O texto
      // ja esta selecionado, entao Ctrl+C resolve - e o aviso conta isso.
      botao.textContent = 'Aperte Ctrl+C';
      setTimeout(() => { botao.textContent = 'Copiar'; }, 2500);
      return;
    }
    botao.textContent = 'Copiado';
    setTimeout(() => { botao.textContent = 'Copiar'; }, 1800);
  }

  async function revogar() {
    const botao = document.getElementById('btn-revogar-convites');
    botao.disabled = true;
    try {
      await pedir('/convite/revogar');
      campoLink.value = '';
      validadeEl.textContent = 'Pronto: todos os links antigos pararam de valer. '
        + 'Quem ja estava dentro continua - a sessao dele nao depende do link.';
    } catch (e) {
      validadeEl.textContent = e.message;
    } finally {
      botao.disabled = false;
    }
  }

  // Chamado pelo main.js quando a conta carrega: so diretoria ve o botao.
  function mostrarPara(usuario) {
    btnAbrir.classList.toggle('oculto', !(usuario && usuario.isAdmin));
  }

  function init(aoAbrir) {
    painel = document.getElementById('painel-convite');
    campoLink = document.getElementById('convite-link');
    validadeEl = document.getElementById('convite-validade');
    btnAbrir = document.getElementById('btn-convidar');

    btnAbrir.addEventListener('click', () => {
      if (aoAbrir) aoAbrir();   // fecha o menu da conta
      abrir();
    });
    document.getElementById('btn-fechar-convite').addEventListener('click', fechar);
    document.getElementById('btn-copiar-convite').addEventListener('click', copiar);
    document.getElementById('btn-revogar-convites').addEventListener('click', revogar);
    painel.addEventListener('click', (ev) => { if (ev.target === painel) fechar(); });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !painel.classList.contains('oculto')) fechar();
    });
  }

  window.Convite = { init, mostrarPara, abrir, fechar };
})();

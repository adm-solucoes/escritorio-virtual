// Arranque: login -> avatar (so no primeiro acesso) -> entrada -> escritorio.
// A tela de entrada aparece sempre, mesmo com a sessao ja salva, pra pessoa
// conferir camera e microfone antes de aparecer no mapa.
// Ver docs/plano-login.md, secao 7.
(function () {
  const telaCriador = document.getElementById('tela-criador');
  const telaJogo = document.getElementById('tela-jogo');
  const menuConta = document.getElementById('menu-conta');
  let iniciado = false;
  let contaAtual = null;

  function entrarNoJogo(perfil) {
    telaCriador.classList.add('oculto');
    Auth.esconder();
    Entrada.esconder();
    telaJogo.classList.remove('oculto');
    contaAtual = Object.assign({}, contaAtual, { nome: perfil.name });
    preencherMenu(contaAtual);
    if (!iniciado) {
      Game.init(perfil);
      iniciado = true;
    }
  }

  function abrirEntrada() {
    telaJogo.classList.add('oculto');
    telaCriador.classList.add('oculto');
    Auth.esconder();
    Entrada.mostrar(contaAtual);
  }

  function abrirCriador() {
    telaJogo.classList.add('oculto');
    Auth.esconder();
    Entrada.esconder();
    telaCriador.classList.remove('oculto');
    Creator.init(contaAtual, (perfil) => {
      contaAtual = Object.assign({}, contaAtual, {
        nome: perfil.name,
        appearance: perfil.appearance,
      });
      // O Game so aceita init uma vez; depois disso a troca de avatar exige
      // reconectar, entao recarrega (a sessao continua no cookie).
      if (iniciado) location.reload();
      else abrirEntrada();
    });
  }

  // Primeiro acesso (sem avatar) monta o boneco antes; o resto vai pra entrada.
  function depoisDoLogin(usuario) {
    contaAtual = usuario;
    preencherMenu(usuario);
    if (usuario.appearance) abrirEntrada();
    else abrirCriador();
  }

  function preencherMenu(usuario) {
    document.getElementById('menu-conta-nome').textContent = usuario.nome;
    document.getElementById('menu-conta-email').textContent = usuario.email;
  }

  function fecharMenu() {
    menuConta.classList.add('oculto');
  }

  Auth.init(depoisDoLogin);
  Entrada.init(entrarNoJogo, abrirCriador);

  document.getElementById('btn-conta').addEventListener('click', (ev) => {
    ev.stopPropagation();
    menuConta.classList.toggle('oculto');
  });
  document.addEventListener('click', (ev) => {
    if (!menuConta.contains(ev.target)) fecharMenu();
  });

  document.getElementById('btn-trocar-avatar').addEventListener('click', () => {
    fecharMenu();
    abrirCriador();
  });

  // So faz sentido oferecer "largar" pra quem tem mesa, entao o item aparece e
  // some junto com a mesa. `Game` avisa a cada atualizacao da lista.
  const btnLargarMesa = document.getElementById('btn-largar-mesa');
  btnLargarMesa.addEventListener('click', () => {
    fecharMenu();
    Network.largarMesa();
  });
  Game.aoMudarMinhaMesa((tem) => btnLargarMesa.classList.toggle('oculto', !tem));

  document.getElementById('btn-sair').addEventListener('click', async () => {
    fecharMenu();
    try { await Auth.sair(); } catch (e) { /* segue pro login do mesmo jeito */ }
    location.reload();
  });

  // Quem ja tem sessao nao ve a tela de login.
  Auth.eu().then(depoisDoLogin).catch(() => Auth.mostrar());
})();

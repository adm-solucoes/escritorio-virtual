(function () {
  const telaCriador = document.getElementById('tela-criador');
  const telaJogo = document.getElementById('tela-jogo');
  let iniciado = false;

  function entrarNoJogo(profile) {
    telaCriador.classList.add('oculto');
    telaJogo.classList.remove('oculto');
    if (!iniciado) {
      Game.init(profile);
      iniciado = true;
    }
  }

  Creator.init(entrarNoJogo);

  document.getElementById('btn-sair').addEventListener('click', () => {
    location.reload();
  });
})();

// Cartao que abre ao clicar numa mesa. Ver docs/plano-mesa-pessoal.md, secao 9.
//
// O formato e o do print `13-menu-largar-mesa.png`: bolinha com a inicial e o
// status, nome, "entrou em", um botao primario e dois de icone - a plantinha e
// o "...". A plantinha e o que decora a mesa; o "..." guarda o largar.
//
// Na mesa de outra pessoa o cartao vira so identificacao: os botoes somem,
// porque nao ha nada que voce possa fazer com a mesa dela.
(() => {
  let caixa, avatarEl, statusEl, nomeEl, desdeEl, acoesEl, maisEl, btnMais, btnPersonalizar;
  let aberta = null;

  // `manterFoco` = fecha o cartao mas continua perto da mesa. E o caso de abrir
  // o decorador pela plantinha: seria absurdo afastar bem na hora de escolher
  // onde pousar as coisas. Quem solta o foco ali e o decorador, ao fechar.
  function fechar(manterFoco) {
    if (!caixa) return;
    caixa.classList.add('oculto');
    maisEl.classList.add('oculto');
    aberta = null;
    if (!manterFoco) Game.soltarFoco();
  }

  // Encosta no ponto clicado sem vazar pra fora da janela.
  function posicionar(x, y) {
    caixa.classList.remove('oculto');
    const r = caixa.getBoundingClientRect();
    const margem = 10;
    caixa.style.left = Math.min(Math.max(margem, x + 12), window.innerWidth - r.width - margem) + 'px';
    caixa.style.top = Math.min(Math.max(margem, y - r.height / 2), window.innerHeight - r.height - margem) + 'px';
  }

  function abrir(mesa, x, y) {
    if (!caixa || !mesa) return;
    aberta = mesa;
    const minha = mesa.donoUid && mesa.donoUid === Game.getSelfUid();
    const dono = donoConectado(mesa.donoUid);

    const nome = mesa.donoNome || 'Alguem';
    nomeEl.textContent = nome;
    avatarEl.textContent = nome.trim().slice(0, 1).toUpperCase();
    avatarEl.style.background = (dono && dono.appearance && dono.appearance.shirt) || 'var(--roxo)';

    // A bolinha de status so faz sentido pra quem esta online; offline ela some
    // em vez de mentir que a pessoa esta livre.
    statusEl.style.display = dono ? '' : 'none';
    if (dono) statusEl.style.background = Game.STATUS_COR[dono.status] || '#63d9c4';

    desdeEl.textContent = minha ? 'Esta e a sua mesa' : (dono ? 'Esta na sede agora' : 'Fora da sede agora');
    acoesEl.classList.toggle('oculto', !minha);
    maisEl.classList.add('oculto');
    posicionar(x, y);
    // Chega perto: e daqui que a pessoa vai escolher onde pousar cada coisa.
    Game.focarNaMesa(mesa.celulas);
  }

  function donoConectado(uid) {
    let achado = null;
    Game.getPlayers().forEach((p) => { if (p.uid === uid) achado = p; });
    return achado;
  }

  function init() {
    caixa = document.getElementById('cartao-mesa');
    if (!caixa) return;
    avatarEl = document.getElementById('cartao-mesa-avatar');
    statusEl = document.getElementById('cartao-mesa-status');
    nomeEl = document.getElementById('cartao-mesa-nome');
    desdeEl = document.getElementById('cartao-mesa-sub');
    acoesEl = document.getElementById('cartao-mesa-acoes');
    maisEl = document.getElementById('cartao-mesa-mais');
    btnMais = document.getElementById('btn-cartao-mesa-mais');
    btnPersonalizar = document.getElementById('btn-cartao-personalizar');

    document.getElementById('btn-fechar-cartao-mesa').addEventListener('click', () => fechar());

    btnPersonalizar.addEventListener('click', () => {
      fechar(true);
      Decorador.abrirEmCima();
    });

    document.getElementById('btn-cartao-editar').addEventListener('click', () => {
      fechar();
      document.getElementById('btn-trocar-avatar').click();
    });

    btnMais.addEventListener('click', (e) => {
      e.stopPropagation();
      maisEl.classList.toggle('oculto');
    });

    document.getElementById('btn-cartao-largar').addEventListener('click', () => {
      fechar();
      Network.largarMesa();
    });

    document.addEventListener('mousedown', (e) => {
      if (aberta && !caixa.contains(e.target)) fechar();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') fechar();
    });
  }

  window.CartaoMesa = { init, abrir, fechar };
})();

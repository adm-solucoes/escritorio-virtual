// Visao de salas: painel com um card por ambiente da sede, mostrando quem esta
// em cada um agora (calculado a partir da posicao de cada jogador no mapa).
(function () {
  let painel, grade, btnToggle, btnFechar;
  let aberto = false;
  let intervalId = null;

  function iniciais(nome) {
    return (nome || '?').trim().slice(0, 2).toUpperCase();
  }

  function criarChip(p, selfId) {
    const chip = document.createElement('div');
    chip.className = 'avatar-chip' + (p.id === selfId ? ' avatar-chip-voce' : '');
    chip.style.background = p.appearance.skin;
    chip.style.borderColor = Game.STATUS_COR[p.status] || Game.STATUS_COR.livre;
    chip.title = (p.isAdmin ? '👑 ' : '') + p.name + ' · ' + (Game.STATUS_LABEL[p.status] || '');

    const label = document.createElement('span');
    label.className = 'avatar-chip-texto';
    label.textContent = iniciais(p.name);
    chip.appendChild(label);

    if (p.isAdmin) {
      const coroa = document.createElement('span');
      coroa.className = 'avatar-chip-coroa';
      coroa.textContent = '👑';
      chip.appendChild(coroa);
    }
    return chip;
  }

  function atualizar() {
    if (!aberto) return;
    const players = Game.getPlayers();
    const selfId = Game.getSelfId();

    const porSala = new Map();
    OfficeMap.ROOMS.forEach((s) => porSala.set(s.id, []));
    players.forEach((p) => {
      // displayX/displayY (nao x/y) refletem a posicao atual tanto do jogador
      // local quanto dos remotos, que sao interpolados a cada frame em game.js.
      const sala = OfficeMap.getRoomAt(p.displayX, p.displayY);
      if (sala) porSala.get(sala.id).push(p);
    });

    grade.innerHTML = '';
    OfficeMap.ROOMS.forEach((sala) => {
      const lista = porSala.get(sala.id) || [];

      const card = document.createElement('div');
      card.className = 'sala-card' + (lista.some((p) => p.id === selfId) ? ' sala-atual' : '');

      const header = document.createElement('div');
      header.className = 'sala-header';
      const corPonto = sala.cor || 'var(--texto-fraco)';
      header.innerHTML =
        '<span class="sala-nome"><span class="sala-ponto" style="background:' + corPonto + '"></span>' + sala.nome + '</span>' +
        '<span class="sala-contagem">' + lista.length + '</span>';
      card.appendChild(header);

      const pessoas = document.createElement('div');
      pessoas.className = 'sala-pessoas';
      if (lista.length === 0) {
        pessoas.innerHTML = '<span class="sala-vazia">Vazia</span>';
      } else {
        lista
          .sort((a, b) => a.name.localeCompare(b.name))
          .forEach((p) => pessoas.appendChild(criarChip(p, selfId)));
      }
      card.appendChild(pessoas);

      grade.appendChild(card);
    });
  }

  function abrir() {
    aberto = true;
    painel.classList.remove('oculto');
    atualizar();
    intervalId = setInterval(atualizar, 500);
  }

  function fechar() {
    aberto = false;
    painel.classList.add('oculto');
    clearInterval(intervalId);
  }

  function init() {
    painel = document.getElementById('painel-salas');
    grade = document.getElementById('grade-salas');
    btnToggle = document.getElementById('btn-salas');
    btnFechar = document.getElementById('btn-fechar-salas');

    btnToggle.addEventListener('click', () => (aberto ? fechar() : abrir()));
    btnFechar.addEventListener('click', fechar);
    painel.addEventListener('click', (e) => {
      if (e.target === painel) fechar();
    });
  }

  window.Rooms = { init };
})();

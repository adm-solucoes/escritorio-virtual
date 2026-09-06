// Chat da sede: canais fixos + mensagens diretas, no formato da referencia do
// Gather (coluna de conversas + conversa aberta). Ver docs/plano-chat.md.
// Historico e presenca vivem em memoria no servidor: somem se ele reiniciar.
(function () {
  const EMOJIS_REACAO = ['👍', '😂', '❤️', '🎉', '👏'];
  const JANELA_AGRUPAMENTO = 5 * 60 * 1000; // mensagens seguidas da mesma pessoa

  let painel, listaEl, formEl, inputEl, badgeEl, conversasEl, buscaEl, tituloEl, contagemEl;
  let aberto = false;

  let canais = [];
  let conversaAtual = null;
  const historico = new Map(); // conversaId -> [mensagem]
  const naoLidas = new Map(); // conversaId -> quantidade
  // Nome de quem ja trocou DM com a gente, mesmo offline: e o que faz a conversa
  // continuar na lista depois de recarregar a pagina.
  const nomesConhecidos = new Map(); // uid -> nome
  let filtroBusca = '';

  // ---------- helpers ----------

  // A DM anda pelo uid (estavel), nao pelo id do socket (novo a cada F5).
  function selfUid() { return Game.getSelfUid(); }

  function idDm(outroUid) {
    return 'dm:' + [selfUid(), outroUid].sort().join('|');
  }

  function ehDm(conversaId) { return String(conversaId).startsWith('dm:'); }

  function outroDaDm(conversaId) {
    const partes = conversaId.slice(3).split('|');
    return partes[0] === selfUid() ? partes[1] : partes[0];
  }

  function jogadorPorUid(uid) {
    let achado = null;
    Game.getPlayers().forEach((p) => { if (p.uid === uid) achado = p; });
    return achado;
  }

  function nomeDoUid(uid) {
    const p = jogadorPorUid(uid);
    if (p) return p.name;
    return nomesConhecidos.get(uid) || 'Conversa';
  }

  function nomeDaConversa(conversaId) {
    if (!conversaId) return '';
    if (ehDm(conversaId)) return nomeDoUid(outroDaDm(conversaId));
    const canal = canais.find((c) => 'canal:' + c.id === conversaId);
    return canal ? canal.nome : conversaId;
  }

  function iniciais(nome) {
    return (nome || '?').trim().slice(0, 2).toUpperCase();
  }

  function corDoAutor(autorUid) {
    const p = jogadorPorUid(autorUid);
    return (p && p.appearance && p.appearance.skin) || '#c9cdd6';
  }

  function formatarHora(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function escapar(texto) {
    return texto.replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Formatacao leve do composer. Escapa TUDO antes: o que vier de outra pessoa
  // nunca vira HTML - as unicas tags da string sao as que a gente coloca aqui.
  function formatar(texto) {
    let s = escapar(texto);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    // aceita pontuacao colada depois do fecha-underline ("_italico_," por exemplo)
    s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s),.!?;:]|$)/g, '$1<em>$2</em>');
    s = s.replace(/https?:\/\/[^\s<]+/g, (url) => (
      '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>'
    ));
    return s.replace(/\n/g, '<br>');
  }

  function mensagensDe(conversaId) {
    return historico.get(conversaId) || [];
  }

  function estaNoFim() {
    return listaEl.scrollHeight - listaEl.scrollTop - listaEl.clientHeight < 60;
  }

  // ---------- coluna das conversas ----------

  function montarItemConversa(conversaId, conteudo, naoLidasQtd) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'chat-conversa-item' + (conversaId === conversaAtual ? ' ativa' : '');
    conteudo.forEach((el) => item.appendChild(el));

    if (naoLidasQtd > 0) {
      const badge = document.createElement('span');
      badge.className = 'chat-nao-lidas';
      badge.textContent = naoLidasQtd > 9 ? '9+' : String(naoLidasQtd);
      item.appendChild(badge);
    }

    item.addEventListener('click', () => abrirConversa(conversaId));
    return item;
  }

  function textoEl(classe, texto) {
    const el = document.createElement('span');
    el.className = classe;
    el.textContent = texto;
    return el;
  }

  // `p` e o jogador online, ou null pra quem so existe na conversa antiga.
  function avatarConversa(nome, p) {
    const av = document.createElement('span');
    av.className = 'chat-conversa-avatar';
    av.style.background = (p && p.appearance && p.appearance.skin) || '#c9cdd6';
    av.textContent = iniciais(nome);
    const presenca = document.createElement('span');
    presenca.className = 'chat-conversa-presenca' + (p ? '' : ' offline');
    presenca.style.background = p
      ? (Game.STATUS_COR[p.status] || Game.STATUS_COR.livre)
      : '#c2c7d0';
    av.appendChild(presenca);
    return av;
  }

  function renderConversas() {
    if (!conversasEl) return;
    const filtro = filtroBusca.trim().toLowerCase();
    conversasEl.innerHTML = '';

    const canaisFiltrados = canais.filter((c) => !filtro || c.nome.includes(filtro));
    if (canaisFiltrados.length) {
      conversasEl.appendChild(textoEl('chat-secao', 'Canais'));
      canaisFiltrados.forEach((c) => {
        const id = 'canal:' + c.id;
        conversasEl.appendChild(montarItemConversa(id, [
          textoEl('chat-conversa-cerquilha', '#'),
          textoEl('chat-conversa-nome', c.nome),
        ], naoLidas.get(id) || 0));
      });
    }

    // Quem esta online agora, mais as conversas antigas de quem ja saiu.
    const entradas = new Map(); // uid -> { uid, nome, jogador }
    Game.getPlayers().forEach((p) => {
      if (!p.uid || p.uid === selfUid()) return;
      entradas.set(p.uid, { uid: p.uid, nome: p.name + (p.isAdmin ? ' 👑' : ''), jogador: p });
    });
    nomesConhecidos.forEach((nome, uid) => {
      if (uid === selfUid() || entradas.has(uid)) return;
      entradas.set(uid, { uid, nome, jogador: null });
    });

    const pessoas = Array.from(entradas.values())
      .filter((e) => !filtro || e.nome.toLowerCase().includes(filtro))
      // online primeiro, depois em ordem alfabetica
      .sort((a, b) => (!!b.jogador - !!a.jogador) || a.nome.localeCompare(b.nome));

    conversasEl.appendChild(textoEl('chat-secao', 'Mensagens diretas'));
    if (!pessoas.length) {
      conversasEl.appendChild(textoEl('chat-vazio-lista', 'Ninguem mais online agora.'));
    }
    pessoas.forEach((e) => {
      const id = idDm(e.uid);
      const item = montarItemConversa(id, [
        avatarConversa(e.nome, e.jogador),
        textoEl('chat-conversa-nome', e.nome),
      ], naoLidas.get(id) || 0);
      if (!e.jogador) item.classList.add('offline');
      conversasEl.appendChild(item);
    });
  }

  // ---------- conversa aberta ----------

  function montarAbertura(conversaId) {
    const bloco = document.createElement('div');
    bloco.className = 'chat-abertura';
    const titulo = document.createElement('h4');
    const p = document.createElement('p');

    if (ehDm(conversaId)) {
      titulo.textContent = 'Conversa com ' + nomeDoUid(outroDaDm(conversaId));
      p.textContent = 'So voces dois veem essas mensagens. Elas continuam aqui depois de recarregar a pagina.';
    } else {
      const canal = canais.find((c) => 'canal:' + c.id === conversaId);
      titulo.textContent = 'Comeco do #' + (canal ? canal.nome : '');
      p.textContent = canal ? canal.descricao : '';
    }

    bloco.appendChild(titulo);
    bloco.appendChild(p);
    return bloco;
  }

  function montarReacoes(msg) {
    const reacoes = msg.reacoes || {};
    const emojis = Object.keys(reacoes).filter((e) => (reacoes[e] || []).length);
    if (!emojis.length) return null;

    const wrap = document.createElement('div');
    wrap.className = 'chat-reacoes';
    emojis.forEach((emoji) => {
      const quem = reacoes[emoji];
      const pilula = document.createElement('button');
      pilula.type = 'button';
      pilula.className = 'chat-reacao-pilula' + (quem.includes(selfUid()) ? ' minha' : '');
      pilula.textContent = emoji + ' ' + quem.length;
      pilula.addEventListener('click', () => Network.reagirMensagem(msg.conversa, msg.id, emoji));
      wrap.appendChild(pilula);
    });
    return wrap;
  }

  function montarAcoes(msg) {
    const acoes = document.createElement('div');
    acoes.className = 'chat-msg-acoes';
    EMOJIS_REACAO.forEach((emoji) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = emoji;
      b.title = 'Reagir com ' + emoji;
      b.addEventListener('click', () => Network.reagirMensagem(msg.conversa, msg.id, emoji));
      acoes.appendChild(b);
    });
    return acoes;
  }

  function montarMensagem(msg, anterior) {
    if (msg.sistema) {
      const el = document.createElement('div');
      el.className = 'chat-msg-sistema';
      el.textContent = msg.texto;
      return el;
    }

    const agrupada = !!anterior && !anterior.sistema
      && anterior.autorId === msg.autorId
      && (msg.ts - anterior.ts) < JANELA_AGRUPAMENTO;

    const item = document.createElement('div');
    item.className = 'chat-msg' + (agrupada ? ' agrupada' : '');
    item.dataset.mensagemId = String(msg.id);

    const avatar = document.createElement('div');
    avatar.className = 'chat-msg-avatar';
    avatar.style.background = corDoAutor(msg.autorId);
    avatar.textContent = iniciais(msg.autorNome);
    item.appendChild(avatar);

    const corpo = document.createElement('div');
    corpo.className = 'chat-msg-corpo';

    if (!agrupada) {
      const cabecalho = document.createElement('div');
      cabecalho.className = 'chat-msg-cabecalho';
      const nome = document.createElement('span');
      nome.className = 'chat-msg-nome';
      nome.textContent = (msg.autorIsAdmin ? '👑 ' : '') + msg.autorNome;
      cabecalho.appendChild(nome);
      const hora = document.createElement('span');
      hora.className = 'chat-msg-hora';
      hora.textContent = formatarHora(msg.ts);
      cabecalho.appendChild(hora);
      corpo.appendChild(cabecalho);
    }

    const texto = document.createElement('div');
    texto.className = 'chat-msg-texto';
    texto.innerHTML = formatar(msg.texto); // texto ja escapado dentro de formatar()
    corpo.appendChild(texto);

    const reacoes = montarReacoes(msg);
    if (reacoes) corpo.appendChild(reacoes);

    item.appendChild(corpo);
    item.appendChild(montarAcoes(msg));
    return item;
  }

  function renderConversaAtual(manterRolagem) {
    if (!conversaAtual) return;
    const naoFim = manterRolagem && !estaNoFim();

    tituloEl.textContent = (ehDm(conversaAtual) ? '' : '# ') + nomeDaConversa(conversaAtual);
    if (ehDm(conversaAtual)) {
      contagemEl.textContent = 'conversa direta';
    } else {
      contagemEl.textContent = Game.getPlayers().size + ' na sede';
    }

    const mensagens = mensagensDe(conversaAtual);
    listaEl.innerHTML = '';
    listaEl.appendChild(montarAbertura(conversaAtual));
    mensagens.forEach((msg, i) => listaEl.appendChild(montarMensagem(msg, mensagens[i - 1])));

    if (!naoFim) listaEl.scrollTop = listaEl.scrollHeight;
  }

  // ---------- estado ----------

  function atualizarBadge() {
    let total = 0;
    naoLidas.forEach((n) => { total += n; });
    if (total > 0) {
      badgeEl.textContent = total > 9 ? '9+' : String(total);
      badgeEl.classList.remove('oculto');
    } else {
      badgeEl.classList.add('oculto');
    }
  }

  function abrirConversa(conversaId) {
    conversaAtual = conversaId;
    naoLidas.delete(conversaId);
    atualizarBadge();
    renderConversas();

    if (historico.has(conversaId)) renderConversaAtual(false);
    else {
      listaEl.innerHTML = '';
      tituloEl.textContent = (ehDm(conversaId) ? '' : '# ') + nomeDaConversa(conversaId);
      Network.pedirHistorico(conversaId);
    }
    if (aberto) inputEl.focus();
  }

  function receberMensagem(msg) {
    // Alguem abriu uma DM comigo: guarda o nome pra conversa entrar na lista.
    if (ehDm(msg.conversa) && msg.autorId && msg.autorId !== selfUid()) {
      nomesConhecidos.set(msg.autorId, msg.autorNome);
    }

    const lista = historico.get(msg.conversa);
    if (lista) {
      lista.push(msg);
      if (lista.length > 200) lista.shift();
    } else if (msg.conversa === conversaAtual) {
      historico.set(msg.conversa, [msg]);
    }

    if (msg.conversa === conversaAtual && aberto) {
      renderConversaAtual(true);
      return;
    }
    if (msg.autorId === selfUid() || msg.sistema) return;
    naoLidas.set(msg.conversa, (naoLidas.get(msg.conversa) || 0) + 1);
    atualizarBadge();
    renderConversas();
  }

  function receberHistorico(dado) {
    historico.set(dado.conversa, dado.mensagens || []);
    if (dado.conversa === conversaAtual) renderConversaAtual(false);
  }

  function receberReacao(dado) {
    const lista = historico.get(dado.conversa);
    if (!lista) return;
    const msg = lista.find((m) => m.id === dado.mensagemId);
    if (!msg) return;
    msg.reacoes = dado.reacoes;
    if (dado.conversa === conversaAtual) renderConversaAtual(true);
  }

  // Chamado pelo game quando alguem entra/sai, pra lista de DMs acompanhar.
  function pessoasMudaram() {
    if (aberto) renderConversas();
  }

  function carregarHistorico(dados) {
    canais = (dados && dados.canais) || [];
    // DMs que o servidor ja tinha pra esse uid: e o que reaparece depois do F5.
    ((dados && dados.dms) || []).forEach((d) => nomesConhecidos.set(d.uid, d.nome));
    const padrao = (dados && dados.conversaPadrao) || 'canal:geral';
    historico.set(padrao, (dados && dados.mensagens) || []);
    conversaAtual = padrao;
    renderConversas();
    renderConversaAtual(false);
  }

  // ---------- composer ----------

  function envolverSelecao(prefixo, sufixo) {
    const ini = inputEl.selectionStart;
    const fim = inputEl.selectionEnd;
    const valor = inputEl.value;
    const selecionado = valor.slice(ini, fim) || 'texto';
    inputEl.value = valor.slice(0, ini) + prefixo + selecionado + sufixo + valor.slice(fim);
    inputEl.focus();
    inputEl.setSelectionRange(ini + prefixo.length, ini + prefixo.length + selecionado.length);
  }

  function aplicarFormato(formato) {
    if (formato === 'negrito') envolverSelecao('**', '**');
    else if (formato === 'italico') envolverSelecao('_', '_');
    else if (formato === 'riscado') envolverSelecao('~~', '~~');
    else if (formato === 'codigo') envolverSelecao('`', '`');
    else if (formato === 'emoji') {
      const ini = inputEl.selectionStart;
      inputEl.value = inputEl.value.slice(0, ini) + '🙂' + inputEl.value.slice(ini);
      inputEl.focus();
      inputEl.setSelectionRange(ini + 2, ini + 2);
    }
  }

  function ajustarAltura() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(140, inputEl.scrollHeight) + 'px';
  }

  function enviar(e) {
    if (e) e.preventDefault();
    const texto = inputEl.value.trim();
    if (!texto || !conversaAtual) return;
    Network.sendChatMessage(conversaAtual, texto);
    inputEl.value = '';
    ajustarAltura();
  }

  // ---------- abrir/fechar ----------

  function abrir(conversaId) {
    aberto = true;
    painel.classList.remove('oculto');
    document.getElementById('btn-chat').classList.add('ativo');
    if (conversaId) abrirConversa(conversaId);
    else if (conversaAtual) abrirConversa(conversaAtual);
    renderConversas();
    inputEl.focus();
  }

  function fechar() {
    aberto = false;
    painel.classList.add('oculto');
    document.getElementById('btn-chat').classList.remove('ativo');
  }

  // Aceita o id do socket (vem do cartao da pessoa) ou o uid direto.
  function abrirDm(outroId) {
    const p = Game.getPlayers().get(outroId);
    abrir(idDm(p ? p.uid : outroId));
  }

  function init() {
    painel = document.getElementById('painel-chat');
    listaEl = document.getElementById('chat-lista');
    formEl = document.getElementById('form-chat');
    inputEl = document.getElementById('chat-input');
    badgeEl = document.getElementById('chat-badge');
    conversasEl = document.getElementById('chat-conversas');
    buscaEl = document.getElementById('chat-busca');
    tituloEl = document.getElementById('chat-titulo');
    contagemEl = document.getElementById('chat-contagem');

    document.getElementById('btn-chat').addEventListener('click', () => (aberto ? fechar() : abrir()));
    document.getElementById('btn-fechar-chat').addEventListener('click', fechar);
    formEl.addEventListener('submit', enviar);

    inputEl.addEventListener('input', ajustarAltura);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) enviar(e);
    });

    buscaEl.addEventListener('input', () => {
      filtroBusca = buscaEl.value;
      renderConversas();
    });

    document.querySelectorAll('.chat-tool').forEach((btn) => {
      btn.addEventListener('click', () => aplicarFormato(btn.dataset.formato));
    });
  }

  window.Chat = {
    init,
    carregarHistorico,
    receberMensagem,
    receberHistorico,
    receberReacao,
    pessoasMudaram,
    abrirDm,
  };
})();

// Calendario da sede: grade da semana com a agenda do time, lida do CRM.
// Ver docs/plano-calendario.md e referencias/...111656.png.
(function () {
  const HORA_MIN = 7;
  const HORA_MAX = 21;
  const ALTURA_HORA = 44; // px por hora
  // Abreviado: a coluna aqui tem ~60px, bem menos que a da referencia, e nome
  // inteiro ("domingo") transborda por cima do dia seguinte.
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const DIAS_LONGO = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  // Cor e identidade da pessoa na grade, nao status - mesma ideia do calendario
  // do CRM.
  const CORES = ['#4a63d8', '#c94f6d', '#2e8b57', '#b5701f', '#7a4fc9', '#c14f9e'];

  // Reuniao da sede tem cor propria, e uma so: ela nao e "de uma pessoa", e do
  // escritorio. Verde da casa, que e a cor da sala de reuniao no mapa.
  const COR_REUNIAO = '#2f5d4a';

  let painel, gradeEl, tituloEl, avisoEl, listaEl;
  let reunioesEl, formEl, erroFormEl, salaEl;
  let semanaBase = inicioDaSemana(new Date());
  let eventos = [];
  let reunioes = [];
  let salas = [];
  let indisponivel = null;
  let aberto = false;
  let jaAvisados = new Set();

  function inicioDaSemana(d) {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    c.setDate(c.getDate() - c.getDay());
    return c;
  }

  function corDe(nome) {
    let hash = 0;
    for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
    return CORES[hash % CORES.length];
  }

  function doisDigitos(n) { return String(n).padStart(2, '0'); }

  function horaDe(ts) {
    const d = new Date(ts);
    return doisDigitos(d.getHours()) + ':' + doisDigitos(d.getMinutes());
  }

  // ---------- grade ----------
  function montarGrade() {
    tituloEl.textContent = MESES[semanaBase.getMonth()] + ' de ' + semanaBase.getFullYear();
    gradeEl.innerHTML = '';

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // cabecalho dos dias
    const cabecalho = document.createElement('div');
    cabecalho.className = 'cal-cabecalho';
    cabecalho.appendChild(document.createElement('div')); // canto vazio da regua
    for (let i = 0; i < 7; i++) {
      const dia = new Date(semanaBase);
      dia.setDate(dia.getDate() + i);
      const cel = document.createElement('div');
      cel.className = 'cal-dia-topo';
      const nome = document.createElement('span');
      nome.textContent = DIAS[i];
      const num = document.createElement('b');
      num.textContent = dia.getDate();
      if (dia.getTime() === hoje.getTime()) num.classList.add('cal-hoje');
      cel.appendChild(nome);
      cel.appendChild(num);
      cabecalho.appendChild(cel);
    }
    gradeEl.appendChild(cabecalho);

    // corpo: regua de horas + sete colunas
    const corpo = document.createElement('div');
    corpo.className = 'cal-corpo';
    corpo.style.height = ((HORA_MAX - HORA_MIN) * ALTURA_HORA) + 'px';

    const regua = document.createElement('div');
    regua.className = 'cal-regua';
    for (let h = HORA_MIN; h < HORA_MAX; h++) {
      const marca = document.createElement('div');
      marca.className = 'cal-hora';
      marca.style.height = ALTURA_HORA + 'px';
      marca.textContent = h;
      regua.appendChild(marca);
    }
    corpo.appendChild(regua);

    for (let i = 0; i < 7; i++) {
      const dia = new Date(semanaBase);
      dia.setDate(dia.getDate() + i);
      const col = document.createElement('div');
      col.className = 'cal-coluna';
      for (let h = HORA_MIN; h < HORA_MAX; h++) {
        const faixa = document.createElement('div');
        faixa.className = 'cal-faixa';
        faixa.style.height = ALTURA_HORA + 'px';
        col.appendChild(faixa);
      }
      posicionarEventos(col, dia);
      corpo.appendChild(col);
    }

    gradeEl.appendChild(corpo);
    marcarAgora(corpo);
  }

  // ENTRAR NA REUNIAO E ENTRAR NA CHAMADA - nao e ir ate a sala.
  //
  // A primeira versao disto levava a pessoa ate a sala e deixava a chamada
  // acontecer por proximidade. O Caio derrubou com o caso obvio: "vai que a sala
  // de reuniao esta cheia". E tem o outro, tao comum quanto: ninguem deveria ter
  // que largar o lugar onde esta trabalhando por quinze minutos de reuniao.
  //
  // Agora a chamada e uma sessao propria (js/chamada.js): quem entra fala com
  // quem tambem entrou, de QUALQUER canto do mapa. A sala continua na reuniao,
  // mas como INFORMACAO ("e na Sala de Reuniao") e nao como requisito - quem
  // quiser se juntar fisicamente vai; quem nao puder, entra de onde esta.
  function entrarNaReuniao(r) {
    if (!window.Chamada) return;
    Chamada.entrar('reuniao:' + r.id);
    fechar();
  }

  // Reuniao que ja comecou e ainda nao acabou. E quando o botao "Entrar" deixa
  // de ser promessa e vira acao.
  function acontecendoAgora(r) {
    const agora = Date.now();
    return r.inicio - 5 * 60000 <= agora && agora < r.fim;
  }

  function posicionarEventos(col, dia) {
    const inicioDia = dia.getTime();
    const fimDia = inicioDia + 24 * 60 * 60 * 1000;

    // As reunioes da sede entram na MESMA grade dos compromissos do Google, e
    // nao numa lista separada: a pessoa precisa ver o choque de horario entre a
    // reuniao da sede e o compromisso dela, e isso so aparece lado a lado.
    const daSede = reunioes.map((r) => ({
      inicio: r.inicio, fim: r.fim, titulo: r.titulo,
      pessoaNome: r.salaNome, interna: true, reuniao: r,
    }));

    daSede.concat(eventos)
      .filter((ev) => ev.inicio < fimDia && ev.fim > inicioDia)
      .forEach((ev) => {
        const d = new Date(ev.inicio);
        const minutos = d.getHours() * 60 + d.getMinutes();
        const duracao = Math.max(20, (ev.fim - ev.inicio) / 60000);
        const topo = ((minutos - HORA_MIN * 60) / 60) * ALTURA_HORA;
        if (topo < -ALTURA_HORA) return; // comeca antes da faixa mostrada

        const bloco = document.createElement(ev.interna ? 'button' : 'div');
        if (ev.interna) bloco.type = 'button';
        bloco.className = 'cal-evento' + (ev.interna ? ' cal-evento-interno' : '');
        bloco.style.top = Math.max(0, topo) + 'px';
        bloco.style.height = Math.max(18, (duracao / 60) * ALTURA_HORA - 2) + 'px';
        bloco.style.background = ev.interna ? COR_REUNIAO : corDe(ev.pessoaNome);
        bloco.title = ev.titulo + ' · ' + ev.pessoaNome + ' · '
          + horaDe(ev.inicio) + '–' + horaDe(ev.fim)
          + (ev.interna ? ' · clique pra entrar na chamada' : '');
        if (ev.interna) bloco.addEventListener('click', () => entrarNaReuniao(ev.reuniao));

        const t = document.createElement('div');
        t.className = 'cal-evento-titulo';
        t.textContent = ev.titulo;
        bloco.appendChild(t);

        const p = document.createElement('div');
        p.className = 'cal-evento-pessoa';
        p.textContent = ev.pessoaNome;
        bloco.appendChild(p);

        col.appendChild(bloco);
      });
  }

  // Linha vermelha do horario atual, como na referencia.
  function marcarAgora(corpo) {
    const agora = new Date();
    const dentroDaSemana = agora >= semanaBase
      && agora < new Date(semanaBase.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (!dentroDaSemana) return;

    const minutos = agora.getHours() * 60 + agora.getMinutes();
    const topo = ((minutos - HORA_MIN * 60) / 60) * ALTURA_HORA;
    if (topo < 0 || topo > (HORA_MAX - HORA_MIN) * ALTURA_HORA) return;

    const linha = document.createElement('div');
    linha.className = 'cal-agora';
    linha.style.top = topo + 'px';
    const etiqueta = document.createElement('span');
    etiqueta.textContent = horaDe(agora.getTime());
    linha.appendChild(etiqueta);
    corpo.appendChild(linha);
  }

  // ---------- lista lateral ----------
  function montarLista() {
    listaEl.innerHTML = '';

    if (indisponivel) {
      const box = document.createElement('div');
      box.className = 'cal-vazio';
      box.textContent = indisponivel;
      listaEl.appendChild(box);
      return;
    }

    const agora = Date.now();
    const meus = eventos
      .filter((ev) => ev.uid && ev.uid === Game.getSelfUid() && ev.fim > agora)
      .slice(0, 8);

    if (meus.length === 0) {
      const box = document.createElement('div');
      box.className = 'cal-vazio';
      box.textContent = 'Nada marcado pra voce por enquanto.';
      listaEl.appendChild(box);
      return;
    }

    meus.forEach((ev) => {
      const item = document.createElement('div');
      item.className = 'cal-item';
      const barra = document.createElement('span');
      barra.className = 'cal-item-cor';
      barra.style.background = corDe(ev.pessoaNome);
      item.appendChild(barra);

      const txt = document.createElement('div');
      const t = document.createElement('div');
      t.className = 'cal-item-titulo';
      t.textContent = ev.titulo;
      const q = document.createElement('div');
      q.className = 'cal-item-quando';
      const d = new Date(ev.inicio);
      q.textContent = DIAS_LONGO[d.getDay()] + ', ' + horaDe(ev.inicio) + '–' + horaDe(ev.fim);
      txt.appendChild(t);
      txt.appendChild(q);
      item.appendChild(txt);
      listaEl.appendChild(item);
    });
  }

  // ---------- aviso de "comeca em 5 minutos" ----------
  function conferirProximos() {
    const meuUid = Game.getSelfUid && Game.getSelfUid();
    if (!meuUid) return;
    const agora = Date.now();

    eventos.forEach((ev) => {
      if (ev.uid !== meuUid) return;
      const faltam = ev.inicio - agora;
      if (faltam > 0 && faltam < 5 * 60 * 1000 && !jaAvisados.has(ev.titulo + ev.inicio)) {
        jaAvisados.add(ev.titulo + ev.inicio);
        mostrarAviso(ev);
      }
    });
  }

  function mostrarAviso(ev) {
    avisoEl.innerHTML = '';
    const t = document.createElement('strong');
    t.textContent = ev.titulo;
    const q = document.createElement('span');
    q.textContent = ' comeca as ' + horaDe(ev.inicio);
    const fechar = document.createElement('button');
    fechar.type = 'button';
    fechar.className = 'cal-aviso-fechar';
    fechar.textContent = '✕';
    fechar.addEventListener('click', () => avisoEl.classList.add('oculto'));
    avisoEl.appendChild(t);
    avisoEl.appendChild(q);
    avisoEl.appendChild(fechar);
    avisoEl.classList.remove('oculto');
  }

  // ---------- abrir/fechar ----------
  function abrir() {
    aberto = true;
    painel.classList.remove('oculto');
    Network.pedirAgenda();
    atualizarStatusGoogle();
    montarGrade();
    montarLista();
  }

  function fechar() {
    aberto = false;
    painel.classList.add('oculto');
  }

  // ---------- reunioes internas ----------

  function montarReunioes() {
    if (!reunioesEl) return;
    reunioesEl.innerHTML = '';

    const proximas = reunioes.filter((r) => r.fim > Date.now()).slice(0, 8);
    if (!proximas.length) {
      const p = document.createElement('p');
      p.className = 'cal-vazio';
      p.textContent = 'Nenhuma reuniao marcada.';
      reunioesEl.appendChild(p);
      return;
    }

    const meuUid = Game.getSelfUid && Game.getSelfUid();
    proximas.forEach((r) => {
      const item = document.createElement('div');
      item.className = 'cal-reuniao' + (acontecendoAgora(r) ? ' agora' : '');

      const t = document.createElement('div');
      t.className = 'cal-reuniao-titulo';
      t.textContent = r.titulo;
      item.appendChild(t);

      const d = new Date(r.inicio);
      const quando = document.createElement('div');
      quando.className = 'cal-reuniao-quando';
      quando.textContent = DIAS_LONGO[d.getDay()] + ', ' + horaDe(r.inicio)
        + ' · ' + r.salaNome;
      item.appendChild(quando);

      const acoes = document.createElement('div');
      acoes.className = 'cal-reuniao-acoes';

      const entrar = document.createElement('button');
      entrar.type = 'button';
      entrar.className = 'cal-reuniao-entrar';
      // A reuniao ainda mostra a SALA na linha de cima, como informacao de onde
      // ela e. Mas entrar nao depende dela: entra de onde a pessoa estiver.
      entrar.textContent = acontecendoAgora(r) ? 'Entrar agora' : 'Entrar na chamada';
      entrar.addEventListener('click', () => entrarNaReuniao(r));
      acoes.appendChild(entrar);

      // Desmarcar so aparece pra quem pode. Quem CONFERE e o servidor; isto
      // aqui e so pra nao mostrar botao que ja nasce dando erro.
      const eu = Game.getPlayers && Game.getPlayers().get(Game.getSelfId());
      if (r.criadaPorUid === meuUid || (eu && eu.isAdmin)) {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'cal-reuniao-desmarcar';
        x.textContent = 'Desmarcar';
        x.addEventListener('click', () => Network.desmarcarReuniao(r.id));
        acoes.appendChild(x);
      }

      item.appendChild(acoes);
      reunioesEl.appendChild(item);
    });
  }

  function receberReunioes(dados) {
    reunioes = (dados && dados.reunioes) || [];
    salas = (dados && dados.salas) || [];
    montarSalas();
    montarReunioes();
    if (aberto) montarGrade();
  }

  function montarSalas() {
    if (!salaEl) return;
    const antes = salaEl.value;
    salaEl.innerHTML = '';
    salas.forEach((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.nome + (s.lugares ? ' · ' + s.lugares + ' lugares' : '');
      salaEl.appendChild(o);
    });
    if (antes) salaEl.value = antes;
  }

  function erroDoForm(texto) {
    if (!erroFormEl) return;
    erroFormEl.textContent = texto || '';
    erroFormEl.classList.toggle('oculto', !texto);
  }

  function abrirForm(abrirAssim) {
    formEl.classList.toggle('oculto', !abrirAssim);
    document.getElementById('cal-nova').classList.toggle('oculto', abrirAssim);
    erroDoForm('');
    if (!abrirAssim) return;
    // Nasce preenchido com a proxima hora cheia: marcar reuniao quase sempre e
    // "hoje, daqui a pouco", e digitar data por extenso pra isso e atrito a toa.
    const d = new Date(Date.now() + 60 * 60000);
    d.setMinutes(0, 0, 0);
    document.getElementById('cal-f-data').value =
      d.getFullYear() + '-' + doisDigitos(d.getMonth() + 1) + '-' + doisDigitos(d.getDate());
    document.getElementById('cal-f-hora').value = doisDigitos(d.getHours()) + ':00';
    document.getElementById('cal-f-titulo').focus();
  }

  function enviarForm(ev) {
    ev.preventDefault();
    const data = document.getElementById('cal-f-data').value;
    const hora = document.getElementById('cal-f-hora').value;
    if (!data || !hora) return erroDoForm('Escolhe a data e a hora.');
    const quando = new Date(data + 'T' + hora);
    if (isNaN(quando.getTime())) return erroDoForm('Essa data nao deu certo.');

    erroDoForm('');
    Network.marcarReuniao({
      titulo: document.getElementById('cal-f-titulo').value,
      inicio: quando.getTime(),
      minutos: Number(document.getElementById('cal-f-dur').value),
      sala: salaEl.value,
    });
    // O servidor e quem decide. Fecha otimista: se recusar, `reuniao-recusada`
    // reabre com o motivo.
    document.getElementById('cal-f-titulo').value = '';
    abrirForm(false);
  }

  function receberAgenda(dados) {
    eventos = (dados && dados.eventos) || [];
    indisponivel = (dados && dados.indisponivel) || null;
    if (aberto) {
      montarGrade();
      montarLista();
    }
    conferirProximos();
  }

  // ---------- conectar a propria conta Google ----------
  async function atualizarStatusGoogle() {
    const caixa = document.getElementById('cal-google');
    try {
      const r = await fetch('/api/google/status', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('sem status');
      const s = await r.json();
      caixa.innerHTML = '';

      if (!s.configurado) {
        caixa.textContent = 'O servidor ainda nao tem as credenciais do Google.';
        return;
      }

      if (s.conectado) {
        const txt = document.createElement('div');
        txt.className = 'cal-google-ok';
        txt.textContent = 'Agenda conectada' + (s.email ? ' (' + s.email + ')' : '');
        caixa.appendChild(txt);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cal-google-sair';
        btn.textContent = 'Desconectar';
        btn.addEventListener('click', async () => {
          await fetch('/api/google/desconectar', { method: 'POST', credentials: 'same-origin' });
          atualizarStatusGoogle();
          Network.pedirAgenda();
        });
        caixa.appendChild(btn);
        return;
      }

      const link = document.createElement('a');
      link.className = 'cal-google-btn';
      link.href = '/api/google/conectar';
      link.textContent = 'Conectar meu Google Agenda';
      caixa.appendChild(link);
    } catch (e) {
      caixa.textContent = 'Nao consegui conferir a conexao com o Google.';
    }
  }

  function init() {
    painel = document.getElementById('painel-calendario');
    gradeEl = document.getElementById('cal-grade');
    tituloEl = document.getElementById('cal-titulo');
    avisoEl = document.getElementById('cal-aviso');
    listaEl = document.getElementById('cal-lista');
    reunioesEl = document.getElementById('cal-reunioes');
    formEl = document.getElementById('cal-form');
    erroFormEl = document.getElementById('cal-f-erro');
    salaEl = document.getElementById('cal-f-sala');

    document.getElementById('cal-nova').addEventListener('click', () => abrirForm(true));
    document.getElementById('cal-f-cancelar').addEventListener('click', () => abrirForm(false));
    formEl.addEventListener('submit', enviarForm);

    document.getElementById('btn-calendario').addEventListener('click', () => (aberto ? fechar() : abrir()));
    document.getElementById('btn-fechar-calendario').addEventListener('click', fechar);

    document.getElementById('cal-anterior').addEventListener('click', () => {
      semanaBase.setDate(semanaBase.getDate() - 7);
      montarGrade();
    });
    document.getElementById('cal-proxima').addEventListener('click', () => {
      semanaBase.setDate(semanaBase.getDate() + 7);
      montarGrade();
    });
    document.getElementById('cal-hoje').addEventListener('click', () => {
      semanaBase = inicioDaSemana(new Date());
      montarGrade();
    });

    Network.on('agenda', receberAgenda);
    Network.on('reunioes', receberReunioes);
    // O servidor recusou (choque de horario, titulo vazio, sala errada): o
    // formulario volta com o motivo dele, nao com um texto meu inventado aqui.
    Network.on('reuniao-recusada', (motivo) => {
      abrirForm(true);
      erroDoForm(motivo || 'Nao consegui marcar.');
    });
    // pede a agenda ao entrar, pra conseguir avisar mesmo com o painel fechado
    Network.pedirAgenda();
    setInterval(() => Network.pedirAgenda(), 5 * 60 * 1000);
    setInterval(conferirProximos, 30 * 1000);
  }

  window.Calendario = { init, abrir };
})();

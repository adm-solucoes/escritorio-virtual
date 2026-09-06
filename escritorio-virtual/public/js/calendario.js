// Calendario da sede: grade da semana com a agenda do time, lida do CRM.
// Ver docs/plano-calendario.md e referencias/...111656.png.
(function () {
  const HORA_MIN = 7;
  const HORA_MAX = 21;
  const ALTURA_HORA = 44; // px por hora
  const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  // Cor e identidade da pessoa na grade, nao status - mesma ideia do calendario
  // do CRM.
  const CORES = ['#4a63d8', '#c94f6d', '#2e8b57', '#b5701f', '#7a4fc9', '#c14f9e'];

  let painel, gradeEl, tituloEl, avisoEl, listaEl;
  let semanaBase = inicioDaSemana(new Date());
  let eventos = [];
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

  function posicionarEventos(col, dia) {
    const inicioDia = dia.getTime();
    const fimDia = inicioDia + 24 * 60 * 60 * 1000;

    eventos
      .filter((ev) => ev.inicio < fimDia && ev.fim > inicioDia)
      .forEach((ev) => {
        const d = new Date(ev.inicio);
        const minutos = d.getHours() * 60 + d.getMinutes();
        const duracao = Math.max(20, (ev.fim - ev.inicio) / 60000);
        const topo = ((minutos - HORA_MIN * 60) / 60) * ALTURA_HORA;
        if (topo < -ALTURA_HORA) return; // comeca antes da faixa mostrada

        const bloco = document.createElement('div');
        bloco.className = 'cal-evento';
        bloco.style.top = Math.max(0, topo) + 'px';
        bloco.style.height = Math.max(18, (duracao / 60) * ALTURA_HORA - 2) + 'px';
        bloco.style.background = corDe(ev.pessoaNome);
        bloco.title = ev.titulo + ' · ' + ev.pessoaNome + ' · '
          + horaDe(ev.inicio) + '–' + horaDe(ev.fim);

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
      q.textContent = DIAS[d.getDay()] + ', ' + horaDe(ev.inicio) + '–' + horaDe(ev.fim);
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
    montarGrade();
    montarLista();
  }

  function fechar() {
    aberto = false;
    painel.classList.add('oculto');
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

  function init() {
    painel = document.getElementById('painel-calendario');
    gradeEl = document.getElementById('cal-grade');
    tituloEl = document.getElementById('cal-titulo');
    avisoEl = document.getElementById('cal-aviso');
    listaEl = document.getElementById('cal-lista');

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
    // pede a agenda ao entrar, pra conseguir avisar mesmo com o painel fechado
    Network.pedirAgenda();
    setInterval(() => Network.pedirAgenda(), 5 * 60 * 1000);
    setInterval(conferirProximos, 30 * 1000);
  }

  window.Calendario = { init, abrir };
})();

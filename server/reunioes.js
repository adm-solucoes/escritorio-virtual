// Reunioes internas da sede: marcadas aqui, guardadas aqui, e com a chamada
// junto. Ver docs/plano-reunioes.md.
//
// POR QUE NAO E O GOOGLE AGENDA
// A aba Agenda mostra o Google de cada pessoa, e isso continua. Mas o Google so
// LE: a sede nunca escreve na agenda de ninguem, de proposito (docs/plano-
// calendario.md). Entao nao havia como marcar uma reuniao DA SEDE - e "reuniao
// interna" e justamente a que nao precisa de convite, link nem conta Google.
//
// A CHAMADA E UMA SALA DO MAPA, E NAO UM LINK
// Foi a decisao de projeto. A sede ja tem chamada por proximidade, sala de
// reuniao fechada e TV que espelha quem apresenta. Uma reuniao marcada nao
// precisa de um segundo sistema de video em paralelo: precisa dizer ONDE e
// QUANDO. Entrar na reuniao leva a pessoa ate a sala, e a chamada acontece
// porque todo mundo esta no mesmo lugar - que e como funciona num escritorio.
//
// Isso tambem e o que faz a reuniao "ficar salva": a sala existe sempre, entao
// nao ha link que vence, nem chamada que morre quando o ultimo sai.
const fs = require('fs');
const map = require('./map');
const pastaDados = require('./dados');

const ARQUIVO = pastaDados.arquivo('reunioes.json');

const TITULO_MAX = 80;
const MIN_DURACAO = 15;
const MAX_DURACAO = 8 * 60;
const REUNIOES_MAX = 200;
// Reuniao que acabou ha mais de meio dia sai da lista sozinha. Sem isso a
// agenda da sede viraria um arquivo morto que so cresce.
const GUARDAR_DEPOIS_MS = 12 * 60 * 60 * 1000;

let reunioes = [];
let proximoId = 1;

// Onde cabe marcar uma reuniao. Sai da PLANTA, nao de uma lista escrita a mao:
// mudou o mapa, muda isto junto.
//
// Duas condicoes, e as duas sao sobre a sala de verdade:
//
//   1. PRIVATIVA - e onde a chamada nao vaza pra quem passa do lado de fora.
//   2. tem MESA DE REUNIAO ou MESA REDONDA, ou seja, uma mesa em volta da qual
//      se senta.
//
// A segunda existe pra separar sala de reuniao de CABINE DE CHAMADA. As tres
// cabines tambem sao privativas, mas sao pra uma pessoa so: o movel delas e uma
// poltrona e uma mesinha de apoio (MESA_CENTRO). Marcar "Alinhamento do
// Comercial" numa cabine seria marcar reuniao num lugar onde nao cabe reuniao.
//
// Da pra fazer isso por area (cabine tem 15 tiles, huddle 30), mas o numero
// seria arbitrario e quebraria na primeira vez que alguem mexesse na planta. O
// movel diz o que a sala E.
const MESAS_DE_REUNIAO = [map.MESA_REUNIAO, map.MESA_REDONDA].filter((t) => t !== undefined);

function moveisDaSala(s) {
  const achados = new Set();
  for (let r = s.r0; r <= s.r1; r++) {
    for (let c = s.c0; c <= s.c1; c++) {
      const t = map.tiles[r] && map.tiles[r][c];
      if (t) achados.add(t);
    }
  }
  return achados;
}

function lugaresDaSala(s) {
  let n = 0;
  for (let r = s.r0; r <= s.r1; r++) {
    for (let c = s.c0; c <= s.c1; c++) {
      if (map.ASSENTOS.has(map.tiles[r] && map.tiles[r][c])) n++;
    }
  }
  return n;
}

function salasDisponiveis() {
  return (map.ROOMS || [])
    .filter((s) => s.privativa)
    .filter((s) => {
      const moveis = moveisDaSala(s);
      return MESAS_DE_REUNIAO.some((t) => moveis.has(t));
    })
    .map((s) => ({ id: s.id, nome: s.nome, lugares: lugaresDaSala(s) }));
}

function salaValida(id) {
  return salasDisponiveis().some((s) => s.id === id);
}

function carregar() {
  try {
    if (!fs.existsSync(ARQUIVO)) return;
    const bruto = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    reunioes = Array.isArray(bruto.reunioes) ? bruto.reunioes : [];
    proximoId = Number(bruto.proximoId) || (reunioes.length + 1);
    limpar();
  } catch (e) {
    console.error('[reunioes] nao consegui ler o arquivo: ' + e.message);
    reunioes = [];
  }
}

let gravando = null;
function salvar() {
  // Junta as gravacoes: marcar tres reunioes seguidas nao escreve tres vezes.
  if (gravando) return;
  gravando = setTimeout(() => {
    gravando = null;
    try {
      pastaDados.gravarSeguro(ARQUIVO, JSON.stringify({ reunioes, proximoId }, null, 2));
    } catch (e) {
      console.error('[reunioes] nao consegui gravar: ' + e.message);
    }
  }, 400);
}

function limpar() {
  const corte = Date.now() - GUARDAR_DEPOIS_MS;
  const antes = reunioes.length;
  reunioes = reunioes.filter((r) => r.fim > corte);
  if (reunioes.length !== antes) salvar();
}

function listar() {
  limpar();
  return reunioes.slice().sort((a, b) => a.inicio - b.inicio);
}

// Devolve { erro } ou { reuniao }. O texto do erro vai direto pra tela, entao
// ele diz o que fazer, e nao so o que esta errado.
function criar({ titulo, inicio, minutos, sala }, autor) {
  const t = String(titulo || '').trim().slice(0, TITULO_MAX);
  if (!t) return { erro: 'Poe um titulo na reuniao.' };

  const comeco = Number(inicio);
  if (!Number.isFinite(comeco)) return { erro: 'Escolhe a data e a hora.' };
  // Um dia pra tras e aceito de proposito: marcar as 14h faltando cinco
  // minutos, ou registrar a que acabou de acontecer, sao casos de verdade.
  if (comeco < Date.now() - 24 * 60 * 60 * 1000) {
    return { erro: 'Essa data ja passou faz tempo.' };
  }
  if (comeco > Date.now() + 365 * 24 * 60 * 60 * 1000) {
    return { erro: 'Essa data esta longe demais.' };
  }

  const dur = Math.round(Number(minutos));
  if (!Number.isFinite(dur) || dur < MIN_DURACAO || dur > MAX_DURACAO) {
    return { erro: 'A duracao tem que ficar entre ' + MIN_DURACAO + ' minutos e 8 horas.' };
  }

  if (!salaValida(sala)) return { erro: 'Escolhe uma sala da sede.' };

  if (reunioes.length >= REUNIOES_MAX) return { erro: 'A agenda da sede esta cheia.' };

  const fim = comeco + dur * 60000;

  // Duas reunioes na mesma sala no mesmo horario e o erro que estraga a reuniao
  // de verdade: as duas turmas chegam e uma tem que sair. A sala e fisica, entao
  // o choque e real - nao da pra "entrar nas duas".
  const choque = reunioes.find((r) => r.sala === sala && r.inicio < fim && r.fim > comeco);
  if (choque) {
    return { erro: 'Essa sala ja tem "' + choque.titulo + '" nesse horario.' };
  }

  const reuniao = {
    id: proximoId++,
    titulo: t,
    inicio: comeco,
    fim,
    sala,
    salaNome: (salasDisponiveis().find((s) => s.id === sala) || {}).nome || sala,
    criadaPorUid: autor.uid,
    criadaPorNome: autor.nome,
    criadaEm: Date.now(),
  };
  reunioes.push(reuniao);
  salvar();
  return { reuniao };
}

// Desmarcar e de quem marcou, ou da diretoria. Reuniao da sede nao pode ser
// apagada por qualquer um - mas prender a chave so em quem marcou deixaria a
// sede travada quando a pessoa sai da empresa.
function remover(id, autor) {
  const i = reunioes.findIndex((r) => r.id === Number(id));
  if (i < 0) return { erro: 'Essa reuniao nao existe mais.' };
  const r = reunioes[i];
  if (r.criadaPorUid !== autor.uid && !autor.isAdmin) {
    return { erro: 'So quem marcou (ou a diretoria) desmarca.' };
  }
  reunioes.splice(i, 1);
  salvar();
  return { reuniao: r };
}

carregar();

module.exports = {
  listar,
  criar,
  remover,
  salasDisponiveis,
  // pros testes
  _limpar: () => { reunioes = []; proximoId = 1; },
  _ARQUIVO: ARQUIVO,
};

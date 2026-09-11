// Reunioes marcadas na sede. Guardadas em server/data/reunioes.json.
// Ver docs/plano-calendario.md.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const map = require('./map');
const pastaDados = require('./dados');

const PASTA = pastaDados.PASTA;
const ARQUIVO = path.join(PASTA, 'reunioes.json');

const MAX_REUNIOES = 500;
const MAX_TITULO = 80;
const DURACAO_MAX_MS = 8 * 60 * 60 * 1000; // 8h
const FUTURO_MAX_MS = 365 * 24 * 60 * 60 * 1000; // 1 ano
const SALAS_VALIDAS = new Set(map.ROOMS.map((s) => s.id));

let reunioes = [];

function carregar() {
  try {
    if (!fs.existsSync(ARQUIVO)) return;
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    if (Array.isArray(dados.reunioes)) reunioes = dados.reunioes;
  } catch (e) {
    console.error('Nao consegui ler reunioes.json, comecando vazio:', e.message);
  }
}

function salvar() {
  try {
    if (!fs.existsSync(PASTA)) fs.mkdirSync(PASTA, { recursive: true });
    fs.writeFileSync(ARQUIVO, JSON.stringify({ reunioes }, null, 2));
  } catch (e) {
    console.error('Nao consegui salvar reunioes.json:', e.message);
  }
}

carregar();

// Devolve { erro } ou { ok: reuniao }. O criador NAO vem do cliente: quem chama
// passa o uid que saiu da sessao.
function criar(dados, criadorUid, uidsValidos) {
  const d = dados && typeof dados === 'object' ? dados : {};

  const titulo = typeof d.titulo === 'string' ? d.titulo.trim().slice(0, MAX_TITULO) : '';
  if (!titulo) return { erro: 'Da um titulo pra reuniao.' };

  const inicio = Number(d.inicio);
  const fim = Number(d.fim);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim)) return { erro: 'Horario invalido.' };
  if (fim <= inicio) return { erro: 'O fim tem que ser depois do inicio.' };
  if (fim - inicio > DURACAO_MAX_MS) return { erro: 'Reuniao longa demais (maximo 8 horas).' };
  if (inicio > Date.now() + FUTURO_MAX_MS) return { erro: 'Data muito distante.' };

  if (!SALAS_VALIDAS.has(d.salaId)) return { erro: 'Escolhe uma sala da sede.' };

  // so uids que existem de verdade, sem repetir, e o criador sempre entra
  const participantes = Array.isArray(d.participantes) ? d.participantes : [];
  const lista = participantes.filter((uid) => uidsValidos.has(uid));
  if (!lista.includes(criadorUid)) lista.unshift(criadorUid);

  if (reunioes.length >= MAX_REUNIOES) {
    return { erro: 'Limite de reunioes guardadas. Cancele alguma antiga.' };
  }

  const reuniao = {
    id: crypto.randomUUID(),
    titulo,
    inicio,
    fim,
    salaId: d.salaId,
    criadorUid,
    participantes: Array.from(new Set(lista)),
    criadaEm: Date.now(),
  };
  reunioes.push(reuniao);
  salvar();
  return { ok: reuniao };
}

// So o criador ou a diretoria cancela.
function cancelar(id, uid, isAdmin) {
  const i = reunioes.findIndex((r) => r.id === id);
  if (i === -1) return { erro: 'Reuniao nao encontrada.' };
  if (reunioes[i].criadorUid !== uid && !isAdmin) {
    return { erro: 'So quem marcou (ou a diretoria) pode cancelar.' };
  }
  reunioes.splice(i, 1);
  salvar();
  return { ok: true };
}

// Some com o que ja acabou faz mais de um dia, pra lista nao crescer sozinha.
function limparAntigas() {
  const corte = Date.now() - 24 * 60 * 60 * 1000;
  const antes = reunioes.length;
  reunioes = reunioes.filter((r) => r.fim > corte);
  if (reunioes.length !== antes) salvar();
}

function paraEnvio() {
  return reunioes;
}

module.exports = { criar, cancelar, limparAntigas, paraEnvio };

// Mesas reivindicadas. Ver docs/plano-mesa-pessoal.md.
//
// Duas coisas mudaram em relacao a primeira versao:
//
//   1. A mesa e da CONTA, nao da sessao. Antes o dono era o `socket.id` e o
//      `disconnect` largava a mesa - voce fechava a aba e a mesa deixava de ser
//      sua. Agora o dono e o `uid` e a lista vai pro disco.
//   2. Pegar uma mesa pega o **movel inteiro**, nao uma celula. Uma mesa da
//      sala Time tem 6 celulas (3 de largura por 2 de fundo); reivindicar uma
//      delas e ficar com 1/6 de mesa nao quer dizer nada.
const fs = require('fs');
const path = require('path');
const map = require('./map');
const usuarios = require('./usuarios');

const ARQUIVO = path.join(__dirname, 'data', 'mesas.json');

// chave canonica da mesa -> uid da conta dona
let donos = new Map();

function chave(col, row) {
  return col + ',' + row;
}

// A varredura do movel mora no mapa, que e o arquivo espelhado entre cliente e
// servidor - assim os dois concordam sobre onde uma mesa comeca e termina.
function blocoEm(col, row) {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
  return map.celulasDaMesa(col, row);
}

function chaveDoBloco(celulas) {
  return chave(celulas[0][0], celulas[0][1]);
}

function mesaDaPessoa(uid) {
  for (const [k, dono] of donos) if (dono === uid) return k;
  return null;
}

// Reivindica ou larga. Devolve `true` se algo mudou (pra so avisar todo mundo
// quando valeu a pena).
function alternar(col, row, uid) {
  const celulas = blocoEm(col, row);
  if (!celulas || !uid) return false;

  const k = chaveDoBloco(celulas);
  const donoAtual = donos.get(k);
  if (donoAtual && donoAtual !== uid) return false; // mesa de outra pessoa

  // Cada pessoa fica com no maximo uma: pegar outra larga a anterior.
  const anterior = mesaDaPessoa(uid);
  if (anterior) donos.delete(anterior);

  // Clicou na propria mesa: era pra largar, e a linha de cima ja largou.
  if (donoAtual !== uid) donos.set(k, uid);

  salvar();
  return true;
}

function largarDe(uid) {
  const k = mesaDaPessoa(uid);
  if (!k) return false;
  donos.delete(k);
  salvar();
  return true;
}

// O que o cliente precisa pra desenhar: as celulas (pro contorno cobrir a mesa
// inteira) e o nome do dono, que sai da conta - senao a plaquinha ficaria em
// branco toda vez que o dono estivesse offline.
function paraEnvio() {
  const lista = [];
  for (const [k, uid] of donos) {
    const partes = k.split(',');
    const celulas = blocoEm(Number(partes[0]), Number(partes[1]));
    // A diretoria pode ter apagado a mesa pelo decorador. Sem movel, sem dono.
    if (!celulas) {
      donos.delete(k);
      continue;
    }
    const conta = usuarios.porId(uid);
    lista.push({ chave: k, celulas, donoUid: uid, donoNome: conta ? conta.nome : '' });
  }
  return lista;
}

function salvar() {
  try {
    fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
    const dados = Array.from(donos.entries()).map(([k, uid]) => ({ chave: k, uid }));
    fs.writeFileSync(ARQUIVO, JSON.stringify({ mesas: dados }, null, 2));
  } catch (e) {
    console.error('Nao consegui salvar as mesas:', e.message);
  }
}

function carregar() {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    (dados.mesas || []).forEach((m) => {
      if (typeof m.chave === 'string' && typeof m.uid === 'string') donos.set(m.chave, m.uid);
    });
  } catch (e) {
    donos = new Map(); // primeira vez, ou arquivo corrompido: comeca vazio
  }
}

carregar();

module.exports = { blocoEm, alternar, largarDe, mesaDaPessoa, paraEnvio };

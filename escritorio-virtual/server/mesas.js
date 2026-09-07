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
// chave canonica da mesa -> [{ o, x, y }]. Fica separado da decoracao da
// diretoria (mapa-editado.js) de proposito: o que voce poe na SUA mesa e seu, e
// vai embora junto quando voce larga a mesa.
//
// `x` e `y` sao coordenadas de tile COM FRACAO (15.4, 18.6). Nao e uma coisa
// por celula: na referencia a pessoa poe onde quiser em cima da mesa, entao a
// posicao precisa ser mais fina que o tile.
let itens = new Map();

const ITENS_MAX = 14;        // uma mesa cheia, sem virar bagunca
const RAIO_PRA_TIRAR = 0.55; // em tiles: o quao perto o clique tem que passar

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
  if (anterior) {
    donos.delete(anterior);
    itens.delete(anterior);
  }

  // Clicou na propria mesa: era pra largar, e a linha de cima ja largou.
  if (donoAtual !== uid) donos.set(k, uid);

  salvar();
  return true;
}

function largarDe(uid) {
  const k = mesaDaPessoa(uid);
  if (!k) return false;
  donos.delete(k);
  itens.delete(k); // suas coisas saem com voce
  salvar();
  return true;
}

// Poe (ou tira, com `objeto` 0) uma coisa em cima da PROPRIA mesa, na posicao
// exata em que a pessoa clicou. E o que deixa personalizar sem ser da diretoria:
// a checagem que vale e esta - o ponto tem que cair numa mesa que e sua.
function porItem(x, y, objeto, uid) {
  if (!uid || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (!Number.isInteger(objeto) || objeto < 0 || objeto > map.OBJETO_MAX) return false;

  const celulas = blocoEm(Math.floor(x), Math.floor(y));
  if (!celulas) return false;

  const k = chaveDoBloco(celulas);
  if (donos.get(k) !== uid) return false; // so na sua mesa

  const lista = itens.get(k) || [];

  if (!objeto) {
    // Borracha: tira o que estiver mais perto do clique. Sem isso, uma coisa
    // colocada meio torta nunca mais sairia dali.
    let perto = -1;
    let melhor = RAIO_PRA_TIRAR;
    lista.forEach((it, i) => {
      const d = Math.hypot(it.x - x, it.y - y);
      if (d < melhor) { melhor = d; perto = i; }
    });
    if (perto < 0) return false;
    lista.splice(perto, 1);
    if (lista.length) itens.set(k, lista);
    else itens.delete(k);
    salvar();
    return true;
  }

  if (lista.length >= ITENS_MAX) return false;
  // Guarda com 2 casas: o cliente manda float do mouse, e sem cortar o arquivo
  // encheria de 15.400000000000002.
  lista.push({ o: objeto, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  itens.set(k, lista);
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
    lista.push({
      chave: k,
      celulas,
      donoUid: uid,
      donoNome: conta ? conta.nome : '',
      itens: (itens.get(k) || []).slice(),
    });
  }
  return lista;
}

// Aceita o formato antigo ({"c,r": objeto}, uma coisa por celula) e o converte
// pro novo. Sem isso, quem ja tinha decorado a mesa perderia tudo.
function normalizarItens(bruto) {
  if (Array.isArray(bruto)) {
    return bruto
      .filter((it) => it && Number.isFinite(it.x) && Number.isFinite(it.y) && Number.isInteger(it.o))
      .slice(0, ITENS_MAX);
  }
  if (!bruto || typeof bruto !== 'object') return [];
  return Object.keys(bruto).map((cel) => {
    const p = cel.split(',');
    // no formato antigo a coisa ficava no meio da celula
    return { o: bruto[cel], x: Number(p[0]) + 0.5, y: Number(p[1]) + 0.5 };
  }).filter((it) => Number.isInteger(it.o) && Number.isFinite(it.x)).slice(0, ITENS_MAX);
}

function salvar() {
  try {
    fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
    const dados = Array.from(donos.entries())
      .map(([k, uid]) => ({ chave: k, uid, itens: itens.get(k) || [] }));
    fs.writeFileSync(ARQUIVO, JSON.stringify({ mesas: dados }, null, 2));
  } catch (e) {
    console.error('Nao consegui salvar as mesas:', e.message);
  }
}

function carregar() {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    (dados.mesas || []).forEach((m) => {
      if (typeof m.chave !== 'string' || typeof m.uid !== 'string') return;
      donos.set(m.chave, m.uid);
      const lidos = normalizarItens(m.itens);
      if (lidos.length) itens.set(m.chave, lidos);
    });
  } catch (e) {
    donos = new Map(); // primeira vez, ou arquivo corrompido: comeca vazio
    itens = new Map();
  }
}

carregar();

module.exports = { blocoEm, alternar, largarDe, porItem, mesaDaPessoa, paraEnvio };

// Decoracao do escritorio: lista de diferencas em cima do mapa base do map.js.
// Guardada em server/data/mapa.json. Ver docs/plano-decorador.md.
const fs = require('fs');
const path = require('path');
const map = require('./map');

const PASTA = path.join(__dirname, 'data');
const ARQUIVO = path.join(PASTA, 'mapa.json');

// So esses tipos podem ser colocados pelo decorador. Fora daqui (o chao das
// zonas, por exemplo) nao e coisa que a pessoa escolhe na grade.
const TILES_DO_CATALOGO = [
  map.LIVRE, map.MESA, map.MESA_MONITOR, map.MESA_CENTRO, map.MESA_REUNIAO,
  map.CADEIRA, map.IMPRESSORA, map.PLANTA, map.QUADRO, map.LOUSA, map.CAVALETE,
  map.CABIDE, map.TAPETE, map.SOFA_CIMA, map.SOFA_BAIXO, map.BANCO, map.ESTANTE,
  map.ARMARIO, map.BALCAO, map.PAREDE, map.JANELA, map.CERCA, map.ARVORE,
  map.ARBUSTO, map.PEDRA, map.AGUA,
  map.MESA_DUPLA, map.MESA_NOTEBOOK, map.PLANTA_GRANDE, map.VASO_FLORES,
  map.CACTO, map.POLTRONA, map.CADEIRA_VERMELHA, map.BEBEDOURO, map.TV,
  map.RELOGIO, map.TAPETE_REDONDO,
  map.CADEIRA_BAIXO, map.CADEIRA_ESQ, map.CADEIRA_DIR,
  map.CADEIRA_VERMELHA_BAIXO, map.CADEIRA_VERMELHA_ESQ, map.CADEIRA_VERMELHA_DIR,
  map.MESA_BAIXO, map.MESA_ESQ, map.MESA_DIR,
  map.MESA_MONITOR_BAIXO, map.MESA_MONITOR_ESQ, map.MESA_MONITOR_DIR,
];

// chave "c,r" -> tile. Mapa em vez de lista: editar a mesma celula duas vezes
// nao acumula lixo no arquivo.
const mudancas = new Map();
// chave "c,r" -> id do objeto apoiado na celula (camada de cima).
const objetos = new Map();

function chave(c, r) {
  return c + ',' + r;
}

function garantirPasta() {
  if (!fs.existsSync(PASTA)) fs.mkdirSync(PASTA, { recursive: true });
}

function comoLista(mapa, campo) {
  return Array.from(mapa.entries()).map(([k, valor]) => {
    const [c, r] = k.split(',').map(Number);
    return { c, r, [campo]: valor };
  });
}

function salvar() {
  garantirPasta();
  const dados = {
    mudancas: comoLista(mudancas, 't'),
    objetos: comoLista(objetos, 'o'),
  };
  const tmp = ARQUIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, ARQUIVO);
}

function carregar() {
  try {
    if (!fs.existsSync(ARQUIVO)) return;
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    (dados.mudancas || []).forEach((m) => {
      if (!posicaoValida(m.c, m.r) || !tileValido(m.t)) return;
      mudancas.set(chave(m.c, m.r), m.t);
      map.tiles[m.r][m.c] = m.t; // aplica por cima do mapa base
    });
    (dados.objetos || []).forEach((o) => {
      if (!posicaoValida(o.c, o.r) || !objetoValido(o.o) || !o.o) return;
      objetos.set(chave(o.c, o.r), o.o);
      map.objetos[o.r][o.c] = o.o;
    });
  } catch (e) {
    console.error('[mapa] nao consegui ler a decoracao:', e.message);
  }
}

function posicaoValida(c, r) {
  return Number.isInteger(c) && Number.isInteger(r)
    && c >= 0 && c < map.COLS && r >= 0 && r < map.ROWS;
}

function tileValido(t) {
  return TILES_DO_CATALOGO.includes(t);
}

function objetoValido(o) {
  return Number.isInteger(o) && o >= 0 && o <= map.OBJETO_MAX;
}

// Retorna { mudou, objetoCaiu } - `mudou` false quando nada mudou de verdade
// (pra nao ficar reemitindo o mesmo tile).
function editar(c, r, t) {
  if (!posicaoValida(c, r) || !tileValido(t)) return { mudou: false };
  if (map.tiles[r][c] === t) return { mudou: false };

  map.tiles[r][c] = t;
  if (t === map.baseTiles[r][c]) mudancas.delete(chave(c, r)); // voltou ao original
  else mudancas.set(chave(c, r), t);

  // Trocou o movel por algo que nao segura nada? O que estava em cima vai junto.
  const objetoCaiu = !map.SUPERFICIES.has(t) && limparObjeto(c, r);

  salvar();
  return { mudou: true, objetoCaiu };
}

// Trocar o movel de baixo leva junto o que estava apoiado nele (senao fica um
// monitor flutuando no chao depois de apagar a mesa).
function editarObjeto(c, r, o) {
  if (!posicaoValida(c, r) || !objetoValido(o)) return false;
  // So se apoia coisa EM CIMA de uma superficie: mesa, balcao, estante,
  // armario. Nada de caneca no meio do corredor. Tirar (o === 0) vale sempre,
  // senao um objeto que ficou orfao nunca mais sairia dali.
  if (o && !map.SUPERFICIES.has(map.tiles[r][c])) return false;
  if (map.objetos[r][c] === o) return false;

  map.objetos[r][c] = o;
  if (o) objetos.set(chave(c, r), o);
  else objetos.delete(chave(c, r));
  salvar();
  return true;
}

function limparObjeto(c, r) {
  if (!map.objetos[r] || !map.objetos[r][c]) return false;
  map.objetos[r][c] = 0;
  objetos.delete(chave(c, r));
  return true;
}

function paraEnvio() {
  return comoLista(mudancas, 't');
}

function objetosParaEnvio() {
  return comoLista(objetos, 'o');
}

carregar();

module.exports = {
  editar, editarObjeto, limparObjeto, paraEnvio, objetosParaEnvio,
  tileValido, objetoValido, posicaoValida, TILES_DO_CATALOGO,
};

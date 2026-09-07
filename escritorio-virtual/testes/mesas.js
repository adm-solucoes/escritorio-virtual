// Testa as regras de server/mesas.js direto, sem navegador - as que precisam de
// duas pessoas nao dao pra testar numa aba so (o SEM_LOGIN poe todo mundo na
// mesma conta).
//
//   npm run teste
//
// Ele mexe em server/data/mesas.json e devolve o conteudo no fim. Com o
// servidor rodando, feche a sede antes: o processo dele tem a lista em memoria
// e vai regravar por cima na proxima mudanca.
const path = require('path');
const fs = require('fs');

const RAIZ = path.join(__dirname, '..');
const ARQUIVO = path.join(RAIZ, 'server', 'data', 'mesas.json');

// guarda o arquivo de verdade pra devolver no fim
const original = fs.existsSync(ARQUIVO) ? fs.readFileSync(ARQUIVO, 'utf8') : null;
fs.writeFileSync(ARQUIVO, JSON.stringify({ mesas: [] }));

const mesas = require(path.join(RAIZ, 'server', 'mesas.js'));

const ANA = 'uid-ana';
const BRUNO = 'uid-bruno';
let ok = 0;
let falhou = 0;

function conferir(nome, real, esperado) {
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  console.log((bate ? '  ok   ' : '  FALHOU ') + nome
    + (bate ? '' : '\n         esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(real)));
  bate ? ok++ : falhou++;
}

// A Ana pega a mesa clicando no canto de baixo a direita dela
conferir('Ana pega a mesa clicando em 17,19', mesas.alternar(17, 19, ANA), true);
conferir('  a mesa dela e a 15,18 (canto de cima a esquerda)', mesas.mesaDaPessoa(ANA), '15,18');
conferir('  e a mesa tem as 6 celulas', mesas.paraEnvio()[0].celulas.length, 6);

// O Bruno tenta pegar a mesma mesa, por outra celula
conferir('Bruno nao rouba a mesa da Ana (clicando em 15,18)', mesas.alternar(15, 18, BRUNO), false);
conferir('  e a mesa continua da Ana', mesas.mesaDaPessoa(ANA), '15,18');
conferir('  Bruno segue sem mesa', mesas.mesaDaPessoa(BRUNO), null);

// O Bruno pega a mesa do lado
conferir('Bruno pega a mesa vizinha', mesas.alternar(21, 19, BRUNO), true);
conferir('  sao duas mesas ocupadas', mesas.paraEnvio().length, 2);

// A Ana troca de mesa: a antiga tem que ficar livre
conferir('Ana troca pra uma terceira mesa', mesas.alternar(26, 18, ANA), true);
conferir('  a mesa nova e dela', mesas.mesaDaPessoa(ANA), '25,18');
conferir('  continua com 2 ocupadas (nao acumulou)', mesas.paraEnvio().length, 2);

// Largar pelo perfil
conferir('Ana larga pelo perfil', mesas.largarDe(ANA), true);
conferir('  ficou so a do Bruno', mesas.paraEnvio().length, 1);
conferir('  largar de novo nao faz nada', mesas.largarDe(ANA), false);

// Nao e mesa
conferir('clicar no chao nao pega nada', mesas.alternar(21, 14, ANA), false);

// ---- itens em cima da mesa (posicao livre) ----
const CANECA = 5;
const LIVROS = 10;
mesas.alternar(17, 19, ANA); // Ana volta pra mesa 15,18
const itensDa = (chave) => mesas.paraEnvio().find((m) => m.chave === chave).itens;

conferir('Ana poe caneca na propria mesa', mesas.porItem(15.3, 18.4, CANECA, ANA), true);
conferir('  e outra na MESMA celula, noutro ponto', mesas.porItem(15.8, 18.7, CANECA, ANA), true);
conferir('  as duas ficam (nao e uma por celula)', itensDa('15,18').length, 2);
const primeiro = itensDa('15,18')[0];
conferir('  e guardam a posicao com fracao', [primeiro.o, primeiro.x, primeiro.y], [CANECA, 15.3, 18.4]);
conferir('Ana poe livros noutra celula da mesma mesa', mesas.porItem(17.2, 19.1, LIVROS, ANA), true);

conferir('Bruno NAO poe nada na mesa da Ana', mesas.porItem(16.5, 18.5, CANECA, BRUNO), false);
conferir('Ana NAO poe nada na mesa do Bruno', mesas.porItem(21.5, 18.5, CANECA, ANA), false);
conferir('ninguem poe item no chao', mesas.porItem(21.5, 14.5, CANECA, ANA), false);

// o id que ainda nao existe - a armadilha do OBJETO_MAX
const map = require(path.join(RAIZ, 'server', 'map.js'));
conferir('item acima do OBJETO_MAX (' + map.OBJETO_MAX + ') e recusado',
  mesas.porItem(16.5, 19.5, map.OBJETO_MAX + 1, ANA), false);

// tirar e mover apontam pelo ID, nao por "o mais perto" - com duas canecas
// encostadas, chute nao serve
conferir('objeto 0 nao serve mais de borracha', mesas.porItem(15.85, 18.75, 0, ANA), false);
const alvoId = itensDa('15,18')[1].id;
conferir('cada coisa tem id proprio', typeof alvoId === 'string' && alvoId.length > 3, true);
conferir('mover leva a coisa certa pro ponto novo', mesas.moverItem(alvoId, 16.9, 19.2, ANA), true);
conferir('  e ela foi mesmo', itensDa('15,18').find((i) => i.id === alvoId).x, 16.9);
conferir('  a outra nao saiu do lugar', itensDa('15,18')[0].x, 15.3);
conferir('Bruno nao move coisa da mesa da Ana', mesas.moverItem(alvoId, 16, 19, BRUNO), false);
conferir('nao da pra mover pra fora da mesa', mesas.moverItem(alvoId, 21.5, 18.5, ANA), false);
conferir('Bruno nao tira coisa da mesa da Ana', mesas.tirarItem(alvoId, BRUNO), false);
conferir('tirar pelo id funciona', mesas.tirarItem(alvoId, ANA), true);
conferir('  e tirou a certa (sobrou a de 15.3)', itensDa('15,18')[0].x, 15.3);
conferir('tirar id que nao existe nao faz nada', mesas.tirarItem('naoexiste', ANA), false);

// teto por mesa
let postos = 0;
for (let i = 0; i < 30; i++) if (mesas.porItem(15.1 + (i % 5) * 0.1, 18.1, CANECA, ANA)) postos++;
conferir('a mesa nao aceita item infinito', itensDa('15,18').length <= 14, true);

conferir('largar a mesa leva as coisas junto', mesas.largarDe(ANA), true);
mesas.alternar(17, 19, ANA);
conferir('  e a mesa volta vazia', itensDa('15,18').length, 0);

mesas.porItem(15.5, 18.5, CANECA, ANA);
conferir('trocar de mesa tambem larga as coisas', mesas.alternar(26, 18, ANA), true);
conferir('  a mesa antiga nao esta mais na lista',
  mesas.paraEnvio().some((m) => m.chave === '15,18'), false);
mesas.largarDe(ANA);

// Sobrevive ao restart: le o arquivo de novo num processo limpo
const salvo = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
conferir('o disco guardou a mesa do Bruno', salvo.mesas, [{ chave: '20,18', uid: BRUNO, itens: [] }]);

fs.writeFileSync(ARQUIVO, original === null ? JSON.stringify({ mesas: [] }, null, 2) : original);
console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam');
process.exit(falhou ? 1 : 0);

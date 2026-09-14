// Reunioes internas da sede: quem pode marcar o que, e onde.
//
// O que este teste guarda de verdade sao duas regras que quebram a reuniao DE
// VERDADE quando falham:
//
//   1. duas reunioes na mesma sala no mesmo horario. A sala e fisica: as duas
//      turmas chegam e uma tem que sair. Nao da pra "entrar nas duas".
//   2. cabine de chamada nao e sala de reuniao. As tres cabines tambem sao
//      privativas, mas sao pra uma pessoa - marcar "Alinhamento do Comercial"
//      numa cabine e marcar reuniao onde nao cabe reuniao.
//
// Roda contra o MAPA DE VERDADE: se alguem mexer na planta e tirar a mesa de
// reuniao de uma sala, este teste avisa.
const fs = require('fs');
const os = require('os');
const path = require('path');

// Pasta descartavel: o modulo grava reunioes.json, e nao pode encostar no
// server/data de verdade.
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-reunioes-'));
process.env.DATA_DIR = PASTA;

const reunioes = require('../server/reunioes.js');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

console.log('\nREUNIOES DA SEDE');

const CAIO = { uid: 'u-caio', nome: 'Caio', isAdmin: true };
const ZE = { uid: 'u-ze', nome: 'Ze', isAdmin: false };
const DAQUI_A_UMA_HORA = Date.now() + 60 * 60 * 1000;

try {
  // ------------------------------------------------------- onde cabe marcar
  const salas = reunioes.salasDisponiveis();
  const ids = salas.map((s) => s.id).sort();
  conferir('as salas de reuniao saem da planta', ids, ['huddle1', 'huddle2', 'reuniao']);
  conferir('cabine de chamada NAO entra', ids.some((i) => i.startsWith('cabine')), false);
  conferir('e cada sala diz quantos lugares tem',
    salas.every((s) => s.lugares > 0), true);

  // --------------------------------------------------------------- o basico
  const r1 = reunioes.criar(
    { titulo: 'Alinhamento do Comercial', inicio: DAQUI_A_UMA_HORA, minutos: 60, sala: 'reuniao' }, CAIO);
  conferir('marca uma reuniao', !!r1.reuniao, true);
  conferir('  com a sala pelo nome', r1.reuniao.salaNome, 'Sala de Reuniao');
  conferir('  e o fim calculado da duracao', r1.reuniao.fim - r1.reuniao.inicio, 60 * 60 * 1000);

  // ------------------------------------------- duas na mesma sala e no mesmo horario
  const chocando = reunioes.criar(
    { titulo: 'Outra', inicio: DAQUI_A_UMA_HORA + 30 * 60000, minutos: 30, sala: 'reuniao' }, ZE);
  conferir('sala ocupada recusa, e diz com o que chocou',
    chocando.erro, 'Essa sala ja tem "Alinhamento do Comercial" nesse horario.');

  const outraSala = reunioes.criar(
    { titulo: 'Huddle de Projetos', inicio: DAQUI_A_UMA_HORA, minutos: 30, sala: 'huddle1' }, ZE);
  conferir('mesma hora em OUTRA sala pode', !!outraSala.reuniao, true);

  const depois = reunioes.criar(
    { titulo: 'Retro', inicio: DAQUI_A_UMA_HORA + 2 * 60 * 60000, minutos: 30, sala: 'reuniao' }, ZE);
  conferir('mesma sala depois que a outra acaba, pode', !!depois.reuniao, true);

  // ------------------------------------------------------------- o que nao vale
  conferir('sem titulo nao marca',
    reunioes.criar({ titulo: '   ', inicio: DAQUI_A_UMA_HORA, minutos: 30, sala: 'huddle2' }, CAIO).erro,
    'Poe um titulo na reuniao.');
  conferir('em cabine nao marca',
    reunioes.criar({ titulo: 'X', inicio: DAQUI_A_UMA_HORA, minutos: 30, sala: 'cabine1' }, CAIO).erro,
    'Escolhe uma sala da sede.');
  conferir('em sala inventada nao marca',
    reunioes.criar({ titulo: 'X', inicio: DAQUI_A_UMA_HORA, minutos: 30, sala: 'sala-secreta' }, CAIO).erro,
    'Escolhe uma sala da sede.');
  conferir('de 5 minutos nao marca',
    reunioes.criar({ titulo: 'X', inicio: DAQUI_A_UMA_HORA, minutos: 5, sala: 'huddle2' }, CAIO).erro,
    'A duracao tem que ficar entre 15 minutos e 8 horas.');
  conferir('sem data nao marca',
    reunioes.criar({ titulo: 'X', inicio: 'ontem', minutos: 30, sala: 'huddle2' }, CAIO).erro,
    'Escolhe a data e a hora.');
  conferir('semana passada nao marca',
    reunioes.criar({ titulo: 'X', inicio: Date.now() - 7 * 24 * 3600e3, minutos: 30, sala: 'huddle2' }, CAIO).erro,
    'Essa data ja passou faz tempo.');
  // Marcar as 14h faltando cinco minutos e caso de verdade, entao um dia pra
  // tras e aceito de proposito.
  conferir('hoje mais cedo AINDA marca',
    !!reunioes.criar({ titulo: 'A que acabou', inicio: Date.now() - 2 * 3600e3, minutos: 30, sala: 'huddle2' }, CAIO).reuniao,
    true);

  // ----------------------------------------------------------- quem desmarca
  conferir('quem nao marcou nao desmarca',
    reunioes.remover(r1.reuniao.id, ZE).erro, 'So quem marcou (ou a diretoria) desmarca.');
  conferir('a diretoria desmarca a dos outros',
    !!reunioes.remover(outraSala.reuniao.id, CAIO).reuniao, true);
  conferir('quem marcou desmarca a sua',
    !!reunioes.remover(r1.reuniao.id, { uid: CAIO.uid, isAdmin: false }).reuniao, true);
  conferir('desmarcar o que nao existe avisa',
    reunioes.remover(99999, CAIO).erro, 'Essa reuniao nao existe mais.');

  // --------------------------------------------------------------- no disco
  conferir('a lista sai em ordem de horario',
    reunioes.listar().map((r) => r.titulo),
    ['A que acabou', 'Retro']);
  // O gravador junta as escritas (400ms), entao o arquivo aparece depois.
  setTimeout(() => {
    const arq = path.join(PASTA, 'reunioes.json');
    conferir('e fica gravada no disco', fs.existsSync(arq), true);
    if (fs.existsSync(arq)) {
      const doDisco = JSON.parse(fs.readFileSync(arq, 'utf8'));
      conferir('  com as reunioes que sobraram', doDisco.reunioes.length, 2);
    }
    fs.rmSync(PASTA, { recursive: true, force: true });
    console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
    process.exit(falhou ? 1 : 0);
  }, 700);
} catch (e) {
  falhou++;
  console.log('  FALHOU com erro: ' + e.stack);
  fs.rmSync(PASTA, { recursive: true, force: true });
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(1);
}

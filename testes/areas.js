// Editor de AREAS: a diretoria move e redimensiona o retangulo de cada sala
// (docs/areas.md). Sobe o servidor de verdade, conecta diretoria e membro pelo
// socket, e confere tambem o mapa do cliente (public/js/map.js) numa vm.
//
// O que importa aqui:
//  - so a diretoria mexe, e a checagem e a do servidor;
//  - area nao fica em cima de outra (a pessoa estaria em duas salas, e a
//    chamada fechada de uma vazaria pra outra), nem fora do mapa, nem menor
//    que 2x2;
//  - o que foi mudado sobrevive ao reinicio - inclusive quando uma area foi
//    pro lugar que outra deixou livre (lendo uma de cada vez, bateria);
//  - no cliente, o piso e a sala de cada celula seguem a area.
//
// NAO mexe em server/data: DATA_DIR numa pasta temporaria, apagada no fim.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-areas-'));
const ARQUIVO = path.join(PASTA, 'mapa.json');
const PORTA = 3738;
const BASE = 'http://127.0.0.1:' + PORTA;
const CODIGO_SEDE = 'codigo-areas';
const ADMIN_CODE = 'chefe-areas';

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ servidor
let servidor = null;
let saida = '';
function subir() {
  return new Promise((resolve, reject) => {
    saida = '';
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: PASTA, PORT: String(PORTA), CODIGO_SEDE, ADMIN_CODE, ARQUIVO_ENV: 'nenhum',
        SESSION_SECRET: 'segredo-de-teste-bem-comprido', SEM_LOGIN: '', NODE_ENV: 'test',
        DOMINIOS_SEDE: '', DIRETORIA_EMAILS: '',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_DRIVE_PASTA: '', GOOGLE_CONTA_SERVICO: '',
        TRELLO_API_KEY: '', TRELLO_TOKEN: '', TRELLO_BOARD_ID: '',
        CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '', BACKUP_DRIVE_PASTA: '', BACKUP_CHAVE: '',
        EMAIL_PROVEDOR: '',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    servidor.stdout.on('data', (b) => { saida += b.toString(); });
    servidor.stderr.on('data', (b) => { saida += b.toString(); });
    const prazo = Date.now() + 15000;
    (function tentar() {
      if (servidor.exitCode !== null) return reject(new Error('o servidor morreu no arranque:\n' + saida));
      if (Date.now() > prazo) return reject(new Error('o servidor nao subiu em 15s'));
      fetch(BASE + '/api/saude').then((r) => (r.ok ? resolve() : setTimeout(tentar, 150)))
        .catch(() => setTimeout(tentar, 150));
    })();
  });
}

function parar() {
  return new Promise((resolve) => {
    // morto por sinal (o kill), o exitCode fica null e quem diz e o signalCode
    if (!servidor || servidor.exitCode !== null || servidor.signalCode !== null) return resolve();
    servidor.once('exit', () => resolve());
    servidor.kill();
  });
}

function pedir(rota, corpo) {
  return fetch(BASE + rota, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  }).then(async (r) => ({
    status: r.status,
    cookie: (r.headers.get('set-cookie') || '').split(';')[0] || null,
    corpo: await r.json().catch(() => null),
  }));
}

function entrar(email) {
  return pedir('/api/entrar', { email, senha: 'senha-das-areas-1' }).then((r) => r.cookie);
}

// Socket.io "na unha" (protocolo 4 do engine.io por WebSocket), como no
// testes/contas.js: "40" conecta, "42[...]" e evento, "2" e ping.
function abrirSocket(cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: { Cookie: cookie } });
    const eventos = [];
    const prazo = setTimeout(() => reject(new Error('socket nao conectou')), 5000);
    ws.addEventListener('message', (ev) => {
      const m = String(ev.data);
      if (m.startsWith('0')) ws.send('40');
      else if (m === '2') ws.send('3');
      else if (m.startsWith('40')) {
        clearTimeout(prazo);
        ws.send('42' + JSON.stringify(['join', {}]));
        resolve({
          eventos,
          mandar: (nome, dados) => ws.send('42' + JSON.stringify([nome, dados])),
          fechar: () => ws.close(),
        });
      } else if (m.startsWith('44')) { clearTimeout(prazo); reject(new Error('recusado: ' + m)); }
      else if (m.startsWith('42')) { try { eventos.push(JSON.parse(m.slice(2))); } catch (e) { /* ignora */ } }
    });
    ws.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('erro no socket')); });
  });
}

// O evento `nome` que chegar depois da posicao `desde` da lista (ou null).
async function esperarEvento(sock, nome, desde, ms = 2000) {
  const prazo = Date.now() + ms;
  while (Date.now() < prazo) {
    const achado = sock.eventos.slice(desde).find((e) => e[0] === nome);
    if (achado) return achado[1];
    await espera(20);
  }
  return null;
}

function arquivoDeAreas() {
  try { return JSON.parse(fs.readFileSync(ARQUIVO, 'utf8')).areas || []; } catch (e) { return null; }
}

// Manda e espera a resposta pra quem mandou: aceita ou recusada.
async function editar(sock, dados) {
  const desde = sock.eventos.length;
  sock.mandar('mapa-area', dados);
  const prazo = Date.now() + 2000;
  while (Date.now() < prazo) {
    const r = sock.eventos.slice(desde).find((e) => e[0] === 'mapa-area-atualizada' || e[0] === 'mapa-area-recusada');
    if (r) return { tipo: r[0] === 'mapa-area-atualizada' ? 'aceita' : 'recusada', dados: r[1] };
    await espera(20);
  }
  return { tipo: 'nada' };
}

async function conectarOsDois() {
  const chefe = await abrirSocket(await entrar('chefe@fora.com.br'));
  const membro = await abrirSocket(await entrar('membro@fora.com.br'));
  const initChefe = await esperarEvento(chefe, 'init', 0);
  await esperarEvento(membro, 'init', 0);
  return { chefe, membro, initChefe };
}

// ---------------------------------------------------- o mapa do cliente (vm)
function mapaDoCliente() {
  const ctx = { console, window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/map.js'), 'utf8'), ctx);
  return ctx.window.OfficeMap;
}

(async function () {
  console.log('\nAREAS: MOVER E MUDAR O TAMANHO');
  try {
    // ------------------------------------------------- mapa do cliente, na vm
    const M = mapaDoCliente();
    const focoA = M.ROOMS.find((s) => s.id === 'bairro_a');
    conferir('cliente: Foco comeca com carpete', [M.pisoEmTile(22, 15), M.getRoomAtTile(22, 15).id], ['carpete_roxo', 'bairro_a']);
    conferir('cliente: hall e jardim nao se editam, o resto sim',
      [M.areaEditavel('hall'), M.areaEditavel('jardim'), M.areaEditavel('bairro_a'), M.areaEditavel('nao-existe')],
      [false, false, true, false]);
    conferir('cliente: area em cima de outra e recusada, com o nome dela',
      M.problemaDaArea('bairro_a', { r0: 13, c0: 11, r1: 20, c1: 20 }), 'Ia ficar em cima de "Projetos".');
    conferir('cliente: menor que 2x2 e recusada',
      M.problemaDaArea('bairro_a', { r0: 13, c0: 11, r1: 13, c1: 20 }), 'A area minima e 2 por 2.');
    M.aplicarArea('bairro_a', { r0: 13, c0: 11, r1: 16, c1: 20 });
    conferir('cliente: diminuiu - a celula que saiu vira corredor (piso e sala)',
      [M.pisoEmTile(22, 15), M.getRoomAtTile(22, 15).id], ['tijolo', 'hall']);
    conferir('cliente: e a que ficou continua Foco, com carpete',
      [M.pisoEmTile(13, 15), M.getRoomAtTile(13, 15).id], ['carpete_roxo', 'bairro_a']);
    M.aplicarArea('reuniao', { r0: 4, c0: 13, r1: 8, c1: 17 });
    const reuniao = M.ROOMS.find((s) => s.id === 'reuniao');
    conferir('cliente: a etiqueta anda junto, guardando a distancia do canto',
      [reuniao.labelR, reuniao.labelC], [4, 12]);
    conferir('cliente: o original fica guardado pra voltar',
      M.areaOriginal('bairro_a'), { r0: 13, c0: 11, r1: 18, c1: 26 });
    conferir('cliente: e a sala mexida nao muda o original (copia, nao referencia)', focoA.r1, 16);

    // ------------------------------------------------------------- servidor
    await subir();
    const cad = (nome, email, admin) => pedir('/api/registrar', {
      nome, email, senha: 'senha-das-areas-1', codigo: CODIGO_SEDE, codigoAdmin: admin ? ADMIN_CODE : '',
    });
    const r1 = await cad('Chefe', 'chefe@fora.com.br', true);
    const r2 = await cad('Membro', 'membro@fora.com.br', false);
    conferir('duas contas: uma diretoria, uma nao',
      [r1.status, r1.corpo.usuario.isAdmin, r2.status, r2.corpo.usuario.isAdmin], [200, true, 200, false]);

    let { chefe, membro, initChefe } = await conectarOsDois();
    conferir('o init traz as areas mexidas (nenhuma, na sede nova)', initChefe && initChefe.areasMapa, []);

    // Membro nao mexe.
    const desdeChefe = chefe.eventos.length;
    membro.mandar('mapa-area', { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20 });
    await espera(400);
    conferir('membro (nao diretoria) tenta: ninguem recebe nada',
      chefe.eventos.slice(desdeChefe).some((e) => e[0] === 'mapa-area-atualizada'), false);
    conferir('  e nada foi gravado', arquivoDeAreas(), null);

    // A diretoria diminui o Foco A.
    const desdeMembro = membro.eventos.length;
    const diminuiu = await editar(chefe, { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20 });
    conferir('diretoria diminui o Foco: aceito',
      [diminuiu.tipo, diminuiu.dados], ['aceita', { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20 }]);
    conferir('  e TODO MUNDO recebe na hora (o membro tambem)',
      await esperarEvento(membro, 'mapa-area-atualizada', desdeMembro), { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20 });
    conferir('  gravado no mapa.json (so a que mudou)',
      arquivoDeAreas(), [{ id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20 }]);

    // O que e recusado, e o motivo que volta.
    const casos = [
      ['em cima do Projetos', { id: 'bairro_a', r0: 13, c0: 11, r1: 20, c1: 20 }, 'Ia ficar em cima de "Projetos".'],
      ['fora do mapa', { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 60 }, 'Fora do mapa.'],
      ['menor que 2x2', { id: 'bairro_a', r0: 13, c0: 11, r1: 13, c1: 20 }, 'A area minima e 2 por 2.'],
      ['coordenada que nao e numero', { id: 'bairro_a', r0: 'x', c0: 11, r1: 16, c1: 20 }, 'Fora do mapa.'],
      ['o hall (fundo)', { id: 'hall', r0: 3, c0: 3, r1: 10, c1: 10 }, 'Essa area nao se edita.'],
      ['area que nao existe', { id: 'sala-secreta', r0: 3, c0: 3, r1: 5, c1: 5 }, 'Essa area nao se edita.'],
    ];
    for (const [nome, dados, motivo] of casos) {
      const r = await editar(chefe, dados);
      conferir('recusa ' + nome + ', com o motivo', [r.tipo, r.dados && r.dados.erro], ['recusada', motivo]);
    }
    conferir('  e o arquivo nao mudou com nenhuma delas',
      arquivoDeAreas(), [{ id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20 }]);

    // Uma area vai pro lugar que a outra deixou livre.
    const cabine = await editar(chefe, { id: 'cabine1', r0: 17, c0: 21, r1: 18, c1: 25 });
    conferir('a Cabine 1 vai pro pedaco que o Foco liberou', cabine.tipo, 'aceita');
    const voltarFoco = await editar(chefe, { id: 'bairro_a', restaurar: true });
    conferir('voltar o Foco ao original agora bate na Cabine 1: recusado com o nome dela',
      [voltarFoco.tipo, voltarFoco.dados && voltarFoco.dados.erro], ['recusada', 'Ia ficar em cima de "Cabine 1".']);

    chefe.fechar(); membro.fechar();
    await parar();

    // ------------------------------------------------------------ reinicio
    await subir();
    ({ chefe, membro, initChefe } = await conectarOsDois());
    const areasNoInit = (initChefe.areasMapa || []).slice().sort((a, b) => a.id.localeCompare(b.id));
    conferir('reiniciou: as duas mudancas voltam - inclusive a que depende da outra ter saido',
      areasNoInit, [
        { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20 },
        { id: 'cabine1', r0: 17, c0: 21, r1: 18, c1: 25 },
      ]);

    // Restaurar, na ordem que da.
    const volta1 = await editar(chefe, { id: 'cabine1', restaurar: true });
    conferir('Cabine 1 volta ao original', [volta1.tipo, volta1.dados], ['aceita', { id: 'cabine1', r0: 3, c0: 3, r1: 5, c1: 7 }]);
    const volta2 = await editar(chefe, { id: 'bairro_a', restaurar: true });
    conferir('  e ai o Foco tambem volta', [volta2.tipo, volta2.dados], ['aceita', { id: 'bairro_a', r0: 13, c0: 11, r1: 18, c1: 26 }]);
    conferir('  e o arquivo fica sem area nenhuma (tudo de fabrica)', arquivoDeAreas(), []);
    const deNovo = await editar(chefe, { id: 'bairro_a', r0: 13, c0: 11, r1: 18, c1: 26 });
    conferir('mandar o retangulo que ja esta la: responde (pra tela destravar) sem gravar nada',
      [deNovo.tipo, arquivoDeAreas()], ['aceita', []]);
    const membroRestaura = await editar(membro, { id: 'bairro_a', restaurar: true });
    conferir('membro tambem nao restaura nada', membroRestaura.tipo, 'nada');

    chefe.fechar(); membro.fechar();
    await parar();

    // ---------------------------------------- arquivo que nao fecha (a mao)
    const bruto = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    bruto.areas = [
      { id: 'bairro_a', r0: 13, c0: 11, r1: 21, c1: 26 },   // em cima do Projetos
      { id: 'copa', r0: 3, c0: 27, r1: 8, c1: 34 },
    ];
    fs.writeFileSync(ARQUIVO, JSON.stringify(bruto));
    await subir();
    ({ chefe, membro, initChefe } = await conectarOsDois());
    conferir('mapa.json editado a mao com uma area em cima da outra: fica a planta de fabrica',
      initChefe.areasMapa, []);
    conferir('  e o log diz por que', /areas do mapa\.json nao fecham/.test(saida), true);
    chefe.fechar(); membro.fechar();
    await parar();

    // ------------------------------------------- decoracao de outra planta
    // A planta mudou de tamanho (server/map.js, VERSAO_PLANTA): o que foi salvo
    // por celula na antiga cairia no lugar errado. Sai do caminho - guardado
    // com outro nome, e nao apagado - e a sede comeca do zero.
    fs.writeFileSync(ARQUIVO, JSON.stringify({
      mudancas: [{ c: 12, r: 18, t: 8 }],
      areas: [{ id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20 }],
    }));
    await subir();
    ({ chefe, membro, initChefe } = await conectarOsDois());
    conferir('mapa.json de outra planta (sem versao = a antiga): nada dele entra',
      [initChefe.areasMapa, initChefe.mudancasMapa], [[], []]);
    const guardado = fs.readdirSync(PASTA).filter((n) => n.startsWith('mapa.json.planta-'));
    conferir('  e ele nao some: fica guardado como mapa.json.planta-1',
      [guardado, fs.existsSync(ARQUIVO)], [['mapa.json.planta-1'], false]);
    chefe.fechar(); membro.fechar();
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e.stack || e.message));
  } finally {
    await parar();
    try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch (e) { /* ja foi */ }
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();

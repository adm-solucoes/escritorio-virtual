// Link de visitante, testado de ponta a ponta: sobe o servidor de verdade numa
// pasta de dados descartavel e conversa com ele por HTTP.
//
// E teste de servidor inteiro, e nao de funcao solta, porque o que pode dar
// errado aqui e justamente a costura: um token que o servidor aceita mas a
// conta nasce com poder demais, ou uma rota que esqueceu de checar. Isso nao
// aparece testando convites.js sozinho.
//
// NAO mexe em server/data: usa DATA_DIR numa pasta temporaria, que e apagada
// no fim. Pode rodar com o servidor de desenvolvimento de pe.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-convidado-'));
const PORTA = 3711;
const BASE = 'http://127.0.0.1:' + PORTA;
const CODIGO_SEDE = 'teste-sede';
const ADMIN_CODE = 'teste-chefe';

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

let servidor = null;

function derrubar() {
  if (servidor && !servidor.killed) servidor.kill();
  try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch (e) { /* ja foi */ }
}

// Sobe e espera o /api/saude responder. Sem essa espera o primeiro pedido sai
// antes do listen e o teste falha por corrida, nao por bug.
function subir() {
  return new Promise((resolve, reject) => {
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: PASTA,
        PORT: String(PORTA),
        CODIGO_SEDE,
        ADMIN_CODE,
        SESSION_SECRET: 'segredo-de-teste-bem-comprido',
        SEM_LOGIN: '',
        NODE_ENV: 'test',      // 'production' poria o cookie como Secure e o teste e http
        // Vazias de proposito: o ambiente ganha do .env, e sem isso o teste
        // usaria as credenciais de verdade da maquina - e falharia sem internet.
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
        TRELLO_API_KEY: '',
        TRELLO_TOKEN: '',
        TRELLO_BOARD_ID: '',
        GOOGLE_DRIVE_PASTA: '',
        GOOGLE_CONTA_SERVICO: '',
        CLOUDFLARE_TURN_KEY_ID: '',
        CLOUDFLARE_TURN_TOKEN: '',
        EMAIL_PROVEDOR: '',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let erroDoServidor = '';
    servidor.stderr.on('data', (b) => { erroDoServidor += b.toString(); });

    const prazo = Date.now() + 15000;
    (function tentar() {
      if (servidor.exitCode !== null) {
        return reject(new Error('o servidor morreu no arranque:\n' + erroDoServidor));
      }
      if (Date.now() > prazo) return reject(new Error('o servidor nao subiu em 15s'));
      fetch(BASE + '/api/saude')
        .then((r) => (r.ok ? resolve() : setTimeout(tentar, 150)))
        .catch(() => setTimeout(tentar, 150));
    })();
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Espera o evento CHEGAR, em vez de dormir um tempo fixo e torcer.
//
// Escrevi primeiro com `espera(600)` e a bateria inteira ficou INTERMITENTE:
// passava sozinha, falhava de vez em quando rodando com as outras (que sobem
// servidor e disputam a maquina). Teste de seguranca que pisca e pior que teste
// nenhum - ele ensina a rodar de novo ate ficar verde, e um dia o vermelho de
// verdade passa batido junto.
function esperarEvento(soquete, nome, prazoMs = 8000) {
  const limite = Date.now() + prazoMs;
  return new Promise((resolve) => {
    (function olhar() {
      const achado = soquete.eventos.find((e) => e[0] === nome);
      if (achado) return resolve(achado);
      if (Date.now() > limite) return resolve(null);
      setTimeout(olhar, 50);
    })();
  });
}

// Socket.io "na unha" (o projeto nao tem o cliente de Node): protocolo 4 do
// engine.io por WebSocket. "40" conecta, "42[...]" e evento, "2" e ping.
// Mesma tecnica de testes/contas.js - a agenda e o Trello so existem por
// socket, entao nao da pra conferir esses dois so por HTTP.
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
        resolve({ eventos, ws });
      } else if (m.startsWith('44')) { clearTimeout(prazo); reject(new Error('recusado: ' + m)); }
      else if (m.startsWith('42')) { try { eventos.push(JSON.parse(m.slice(2))); } catch (e) { /* ignora */ } }
    });
    ws.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('erro no socket')); });
  });
}

// Guarda o cookie de sessao de cada "pessoa" do teste.
function pedir(rota, { metodo = 'GET', corpo, cookie } = {}) {
  const cabecalhos = { 'Content-Type': 'application/json' };
  if (cookie) cabecalhos.Cookie = cookie;
  return fetch(BASE + rota, {
    method: metodo,
    headers: cabecalhos,
    body: corpo ? JSON.stringify(corpo) : undefined,
  }).then(async (r) => ({
    status: r.status,
    cookie: (r.headers.get('set-cookie') || '').split(';')[0] || null,
    corpo: await r.json().catch(() => null),
  }));
}

(async function () {
  console.log('\nLINK DE VISITANTE');
  try {
    await subir();

    // ---------------------------------------------------------- a diretoria
    const chefe = await pedir('/api/registrar', {
      metodo: 'POST',
      corpo: {
        nome: 'Chefe', email: 'chefe@adm.com', senha: 'senha-bem-longa',
        codigo: CODIGO_SEDE, codigoAdmin: ADMIN_CODE,
      },
    });
    conferir('a diretoria cria conta', chefe.status, 200);
    conferir('e ela e diretoria mesmo', chefe.corpo.usuario.isAdmin, true);

    // ------------------------------------------------------------- o convite
    const semSessao = await pedir('/api/convite', { metodo: 'POST' });
    conferir('sem sessao nao gera convite', semSessao.status, 401);

    const gerado = await pedir('/api/convite', { metodo: 'POST', cookie: chefe.cookie });
    conferir('a diretoria gera o convite', gerado.status, 200);
    const token = gerado.corpo.token;
    conferir('o link ja vem pronto', gerado.corpo.caminho.startsWith('/?convite='), true);
    conferir('com validade no futuro', gerado.corpo.expiraEm > Date.now(), true);

    // ------------------------------------------------------- token adulterado
    const mexido = await pedir('/api/convite/entrar', {
      metodo: 'POST',
      corpo: { token: token.slice(0, -2) + 'ff', nome: 'Intruso' },
    });
    conferir('token adulterado e recusado', mexido.status, 403);

    const inventado = await pedir('/api/convite/entrar', {
      metodo: 'POST',
      corpo: { token: 'qualquer-coisa.abc', nome: 'Intruso' },
    });
    conferir('token inventado e recusado', inventado.status, 403);

    // --------------------------------------------------------- o visitante
    const semNome = await pedir('/api/convite/entrar', { metodo: 'POST', corpo: { token, nome: '  ' } });
    conferir('sem nome nao entra', semNome.status, 400);

    const visita = await pedir('/api/convite/entrar', {
      metodo: 'POST', corpo: { token, nome: 'Cliente' },
    });
    conferir('o visitante entra pelo link', visita.status, 200);
    conferir('com o nome que digitou', visita.corpo.usuario.nome, 'Cliente');
    conferir('marcado como visitante', visita.corpo.usuario.convidado, true);
    conferir('e nunca como diretoria', visita.corpo.usuario.isAdmin, false);
    conferir('o servidor deu cookie de sessao', !!visita.cookie, true);

    const eu = await pedir('/api/eu', { cookie: visita.cookie });
    conferir('a sessao do visitante vale', eu.status, 200);
    conferir('e continua sendo visitante', eu.corpo.usuario.convidado, true);

    // ---------------------------------------------- o que ele NAO pode fazer
    const emailDele = visita.corpo.usuario.email;
    const porSenha = await pedir('/api/entrar', {
      metodo: 'POST', corpo: { email: emailDele, senha: '' },
    });
    conferir('conta de visitante nao loga por senha (vazia)', porSenha.status, 401);
    const porSenha2 = await pedir('/api/entrar', {
      metodo: 'POST', corpo: { email: emailDele, senha: 'chutando' },
    });
    conferir('nem chutando uma senha', porSenha2.status, 401);

    const geraConvite = await pedir('/api/convite', { metodo: 'POST', cookie: visita.cookie });
    conferir('visitante nao gera convite', geraConvite.status, 403);

    // A estante mostra a capa pra todo mundo, mas o LIVRO e so da sede: o acervo
    // e material interno. O id nem precisa existir - a porta fecha antes.
    const abreLivro = await pedir('/api/estante/qualquerid123/arquivo', { cookie: visita.cookie });
    conferir('visitante nao abre livro da estante', abreLivro.status, 403);

    const leEstante = await pedir('/api/estante', { cookie: visita.cookie });
    conferir('mas VE a estante normalmente', leEstante.status, 200);
    conferir('  e a estante avisa que ele nao le',
      leEstante.corpo && leEstante.corpo.podeLer, false);

    // ------------------------------------------------------------- revogar
    const revoga = await pedir('/api/convite/revogar', { metodo: 'POST', cookie: chefe.cookie });
    conferir('a diretoria invalida os links', revoga.status, 200);

    const depois = await pedir('/api/convite/entrar', {
      metodo: 'POST', corpo: { token, nome: 'Atrasado' },
    });
    conferir('o link antigo morreu', depois.status, 403);

    const aindaDentro = await pedir('/api/eu', { cookie: visita.cookie });
    conferir('mas quem ja entrou continua dentro', aindaDentro.status, 200);

    const novo = await pedir('/api/convite', { metodo: 'POST', cookie: chefe.cookie });
    const comNovo = await pedir('/api/convite/entrar', {
      metodo: 'POST', corpo: { token: novo.corpo.token, nome: 'Outro' },
    });
    conferir('e o link novo ja funciona', comNovo.status, 200);

    // --------------------------------------------- o que ele NAO pode LER
    // Ate aqui o teste so cobria o que o visitante nao pode ESCREVER. Uma
    // varredura achou tres coisas que ele podia LER e nao devia: a agenda do
    // time inteiro, o quadro do Trello e o nome de quem pegou cada livro da
    // estante fisica. Nenhuma delas tinha checagem nenhuma - e visitante tem
    // sessao de verdade, entao bastava abrir o link.
    //
    // A regra do projeto sempre foi essa: ele ve a capa do livro e nao abre o
    // livro. Estas checagens sao a mesma regra, nos lugares que tinham ficado
    // de fora.
    const acervo = await pedir('/api/acervo-fisico', { cookie: visita.cookie });
    conferir('visitante VE o acervo fisico', acervo.status, 200);
    const pegos = (acervo.corpo.livros || []).filter((l) => l.emprestimo);
    conferir('  mas nao pode pegar livro', acervo.corpo.podePegar, false);
    conferir('  e nao ve QUEM pegou (nem nome, nem uid)',
      pegos.every((l) => !('nome' in l.emprestimo) && !('uid' in l.emprestimo)), true);

    const socketVisita = await abrirSocket(visita.cookie);
    // O `join` sai dentro do abrirSocket; o `init` de volta e a prova de que o
    // servidor ja registrou este socket como player. So depois dele os pedidos
    // valem - antes, o handler cai no `if (!player) return` e nao responde
    // nada, o que pareceria "guarda funcionando" pelo motivo errado.
    await esperarEvento(socketVisita, 'init');
    socketVisita.ws.send('42' + JSON.stringify(['agenda-pedir']));
    socketVisita.ws.send('42' + JSON.stringify(['trello-pedir']));
    const agendaRecebida = await esperarEvento(socketVisita, 'agenda');
    const trelloRecebido = await esperarEvento(socketVisita, 'trello');

    // A assercao confere a MENSAGEM, e nao so "veio indisponivel".
    //
    // Escrevi primeiro do jeito frouxo - "tem indisponivel e a lista esta
    // vazia" - e ele PASSOU COM A GUARDA REMOVIDA. Motivo: neste teste o Google
    // nao esta configurado, entao a agenda ja responde "nao configurado" e a
    // lista ja vem vazia. O teste dava verde pelo motivo errado, e em producao
    // - com o Google ligado - a agenda vazaria com o teste sorrindo.
    //
    // Este texto so pode vir da guarda. Se ela sair, a checagem cai.
    conferir('visitante NAO recebe a agenda do time',
      /so de quem e da sede/.test((agendaRecebida && agendaRecebida[1].indisponivel) || ''), true);
    conferir('visitante NAO recebe o quadro do Trello',
      /so de quem e da sede/.test((trelloRecebido && trelloRecebido[1].indisponivel) || ''), true);
    // E a lista de reunioes nem chega: a guarda devolve antes de emitir.
    conferir('  nem a lista de reunioes da sede',
      socketVisita.eventos.some((e) => e[0] === 'reunioes'), false);
    socketVisita.ws.close();
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + e.message);
  } finally {
    derrubar();
  }

  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();

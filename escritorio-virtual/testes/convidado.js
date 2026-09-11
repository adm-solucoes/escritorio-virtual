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

    const poeLivro = await pedir('/api/estante/livro', {
      metodo: 'POST', cookie: visita.cookie, corpo: { titulo: 'x', url: 'http://x' },
    });
    conferir('visitante nao mexe na estante', poeLivro.status, 403);

    const leEstante = await pedir('/api/estante', { cookie: visita.cookie });
    conferir('mas LE a estante normalmente', leEstante.status, 200);

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
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + e.message);
  } finally {
    derrubar();
  }

  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();

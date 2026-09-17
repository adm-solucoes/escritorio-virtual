// Rotas de conta: criar, entrar, sair, quem sou eu e salvar o avatar.
// Ver docs/plano-login.md, secao 5.
const crypto = require('crypto');
const express = require('express');
const usuarios = require('./usuarios');
const sessao = require('./sessao');
const convites = require('./convites');
const google = require('./google');
const { DOMINIOS, ehEmailDaSede } = require('./dominios');

// ---- quem pode criar conta na sede -----------------------------------------
//
// Tres portas, da mais forte pra mais fraca:
//
//   1. ENTRAR COM O GOOGLE da ADM (quando GOOGLE_CLIENT_ID/SECRET estao
//      configurados). O Google prova que a pessoa e dona do e-mail
//      @admsolucoes. Com ele ligado, e-mail da ADM SO entra por aqui.
//   2. e-mail da ADM + senha, SO enquanto o Google nao esta ligado. Nao prova
//      nada - qualquer um digita fulano@admsolucoes.com.br -, entao essa porta
//      nunca da diretoria e tem limite de contas por IP.
//   3. e-mail de fora + CODIGO_SEDE (estagiario com e-mail pessoal, parceiro).
//      Sem a variavel configurada, fechada.
//
// Historia, pra ninguem desfazer sem querer: o "codigo da sede" era a porta
// principal e tinha valor padrao escrito neste arquivo - que vai pra um
// repositorio publico. Virou "e-mail da ADM entra direto, e a primeira conta
// nasce diretoria". So que o e-mail nao era conferido: com a sede vazia depois
// de um deploy, o primeiro estranho que digitasse um @admsolucoes qualquer
// virava diretoria. Dai o Google.
const CODIGO_SEDE = String(process.env.CODIGO_SEDE || '').trim();
const ADMIN_CODE = String(process.env.ADMIN_CODE || '').trim();

// Quem entra com o Google e vira diretoria sozinho. Vazio = a primeira pessoa
// que entrar com o Google numa sede SEM diretoria. Ver docs/plano-login.md.
const DIRETORIA_EMAILS = String(process.env.DIRETORIA_EMAILS || '')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const NOME_NONCE = 'adm_google_nonce';

const MAX_NOME = 18;
const MIN_SENHA = 8;
const MAX_SENHA = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Freio simples de forca bruta por IP (em memoria, some no restart).
const JANELA_MS = 15 * 60 * 1000;
const MAX_TENTATIVAS = 10;
const tentativas = new Map(); // ip -> { qtd, ate }

function tentativasDoIp(ip) {
  const registro = tentativas.get(ip);
  if (!registro || registro.ate < Date.now()) {
    const novo = { qtd: 0, ate: Date.now() + JANELA_MS };
    tentativas.set(ip, novo);
    return novo;
  }
  return registro;
}

function bloqueado(ip) {
  return tentativasDoIp(ip).qtd >= MAX_TENTATIVAS;
}

function contarErro(ip) {
  tentativasDoIp(ip).qtd += 1;
}

function limparErros(ip) {
  tentativas.delete(ip);
}

// Contas CRIADAS por IP. O freio de cima conta erro; este conta acerto, porque
// criar conta nao precisa errar nada. Folgado de proposito: a sala da ADM (ou a
// UECE) sai pra internet por um IP so, e 20 pessoas se cadastrando no mesmo dia
// e normal. Robo criando conta em serie, nao.
const JANELA_CADASTRO_MS = 60 * 60 * 1000;
const MAX_CADASTROS = 20;
const cadastros = new Map(); // ip -> { qtd, ate }

function cadastrosDoIp(ip) {
  const registro = cadastros.get(ip);
  if (!registro || registro.ate < Date.now()) {
    const novo = { qtd: 0, ate: Date.now() + JANELA_CADASTRO_MS };
    cadastros.set(ip, novo);
    return novo;
  }
  return registro;
}

function loginGoogleLigado() {
  return google.configurado();
}

// A conta de quem o Google acabou de confirmar. Cria se nao existe; se existe,
// vincula (e isso apaga a senha e derruba sessoes - ver usuarios.vincularGoogle).
function contaDoGoogle({ email, nome, sub }) {
  let conta = usuarios.porEmail(email);
  if (!conta) {
    conta = usuarios.criarPeloGoogle({ nome: nome.slice(0, MAX_NOME) || 'ADM', email, sub, isAdmin: false });
    console.log('[contas] ' + email + ' criou conta com o Google.');
  } else {
    conta = usuarios.vincularGoogle(conta.id, sub);
  }

  // Diretoria automatica: so aqui, com e-mail provado pelo Google. Com a lista
  // configurada, vale a lista. Sem ela, vale "a sede nao tem diretoria nenhuma"
  // - senao a sede recem-publicada (plano free apaga as contas) fica sem ninguem
  // que possa decorar, convidar ou gerenciar.
  const naLista = DIRETORIA_EMAILS.includes(email.toLowerCase());
  const semDiretoria = !DIRETORIA_EMAILS.length && usuarios.totalDeDiretoria() === 0;
  if (!conta.isAdmin && (naLista || semDiretoria)) {
    conta = usuarios.definirDiretoria(conta.id, true);
    console.log('[contas] ' + email + ' virou diretoria ' + (naLista ? '(DIRETORIA_EMAILS).' : '(sede sem diretoria).'));
  }
  usuarios.marcarAcesso(conta.id);
  return conta;
}

// Fim do login com o Google: chamado pela rota /api/google/callback do
// index.js, que e dividida com a conexao da agenda.
async function concluirLoginGoogle(req, res) {
  const { code, state, error } = req.query;
  const nonce = sessao.lerCookies(req.headers.cookie)[NOME_NONCE];
  // o nonce serve pra UMA volta so
  sessao.definirCookieCurto(res, NOME_NONCE, '', 0, '/api/google');

  if (error) return res.redirect('/?entrar=cancelado');
  if (typeof code !== 'string' || typeof state !== 'string') return res.redirect('/?entrar=erro');

  const r = await google.identidadeDoLogin(code, state, nonce);
  if (r.erro) {
    console.error('[login google] recusado: ' + r.motivo);
    return res.redirect('/?entrar=' + (r.erro === 'dominio' ? 'dominio' : 'erro'));
  }
  const conta = contaDoGoogle(r);
  sessao.definirCookie(res, conta.id);
  res.redirect('/');
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

// `aoEncerrarConta(uid, motivo)` vem do index.js: derruba os sockets abertos da
// pessoa (e larga a mesa dela). A sessao HTTP ja cai sozinha - o cookie deixa
// de valer -, mas uma aba que esta aberta AGORA continuaria dentro da sede ate
// recarregar, e "removi o ex-membro" nao pode significar "ele sai amanha".
function criarRotas(sanitizeAppearance, ganchos = {}) {
  const rotas = express.Router();
  const aoEncerrarConta = typeof ganchos.aoEncerrarConta === 'function' ? ganchos.aoEncerrarConta : () => {};

  rotas.post('/registrar', (req, res) => {
    const ip = req.ip || 'desconhecido';
    // chutar o codigo da sede e forca bruta como chutar senha
    if (bloqueado(ip)) {
      return res.status(429).json({ erro: 'Muitas tentativas. Espera uns minutos.' });
    }
    if (cadastrosDoIp(ip).qtd >= MAX_CADASTROS) {
      return res.status(429).json({ erro: 'Muitas contas criadas daqui. Tenta de novo mais tarde.' });
    }

    const corpo = req.body || {};
    const nome = texto(corpo.nome).slice(0, MAX_NOME);
    const email = texto(corpo.email);
    const senha = typeof corpo.senha === 'string' ? corpo.senha : '';
    const codigo = texto(corpo.codigo);

    if (!nome) return res.status(400).json({ erro: 'Diz teu nome.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ erro: 'E-mail invalido.' });

    if (ehEmailDaSede(email)) {
      // Com o Google ligado, e-mail da ADM so entra provando que e dono dele.
      if (loginGoogleLigado()) {
        return res.status(403).json({
          erro: 'Quem e da ADM entra com o botao "Entrar com o Google" - sem senha nenhuma.',
        });
      }
    } else {
      // Quem nao tem e-mail da empresa precisa do codigo - e se o codigo nao
      // estiver configurado, esse caminho simplesmente nao existe.
      if (!CODIGO_SEDE) {
        return res.status(403).json({
          erro: 'A sede so aceita e-mail @' + DOMINIOS[0] + '. Peca um convite pra diretoria.',
        });
      }
      if (codigo !== CODIGO_SEDE) {
        contarErro(ip);
        return res.status(403).json({
          erro: 'Com e-mail de fora, precisa do codigo da sede. Peca pra diretoria.',
        });
      }
    }

    if (senha.length < MIN_SENHA) {
      return res.status(400).json({ erro: 'A senha precisa de pelo menos ' + MIN_SENHA + ' caracteres.' });
    }
    if (senha.length > MAX_SENHA) return res.status(400).json({ erro: 'Senha grande demais.' });
    if (usuarios.porEmail(email)) {
      return res.status(409).json({ erro: 'Ja existe uma conta com esse e-mail.' });
    }

    // Cadastro com senha NUNCA da diretoria sozinho - nem pra primeira conta.
    // Aqui ninguem provou quem e: "a primeira conta nasce diretoria" deixava o
    // primeiro estranho a digitar um @admsolucoes depois de um deploy mandar na
    // sede. Diretoria automatica so pelo Google (ver contaDoGoogle); por senha,
    // so com o ADMIN_CODE.
    cadastrosDoIp(ip).qtd += 1;
    const usuario = usuarios.criar({
      nome,
      email,
      senha,
      isAdmin: !!codigoDeAdmin(corpo.codigoAdmin),
    });
    sessao.definirCookie(res, usuario.id);
    res.json({ usuario: usuarios.publico(usuario) });
  });

  // O que a tela de login deve oferecer. Publico: a tela aparece antes de ter
  // sessao.
  rotas.get('/login-opcoes', (req, res) => {
    res.json({ google: loginGoogleLigado(), dominio: DOMINIOS[0] });
  });

  // Inicio do login com o Google. O fim e o concluirLoginGoogle.
  rotas.get('/google/entrar', (req, res) => {
    if (!loginGoogleLigado()) return res.redirect('/?entrar=indisponivel');
    const nonce = crypto.randomBytes(24).toString('base64url');
    // 10 min, igual a validade do state; e so o caminho da volta enxerga
    sessao.definirCookieCurto(res, NOME_NONCE, nonce, 600, '/api/google');
    res.redirect(google.urlDeLogin(nonce));
  });

  rotas.post('/entrar', (req, res) => {
    const ip = req.ip || 'desconhecido';
    if (bloqueado(ip)) {
      return res.status(429).json({ erro: 'Muitas tentativas. Espera uns minutos.' });
    }

    const corpo = req.body || {};
    const usuario = usuarios.porEmail(texto(corpo.email));
    const senha = typeof corpo.senha === 'string' ? corpo.senha : '';

    // Mesma resposta nos dois casos: nao entrega quais e-mails existem.
    if (!usuario || !senha || !usuarios.senhaConfere(senha, usuario)) {
      contarErro(ip);
      return res.status(401).json({ erro: 'E-mail ou senha invalidos.' });
    }

    limparErros(ip);
    usuarios.marcarAcesso(usuario.id);
    sessao.definirCookie(res, usuario.id);
    res.json({ usuario: usuarios.publico(usuario) });
  });

  // ---------------------------------------------------------------- convite
  // Ver docs/plano-convidado.md.
  rotas.post('/convite', sessao.exigirDiretoria, (req, res) => {
    const horas = Number((req.body || {}).horas) || convites.HORAS_PADRAO;
    const { token, expiraEm } = convites.criar({ quemCriou: req.usuario.id, horas });
    res.json({ token, expiraEm, caminho: '/?convite=' + encodeURIComponent(token) });
  });

  rotas.post('/convite/revogar', sessao.exigirDiretoria, (req, res) => {
    res.json({ geracao: convites.revogarTodos() });
  });

  rotas.post('/convite/entrar', (req, res) => {
    const ip = req.ip || 'desconhecido';
    // O mesmo freio do login: sem ele daria pra ficar chutando assinatura.
    if (bloqueado(ip)) {
      return res.status(429).json({ erro: 'Muitas tentativas. Espera uns minutos.' });
    }

    const corpo = req.body || {};
    if (!convites.ler(texto(corpo.token))) {
      contarErro(ip);
      return res.status(403).json({ erro: 'Esse link de convite nao vale mais. Peca outro.' });
    }

    const nome = texto(corpo.nome).slice(0, MAX_NOME);
    if (!nome) return res.status(400).json({ erro: 'Diz teu nome.' });

    limparErros(ip);
    const usuario = usuarios.criarConvidado({ nome });
    sessao.definirCookie(res, usuario.id, sessao.DURACAO_CONVIDADO_MS);
    res.json({ usuario: usuarios.publico(usuario) });
  });

  rotas.post('/sair', (req, res) => {
    sessao.limparCookie(res);
    res.json({ ok: true });
  });

  // Health check da hospedagem: tem que responder 200 SEM login, senao o Render
  // acha que o servico caiu. Nao use /eu pra isso - ele responde 401 de proposito.
  rotas.get('/saude', (req, res) => {
    res.json({ ok: true, contas: usuarios.totalDeContas() });
  });

  rotas.get('/eu', (req, res) => {
    const usuario = sessao.usuarioDaRequisicao(req);
    if (!usuario) return res.status(401).json({ erro: 'Sem sessao.' });
    res.json({ usuario: usuarios.publico(usuario) });
  });

  // ------------------------------------------------------------------- senha
  // Trocar a propria senha. Pede a atual: sessao aberta num PC emprestado nao
  // pode virar conta tomada. Visitante nao tem senha.
  rotas.put('/senha', sessao.exigirMembro, (req, res) => {
    const ip = req.ip || 'desconhecido';
    if (bloqueado(ip)) {
      return res.status(429).json({ erro: 'Muitas tentativas. Espera uns minutos.' });
    }
    const corpo = req.body || {};
    const atual = typeof corpo.senhaAtual === 'string' ? corpo.senhaAtual : '';
    const nova = typeof corpo.novaSenha === 'string' ? corpo.novaSenha : '';

    if (!usuarios.senhaConfere(atual, req.usuario)) {
      contarErro(ip);
      return res.status(403).json({ erro: 'A senha atual nao confere.' });
    }
    if (nova.length < MIN_SENHA) {
      return res.status(400).json({ erro: 'A senha nova precisa de pelo menos ' + MIN_SENHA + ' caracteres.' });
    }
    if (nova.length > MAX_SENHA) return res.status(400).json({ erro: 'Senha grande demais.' });
    if (nova === atual) return res.status(400).json({ erro: 'A senha nova e igual a atual.' });

    limparErros(ip);
    const conta = usuarios.trocarSenha(req.usuario.id, nova);
    // Trocar a senha derruba as OUTRAS sessoes (a versao subiu). Esta aqui
    // ganha um cookie novo na hora, senao a pessoa caia pro login no mesmo
    // clique em que trocou a senha.
    sessao.definirCookie(res, conta.id);
    res.json({ usuario: usuarios.publico(conta) });
  });

  // -------------------------------------------------------------- WhatsApp
  // O proprio numero (vazio apaga).
  rotas.put('/perfil/whatsapp', sessao.exigirMembro, (req, res) => {
    const r = usuarios.definirWhatsapp(req.usuario.id, (req.body || {}).numero);
    if (r.erro) return res.status(400).json({ erro: r.erro });
    res.json(r);
  });

  // O numero de um colega, pro botao do cartao. Um por vez e so pra membro: o
  // numero nao vai na lista de pessoas que o socket manda pra todo mundo -
  // visitante incluso.
  rotas.get('/pessoas/:uid/whatsapp', sessao.exigirMembro, (req, res) => {
    const u = usuarios.porId(req.params.uid);
    if (!u || u.convidado) return res.json({ whatsapp: null });
    res.set('Cache-Control', 'no-store');
    res.json({ whatsapp: u.whatsapp || null });
  });

  // ---------------------------------------------------------------- membros
  // Tela da diretoria. Sem servico de e-mail nao ha "esqueci minha senha" por
  // link: quem esqueceu pede pra diretoria, que gera uma senha provisoria.
  rotas.get('/membros', sessao.exigirDiretoria, (req, res) => {
    res.json({ membros: usuarios.membros(), eu: req.usuario.id });
  });

  function alvoDe(req, res) {
    const alvo = usuarios.porId(req.params.id);
    if (!alvo || alvo.convidado) {
      res.status(404).json({ erro: 'Essa conta nao existe mais.' });
      return null;
    }
    return alvo;
  }

  rotas.post('/membros/:id/redefinir-senha', sessao.exigirDiretoria, (req, res) => {
    const alvo = alvoDe(req, res);
    if (!alvo) return;
    if (alvo.id === req.usuario.id) {
      return res.status(400).json({ erro: 'Pra sua propria conta, use "Trocar senha".' });
    }
    // Conta provada pelo Google nao ganha senha pela mao de terceiros: seria a
    // diretoria abrindo uma porta que o Google nao confere - e entrando nela.
    if (alvo.googleSub) {
      return res.status(400).json({ erro: 'Essa pessoa entra com o Google: nao ha senha pra redefinir.' });
    }
    const senhaTemporaria = usuarios.redefinirSenha(alvo.id);
    aoEncerrarConta(alvo.id, 'senha-redefinida');
    console.log('[membros] ' + req.usuario.email + ' redefiniu a senha de ' + alvo.email);
    // A provisoria sai UMA vez, nesta resposta. Nao fica guardada em lugar
    // nenhum em texto - so o hash, como qualquer senha.
    res.json({ senhaTemporaria, membros: usuarios.membros() });
  });

  rotas.put('/membros/:id/diretoria', sessao.exigirDiretoria, (req, res) => {
    const alvo = alvoDe(req, res);
    if (!alvo) return;
    const isAdmin = !!(req.body && req.body.isAdmin);
    // Tirar a propria diretoria e o jeito mais facil de trancar a sede sem
    // ninguem que consiga administrar. Outra pessoa da diretoria faz isso.
    if (alvo.id === req.usuario.id && !isAdmin) {
      return res.status(400).json({ erro: 'Peca pra outra pessoa da diretoria tirar a sua.' });
    }
    usuarios.definirDiretoria(alvo.id, isAdmin);
    console.log('[membros] ' + req.usuario.email + (isAdmin ? ' deu' : ' tirou') + ' diretoria de ' + alvo.email);
    res.json({ membros: usuarios.membros() });
  });

  rotas.delete('/membros/:id', sessao.exigirDiretoria, (req, res) => {
    const alvo = alvoDe(req, res);
    if (!alvo) return;
    if (alvo.id === req.usuario.id) {
      return res.status(400).json({ erro: 'Voce nao pode remover a propria conta.' });
    }
    // derruba ANTES de apagar: o gancho ainda acha a mesa e o socket pela conta
    aoEncerrarConta(alvo.id, 'conta-removida');
    usuarios.remover(alvo.id);
    console.log('[membros] ' + req.usuario.email + ' removeu ' + alvo.email);
    res.json({ membros: usuarios.membros() });
  });

  rotas.put('/perfil', sessao.exigirLogin, (req, res) => {
    const corpo = req.body || {};
    const nome = texto(corpo.nome).slice(0, MAX_NOME);
    const atualizado = usuarios.atualizarPerfil(req.usuario.id, {
      nome: nome || undefined,
      appearance: corpo.appearance ? sanitizeAppearance(corpo.appearance) : undefined,
    });
    res.json({ usuario: usuarios.publico(atualizado) });
  });

  return rotas;
}

// Codigo vazio nao casa com nada: sem ADMIN_CODE configurado, este caminho
// fica fechado em vez de aceitar string vazia e promover todo mundo.
function codigoDeAdmin(valor) {
  return !!ADMIN_CODE && typeof valor === 'string' && valor.trim() === ADMIN_CODE;
}

module.exports = {
  criarRotas,
  concluirLoginGoogle,
  loginGoogleLigado,
  CODIGO_SEDE,
  DOMINIOS,
  DIRETORIA_EMAILS,
  // pros testes
  _ehEmailDaSede: ehEmailDaSede,
};

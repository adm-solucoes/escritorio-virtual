// Rotas de conta: criar, entrar, sair, quem sou eu e salvar o avatar.
// Ver docs/plano-login.md, secao 5.
const express = require('express');
const usuarios = require('./usuarios');
const sessao = require('./sessao');

// Codigo que a diretoria compartilha com a equipe pra liberar o cadastro.
const CODIGO_SEDE = process.env.CODIGO_SEDE || 'adm-solucoes';
const ADMIN_CODE = process.env.ADMIN_CODE || 'adm-solucoes-2026';

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

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function criarRotas(sanitizeAppearance) {
  const rotas = express.Router();

  rotas.post('/registrar', (req, res) => {
    const corpo = req.body || {};
    const nome = texto(corpo.nome).slice(0, MAX_NOME);
    const email = texto(corpo.email);
    const senha = typeof corpo.senha === 'string' ? corpo.senha : '';
    const codigo = texto(corpo.codigo);

    if (codigo !== CODIGO_SEDE) {
      return res.status(403).json({ erro: 'Codigo da sede invalido. Peca pra diretoria.' });
    }
    if (!nome) return res.status(400).json({ erro: 'Diz teu nome.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ erro: 'E-mail invalido.' });
    if (senha.length < MIN_SENHA) {
      return res.status(400).json({ erro: 'A senha precisa de pelo menos ' + MIN_SENHA + ' caracteres.' });
    }
    if (senha.length > MAX_SENHA) return res.status(400).json({ erro: 'Senha grande demais.' });
    if (usuarios.porEmail(email)) {
      return res.status(409).json({ erro: 'Ja existe uma conta com esse e-mail.' });
    }

    const usuario = usuarios.criar({
      nome,
      email,
      senha,
      isAdmin: !!codigoDeAdmin(corpo.codigoAdmin),
    });
    sessao.definirCookie(res, usuario.id);
    res.json({ usuario: usuarios.publico(usuario) });
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

  rotas.post('/sair', (req, res) => {
    sessao.limparCookie(res);
    res.json({ ok: true });
  });

  rotas.get('/eu', (req, res) => {
    const usuario = sessao.usuarioDaRequisicao(req);
    if (!usuario) return res.status(401).json({ erro: 'Sem sessao.' });
    res.json({ usuario: usuarios.publico(usuario) });
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

function codigoDeAdmin(valor) {
  return typeof valor === 'string' && valor.trim() === ADMIN_CODE;
}

module.exports = { criarRotas, CODIGO_SEDE };

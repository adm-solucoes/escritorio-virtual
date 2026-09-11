// Contas do escritorio, guardadas num JSON no disco (o projeto nao usa banco
// externo). Ver docs/plano-login.md.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pastaDados = require('./dados');

const PASTA = pastaDados.PASTA;
const ARQUIVO = path.join(PASTA, 'usuarios.json');
const ARQUIVO_CONFIG = path.join(PASTA, 'config.json');

const SCRYPT_KEYLEN = 64;

let usuarios = []; // carregado uma vez e mantido em memoria
let segredoSessao = null;

function garantirPasta() {
  if (!fs.existsSync(PASTA)) fs.mkdirSync(PASTA, { recursive: true });
}

// Grava num temporario e renomeia: se cair energia no meio, o arquivo bom continua
// inteiro em vez de virar um JSON pela metade.
function gravarJson(arquivo, dados) {
  garantirPasta();
  const tmp = arquivo + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, arquivo);
}

function lerJson(arquivo, padrao) {
  try {
    if (!fs.existsSync(arquivo)) return padrao;
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (e) {
    console.error('[usuarios] nao consegui ler ' + arquivo + ':', e.message);
    return padrao;
  }
}

function carregar() {
  usuarios = lerJson(ARQUIVO, { usuarios: [] }).usuarios || [];

  // Em hospedagem sem disco persistente (Render free), server/data/ some a cada
  // restart. Se o segredo fosse sorteado de novo, todo cookie de sessao virava
  // invalido e todo mundo era deslogado. Por isso SESSION_SECRET vem primeiro.
  const doAmbiente = (process.env.SESSION_SECRET || '').trim();
  if (doAmbiente.length >= 16) {
    segredoSessao = doAmbiente;
    return;
  }

  const config = lerJson(ARQUIVO_CONFIG, null);
  if (config && typeof config.segredoSessao === 'string') {
    segredoSessao = config.segredoSessao;
  } else {
    // Primeira execucao: gera e guarda, pra reiniciar o servidor nao deslogar todo mundo.
    segredoSessao = crypto.randomBytes(32).toString('hex');
    gravarJson(ARQUIVO_CONFIG, { segredoSessao });
  }
}

function salvar() {
  gravarJson(ARQUIVO, { usuarios });
}

function getSegredoSessao() {
  return segredoSessao;
}

// ---------- senha ----------

function hashSenha(senha, salt) {
  return crypto.scryptSync(senha, salt, SCRYPT_KEYLEN).toString('hex');
}

function senhaConfere(senha, usuario) {
  // Conta de convidado nasce SEM senha (senhaHash null). Sem esta linha, uma
  // conta sem hash seria uma conta em que qualquer um entra pelo formulario.
  if (!usuario || !usuario.senhaHash || !usuario.salt) return false;
  const tentativa = Buffer.from(hashSenha(senha, usuario.salt), 'hex');
  const guardado = Buffer.from(usuario.senhaHash, 'hex');
  if (tentativa.length !== guardado.length) return false;
  return crypto.timingSafeEqual(tentativa, guardado);
}

// ---------- consultas ----------

function chaveEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function porEmail(email) {
  const chave = chaveEmail(email);
  return usuarios.find((u) => u.emailChave === chave) || null;
}

function porId(id) {
  return usuarios.find((u) => u.id === id) || null;
}

// O que pode sair do servidor: nunca o hash nem o salt.
function publico(usuario) {
  if (!usuario) return null;
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    isAdmin: !!usuario.isAdmin,
    convidado: !!usuario.convidado,
    appearance: usuario.appearance || null,
    criadoEm: usuario.criadoEm || null,
  };
}

// ---------- escrita ----------

function criar({ nome, email, senha, isAdmin }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const usuario = {
    id: crypto.randomUUID(),
    nome,
    email: String(email).trim(),
    emailChave: chaveEmail(email),
    salt,
    senhaHash: hashSenha(senha, salt),
    isAdmin: !!isAdmin,
    appearance: null,
    criadoEm: Date.now(),
    ultimoAcesso: Date.now(),
  };
  usuarios.push(usuario);
  salvar();
  return usuario;
}

// Conta de visitante, criada quando alguem abre um link de convite.
// Ver docs/plano-convidado.md.
//
// E conta de verdade (tem uid proprio) porque o chat, a DM e a presenca todos
// dependem de um id estavel. O que ela nao tem e senha: ninguem entra nela pelo
// formulario de login, so pelo link, e so enquanto o cookie durar.
function criarConvidado({ nome }) {
  const usuario = {
    id: crypto.randomUUID(),
    nome,
    // e-mail sintetico: preenche o campo que o resto do codigo espera sem
    // colidir com e-mail de gente de verdade.
    email: 'convidado@local',
    emailChave: '',            // string vazia nunca casa com porEmail()
    salt: null,
    senhaHash: null,
    isAdmin: false,            // visitante nao decora a sede
    convidado: true,
    appearance: null,
    criadoEm: Date.now(),
    ultimoAcesso: Date.now(),
  };
  usuario.emailChave = 'convidado-' + usuario.id + '@local';
  usuario.email = usuario.emailChave;
  usuarios.push(usuario);
  salvar();
  return usuario;
}

// Convidado nao acumula: sem isto o usuarios.json ganharia uma conta por
// visitante, pra sempre. 7 dias e bem mais que a sessao de 12 horas dele, entao
// nao ha risco de apagar alguem que ainda esta na sede.
const VALIDADE_CONVIDADO_MS = 7 * 24 * 60 * 60 * 1000;

function limparConvidadosVelhos() {
  const corte = Date.now() - VALIDADE_CONVIDADO_MS;
  const antes = usuarios.length;
  usuarios = usuarios.filter((u) => !u.convidado || (u.ultimoAcesso || u.criadoEm || 0) > corte);
  if (usuarios.length !== antes) {
    console.log('[usuarios] ' + (antes - usuarios.length) + ' conta(s) de convidado expirada(s) removida(s)');
    salvar();
  }
}

function marcarAcesso(id) {
  const u = porId(id);
  if (!u) return;
  u.ultimoAcesso = Date.now();
  salvar();
}

function atualizarPerfil(id, { nome, appearance }) {
  const u = porId(id);
  if (!u) return null;
  if (typeof nome === 'string' && nome) u.nome = nome;
  if (appearance) u.appearance = appearance;
  salvar();
  return u;
}

carregar();
limparConvidadosVelhos();

module.exports = {
  porEmail,
  porId,
  publico,
  criar,
  criarConvidado,
  senhaConfere,
  marcarAcesso,
  atualizarPerfil,
  getSegredoSessao,
  totalDeContas: () => usuarios.length,
  // copia rasa: quem le a lista nao mexe no estado interno
  todos: () => usuarios.map((u) => ({ id: u.id, nome: u.nome, email: u.email })),
};

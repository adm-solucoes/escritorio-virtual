// Google Agenda direto da sede: OAuth proprio e cofre de token proprio.
// Ver docs/plano-calendario.md.
//
// Por que nao lemos os tokens do Supabase do CRM: precisaria da chave de
// servico do Supabase aqui dentro (que ignora RLS e abre o banco inteiro do
// CRM), e os dois apps renovando o mesmo refresh token disputariam a mesma
// linha. Aqui a sede tem o token dela, e o CRM continua com o dele.
//
// Sem dependencia nova: OAuth e Calendar sao chamadas HTTP comuns.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PASTA = path.join(__dirname, 'data');
const ARQUIVO = path.join(PASTA, 'google.json');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3500').replace(/\/$/, '');
const REDIRECT_URI = SITE_URL + '/api/google/callback';

// So leitura: a sede mostra a agenda, nao escreve nela.
const ESCOPO = 'https://www.googleapis.com/auth/calendar.readonly';

// uid da conta da sede -> { accessToken, refreshToken, expiraEm, email }
const contas = new Map();
// state do OAuth -> { uid, criadoEm }, pra impedir que um site qualquer complete
// a conexao no lugar da pessoa
const estados = new Map();
const ESTADO_VALIDADE_MS = 10 * 60 * 1000;

function configurado() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

function carregar() {
  try {
    if (!fs.existsSync(ARQUIVO)) return;
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    Object.entries(dados.contas || {}).forEach(([uid, c]) => contas.set(uid, c));
  } catch (e) {
    console.error('Nao consegui ler google.json:', e.message);
  }
}

function salvar() {
  try {
    if (!fs.existsSync(PASTA)) fs.mkdirSync(PASTA, { recursive: true });
    const obj = {};
    contas.forEach((c, uid) => { obj[uid] = c; });
    fs.writeFileSync(ARQUIVO, JSON.stringify({ contas: obj }, null, 2));
  } catch (e) {
    console.error('Nao consegui salvar google.json:', e.message);
  }
}

carregar();

function conectado(uid) {
  return contas.has(uid);
}

function emailConectado(uid) {
  const c = contas.get(uid);
  return c ? c.email : null;
}

function desconectar(uid) {
  contas.delete(uid);
  salvar();
}

// ---------- fluxo de OAuth ----------

function urlDeConsentimento(uid) {
  const state = crypto.randomBytes(24).toString('hex');
  estados.set(state, { uid, criadoEm: Date.now() });
  limparEstadosVelhos();

  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: ESCOPO,
    access_type: 'offline', // precisa pra vir refresh_token
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}

function limparEstadosVelhos() {
  const agora = Date.now();
  estados.forEach((v, k) => {
    if (agora - v.criadoEm > ESTADO_VALIDADE_MS) estados.delete(k);
  });
}

async function trocarCodigoPorToken(code, state) {
  const guardado = estados.get(state);
  if (!guardado) return { erro: 'Pedido de conexao expirado ou invalido. Tente de novo.' };
  estados.delete(state);
  if (Date.now() - guardado.criadoEm > ESTADO_VALIDADE_MS) {
    return { erro: 'Pedido de conexao expirado. Tente de novo.' };
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const dados = await resp.json();
  if (!resp.ok) return { erro: dados.error_description || 'O Google recusou a conexao.' };
  if (!dados.refresh_token) {
    return { erro: 'O Google nao mandou refresh token. Desconecte a sede na sua conta Google e tente de novo.' };
  }

  const email = await buscarEmail(dados.access_token);
  contas.set(guardado.uid, {
    accessToken: dados.access_token,
    refreshToken: dados.refresh_token,
    expiraEm: Date.now() + (dados.expires_in || 3600) * 1000,
    email,
  });
  salvar();
  return { ok: true, uid: guardado.uid };
}

async function buscarEmail(accessToken) {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.email || null;
  } catch (e) {
    return null;
  }
}

// Renova antes de vencer. Uma renovacao por vez por pessoa, senao duas chamadas
// simultaneas gastam dois refresh e uma invalida a outra.
const renovando = new Map();

async function tokenValido(uid) {
  const conta = contas.get(uid);
  if (!conta) return null;
  if (Date.now() < conta.expiraEm - 60 * 1000) return conta.accessToken;

  if (renovando.has(uid)) return renovando.get(uid);

  const promessa = (async () => {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: conta.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const dados = await resp.json();
    if (!resp.ok) {
      // refresh revogado: tira a conta pra pessoa poder reconectar
      console.error('Refresh do Google falhou para', uid, dados.error);
      contas.delete(uid);
      salvar();
      return null;
    }
    conta.accessToken = dados.access_token;
    conta.expiraEm = Date.now() + (dados.expires_in || 3600) * 1000;
    salvar();
    return conta.accessToken;
  })().finally(() => renovando.delete(uid));

  renovando.set(uid, promessa);
  return promessa;
}

// ---------- eventos ----------

async function listarEventos(uid, inicioISO, fimISO) {
  const token = await tokenValido(uid);
  if (!token) return { erro: 'Conta do Google desconectada.' };

  const p = new URLSearchParams({
    timeMin: inicioISO,
    timeMax: fimISO,
    singleEvents: 'true', // ja expande as recorrentes
    orderBy: 'startTime',
    maxResults: '100',
  });

  const resp = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?' + p.toString(),
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!resp.ok) {
    const d = await resp.json().catch(() => ({}));
    return { erro: (d.error && d.error.message) || 'O Google recusou a consulta.' };
  }

  const dados = await resp.json();
  const eventos = (dados.items || [])
    .filter((ev) => ev.status !== 'cancelled' && ev.start)
    .map((ev) => ({
      titulo: ev.summary || '(sem titulo)',
      // evento de dia inteiro vem em `date`; com hora, em `dateTime`
      inicio: new Date(ev.start.dateTime || ev.start.date).getTime(),
      fim: new Date((ev.end && (ev.end.dateTime || ev.end.date)) || ev.start.dateTime).getTime(),
      diaInteiro: !ev.start.dateTime,
    }))
    .filter((ev) => Number.isFinite(ev.inicio) && Number.isFinite(ev.fim));

  return { eventos };
}

module.exports = {
  configurado, conectado, emailConectado, desconectar,
  urlDeConsentimento, trocarCodigoPorToken, listarEventos,
  REDIRECT_URI,
};

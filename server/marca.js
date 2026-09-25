// A marca de cada sede: o nome que aparece pra quem entra. Ver docs/varias-sedes.md.
//
// Com uma sede por cliente, a tela nao pode dizer "ADM Solucoes" pra outra
// empresa. Tres variaveis, que o scripts/sedes.sh escreve pra cada cliente:
//
//   NOME_SEDE       nome completo  - titulo da aba, cabecalho, boas-vindas
//   SIGLA_SEDE      nome curto     - "Entrar com o Google da <sigla>", "e-mail da <sigla>"
//   SUBTITULO_SEDE  a linha embaixo do nome no login
//
// Sem nenhuma delas (a sede da propria ADM, no Render ou no VPS), fica EXATAMENTE
// como sempre foi. Os padroes sao os textos que estavam escritos na tela.
//
// O nome vai pro HTML: tudo passa por escaparHtml. O script que cria o cliente
// ja tira aspas e quebra de linha, mas quem decide o que e seguro aqui e aqui.
const fs = require('fs');
const path = require('path');

function texto(nome, padrao) {
  const v = process.env[nome];
  return v === undefined || !String(v).trim() ? padrao : String(v).trim();
}

const NOME = texto('NOME_SEDE', 'ADM Soluções');
const marca = {
  nome: NOME,
  sigla: texto('SIGLA_SEDE', process.env.NOME_SEDE ? NOME : 'ADM'),
  subtitulo: texto('SUBTITULO_SEDE', process.env.NOME_SEDE ? 'Escritorio virtual' : 'Escritório virtual da empresa júnior'),
};

// ---- identidade visual ------------------------------------------------------
//
// A ADM tem BrandingBook: azul institucional #11003A (a base), azul secundario
// #1B0075, vermelho de acao #BD0100 ("destacar e guiar a atencao"), creme
// #FFF6F1, e o logotipo de tres quadrados arredondados em cascata.
//
// O LOGOTIPO E ARQUIVO, NUNCA DESENHO. Os PNG em server/marca-arquivos/ sao os
// mesmos que o CRM usa (crm-adm/public/brand/), tirados do BrandingBook. Ja
// houve um redesenho "a mao" aqui, em SVG, com os quadrados em posicao e
// recorte errados: de longe passava, de perto era outra marca. Se precisar de
// outro tamanho ou variante, tirar do PDF do BrandingBook - nao redesenhar.
//
// Nada disso pode vazar pra sede de cliente - e por isso as cores saem DAQUI e
// nao do style.css, que e o mesmo arquivo pra todo mundo: o CSS traz o neutro
// de sempre e esta parte troca por cima, so onde deve.
//
//   sede da ADM (sem NOME_SEDE)          -> identidade da ADM
//   sede de cliente com COR_SEDE         -> as cores dele
//   sede de cliente sem nada configurado -> o neutro de sempre
const EH_ADM = !process.env.NOME_SEDE;

const CORES_ADM = {
  fundo: '#11003A',
  tinta: '#11003A',
  apoio: '#1B0075',
  acao: '#BD0100',
  card: '#FFF6F1',
};

// Os arquivos da marca. A pasta fica FORA de public/ de proposito: assim a
// sede de cliente nao serve o logotipo da ADM nem pra quem adivinhar o
// endereco - quem entrega e a rota /marca/ do server/index.js, e so na sede da
// ADM. "branco" e pra fundo escuro (o painel azul), "vermelho" pra fundo claro.
const ARQUIVOS_MARCA = {
  'icone-branco.png': 'marca-icone-branco.png',
  'icone-vermelho.png': 'marca-icone-vermelho.png',
};

const LOGO_ADM_CLARO = '<img src="/marca/icone-branco.png" alt="" width="52" height="52">';
const LOGO_ADM_ESCURO = '<img src="/marca/icone-vermelho.png" alt="" width="30" height="30">';

/** O caminho do arquivo da marca, ou null - que vira 404. So na sede da ADM. */
function caminhoDeArquivo(nome) {
  if (!EH_ADM) return null;
  const arquivo = ARQUIVOS_MARCA[String(nome || '')];
  return arquivo ? path.join(__dirname, 'marca-arquivos', arquivo) : null;
}

// O de sempre, pra quem nao e a ADM.
const LOGO_NEUTRO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">'
  + '<circle cx="8" cy="8" r="2.6" fill="currentColor"/><circle cx="16" cy="8" r="2.6" fill="currentColor"/>'
  + '<circle cx="8" cy="16" r="2.6" fill="currentColor"/><circle cx="16" cy="16" r="2.6" fill="currentColor"/>'
  + '</svg>';

function corValida(v) {
  return /^#[0-9a-fA-F]{6}$/.test(String(v || '').trim());
}

// A cor entra numa folha de estilo: so passa o que for exatamente #rrggbb.
// Qualquer outra coisa e ignorada, e a sede fica com o neutro.
function cor(nome, padrao) {
  const v = String(process.env[nome] || '').trim();
  return corValida(v) ? v : padrao;
}

function cores() {
  if (EH_ADM) return CORES_ADM;
  const tinta = cor('COR_SEDE', null);
  const acao = cor('COR_SEDE_ACAO', tinta);
  return tinta ? { fundo: tinta, tinta, apoio: tinta, acao, card: '#ffffff' } : null;
}

// O <style> que vai no <head>. Vazio quando nao ha nada pra trocar.
//
// O que o BrandingBook manda, e que esta aqui:
//   TITULOS    Lovelo, ou DM Sans. Lovelo nao existe no Google Fonts, entao
//              fica a DM Sans - que e a segunda opcao da propria marca -, em
//              caixa alta e no peso 700, como os titulos do livro.
//   SUBTITULOS Bree Serif (a mesma serifada que o CRM usa nos titulos de tela).
//   FUNDO      azul institucional com o logotipo ampliado sangrando pelo canto.
//              E um pseudo-elemento: nao entra no HTML e nao atrapalha leitor
//              de tela.
function estilo() {
  const c = cores();
  if (!c) return '';

  const fontes = EH_ADM
    ? "--marca-titulo:'DM Sans',Inter,system-ui,sans-serif;--marca-titulo-peso:700;"
      + '--marca-titulo-tam:22px;--marca-titulo-caixa:uppercase;--marca-titulo-espaco:0.02em;'
      + "--marca-sub:'Bree Serif',Georgia,serif;"
      + "--marca-texto:'DM Sans',Inter,system-ui,sans-serif;"
      + '--marca-logo-fundo:transparent;--marca-logo-tinta:' + CORES_ADM.acao + ';--marca-logo-tam:52px;'
      + '--marca-suave:0.66;'
      // O trilho das abas "Entrar / Criar conta": o creme um tom abaixo, pra
      // aba escolhida (branca) aparecer. Cinza frio brigaria com o creme.
      + '--marca-trilho:#F0E4DC;'
    : '';

  const tokens = ':root{'
    + '--marca-fundo:' + c.fundo + ';'
    + '--marca-tinta:' + c.tinta + ';'
    + '--marca-apoio:' + c.apoio + ';'
    + '--marca-acao:' + c.acao + ';'
    + '--marca-card:' + c.card + ';'
    + '--marca-anel:' + c.apoio + '2e;'
    + fontes
    + '}';

  // O fundo do painel: luz do azul secundario subindo do canto de baixo. E so
  // profundidade - nada de desenho grande atras do texto, que ja teve o
  // logotipo ampliado ali e so parecia uma mancha sem forma. O logotipo de
  // verdade aparece uma vez, em cima, do tamanho certo.
  let fundo = '';
  if (EH_ADM) {
    fundo = '.login-marca-painel{background-image:radial-gradient(120% 80% at 88% 112%,'
      + CORES_ADM.apoio + ' 0%,transparent 62%);}';
  }
  return '<style>' + tokens + fundo + '</style>';
}

// "Menos achismo. Mais direcao." e o mote da ADM - nao vai pra sede de cliente.
// MOTE_SEDE deixa o cliente por o dele, se quiser.
function mote() {
  const proprio = String(process.env.MOTE_SEDE || '').trim();
  if (proprio) return escaparHtml(proprio.slice(0, 60));
  return EH_ADM ? 'Menos achismo. Mais direção.' : '';
}

function escaparHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Marcadores no public/index.html. {{DOMINIO_EXEMPLO}} e o do placeholder do
// campo de e-mail: o primeiro dominio da sede, ou um generico.
function aplicar(html, { dominio } = {}) {
  const valores = {
    NOME_SEDE: marca.nome,
    SIGLA_SEDE: marca.sigla,
    SUBTITULO_SEDE: marca.subtitulo,
    DOMINIO_EXEMPLO: dominio || 'empresa.com.br',
  };
  // Estes quatro nao passam pelo escaparHtml: sao HTML feito aqui (folha de
  // estilo, logotipo e o mote ja escapado), e nao texto de fora.
  // LOGO_SEDE_CLARO e a versao pra fundo escuro (o painel azul do login);
  // LOGO_SEDE, a pra fundo claro (a barra da tela de entrada).
  const brutos = {
    ESTILO_SEDE: estilo(),
    LOGO_SEDE: EH_ADM ? LOGO_ADM_ESCURO : LOGO_NEUTRO,
    LOGO_SEDE_CLARO: EH_ADM ? LOGO_ADM_CLARO : LOGO_NEUTRO,
    MOTE_SEDE: mote() ? '<p class="login-mote">' + mote() + '</p>' : '',
  };
  return html
    .replace(/\{\{(NOME_SEDE|SIGLA_SEDE|SUBTITULO_SEDE|DOMINIO_EXEMPLO)\}\}/g,
      (_, chave) => escaparHtml(valores[chave]))
    .replace(/\{\{(ESTILO_SEDE|LOGO_SEDE_CLARO|LOGO_SEDE|MOTE_SEDE)\}\}/g, (_, chave) => brutos[chave]);
}

// A pagina com a marca aplicada. Em producao e lida uma vez; em desenvolvimento,
// a cada pedido - senao mexer no HTML pedia reiniciar.
const emCache = new Map();
function paginaComMarca(nome, opcoes) {
  const producao = process.env.NODE_ENV === 'production';
  if (producao && emCache.has(nome)) return emCache.get(nome);
  const html = aplicar(fs.readFileSync(path.join(__dirname, '..', 'public', nome), 'utf8'), opcoes);
  if (producao) emCache.set(nome, html);
  return html;
}

function paginaInicial(opcoes) {
  return paginaComMarca('index.html', opcoes);
}

// A pagina de quem entra numa reuniao pelo link (public/reuniao.html). Sai com a
// marca da sede pelo mesmo motivo do index: numa sede de cliente, ela nao pode
// dizer "ADM Solucoes".
function paginaDeReuniao(opcoes) {
  return paginaComMarca('reuniao.html', opcoes);
}

// O manifesto do app instalavel: o nome que aparece no icone da area de
// trabalho e do celular tambem e da sede, e nao da ADM.
function manifesto() {
  // "Sede ADM" cabe embaixo do icone; nome comprido e cortado pelo sistema, entao
  // corta aqui de um jeito que ainda se le.
  const curto = 'Sede ' + marca.sigla;
  return {
    name: 'Escritorio Virtual - ' + marca.nome,
    short_name: curto.length <= 12 ? curto : marca.sigla.slice(0, 12),
    description: 'Escritorio virtual 2D da ' + marca.nome + ': presenca, chat e chamada por proximidade.',
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: EH_ADM ? '#11003A' : '#f4f4f6',
    theme_color: EH_ADM ? CORES_ADM.acao : '#4f46e5',
    icons: [
      { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

module.exports = { marca, ehAdm: EH_ADM, escaparHtml, aplicar, paginaInicial, paginaDeReuniao, manifesto, cores, mote, corValida, caminhoDeArquivo };

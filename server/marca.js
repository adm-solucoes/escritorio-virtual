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

const NOME = texto('NOME_SEDE', 'ADM Solucoes');
const marca = {
  nome: NOME,
  sigla: texto('SIGLA_SEDE', process.env.NOME_SEDE ? NOME : 'ADM'),
  subtitulo: texto('SUBTITULO_SEDE', process.env.NOME_SEDE ? 'Escritorio virtual' : 'Escritorio virtual da empresa junior'),
};

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
  return html.replace(/\{\{(NOME_SEDE|SIGLA_SEDE|SUBTITULO_SEDE|DOMINIO_EXEMPLO)\}\}/g,
    (_, chave) => escaparHtml(valores[chave]));
}

// O index.html com a marca aplicada. Em producao e lido uma vez; em
// desenvolvimento, a cada pedido - senao mexer no HTML pedia reiniciar.
const INDEX = path.join(__dirname, '..', 'public', 'index.html');
let emCache = null;
function paginaInicial(opcoes) {
  if (emCache && process.env.NODE_ENV === 'production') return emCache;
  const html = aplicar(fs.readFileSync(INDEX, 'utf8'), opcoes);
  if (process.env.NODE_ENV === 'production') emCache = html;
  return html;
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
    background_color: '#f4f4f6',
    theme_color: '#4f46e5',
    icons: [
      { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

module.exports = { marca, escaparHtml, aplicar, paginaInicial, manifesto };

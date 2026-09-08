// A estante do escritorio, e o que tem dentro dela.
//
// A ideia: chegar perto de uma estante no mapa abre o acervo da ADM sem sair do
// lugar - o mesmo drive de livros que hoje mora numa pasta que ninguem lembra o
// link. A estante vira o atalho.
//
// O acervo e UM so pra sede inteira: qualquer estante do mapa abre a mesma
// lista. Estante por sala seria mais bonito e mais inutil - ninguem ia lembrar
// em qual sala esta qual livro.
const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, 'data', 'estante.json');
const LIVROS_MAX = 300;

// Limites de texto. Nao sao capricho: isto vai pro disco e volta pra tela de
// todo mundo, entao titulo gigante e o jeito mais facil de estragar o painel
// dos outros.
const LIMITE = { titulo: 120, autor: 80, tag: 24, url: 600 };

let dados = { pasta: '', livros: [] };

function carregar() {
  try {
    const bruto = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    dados = {
      pasta: typeof bruto.pasta === 'string' ? bruto.pasta : '',
      livros: Array.isArray(bruto.livros) ? bruto.livros : [],
    };
  } catch (e) {
    // arquivo ainda nao existe: estante vazia, e tudo bem
  }
}

function salvar() {
  try {
    fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
    fs.writeFileSync(ARQUIVO, JSON.stringify(dados, null, 2));
  } catch (e) {
    console.error('[estante] nao consegui salvar:', e.message);
  }
}

// So http e https. Sem isto, `javascript:` colado no campo de link vira um
// clique que roda codigo na sessao de quem abrir a estante.
function limparUrl(v) {
  if (typeof v !== 'string') return '';
  const t = v.trim().slice(0, LIMITE.url);
  if (!t) return '';
  try {
    const u = new URL(t);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  } catch (e) {
    return '';
  }
}

function limparTexto(v, max) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function ler() {
  return { pasta: dados.pasta, livros: dados.livros };
}

function definirPasta(url) {
  const limpa = limparUrl(url);
  if (url && !limpa) return { erro: 'O link precisa comecar com http:// ou https://.' };
  dados.pasta = limpa;
  salvar();
  return { ok: true, pasta: dados.pasta };
}

function adicionar(entrada, usuario) {
  const titulo = limparTexto(entrada && entrada.titulo, LIMITE.titulo);
  const url = limparUrl(entrada && entrada.url);
  if (!titulo) return { erro: 'Falta o titulo do livro.' };
  if (!url) return { erro: 'O link precisa comecar com http:// ou https://.' };
  if (dados.livros.length >= LIVROS_MAX) {
    return { erro: 'A estante esta cheia (' + LIVROS_MAX + ' livros).' };
  }
  if (dados.livros.some((l) => l.url === url)) {
    return { erro: 'Esse link ja esta na estante.' };
  }

  const livro = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    titulo,
    autor: limparTexto(entrada && entrada.autor, LIMITE.autor),
    tag: limparTexto(entrada && entrada.tag, LIMITE.tag),
    url,
    porUid: usuario.id,
    porNome: usuario.nome || '',
    em: new Date().toISOString(),
  };
  dados.livros.push(livro);
  salvar();
  return { ok: true, livro };
}

// Tira da estante: o dono da conta que pos, ou quem e admin. Livro que alguem
// subiu nao pode sumir por clique de qualquer um.
function remover(id, usuario) {
  const i = dados.livros.findIndex((l) => l.id === id);
  if (i < 0) return { erro: 'Livro nao encontrado.' };
  const livro = dados.livros[i];
  if (livro.porUid !== usuario.id && !usuario.isAdmin) {
    return { erro: 'So quem colocou o livro (ou a diretoria) pode tirar.' };
  }
  dados.livros.splice(i, 1);
  salvar();
  return { ok: true };
}

carregar();

module.exports = { ler, definirPasta, adicionar, remover, LIVROS_MAX };

// Sobe a sede pra valer, do jeito que da pra abrir de fora: login ligado,
// cookie Secure e codigos sorteados de verdade. E o `npm start` com as tres
// variaveis ja no lugar, pra ninguem esquecer nenhuma.
//
// Uso:  npm run publicar
// Depois, num outro terminal:  ngrok http 3600
//
// Ver docs/deploy.md, secao "Link rapido com tunel".
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

if (process.env.SEM_LOGIN === '1') {
  console.error('SEM_LOGIN=1 nao combina com publicar: todo mundo que abrisse o');
  console.error('link entraria na MESMA conta de desenvolvimento. Tire a variavel.');
  process.exit(1);
}

const PASTA = path.join(__dirname, 'data');
const PALAVRAS = ['tucano', 'caju', 'vento', 'mare', 'sertao', 'farol', 'coco', 'duna',
  'jangada', 'aroeira', 'buriti', 'cariri'];

// Os codigos ficam em server/data/ (fora do git) e sao os MESMOS a cada
// restart - se sorteasse de novo, quem ja tinha o codigo ficava de fora.
function codigoFixo(arquivo, prefixo) {
  const caminho = path.join(PASTA, arquivo);
  try {
    const salvo = fs.readFileSync(caminho, 'utf8').trim();
    if (salvo) return salvo;
  } catch (e) { /* primeira vez: sorteia abaixo */ }

  const palavra = PALAVRAS[crypto.randomInt(PALAVRAS.length)];
  const codigo = `${prefixo}-${palavra}-${crypto.randomInt(1000, 10000)}`;
  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(caminho, codigo + '\n', { mode: 0o600 });
  return codigo;
}

process.env.NODE_ENV = 'production';
process.env.PORT = process.env.PORT || '3600';
process.env.CODIGO_SEDE = process.env.CODIGO_SEDE || codigoFixo('codigo-sede.txt', 'adm');
process.env.ADMIN_CODE = process.env.ADMIN_CODE || codigoFixo('codigo-admin.txt', 'chefe');

console.log('');
console.log('  Codigo da sede  (todo mundo precisa, pra criar conta):');
console.log('     ' + process.env.CODIGO_SEDE);
console.log('  Codigo de diretoria (so pra quem vai ser admin):');
console.log('     ' + process.env.ADMIN_CODE);
console.log('');
console.log('  Os dois ficam salvos em server/data/ e nao mudam no proximo restart.');
console.log('  Pra abrir de fora, num outro terminal:  ngrok http ' + process.env.PORT);
console.log('');

require('./index.js');

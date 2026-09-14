// Credenciais das integracoes (Google, Trello, Drive, backup) moram em
// escritorio-virtual/.env, que NAO vai pro git - modelo em .env.example.
//
// Modulo proprio porque dois arranques precisam dele: o index.js e o
// iniciar.js (que restaura o backup ANTES de o index.js carregar as contas).
// Variavel que ja veio do ambiente ganha do arquivo: e assim que o Render (que
// nao tem .env) e os testes mandam. Carregar duas vezes nao muda nada.
const path = require('path');

try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (e) {
  if (e.code !== 'ENOENT') console.error('[env] nao consegui ler o .env: ' + e.message);
}

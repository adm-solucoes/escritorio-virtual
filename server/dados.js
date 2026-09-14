// Onde ficam os JSONs do servidor (contas, chat, decoracao do mapa, mesas...).
//
// Existe por um motivo pratico de hospedagem: disco persistente e um volume
// MONTADO num caminho que a hospedagem escolhe, e nem sempre da pra montar
// exatamente em cima de `server/data` dentro do codigo. Com `DATA_DIR` a pasta
// vira configuracao, e o mesmo build serve pra rodar local (pasta do projeto) e
// pra rodar no Render com o disco montado em /var/dados, por exemplo.
//
// Sem `DATA_DIR` nada muda: continua sendo `server/data`, como sempre foi.
const fs = require('fs');
const path = require('path');

const PADRAO = path.join(__dirname, 'data');
const doAmbiente = String(process.env.DATA_DIR || '').trim();
const PASTA = doAmbiente ? path.resolve(doAmbiente) : PADRAO;

function garantirPasta() {
  if (!fs.existsSync(PASTA)) fs.mkdirSync(PASTA, { recursive: true });
}

// Caminho de um arquivo dentro da pasta de dados.
function arquivo(nome) {
  return path.join(PASTA, nome);
}

// Avisa uma vez, no arranque, quando a pasta saiu do lugar padrao. Sem isso,
// "cade minhas contas?" depois de configurar DATA_DIR errado vira caca ao
// fantasma: o servidor sobe limpo, sem erro nenhum, so olhando pro lugar errado.
if (PASTA !== PADRAO) {
  console.log('[dados] usando DATA_DIR: ' + PASTA);
}

// Grava texto num arquivo SEM deixar ele pela metade: escreve num temporario ao
// lado e renomeia por cima. Renomear no mesmo disco e uma operacao so - ou o
// arquivo velho continua inteiro, ou o novo ja esta la inteiro. Gravar direto
// por cima, se o processo morrer no meio (deploy, restart, falta de memoria),
// deixa um JSON cortado, e no arranque seguinte o historico inteiro some.
function gravarSeguro(caminho, texto) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const tmp = caminho + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, texto, 'utf8');
  fs.renameSync(tmp, caminho);
}

module.exports = { PASTA, arquivo, garantirPasta, gravarSeguro };

import "dotenv/config";

/**
 * Dispara UMA ligação de teste. Rode isto (com o servidor já no ar em outro
 * terminal) antes de soltar o lote de 50 — é muito mais barato descobrir um
 * bug de áudio/roteiro numa ligação só.
 *
 *   node scripts/callSingle.js +5511999999999 "Nome do Lead"
 *
 * O nome é opcional — quando informado, o agente usa na abertura ("falo com
 * Fulano?") em vez do "oi, tudo bem?" genérico.
 */
const telefone = process.argv[2];
const nome = process.argv[3];
if (!telefone) {
  console.error("Uso: node scripts/callSingle.js +55DDDNUMERO \"Nome do Lead\" (nome é opcional)");
  process.exit(1);
}

const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
if (!baseUrl) {
  console.error("PUBLIC_BASE_URL não configurado no .env");
  process.exit(1);
}

const resposta = await fetch(`${baseUrl}/calls/start`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(nome ? { telefone, nome } : { telefone }),
});

const dados = await resposta.json();
if (!resposta.ok) {
  console.error("Falha ao iniciar ligação:", dados);
  process.exit(1);
}

console.log(`Ligação disparada: callId=${dados.callId} (SID Twilio: ${dados.twilioCallSid})`);
console.log(`Acompanhe com: curl ${baseUrl}/calls/${dados.callId}`);

import "dotenv/config";
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { criarControladorDeConcorrencia } from "./lib/concorrencia.js";

/**
 * Dispara ligações em lote a partir de um CSV com uma coluna "telefone"
 * (formato E.164: +55DDDNUMERO) e opcionalmente uma coluna "nome" (dono/
 * decisor, conforme a base da Casa dos Dados — quando presente, o agente usa
 * na abertura da ligação).
 *
 *   node scripts/batchDial.js leads.csv
 *
 * Duas travas de ritmo, propositalmente independentes:
 *   - BATCH_INTERVALO_SEGUNDOS (padrão 20s): intervalo mínimo entre o INÍCIO
 *     de cada disparo, pra não estourar taxa de disparo da Twilio.
 *   - DISPARO_CONCORRENCIA_MAXIMA (padrão 2): quantas ligações podem estar
 *     ATIVAS ao mesmo tempo. Sem isso, ligações mais longas que o intervalo
 *     acima ficavam empilhando no processo sem limite nenhum.
 */
const caminhoCsv = process.argv[2];
if (!caminhoCsv) {
  console.error("Uso: node scripts/batchDial.js caminho/para/leads.csv");
  console.error('O CSV precisa de uma coluna "telefone" (formato E.164, ex: +5511999999999).');
  process.exit(1);
}

const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
if (!baseUrl) {
  console.error("PUBLIC_BASE_URL não configurado no .env");
  process.exit(1);
}

const intervaloMs = Number(process.env.BATCH_INTERVALO_SEGUNDOS || 20) * 1000;
const concorrenciaMaxima = Number(process.env.DISPARO_CONCORRENCIA_MAXIMA || 2);

const linhas = parse(readFileSync(caminhoCsv, "utf8"), { columns: true, skip_empty_lines: true, trim: true });
const leads = linhas.map((l) => ({ telefone: l.telefone, nome: l.nome || undefined })).filter((l) => l.telefone);

if (leads.length === 0) {
  console.error('Nenhum número encontrado. Confira se o CSV tem cabeçalho "telefone".');
  process.exit(1);
}

console.log(
  `${leads.length} números carregados. Intervalo mínimo entre disparos: ${intervaloMs / 1000}s. ` +
    `No máximo ${concorrenciaMaxima} ligação(ões) ativa(s) ao mesmo tempo.\n`
);

const controlador = criarControladorDeConcorrencia({ baseUrl, maximoSimultaneo: concorrenciaMaxima });
const resultados = [];

for (let i = 0; i < leads.length; i++) {
  const { telefone, nome } = leads[i];

  await controlador.aguardarVaga();

  process.stdout.write(`[${i + 1}/${leads.length}] discando ${telefone}${nome ? ` (${nome})` : ""}... `);

  try {
    const resposta = await fetch(`${baseUrl}/calls/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telefone, nome }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      console.log(`ERRO: ${dados.erro}`);
      resultados.push({ telefone, ok: false, erro: dados.erro });
    } else {
      console.log(`ok, callId=${dados.callId} (${controlador.emAndamento() + 1} em andamento)`);
      resultados.push({ telefone, ok: true, callId: dados.callId });
      controlador.registrar(dados.callId);
    }
  } catch (err) {
    console.log(`ERRO DE REDE: ${err.message}`);
    resultados.push({ telefone, ok: false, erro: err.message });
  }

  if (i < leads.length - 1) await esperar(intervaloMs);
}

console.log("\nAguardando as últimas ligações do lote terminarem...");
await controlador.aguardarTodasTerminarem();

const sucesso = resultados.filter((r) => r.ok).length;
console.log(`\nLote concluído: ${sucesso}/${leads.length} ligações disparadas com sucesso.`);
console.log(
  `Os resultados de cada ligação (extração/CRM) acontecem de forma assíncrona — ` +
    `confira data/calls.json ou GET ${baseUrl}/calls/:callId.`
);

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

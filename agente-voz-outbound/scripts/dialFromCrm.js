import "dotenv/config";
import { criarControladorDeConcorrencia } from "./lib/concorrencia.js";

/**
 * Dispara ligações em lote puxando os leads DIRETO da tabela `empresas` do
 * CRM (crm-adm) — em vez de exportar/preparar um CSV manualmente. Isso é o
 * fluxo real de produção: CSV da Casa dos Dados é importado pro CRM (via
 * cadastro manual ou /api/leads/capturar), e daqui pra frente o CRM é a
 * fonte única de verdade de quem já foi ligado ou não.
 *
 * Evita ligar de novo pra quem já foi contatado: consulta `ligacoes_agente_voz`
 * (tabela criada pra guardar o histórico de ligações — ver /agente-voz no
 * CRM) e pula qualquer empresa que já apareça lá.
 *
 *   node scripts/dialFromCrm.js [limite]
 *
 * `limite` é opcional (padrão: todas as empresas elegíveis). Útil pra soltar
 * aos poucos em vez de discar pra base inteira de uma vez.
 */
const limite = process.argv[2] ? Number(process.argv[2]) : Infinity;

const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
if (!baseUrl) {
  console.error("PUBLIC_BASE_URL não configurado no .env");
  process.exit(1);
}

const crmUrl = process.env.CRM_SUPABASE_URL;
const crmKey = process.env.CRM_SUPABASE_ANON_KEY;
if (!crmUrl || !crmKey) {
  console.error("CRM_SUPABASE_URL / CRM_SUPABASE_ANON_KEY não configurados no .env");
  process.exit(1);
}

const intervaloMs = Number(process.env.BATCH_INTERVALO_SEGUNDOS || 20) * 1000;
const concorrenciaMaxima = Number(process.env.DISPARO_CONCORRENCIA_MAXIMA || 2);

async function consultarCrm(caminho) {
  const resposta = await fetch(`${crmUrl}/rest/v1/${caminho}`, {
    headers: { apikey: crmKey, Authorization: `Bearer ${crmKey}` },
  });
  if (!resposta.ok) {
    throw new Error(`CRM respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
  }
  return resposta.json();
}

/** Normaliza pra E.164 (+55DDDNUMERO). Empresas às vezes têm mais de um
 * telefone separado por "/" — usa só o primeiro. */
function normalizarTelefone(bruto) {
  if (!bruto) return null;
  const primeiro = bruto.split("/")[0];
  const digitos = primeiro.replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.startsWith("55") && digitos.length >= 12) return `+${digitos}`;
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`;
  return `+${digitos}`; // já parece ter código de país diferente — segue como veio
}

console.log("Buscando empresas com telefone cadastrado no CRM...");
// Prioriza leads novos primeiro (ordena por criado_em desc) — leads recém
// importados (ex: via Casa dos Dados) sobem na frente da fila de discagem.
const empresas = await consultarCrm(
  "empresas?select=id,nome_empresa,nome_contato,telefone,criado_em&telefone=not.is.null&order=criado_em.desc"
);

console.log("Buscando ligações já feitas (pra não repetir)...");
const jaLigadas = await consultarCrm("ligacoes_agente_voz?select=empresa_id");
const idsJaLigados = new Set(jaLigadas.map((l) => l.empresa_id).filter(Boolean));

const leads = empresas
  .filter((e) => !idsJaLigados.has(e.id))
  .map((e) => ({
    empresaId: e.id,
    telefone: normalizarTelefone(e.telefone),
    nome: e.nome_contato || e.nome_empresa,
  }))
  .filter((l) => l.telefone)
  .slice(0, limite);

if (leads.length === 0) {
  console.log("Nenhuma empresa elegível (todas já foram ligadas, ou nenhuma tem telefone válido).");
  process.exit(0);
}

console.log(
  `${leads.length} empresas elegíveis. Intervalo mínimo entre disparos: ${intervaloMs / 1000}s. ` +
    `No máximo ${concorrenciaMaxima} ligação(ões) ativa(s) ao mesmo tempo.\n`
);

const controlador = criarControladorDeConcorrencia({ baseUrl, maximoSimultaneo: concorrenciaMaxima });
const resultados = [];

for (let i = 0; i < leads.length; i++) {
  const { telefone, nome, empresaId } = leads[i];

  await controlador.aguardarVaga();

  process.stdout.write(`[${i + 1}/${leads.length}] discando ${telefone} (${nome}, empresa ${empresaId})... `);

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
  `Os resultados de cada ligação aparecem automaticamente em /agente-voz no CRM assim que cada uma terminar.`
);

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

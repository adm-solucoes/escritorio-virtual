import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "./llm/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_EXTRACAO = readFileSync(
  path.join(__dirname, "..", "..", "prompts", "extracao.txt"),
  "utf8"
);

const CAMPOS_ESPERADOS = ["interessado", "motivo_recusa", "melhor_horario_retorno", "horario_confirmado", "resumo"];

/**
 * Roda UMA chamada extra ao LLM depois que a ligação encerra, pedindo os
 * dados estruturados em JSON. `response_format: json_object` (Groq/OpenAI)
 * ajuda bastante a não vir texto solto por fora do JSON, mas mesmo assim
 * validamos e damos um fallback seguro — nunca deixe uma extração malformada
 * derrubar o webhook pro CRM.
 *
 * `horariosOferecidos` (opcional): lista dos horários que o agente ofereceu
 * durante a ligação (vindos da agenda real) — repassados aqui pra extração
 * poder identificar qual EXATAMENTE foi confirmado, se algum foi.
 */
export async function extrairDadosDaLigacao(transcricaoCompleta, horariosOferecidos = []) {
  const transcricaoFormatada = transcricaoCompleta
    .map((t) => `${t.papel === "agente" ? "AGENTE" : "LEAD"}: ${t.texto}`)
    .join("\n");

  const contextoHorarios = horariosOferecidos.length
    ? `\n\nHORÁRIOS OFERECIDOS NA LIGAÇÃO:\n${horariosOferecidos.map((h) => `- ${h}`).join("\n")}`
    : "";

  const { texto } = await chat(
    [
      { role: "system", content: PROMPT_EXTRACAO },
      { role: "user", content: (transcricaoFormatada || "(ligação sem fala capturada)") + contextoHorarios },
    ],
    { jsonMode: true, temperatura: 0.1 }
  );

  let dados;
  try {
    dados = JSON.parse(texto);
  } catch (err) {
    console.error("[extração] LLM não devolveu JSON válido, usando fallback:", err.message);
    dados = {};
  }

  for (const campo of CAMPOS_ESPERADOS) {
    if (!(campo in dados)) dados[campo] = null;
  }
  if (typeof dados.interessado !== "boolean") dados.interessado = false;

  return {
    interessado: dados.interessado,
    motivo_recusa: dados.motivo_recusa,
    melhor_horario_retorno: dados.melhor_horario_retorno,
    horario_confirmado: dados.horario_confirmado,
    resumo: dados.resumo ?? "(resumo não gerado)",
  };
}

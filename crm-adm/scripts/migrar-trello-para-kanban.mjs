/**
 * Migra os cartões do quadro do Trello para o Kanban nativo do CRM.
 *
 * Rode com:  node scripts/migrar-trello-para-kanban.mjs
 *            node scripts/migrar-trello-para-kanban.mjs --simular   (não grava)
 *
 * É IDEMPOTENTE: cartão que já existe na lista de destino com o mesmo título
 * é pulado. Dá pra rodar de novo depois, se o time criar mais coisa no Trello
 * antes da virada definitiva, sem duplicar nada.
 *
 * O casamento entre os dois lados é por NOME (lista, etiqueta e pessoa),
 * porque as listas/etiquetas nativas foram criadas na migration 042 com
 * exatamente os mesmos nomes do Trello. Se alguém renomear de um lado só, o
 * script avisa em vez de adivinhar.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SIMULAR = process.argv.includes("--simular");

function lerEnv() {
  const env = {};
  for (const linha of readFileSync(".env.local", "utf8").split("\n")) {
    const t = linha.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = lerEnv();
const { TRELLO_API_KEY: chave, TRELLO_TOKEN: token, TRELLO_BOARD_ID: quadroTrello } = env;
if (!chave || !token || !quadroTrello) {
  console.error("Faltam TRELLO_API_KEY / TRELLO_TOKEN / TRELLO_BOARD_ID no .env.local");
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

async function trello(caminho, params = {}) {
  const url = new URL("https://api.trello.com/1" + caminho);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", chave);
  url.searchParams.set("token", token);
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Trello ${r.status} em ${caminho}`); // sem a URL: ela carrega key e token
  return r.json();
}

/** Normaliza pra comparar nome de lista/etiqueta entre os dois lados: os
 * nomes têm emoji e acento, e um espaço a mais não pode quebrar o casamento. */
const normalizar = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

async function main() {
  console.log(SIMULAR ? "MODO SIMULAÇÃO — nada será gravado\n" : "");

  const [listasTrello, cartoesTrello] = await Promise.all([
    trello(`/boards/${quadroTrello}/lists`, { fields: "id,name", filter: "open" }),
    trello(`/boards/${quadroTrello}/cards`, {
      fields: "id,name,desc,idList,due,dueComplete,pos",
      members: "true",
      member_fields: "fullName",
    }),
  ]);

  const { data: quadros } = await supabase
    .from("kanban_quadros")
    .select("id,nome")
    .eq("arquivado", false)
    .order("criado_em")
    .limit(1);
  const quadro = quadros?.[0];
  if (!quadro) {
    console.error("Nenhum quadro nativo encontrado. Rode a migration 042 antes.");
    process.exit(1);
  }

  const [{ data: listas }, { data: etiquetas }, { data: gcs }] = await Promise.all([
    supabase.from("kanban_listas").select("id,nome,posicao").eq("quadro_id", quadro.id).eq("arquivada", false),
    supabase.from("kanban_etiquetas").select("id,nome").eq("quadro_id", quadro.id),
    supabase.from("gcs").select("id,nome").eq("status", "Ativo"),
  ]);

  const listaPorNome = new Map((listas ?? []).map((l) => [normalizar(l.nome), l]));
  const etiquetaPorNome = new Map((etiquetas ?? []).map((e) => [normalizar(e.nome), e]));
  const gcPorNome = new Map((gcs ?? []).map((g) => [normalizar(g.nome), g]));
  const listaTrelloPorId = new Map(listasTrello.map((l) => [l.id, l.name]));

  // Já existentes no destino, pra não duplicar em nova execução.
  const { data: jaExistem } = await supabase
    .from("kanban_cartoes")
    .select("titulo,lista_id")
    .in("lista_id", (listas ?? []).map((l) => l.id));
  const existente = new Set((jaExistem ?? []).map((c) => `${c.lista_id}::${normalizar(c.titulo)}`));

  let criados = 0;
  let pulados = 0;
  const avisos = [];

  for (const card of cartoesTrello) {
    const nomeListaTrello = listaTrelloPorId.get(card.idList);
    const listaDestino = listaPorNome.get(normalizar(nomeListaTrello));
    if (!listaDestino) {
      avisos.push(`lista "${nomeListaTrello}" não existe no Kanban nativo — cartão "${card.name}" não migrado`);
      continue;
    }

    if (existente.has(`${listaDestino.id}::${normalizar(card.name)}`)) {
      pulados++;
      continue;
    }

    if (SIMULAR) {
      console.log(`+ [${nomeListaTrello}] ${card.name}`);
      criados++;
      continue;
    }

    const { data: novo, error } = await supabase
      .from("kanban_cartoes")
      .insert({
        lista_id: listaDestino.id,
        titulo: card.name,
        descricao: card.desc || null,
        posicao: Number(card.pos) || 1000,
        prazo: card.due,
        prazo_concluido: Boolean(card.dueComplete),
      })
      .select("id")
      .single();

    if (error) {
      avisos.push(`falha ao criar "${card.name}": ${error.message}`);
      continue;
    }

    // Etiquetas: só as que existem dos dois lados (casadas por nome).
    const idsEtiquetas = (card.labels ?? [])
      .map((l) => etiquetaPorNome.get(normalizar(l.name))?.id)
      .filter(Boolean);
    if (idsEtiquetas.length) {
      await supabase
        .from("kanban_cartao_etiquetas")
        .insert(idsEtiquetas.map((etiqueta_id) => ({ cartao_id: novo.id, etiqueta_id })));
    }

    // Membros: casa o nome do Trello com o GC do CRM. Quem não bater vira
    // aviso — melhor deixar o cartão sem responsável do que atribuir errado.
    for (const m of card.members ?? []) {
      const gc = gcPorNome.get(normalizar(m.fullName));
      if (gc) await supabase.from("kanban_cartao_membros").insert({ cartao_id: novo.id, gc_id: gc.id });
      else avisos.push(`membro "${m.fullName}" (cartão "${card.name}") não tem GC correspondente no CRM`);
    }

    console.log(`+ [${nomeListaTrello}] ${card.name}`);
    criados++;
  }

  console.log(`\n${SIMULAR ? "seriam criados" : "criados"}: ${criados} | já existiam: ${pulados}`);
  if (avisos.length) {
    console.log("\nAvisos:");
    for (const a of avisos) console.log("  ! " + a);
  }
}

main().catch((e) => {
  console.error("Erro:", e.message);
  process.exit(1);
});

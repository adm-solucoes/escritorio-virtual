/**
 * Confere se a migration 043 (anexos, histórico, data de início) já foi
 * aplicada no Supabase. DDL não passa pela API, então a migration em si
 * precisa ser colada no SQL Editor do painel — este script só verifica.
 *
 * Rode de dentro de crm-adm:  node scripts/verificar-migration-043.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const linha of readFileSync(".env.local", "utf8").split("\n")) {
  const t = linha.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

let tudoOk = true;
for (const tabela of ["kanban_anexos", "kanban_atividades"]) {
  const { error } = await supabase.from(tabela).select("*").limit(1);
  console.log(tabela.padEnd(20), error ? "FALTA" : "ok");
  if (error) tudoOk = false;
}
const { error } = await supabase.from("kanban_cartoes").select("id,data_inicio").limit(1);
console.log("data_inicio".padEnd(20), error ? "FALTA" : "ok");
if (error) tudoOk = false;

console.log(
  tudoOk
    ? "\nMigration 043 aplicada — pode publicar."
    : "\nFalta rodar sql/043_kanban_completo.sql no SQL Editor do Supabase."
);

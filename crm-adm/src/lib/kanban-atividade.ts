import { supabase } from "@/lib/supabase";

/**
 * Registra uma linha no histórico do cartão (o "feed de atividade" do Trello).
 *
 * Falha em silêncio de propósito: histórico é informação secundária. Se o
 * registro falhar, a ação principal (mover o cartão, trocar o prazo) já
 * aconteceu e não pode ser desfeita nem bloqueada por causa disso — o erro
 * vai pro console pra não passar despercebido no desenvolvimento.
 */
export async function registrarAtividade(
  cartaoId: string,
  gcId: string | null,
  tipo: string,
  descricao: string
): Promise<void> {
  const { error } = await supabase
    .from("kanban_atividades")
    .insert({ cartao_id: cartaoId, gc_id: gcId, tipo, descricao });
  if (error) console.error("[kanban] falha ao registrar atividade:", error.message);
}

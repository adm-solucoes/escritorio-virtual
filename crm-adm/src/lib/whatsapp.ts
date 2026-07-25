import { supabase } from "@/lib/supabase";

export function linkWhatsapp(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  const cleaned = telefone.split("/")[0].replace(/\D/g, "");
  if (!cleaned || cleaned.length < 8) return null;
  const withCountry = cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
  return `https://wa.me/${withCountry}`;
}

/** Normaliza um telefone cadastrado (qualquer formato) pro padrão E.164 usado nas conversas de WhatsApp. */
export function normalizarTelefoneE164(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  const cleaned = telefone.split("/")[0].replace(/\D/g, "");
  if (!cleaned || cleaned.length < 8) return null;
  return cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
}

/** Acha (ou cria) a conversa de WhatsApp de uma empresa e devolve o id — usado por qualquer
 * tela que precise abrir a conversa dentro do CRM (Empresas, Pipeline, WhatsApp). */
export async function obterOuCriarConversaWhatsapp(
  empresaId: string,
  telefone: string | null | undefined
): Promise<{ id: string } | { erro: string }> {
  const telefoneE164 = normalizarTelefoneE164(telefone);
  if (!telefoneE164) return { erro: "Essa empresa não tem um telefone válido cadastrado." };

  const { data: existente } = await supabase
    .from("whatsapp_conversas")
    .select("id, empresa_id")
    .eq("telefone", telefoneE164)
    .maybeSingle();

  if (existente) {
    if (existente.empresa_id !== empresaId) {
      await supabase.from("whatsapp_conversas").update({ empresa_id: empresaId }).eq("id", existente.id);
    }
    return { id: existente.id };
  }

  const { data: nova, error } = await supabase
    .from("whatsapp_conversas")
    .insert({ telefone: telefoneE164, empresa_id: empresaId })
    .select("id")
    .single();

  if (error || !nova) return { erro: error?.message ?? "Erro ao criar conversa" };
  return { id: nova.id };
}

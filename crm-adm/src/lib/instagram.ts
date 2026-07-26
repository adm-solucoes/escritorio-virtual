import { supabase } from "@/lib/supabase";

/** Link pro perfil público do Instagram, pra abrir em nova aba (fora do CRM). */
export function linkInstagram(username: string | null | undefined): string | null {
  if (!username) return null;
  const limpo = username.replace(/^@/, "").trim();
  if (!limpo) return null;
  return `https://instagram.com/${limpo}`;
}

/** Vincula (ou desvincula) a conversa de Instagram de uma empresa manualmente —
 * diferente do WhatsApp, aqui não dá pra criar a conversa antes do contato
 * escrever primeiro, então essa função só atualiza uma conversa já existente. */
export async function vincularEmpresaConversaInstagram(conversaId: string, empresaId: string | null) {
  const { error } = await supabase.from("instagram_conversas").update({ empresa_id: empresaId }).eq("id", conversaId);
  return error ? { erro: error.message } : { ok: true };
}

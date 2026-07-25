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

export function linkWhatsapp(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  const cleaned = telefone.split("/")[0].replace(/\D/g, "");
  if (!cleaned || cleaned.length < 8) return null;
  const withCountry = cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
  return `https://wa.me/${withCountry}`;
}

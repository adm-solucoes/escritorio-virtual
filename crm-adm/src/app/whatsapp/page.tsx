import { redirect } from "next/navigation";

/** WhatsApp e Instagram viraram uma caixa de entrada única em /conversas.
 * Esta rota só existe pra não quebrar link antigo salvo/compartilhado. */
export default async function WhatsappRedirect({
  searchParams,
}: {
  searchParams: Promise<{ conversa?: string }>;
}) {
  const { conversa } = await searchParams;
  redirect(conversa ? `/conversas?conversa=${conversa}&canal=whatsapp` : "/conversas");
}

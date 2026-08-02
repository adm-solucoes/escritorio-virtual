import { createAdminClient } from "@/lib/supabase-admin";
import { trocarCodigoPorTokens, verificarStateGoogle } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  // O gcId vem do state ASSINADO — se veio adulterado/forjado/expirado,
  // verificarStateGoogle devolve null e a gente recusa. Fecha o sequestro de
  // vínculo (gravar tokens do atacante na conta de outra pessoa).
  const gcId = verificarStateGoogle(searchParams.get("state"));

  if (!code || !gcId) {
    return Response.redirect(`${siteUrl}/configuracoes?google=erro`);
  }

  try {
    const { email, accessToken, refreshToken, expiraEm } = await trocarCodigoPorTokens(code);
    if (!refreshToken) {
      // Google só manda refresh_token na primeira autorização — se o GC já tinha
      // conectado antes e desconectou o acesso pelo lado do Google, isso pode faltar.
      return Response.redirect(`${siteUrl}/configuracoes?google=sem_refresh_token`);
    }

    const admin = createAdminClient();

    // Só liga o compartilhamento automaticamente na PRIMEIRA conexão — se a
    // pessoa já tinha desligado antes e está só reconectando (ex: token
    // expirou), reconectar não pode reverter a preferência dela sem avisar.
    const { data: jaExistia } = await admin
      .from("integracoes_google")
      .select("gc_id")
      .eq("gc_id", gcId)
      .maybeSingle();

    await admin.from("integracoes_google").upsert(
      {
        gc_id: gcId,
        email_google: email,
        access_token: accessToken,
        refresh_token: refreshToken,
        expira_em: expiraEm,
        ...(jaExistia ? {} : { compartilhar_agenda: true }),
      },
      { onConflict: "gc_id" }
    );

    return Response.redirect(`${siteUrl}/configuracoes?google=ok`);
  } catch (e) {
    console.error("Erro no callback do Google:", e);
    return Response.redirect(`${siteUrl}/configuracoes?google=erro`);
  }
}

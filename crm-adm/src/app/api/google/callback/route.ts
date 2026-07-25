import { createAdminClient } from "@/lib/supabase-admin";
import { trocarCodigoPorTokens } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const gcId = searchParams.get("state");

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
    await admin.from("integracoes_google").upsert(
      {
        gc_id: gcId,
        email_google: email,
        access_token: accessToken,
        refresh_token: refreshToken,
        expira_em: expiraEm,
      },
      { onConflict: "gc_id" }
    );

    return Response.redirect(`${siteUrl}/configuracoes?google=ok`);
  } catch (e) {
    console.error("Erro no callback do Google:", e);
    return Response.redirect(`${siteUrl}/configuracoes?google=erro`);
  }
}

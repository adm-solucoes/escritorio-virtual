import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

/** Só aceita caminho interno (começa com uma única "/", sem "//" nem "/\").
 * Sem isso, next="@evil.com" ou "//evil.com" viram redirect pra fora do
 * domínio (open redirect — útil pra phishing depois do clique no e-mail). */
function destinoSeguro(next: string | null): string {
  if (next && /^\/(?![/\\])/.test(next)) return next;
  return "/redefinir-senha";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = destinoSeguro(searchParams.get("next"));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return Response.redirect(`${origin}${next}`);
    }
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return Response.redirect(`${origin}${next}`);
    }
  }

  return Response.redirect(`${origin}/login`);
}

import { z } from "zod";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase-admin";
import { emailValido, lerCorpoValidado } from "@/lib/validacao";
import { limitarPorIdentificador, respostaLimiteExcedido } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({ email: emailValido });

export async function POST(request: Request) {
  try {
    const corpo = await lerCorpoValidado(request, schema);
    if (!corpo.ok) return corpo.resposta;
    const { email } = corpo.dados;

    // Segundo limite, por e-mail, somado ao limite por IP que o proxy já
    // aplicou. O de IP sozinho não segura uma botnet — cada requisição viria
    // de um IP virgem e ainda assim martelaria a mesma caixa de entrada.
    const cota = await limitarPorIdentificador(email);
    if (!cota.permitido) return respostaLimiteExcedido(cota);

    const admin = createAdminClient();

    // Só envia se já existir uma conta com esse e-mail — nunca cria uma nova
    // (diferente do convite) e sempre responde "ok" pra não revelar quais
    // e-mails têm cadastro no sistema.
    const { data: gc } = await admin.from("gcs").select("id").eq("email", email).maybeSingle();
    if (!gc) {
      return Response.json({ ok: true });
    }

    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (!error && data.properties.hashed_token) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const actionLink = `${siteUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=${data.properties.verification_type}&next=/redefinir-senha`;

      const resendApiKey = process.env.RESEND_API_KEY;
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: "ADM Soluções <crm@admsolucoes.com.br>",
          to: [email],
          subject: "Redefinir sua senha · CRM ADM Soluções",
          html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#150638">
            <div style="background:#150638;padding:16px 20px;border-radius:10px 10px 0 0">
              <span style="color:#fbf3e7;font-weight:800;font-size:16px">ADM Soluções</span>
            </div>
            <div style="border:1px solid #eee;border-top:0;border-radius:0 0 10px 10px;padding:24px">
              <p style="font-size:14px;color:#333">Recebemos um pedido para redefinir sua senha.</p>
              <p style="font-size:14px;color:#333">Clique no botão abaixo para criar uma nova senha. Se não foi você, pode ignorar este e-mail.</p>
              <p style="text-align:center;margin:28px 0">
                <a href="${actionLink}" style="background:#c81e1e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block">Redefinir senha</a>
              </p>
              <p style="font-size:12px;color:#999">Se o botão não funcionar, copie e cole este link no navegador:<br>${actionLink}</p>
            </div>
          </div>`,
        });
      }
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: true });
  }
}

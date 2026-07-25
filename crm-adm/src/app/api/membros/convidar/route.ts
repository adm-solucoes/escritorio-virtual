import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { nome, email } = await request.json();
    if (!nome || !email) {
      return Response.json({ error: "Nome e e-mail são obrigatórios" }, { status: 400 });
    }

    const admin = createAdminClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const redirectTo = `${siteUrl}/auth/confirm?next=/redefinir-senha`;

    // Tenta criar um convite novo; se o e-mail já existir no Auth (reenvio),
    // gera um link de recuperação de senha em vez disso — serve pro mesmo
    // fim (a pessoa define/redefine a senha) e funciona pra usuários já
    // existentes, mesmo que ainda não tenham confirmado o convite anterior.
    let actionLink: string | null = null;

    const convite = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo, data: { nome } },
    });

    if (convite.error) {
      const jaExiste = convite.error.message.toLowerCase().includes("already been registered");
      if (!jaExiste) {
        return Response.json({ error: convite.error.message }, { status: 400 });
      }
      const recuperacao = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      if (recuperacao.error) {
        return Response.json({ error: recuperacao.error.message }, { status: 400 });
      }
      actionLink = recuperacao.data.properties.action_link;
    } else {
      actionLink = convite.data.properties.action_link;
    }

    const { error: erroGc } = await admin.from("gcs").upsert({ nome, email, status: "Ativo" }, { onConflict: "email" });
    if (erroGc) {
      return Response.json({ error: erroGc.message }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey && actionLink) {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: "ADM Soluções <onboarding@resend.dev>",
        to: [email],
        subject: "Seu acesso ao CRM ADM Soluções",
        html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#150638">
          <div style="background:#150638;padding:16px 20px;border-radius:10px 10px 0 0">
            <span style="color:#fbf3e7;font-weight:800;font-size:16px">ADM Soluções</span>
          </div>
          <div style="border:1px solid #eee;border-top:0;border-radius:0 0 10px 10px;padding:24px">
            <p style="font-size:14px;color:#333">Olá, ${nome}!</p>
            <p style="font-size:14px;color:#333">Você foi convidado a acessar o CRM da ADM Soluções. Clique no botão abaixo para definir sua senha e entrar:</p>
            <p style="text-align:center;margin:28px 0">
              <a href="${actionLink}" style="background:#c81e1e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block">Definir senha e entrar</a>
            </p>
            <p style="font-size:12px;color:#999">Se o botão não funcionar, copie e cole este link no navegador:<br>${actionLink}</p>
          </div>
        </div>`,
      });
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

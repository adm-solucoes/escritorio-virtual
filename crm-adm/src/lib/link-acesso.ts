import { Resend } from "resend";
import { createAdminClient } from "./supabase-admin";

interface Opcoes {
  email: string;
  nome?: string;
  assunto: string;
  titulo: string;
  mensagem: string;
  botao: string;
}

// Gera um link de convite/recuperação apontando pro nosso /auth/confirm
// (com token_hash + type) e envia por Resend. Não usamos o link hospedado
// do Supabase porque ele devolve a sessão via fragmento de URL, que o
// nosso servidor não consegue ler.
export async function enviarLinkDeAcesso({ email, nome, assunto, titulo, mensagem, botao }: Opcoes) {
  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  let hashedToken: string | undefined;
  let verificationType: string | undefined;

  const convite = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: nome ? { data: { nome } } : undefined,
  });

  if (convite.error) {
    const jaExiste = convite.error.message.toLowerCase().includes("already been registered");
    if (!jaExiste) {
      return { error: convite.error.message };
    }
    const recuperacao = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (recuperacao.error) {
      return { error: recuperacao.error.message };
    }
    hashedToken = recuperacao.data.properties.hashed_token;
    verificationType = recuperacao.data.properties.verification_type;
  } else {
    hashedToken = convite.data.properties.hashed_token;
    verificationType = convite.data.properties.verification_type;
  }

  if (!hashedToken || !verificationType) {
    return { error: "Não foi possível gerar o link de acesso." };
  }

  const actionLink = `${siteUrl}/auth/confirm?token_hash=${hashedToken}&type=${verificationType}&next=/redefinir-senha`;

  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    const resend = new Resend(resendApiKey);
    await resend.emails.send({
      from: "ADM Soluções <crm@admsolucoes.com.br>",
      to: [email],
      subject: assunto,
      html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#150638">
        <div style="background:#150638;padding:16px 20px;border-radius:10px 10px 0 0">
          <span style="color:#fbf3e7;font-weight:800;font-size:16px">ADM Soluções</span>
        </div>
        <div style="border:1px solid #eee;border-top:0;border-radius:0 0 10px 10px;padding:24px">
          <p style="font-size:14px;color:#333">${titulo}</p>
          <p style="font-size:14px;color:#333">${mensagem}</p>
          <p style="text-align:center;margin:28px 0">
            <a href="${actionLink}" style="background:#c81e1e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block">${botao}</a>
          </p>
          <p style="font-size:12px;color:#999">Se o botão não funcionar, copie e cole este link no navegador:<br>${actionLink}</p>
        </div>
      </div>`,
    });
  }

  return { admin, ok: true };
}

import { Resend } from "resend";

interface EnviarEmailOpcoes {
  para: string[];
  assunto: string;
  html: string;
}

/** Envia um e-mail transacional via Resend, seguindo o mesmo remetente usado no resto do app. */
export async function enviarEmail({ para, assunto, html }: EnviarEmailOpcoes): Promise<{ ok: boolean; error?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return { ok: false, error: "RESEND_API_KEY não configurada" };

  const resend = new Resend(resendApiKey);
  const { error } = await resend.emails.send({
    from: "ADM Soluções <crm@admsolucoes.com.br>",
    to: para,
    subject: assunto,
    html,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** E-mail de confirmação de reunião agendada — usado pela automação "Agendar reunião". */
export function montarEmailConfirmacaoReuniao(opcoes: {
  nomeEmpresa: string;
  dataHora: string;
  linkChamada: string | null;
  nomeGc: string;
}) {
  const { nomeEmpresa, dataHora, linkChamada, nomeGc } = opcoes;
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#150638">
      <div style="background:#150638;padding:16px 20px;border-radius:10px 10px 0 0">
        <span style="color:#fbf3e7;font-weight:800;font-size:16px">ADM Soluções</span>
      </div>
      <div style="border:1px solid #eee;border-top:0;border-radius:0 0 10px 10px;padding:24px">
        <p style="font-size:14px;color:#333">Reunião confirmada com <strong>${nomeEmpresa}</strong>.</p>
        <p style="font-size:14px;color:#333"><strong>Quando:</strong> ${dataHora}</p>
        <p style="font-size:14px;color:#333"><strong>Responsável:</strong> ${nomeGc}</p>
        ${
          linkChamada
            ? `<p style="text-align:center;margin:28px 0"><a href="${linkChamada}" style="background:#c81e1e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block">Entrar na chamada</a></p>`
            : ""
        }
      </div>
    </div>`;
}

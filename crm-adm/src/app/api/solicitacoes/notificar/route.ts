import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { Empresa, Gc, Oportunidade, Solicitacao } from "@/lib/types";

export const dynamic = "force-dynamic";

function linha(label: string, valor: string) {
  if (!valor) return "";
  return `<tr>
    <td style="padding:6px 10px;font-size:13px;color:#888;white-space:nowrap;vertical-align:top">${label}</td>
    <td style="padding:6px 10px;font-size:13px;color:#150638">${valor}</td>
  </tr>`;
}

export async function POST(request: Request) {
  try {
    const { solicitacaoId } = await request.json();
    if (!solicitacaoId) {
      return Response.json({ error: "solicitacaoId é obrigatório" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY não configurada");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: solicitacao, error: e1 } = await supabase
      .from("solicitacoes")
      .select("*")
      .eq("id", solicitacaoId)
      .single();
    if (e1 || !solicitacao) {
      throw new Error(e1?.message || "Solicitação não encontrada");
    }

    const sol = solicitacao as Solicitacao;

    const [{ data: oportunidade }, { data: gcs }] = await Promise.all([
      supabase.from("oportunidades").select("*, empresas(*)").eq("id", sol.oportunidade_id).single(),
      supabase.from("gcs").select("*"),
    ]);

    const op = oportunidade as (Oportunidade & { empresas: Empresa }) | null;
    const responsavel = (gcs as Gc[] | null)?.find((g) => g.id === sol.responsavel_solicitacao_id);

    const tipos = [...sol.tipo_apoio, sol.tipo_apoio_outro].filter(Boolean).join(", ");

    function montarHtml(avisoRedirecionamento: string) {
      return `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#150638">
        <div style="background:#150638;padding:16px 20px;border-radius:10px 10px 0 0">
          <span style="color:#fbf3e7;font-weight:800;font-size:16px">ADM Soluções · Nova solicitação</span>
        </div>
        <div style="border:1px solid #eee;border-top:0;border-radius:0 0 10px 10px;padding:20px">
          ${avisoRedirecionamento}
          <p style="font-size:13px;color:#444;margin:0 0 16px">
            Uma nova solicitação de apoio foi registrada${op?.empresas ? ` para o cliente <b>${op.empresas.nome_empresa}</b>` : ""}.
          </p>
          <table style="width:100%;border-collapse:collapse">
            ${linha("Evento/projeto", sol.nome_evento_projeto)}
            ${linha("Objetivo", sol.objetivo ?? "")}
            ${linha("Tipo de apoio", tipos)}
            ${linha("Justificativa", sol.justificativa ?? "")}
            ${linha("Data do evento", sol.data_evento ? new Date(sol.data_evento).toLocaleDateString("pt-BR") : "")}
            ${linha("Prazo", sol.prazo ? new Date(sol.prazo).toLocaleDateString("pt-BR") : "")}
            ${linha("Recursos necessários", sol.recursos_necessarios ?? "")}
            ${linha("Solicitado por", responsavel?.nome ?? "")}
            ${linha("E-mail do responsável por atender", sol.email_responsavel_atendimento)}
          </table>
          <p style="font-size:11px;color:#999;margin-top:24px">Notificação automática do CRM ADM Soluções.</p>
        </div>
      </div>`;
    }

    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from: "ADM Soluções <crm@admsolucoes.com.br>",
      to: [sol.email_responsavel_atendimento],
      subject: `Nova solicitação: ${sol.nome_evento_projeto}`,
      html: montarHtml(""),
    });

    if (error) {
      // Plano gratuito do Resend sem domínio verificado só entrega para o e-mail
      // dono da conta. Nesse caso, redireciona para esse e-mail com um aviso,
      // em vez de perder a notificação.
      const fallback = process.env.REPORT_EMAIL_TO;
      if (fallback && fallback !== sol.email_responsavel_atendimento) {
        const aviso = `<p style="font-size:12px;color:#c81e1e;background:#fbecec;border-radius:6px;padding:8px 12px;margin:0 0 16px">
          Essa solicitação era destinada a <b>${sol.email_responsavel_atendimento}</b>, mas o Resend (plano grátis,
          sem domínio verificado) só entrega para o e-mail da conta. Encaminhe manualmente se precisar.
        </p>`;
        const { error: erroFallback } = await resend.emails.send({
          from: "ADM Soluções <crm@admsolucoes.com.br>",
          to: [fallback],
          subject: `[Repasse] Nova solicitação: ${sol.nome_evento_projeto}`,
          html: montarHtml(aviso),
        });
        if (erroFallback) {
          throw new Error(erroFallback.message);
        }
        return Response.json({ ok: true, redirecionado: true });
      }
      throw new Error(error.message);
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

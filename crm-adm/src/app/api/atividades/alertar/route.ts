import { createAdminClient } from "@/lib/supabase-admin";
import { Resend } from "resend";
import type { Atividade, ConfiguracaoRelatorio } from "@/lib/types";
import { buscarAtividadesAtrasadas } from "@/lib/notificacoes";
import { exigirSessao } from "@/lib/auth-api";

export const dynamic = "force-dynamic";

function montarHtml(atividades: Atividade[]) {
  const hoje = new Date().toISOString().slice(0, 10);
  const linhas = atividades
    .map((a) => {
      const dias = a.prazo ? Math.floor((Date.now() - new Date(a.prazo).getTime()) / 86400000) : 0;
      return `<tr>
        <td style="padding:6px 10px;font-size:13px;border-bottom:1px solid #eee;font-weight:600;color:#150638">${a.empresas?.nome_empresa ?? "—"}</td>
        <td style="padding:6px 10px;font-size:13px;border-bottom:1px solid #eee;color:#444">${a.tipo_atividade}</td>
        <td style="padding:6px 10px;font-size:13px;border-bottom:1px solid #eee;color:#c81e1e;font-weight:600">${dias}d atrasada</td>
      </tr>`;
    })
    .join("");

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#150638">
    <div style="background:#150638;padding:16px 20px;border-radius:10px 10px 0 0">
      <span style="color:#fbf3e7;font-weight:800;font-size:16px">ADM Soluções · Atividades atrasadas</span>
    </div>
    <div style="border:1px solid #eee;border-top:0;border-radius:0 0 10px 10px;padding:20px">
      <p style="font-size:12px;color:#888;margin:0 0 12px">Resumo semanal · ${new Date(hoje).toLocaleDateString("pt-BR")}</p>
      <p style="font-size:13px;color:#444;margin:0 0 16px">${atividades.length} atividade${atividades.length === 1 ? "" : "s"} pendente${atividades.length === 1 ? "" : "s"} com prazo vencido:</p>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 10px;background:#f2f0eb;color:#555;font-size:12px;border-bottom:1px solid #ddd">Empresa</th>
            <th style="text-align:left;padding:6px 10px;background:#f2f0eb;color:#555;font-size:12px;border-bottom:1px solid #ddd">Atividade</th>
            <th style="text-align:left;padding:6px 10px;background:#f2f0eb;color:#555;font-size:12px;border-bottom:1px solid #ddd">Atraso</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
      <p style="font-size:11px;color:#999;margin-top:24px">Alerta automático do CRM ADM Soluções.</p>
    </div>
  </div>`;
}

async function gerarEEnviar({ respeitarConfig }: { respeitarConfig: boolean }) {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY não configurada");
  }

  const supabase = createAdminClient();

  const [atividadesAtrasadasQuery, { data: config, error: e2 }] = await Promise.all([
    buscarAtividadesAtrasadas(supabase),
    supabase.from("configuracoes_relatorio").select("*").eq("id", 1).maybeSingle(),
  ]);

  if (e2) {
    throw new Error(e2.message);
  }

  const configRelatorio = config as ConfiguracaoRelatorio | null;
  const destinatario = configRelatorio?.email_destino || process.env.REPORT_EMAIL_TO;

  if (!destinatario) {
    throw new Error("Nenhum e-mail de destino configurado.");
  }

  if (respeitarConfig && configRelatorio && !configRelatorio.notificar_atividades_atrasadas) {
    return { enviado: false, motivo: "Notificação de atividades atrasadas desativada nas configurações." };
  }

  const atividadesAtrasadas = atividadesAtrasadasQuery;
  if (atividadesAtrasadas.length === 0) {
    return { enviado: false, motivo: "Nenhuma atividade atrasada." };
  }

  const resend = new Resend(resendApiKey);
  const { error } = await resend.emails.send({
    from: "ADM Soluções <crm@admsolucoes.com.br>",
    to: destinatario.split(",").map((e) => e.trim()),
    subject: `${atividadesAtrasadas.length} atividade(s) atrasada(s) · ${new Date().toLocaleDateString("pt-BR")}`,
    html: montarHtml(atividadesAtrasadas),
  });

  if (error) {
    throw new Error(error.message);
  }

  return { enviado: true, total: atividadesAtrasadas.length };
}

export async function POST() {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });

  try {
    const resultado = await gerarEEnviar({ respeitarConfig: false });
    return Response.json({ ok: true, ...resultado });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const resultado = await gerarEEnviar({ respeitarConfig: true });
    return Response.json({ ok: true, ...resultado });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

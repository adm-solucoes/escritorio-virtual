import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { ConfiguracaoRelatorio, Empresa, Gc, Oportunidade } from "@/lib/types";
import { montarRelatorioHtml } from "@/lib/relatorio-email";

export const dynamic = "force-dynamic";

async function gerarEEnviar({ respeitarEnvioAutomatico }: { respeitarEnvioAutomatico: boolean }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY não configurada");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const [
    { data: empresas, error: e1 },
    { data: oportunidades, error: e2 },
    { data: gcs, error: e3 },
    { data: config, error: e4 },
  ] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("oportunidades").select("*"),
    supabase.from("gcs").select("*"),
    supabase.from("configuracoes_relatorio").select("*").eq("id", 1).maybeSingle(),
  ]);

  if (e1 || e2 || e3 || e4) {
    throw new Error(e1?.message || e2?.message || e3?.message || e4?.message || "Erro ao buscar dados");
  }

  const configRelatorio = config as ConfiguracaoRelatorio | null;
  const destinatario = configRelatorio?.email_destino || process.env.REPORT_EMAIL_TO;

  if (!destinatario) {
    throw new Error("Nenhum e-mail de destino configurado. Defina em Configurações > Relatórios por e-mail.");
  }

  if (respeitarEnvioAutomatico && configRelatorio && !configRelatorio.envio_automatico) {
    return { enviado: false, motivo: "Envio automático desativado nas configurações." };
  }

  const html = montarRelatorioHtml(
    (empresas as Empresa[]) ?? [],
    (oportunidades as Oportunidade[]) ?? [],
    (gcs as Gc[]) ?? [],
    configRelatorio
      ? {
          incluir_vendas: configRelatorio.incluir_vendas,
          incluir_perdas: configRelatorio.incluir_perdas,
          incluir_origem: configRelatorio.incluir_origem,
          incluir_responsavel: configRelatorio.incluir_responsavel,
          incluir_evolucao: configRelatorio.incluir_evolucao,
        }
      : undefined
  );

  const resend = new Resend(resendApiKey);
  const { error } = await resend.emails.send({
    from: "ADM Soluções <onboarding@resend.dev>",
    to: destinatario.split(",").map((e) => e.trim()),
    subject: `Relatório comercial · ${new Date().toLocaleDateString("pt-BR")}`,
    html,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { enviado: true };
}

export async function POST() {
  try {
    const resultado = await gerarEEnviar({ respeitarEnvioAutomatico: false });
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
    const resultado = await gerarEEnviar({ respeitarEnvioAutomatico: true });
    return Response.json({ ok: true, ...resultado });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

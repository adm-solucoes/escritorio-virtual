import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { Atividade, ConfiguracaoRelatorio, Empresa, Gc, Oportunidade, PipelineSnapshot } from "@/lib/types";
import { calcularAlertasRelatorio, calcularResumoRelatorio, montarRelatorioHtml } from "@/lib/relatorio-email";
import { gerarResumoRelatorioIA } from "@/lib/relatorio-ia";
import { isGanha, isPerdida } from "@/lib/relatorios";

const moedaCompacta = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

export const dynamic = "force-dynamic";

async function gerarEEnviar({ respeitarEnvioAutomatico }: { respeitarEnvioAutomatico: boolean }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY não configurada");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const hojeISO = new Date().toISOString().slice(0, 10);

  const [
    { data: empresas, error: e1 },
    { data: oportunidades, error: e2 },
    { data: gcs, error: e3 },
    { data: config, error: e4 },
    { data: atividadesAtrasadas, error: e5 },
    { data: snapshots, error: e6 },
  ] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("oportunidades").select("*"),
    supabase.from("gcs").select("*"),
    supabase.from("configuracoes_relatorio").select("*").eq("id", 1).maybeSingle(),
    supabase.from("atividades").select("*, empresas(nome_empresa)").neq("status", "Concluído").lt("prazo", hojeISO),
    supabase.from("pipeline_snapshot").select("*").order("data"),
  ]);

  if (e1 || e2 || e3 || e4 || e5 || e6) {
    throw new Error(e1?.message || e2?.message || e3?.message || e4?.message || e5?.message || e6?.message || "Erro ao buscar dados");
  }

  const configRelatorio = config as ConfiguracaoRelatorio | null;
  const destinatario = configRelatorio?.email_destino || process.env.REPORT_EMAIL_TO;

  if (!destinatario) {
    throw new Error("Nenhum e-mail de destino configurado. Defina em Configurações > Relatórios por e-mail.");
  }

  if (respeitarEnvioAutomatico && configRelatorio && !configRelatorio.envio_automatico) {
    return { enviado: false, motivo: "Envio automático desativado nas configurações." };
  }

  const empresasArr = (empresas as Empresa[]) ?? [];
  const oportunidadesArr = (oportunidades as Oportunidade[]) ?? [];
  const atividadesArr = (atividadesAtrasadas as Atividade[]) ?? [];

  // Resumo por IA é melhor-esforço: se a chave não estiver configurada ou a
  // chamada falhar, o e-mail sai normal, só sem esse bloco.
  const { dadosParaIA } = calcularAlertasRelatorio(empresasArr, oportunidadesArr, atividadesArr);
  const { valorPipeline, receitaFechada } = calcularResumoRelatorio(oportunidadesArr);
  const ganhasCount = oportunidadesArr.filter(isGanha).length;
  const totalDecididas = ganhasCount + oportunidadesArr.filter(isPerdida).length;
  const taxaConversao = totalDecididas ? (ganhasCount / totalDecididas) * 100 : 0;

  const resumoIA = await gerarResumoRelatorioIA({
    valorPipeline,
    receitaFechada,
    taxaConversao,
    ...dadosParaIA,
  }).catch(() => null);

  const html = montarRelatorioHtml({
    empresas: empresasArr,
    oportunidades: oportunidadesArr,
    gcs: (gcs as Gc[]) ?? [],
    secoes: configRelatorio
      ? {
          incluir_vendas: configRelatorio.incluir_vendas,
          incluir_perdas: configRelatorio.incluir_perdas,
          incluir_origem: configRelatorio.incluir_origem,
          incluir_responsavel: configRelatorio.incluir_responsavel,
          incluir_evolucao: configRelatorio.incluir_evolucao,
        }
      : undefined,
    snapshots: (snapshots as PipelineSnapshot[]) ?? [],
    atividadesAtrasadas: atividadesArr,
    resumoIA,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  });

  const resend = new Resend(resendApiKey);
  const { error } = await resend.emails.send({
    from: "ADM Soluções <crm@admsolucoes.com.br>",
    to: destinatario.split(",").map((e) => e.trim()),
    subject: `Relatório comercial · ${new Date().toLocaleDateString("pt-BR")} · Pipeline ${moedaCompacta(valorPipeline)}`,
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
    console.error("Erro ao enviar relatório:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

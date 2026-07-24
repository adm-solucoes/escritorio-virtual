import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { Empresa, Gc, Oportunidade } from "@/lib/types";
import { montarRelatorioHtml } from "@/lib/relatorio-email";

export const dynamic = "force-dynamic";

async function gerarEEnviar() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const resendApiKey = process.env.RESEND_API_KEY;
  const destinatario = process.env.REPORT_EMAIL_TO;

  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY não configurada");
  }
  if (!destinatario) {
    throw new Error("REPORT_EMAIL_TO não configurado");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const [{ data: empresas, error: e1 }, { data: oportunidades, error: e2 }, { data: gcs, error: e3 }] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("oportunidades").select("*"),
    supabase.from("gcs").select("*"),
  ]);

  if (e1 || e2 || e3) {
    throw new Error(e1?.message || e2?.message || e3?.message || "Erro ao buscar dados");
  }

  const html = montarRelatorioHtml((empresas as Empresa[]) ?? [], (oportunidades as Oportunidade[]) ?? [], (gcs as Gc[]) ?? []);

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
}

export async function POST() {
  try {
    await gerarEEnviar();
    return Response.json({ ok: true });
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
    await gerarEEnviar();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

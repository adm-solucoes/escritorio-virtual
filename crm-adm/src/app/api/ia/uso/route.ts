import { createAdminClient } from "@/lib/supabase-admin";
import { exigirSessao } from "@/lib/auth-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });
  // Painel de custo de IA é só pro gestor — número de gasto da empresa toda,
  // não faz sentido todo comercial ver.
  if (sessao.gc.role !== "gestor") return Response.json({ error: "Sem acesso." }, { status: 403 });

  const admin = createAdminClient();
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const inicioMes = new Date(inicioHoje.getFullYear(), inicioHoje.getMonth(), 1);

  const { data: doMes } = await admin
    .from("ia_uso")
    .select("tarefa, origem, modelo, tokens_entrada, tokens_saida, custo_usd, criado_em")
    .gte("criado_em", inicioMes.toISOString());

  const linhas = doMes ?? [];

  const somar = (filtro: (l: (typeof linhas)[number]) => boolean) => linhas.filter(filtro).reduce((acc, l) => acc + l.custo_usd, 0);

  const custoHoje = somar((l) => new Date(l.criado_em) >= inicioHoje);
  const custoMes = somar(() => true);

  const porOrigem = new Map<string, { chamadas: number; custoUsd: number }>();
  for (const linha of linhas) {
    const chave = linha.origem ?? "outro";
    const atual = porOrigem.get(chave) ?? { chamadas: 0, custoUsd: 0 };
    atual.chamadas += 1;
    atual.custoUsd += linha.custo_usd;
    porOrigem.set(chave, atual);
  }

  return Response.json({
    custoHojeUsd: custoHoje,
    custoMesUsd: custoMes,
    chamadasMes: linhas.length,
    porOrigem: Array.from(porOrigem.entries()).map(([origem, dados]) => ({ origem, ...dados })),
  });
}

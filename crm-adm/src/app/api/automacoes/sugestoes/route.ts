import { createAdminClient } from "@/lib/supabase-admin";
import { enviarEmail } from "@/lib/email";
import { enviarWhatsappGenerico } from "@/lib/whatsapp-envio";
import { exigirSessao } from "@/lib/auth-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // CRÍTICO: aprovar uma sugestão dispara a mensagem pro cliente. Sem login
  // aqui, qualquer um furava a trava de "humano precisa aprovar" que é a
  // base da seguranca da IA. Quem revisou = a sessão, nunca o corpo.
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });
  const gcId = sessao.gc.id;

  try {
    const { sugestaoId, acao, conteudoEditado } = await request.json();
    if (!sugestaoId || (acao !== "aprovar" && acao !== "descartar")) {
      return Response.json({ error: "Parâmetros inválidos" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: sugestao, error } = await admin
      .from("automacao_sugestoes_ia")
      .select("*, empresas(nome_empresa, telefone, email)")
      .eq("id", sugestaoId)
      .single();

    if (error || !sugestao) return Response.json({ error: "Sugestão não encontrada" }, { status: 404 });
    if (sugestao.status !== "pendente") return Response.json({ error: "Essa sugestão já foi revisada" }, { status: 400 });

    if (acao === "descartar") {
      await admin
        .from("automacao_sugestoes_ia")
        .update({ status: "descartada", revisado_em: new Date().toISOString(), revisado_por_gc_id: gcId ?? null })
        .eq("id", sugestaoId);
      return Response.json({ ok: true });
    }

    const conteudoFinal = typeof conteudoEditado === "string" && conteudoEditado.trim() ? conteudoEditado.trim() : sugestao.conteudo;

    if (sugestao.canal === "whatsapp") {
      const resultado = await enviarWhatsappGenerico(sugestao.empresas?.telefone ?? null, sugestao.empresa_id, {
        modo: "texto",
        texto: conteudoFinal,
      });
      if (!resultado.ok) return Response.json({ error: resultado.erro }, { status: 400 });
    } else {
      if (!sugestao.empresas?.email) return Response.json({ error: "Empresa sem e-mail cadastrado" }, { status: 400 });
      const resultado = await enviarEmail({
        para: [sugestao.empresas.email],
        assunto: sugestao.assunto ?? "Contato ADM Soluções",
        html: `<div>${conteudoFinal}</div>`,
      });
      if (!resultado.ok) return Response.json({ error: resultado.error }, { status: 400 });
    }

    await admin
      .from("automacao_sugestoes_ia")
      .update({
        status: "aprovada",
        conteudo: conteudoFinal,
        revisado_em: new Date().toISOString(),
        revisado_por_gc_id: gcId ?? null,
      })
      .eq("id", sugestaoId);

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

import { enviarLinkDeAcesso } from "@/lib/link-acesso";
import { exigirSessao } from "@/lib/auth-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });
  // Convidar gente pro CRM (cria acesso ativo) é uma ação de gestão — não
  // pode ser feita por qualquer comercial, senão vira porta de entrada pra
  // criar conta pra qualquer um.
  if (sessao.gc.role !== "gestor") return Response.json({ error: "Sem acesso." }, { status: 403 });

  try {
    const { nome, email } = await request.json();
    if (!nome || !email) {
      return Response.json({ error: "Nome e e-mail são obrigatórios" }, { status: 400 });
    }

    const resultado = await enviarLinkDeAcesso({
      email,
      nome,
      assunto: "Seu acesso ao CRM ADM Soluções",
      titulo: `Olá, ${nome}!`,
      mensagem: "Você foi convidado a acessar o CRM da ADM Soluções. Clique no botão abaixo para definir sua senha e entrar:",
      botao: "Definir senha e entrar",
    });

    if (resultado.error) {
      return Response.json({ error: resultado.error }, { status: 400 });
    }

    const { error: erroGc } = await resultado.admin!.from("gcs").upsert({ nome, email, status: "Ativo" }, { onConflict: "email" });
    if (erroGc) {
      return Response.json({ error: erroGc.message }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

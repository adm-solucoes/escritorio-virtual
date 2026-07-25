import { enviarLinkDeAcesso } from "@/lib/link-acesso";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

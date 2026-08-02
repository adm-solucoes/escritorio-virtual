import { z } from "zod";
import { enviarLinkDeAcesso } from "@/lib/link-acesso";
import { exigirSessao } from "@/lib/auth-api";
import { emailValido, lerCorpoValidado, textoLivre } from "@/lib/validacao";
import { limitarPorIdentificador, respostaLimiteExcedido } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  nome: textoLivre(120).min(1),
  email: emailValido,
});

export async function POST(request: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });
  // Convidar gente pro CRM (cria acesso ativo) é uma ação de gestão — não
  // pode ser feita por qualquer comercial, senão vira porta de entrada pra
  // criar conta pra qualquer um.
  if (sessao.gc.role !== "gestor") return Response.json({ error: "Sem acesso." }, { status: 403 });

  try {
    const corpo = await lerCorpoValidado(request, schema);
    if (!corpo.ok) return corpo.resposta;
    const { nome, email } = corpo.dados;

    // Limite por e-mail além do limite por IP: mesmo um gestor legítimo (ou
    // uma conta de gestor comprometida) não deve conseguir usar o convite pra
    // bombardear a caixa de entrada de alguém.
    const cota = await limitarPorIdentificador(email);
    if (!cota.permitido) return respostaLimiteExcedido(cota);

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

    // Se já existe um GC com esse e-mail (reenvio de convite), só reativa —
    // não mexe no cargo/acesso que a pessoa já tinha. Se for gente nova de
    // verdade, nasce sem cargo e sem acesso: alguém precisa atribuir o cargo
    // em Configurações antes dela ver qualquer coisa (o cargo é o que agora
    // define o nível de acesso, não tem mais um "papel" escolhido à parte).
    const admin = resultado.admin!;
    const { data: existente } = await admin.from("gcs").select("id").eq("email", email).maybeSingle();
    const { error: erroGc } = existente
      ? await admin.from("gcs").update({ nome, status: "Ativo" }).eq("id", existente.id)
      : await admin.from("gcs").insert({ nome, email, status: "Ativo", cargo: null, role: "sem_acesso" });
    if (erroGc) {
      return Response.json({ error: erroGc.message }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

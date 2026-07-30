import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function limpar(valor: unknown, max = 200): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim().slice(0, max);
  return v || null;
}

export async function POST(request: Request) {
  const chave = request.headers.get("x-api-key");
  if (!chave) {
    return Response.json({ error: "Chave de API ausente (header x-api-key)" }, { status: 401 });
  }

  // Chave de serviço: a rota já se autentica sozinha pela chave_api do
  // formulário logo abaixo, e o banco não aceita mais acesso anônimo.
  const supabase = createAdminClient();

  const { data: formulario } = await supabase
    .from("formularios_captura")
    .select("*")
    .eq("chave_api", chave)
    .eq("ativo", true)
    .maybeSingle();

  if (!formulario) {
    return Response.json({ error: "Chave de API inválida ou formulário desativado" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corpo da requisição inválido (esperado JSON)" }, { status: 400 });
  }

  const nomeEmpresa = limpar(body.nome_empresa);
  if (!nomeEmpresa) {
    return Response.json({ error: "Campo nome_empresa é obrigatório" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("empresas")
    .insert({
      nome_empresa: nomeEmpresa,
      nome_contato: limpar(body.nome_contato),
      cargo: limpar(body.cargo),
      telefone: limpar(body.telefone, 30),
      email: limpar(body.email),
      cidade: limpar(body.cidade, 100),
      estado: limpar(body.estado, 2),
      segmento: limpar(body.segmento, 100),
      origem_lead: formulario.origem_lead ?? "Formulário público",
      data_cadastro: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, empresaId: data.id });
}

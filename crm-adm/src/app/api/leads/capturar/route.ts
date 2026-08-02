import { z } from "zod";
import { createAdminClient } from "@/lib/supabase-admin";
import { lerCorpoValidado, textoLivre } from "@/lib/validacao";

export const dynamic = "force-dynamic";

/** Campo opcional de texto: normaliza "" e ausência pro mesmo `null` que o
 * banco espera, e corta no tamanho da coluna. Vazio não vira string vazia. */
const opcional = (max: number) =>
  textoLivre(max)
    .transform((v) => v || null)
    .nullish()
    .transform((v) => v ?? null);

/** Formulário público hospedado por terceiro (site do cliente) — pode mandar
 * campos extras que não são nossos (utm, honeypot, etc). `looseObject` deixa
 * passar sem quebrar; só consumimos o que está declarado aqui. */
const schema = z.looseObject({
  nome_empresa: textoLivre(200).min(1, "obrigatório"),
  nome_contato: opcional(200),
  cargo: opcional(200),
  telefone: opcional(30),
  email: opcional(200),
  cidade: opcional(100),
  estado: opcional(2),
  segmento: opcional(100),
});

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

  const corpo = await lerCorpoValidado(request, schema);
  if (!corpo.ok) return corpo.resposta;
  const body = corpo.dados;

  const { data, error } = await supabase
    .from("empresas")
    .insert({
      nome_empresa: body.nome_empresa,
      nome_contato: body.nome_contato,
      cargo: body.cargo,
      telefone: body.telefone,
      email: body.email,
      cidade: body.cidade,
      estado: body.estado,
      segmento: body.segmento,
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

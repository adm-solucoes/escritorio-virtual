interface SubclasseIbge {
  id: string;
  descricao: string;
}

/** Lista oficial de CNAE (subclasses) direto do IBGE, pra alimentar o
 * seletor de atividade principal do importador de leads. Cacheada por 1 dia
 * — a tabela de CNAE não muda de um dia pro outro. */
export async function GET() {
  const resposta = await fetch("https://servicodados.ibge.gov.br/api/v2/cnae/subclasses", {
    next: { revalidate: 86400 },
  });

  if (!resposta.ok) {
    return Response.json({ error: "Falha ao carregar a tabela de CNAE do IBGE." }, { status: 502 });
  }

  const dados = (await resposta.json()) as SubclasseIbge[];
  const opcoes = dados
    .map((item) => ({ codigo: item.id, descricao: item.descricao }))
    .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));

  return Response.json(opcoes);
}

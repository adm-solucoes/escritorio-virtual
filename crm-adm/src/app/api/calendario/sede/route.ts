import { createAdminClient } from "@/lib/supabase-admin";
import { listarEventosPeriodo } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

/** Agenda da equipe pro Escritório Virtual (projeto `escritorio-virtual`).
 *
 * Diferente de `/api/calendario/eventos`, que é chamada pelo navegador de
 * alguém logado, esta é chamada **de servidor pra servidor**: quem chama é o
 * servidor da sede, que não tem sessão de usuário. A autenticação é o segredo
 * compartilhado `SEDE_TOKEN`, mesmo padrão do `ehCronAutorizado` usado no cron
 * da Vercel.
 *
 * Só devolve a agenda de quem marcou `compartilhar_agenda` — o mesmo opt-in da
 * rota normal. Manda o **e-mail** junto porque é por ele que a sede casa a
 * pessoa com a conta de lá. */

interface EventoSede {
  titulo: string;
  inicio: string;
  fim: string;
  pessoaNome: string;
  pessoaEmail: string | null;
}

function autorizado(request: Request): boolean {
  const segredo = process.env.SEDE_TOKEN;
  if (!segredo) return false;
  return request.headers.get("authorization") === `Bearer ${segredo}`;
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const agora = new Date();
    const inicioISO = searchParams.get("inicio") ?? agora.toISOString();
    const fimISO =
      searchParams.get("fim") ?? new Date(agora.getTime() + 14 * 86_400_000).toISOString();

    const admin = createAdminClient();
    const { data } = await admin
      .from("integracoes_google")
      .select("gc_id, gcs(nome, email)")
      .eq("compartilhar_agenda", true);

    const integracoes =
      (data as unknown as { gc_id: string; gcs: { nome: string; email: string } | null }[]) ?? [];

    const eventos: EventoSede[] = [];
    const erros: string[] = [];

    for (const integracao of integracoes) {
      const resultado = await listarEventosPeriodo(integracao.gc_id, inicioISO, fimISO);
      if (!resultado.ok) {
        erros.push(`${integracao.gcs?.nome ?? "GC"}: ${resultado.error}`);
        continue;
      }
      for (const evento of resultado.eventos ?? []) {
        eventos.push({
          titulo: evento.titulo,
          inicio: evento.inicio,
          fim: evento.fim,
          pessoaNome: integracao.gcs?.nome ?? "—",
          pessoaEmail: integracao.gcs?.email ?? null,
        });
      }
    }

    eventos.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

    return Response.json({ eventos, erros, totalCompartilhando: integracoes.length });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}

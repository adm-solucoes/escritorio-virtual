import { createAdminClient } from "@/lib/supabase-admin";
import { exigirSessao } from "@/lib/auth-api";
import { CARGOS, nivelAcessoDoCargo } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_VALIDOS = ["Ativo", "Inativo"];
const CARGOS_VALIDOS = CARGOS.map((c) => c.label);

interface Corpo {
  gcId: string;
  status?: string;
  cargo?: string | null;
}

/** Troca cargo e/ou status de um membro. Só gestor pode — e roda no servidor
 * com a chave de serviço, porque o banco (RLS + grant por coluna) não deixa
 * mais o cliente escrever nessas colunas de jeito nenhum, pra fechar o
 * escalonamento de privilégio (comercial se auto-promovendo).
 *
 * Não existe mais um "papel" escolhido à parte: o cargo É o controle de
 * acesso (nivelAcessoDoCargo) — cargo de gestor de área vira acesso de
 * gestor, cargo de linha vira acesso comercial, sem cargo nenhum é sem
 * acesso. O role continua existindo na tabela (é o que RLS/rotas checam em
 * todo o sistema), só que agora é sempre derivado do cargo, nunca setado à
 * mão. */
export async function POST(req: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });
  if (sessao.gc.role !== "gestor") return Response.json({ error: "Sem acesso." }, { status: 403 });

  const { gcId, status, cargo } = (await req.json()) as Corpo;
  if (!gcId) return Response.json({ error: "gcId é obrigatório." }, { status: 400 });
  if (status !== undefined && !STATUS_VALIDOS.includes(status)) {
    return Response.json({ error: "Status inválido." }, { status: 400 });
  }
  if (cargo !== undefined && cargo !== null && !CARGOS_VALIDOS.includes(cargo)) {
    return Response.json({ error: "Cargo inválido." }, { status: 400 });
  }

  const patch: Record<string, string | null> = {};
  if (status !== undefined) patch.status = status;
  if (cargo !== undefined) {
    patch.cargo = cargo;
    patch.role = nivelAcessoDoCargo(cargo);

    // Ninguém pode tirar o próprio acesso de gestor — evita a conta ficar
    // sem nenhum gestor por acidente (e a pessoa se trancando pra fora).
    if (gcId === sessao.gc.id && patch.role !== "gestor") {
      return Response.json({ error: "Você não pode trocar seu próprio cargo pra um sem acesso de gestor." }, { status: 400 });
    }
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nada pra atualizar." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("gcs").update(patch).eq("id", gcId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

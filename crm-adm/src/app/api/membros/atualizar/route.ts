import { createAdminClient } from "@/lib/supabase-admin";
import { exigirSessao } from "@/lib/auth-api";
import { CARGOS, type RoleGc } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES_VALIDOS: RoleGc[] = ["gestor", "comercial", "sem_acesso"];
const STATUS_VALIDOS = ["Ativo", "Inativo"];
const CARGOS_VALIDOS = CARGOS.map((c) => c.label);

interface Corpo {
  gcId: string;
  role?: RoleGc;
  status?: string;
  cargo?: string | null;
}

/** Troca papel (role) e/ou status de um membro. Só gestor pode — e roda no
 * servidor com a chave de serviço, porque o banco (RLS + grant por coluna)
 * não deixa mais o cliente escrever nessas colunas de jeito nenhum, pra
 * fechar o escalonamento de privilégio (comercial se auto-promovendo). */
export async function POST(req: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });
  if (sessao.gc.role !== "gestor") return Response.json({ error: "Sem acesso." }, { status: 403 });

  const { gcId, role, status, cargo } = (await req.json()) as Corpo;
  if (!gcId) return Response.json({ error: "gcId é obrigatório." }, { status: 400 });
  if (role !== undefined && !ROLES_VALIDOS.includes(role)) {
    return Response.json({ error: "Papel inválido." }, { status: 400 });
  }
  if (status !== undefined && !STATUS_VALIDOS.includes(status)) {
    return Response.json({ error: "Status inválido." }, { status: 400 });
  }
  if (cargo !== undefined && cargo !== null && !CARGOS_VALIDOS.includes(cargo)) {
    return Response.json({ error: "Cargo inválido." }, { status: 400 });
  }

  // Um gestor não pode rebaixar/desativar a si mesmo — evita a conta ficar
  // sem nenhum gestor por acidente (e um gestor se trancando pra fora).
  if (gcId === sessao.gc.id && (role !== undefined && role !== "gestor")) {
    return Response.json({ error: "Você não pode rebaixar a si mesmo." }, { status: 400 });
  }

  const patch: Record<string, string | null> = {};
  if (role !== undefined) patch.role = role;
  if (status !== undefined) patch.status = status;
  if (cargo !== undefined) patch.cargo = cargo;
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nada pra atualizar." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("gcs").update(patch).eq("id", gcId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

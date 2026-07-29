import { createAdminClient } from "@/lib/supabase-admin";
import { createClient as createServerClient } from "@/lib/supabase-server";
import type { Gc } from "@/lib/types";

/** Confirma que a requisição vem de alguém realmente logado (cookie de
 * sessão, não um campo que o cliente possa forjar) e devolve o GC dele.
 * Use em toda rota de API que age sobre dados de uma pessoa específica —
 * nunca confie num gcId mandado no corpo/query da requisição. */
export async function exigirSessao(): Promise<{ gc: Gc } | { erro: string; status: number }> {
  const supabaseSessao = await createServerClient();
  const {
    data: { user },
  } = await supabaseSessao.auth.getUser();
  if (!user?.email) {
    return { erro: "Não autenticado.", status: 401 };
  }

  const admin = createAdminClient();
  const { data: gc } = await admin.from("gcs").select("*").eq("email", user.email).maybeSingle();
  if (!gc || gc.role === "sem_acesso") {
    return { erro: "Sem acesso.", status: 403 };
  }

  return { gc: gc as Gc };
}

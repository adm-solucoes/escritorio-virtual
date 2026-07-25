import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { nome, email } = await request.json();
    if (!nome || !email) {
      return Response.json({ error: "Nome e e-mail são obrigatórios" }, { status: 400 });
    }

    const admin = createAdminClient();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    const { error: erroConvite } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { nome },
      redirectTo: `${siteUrl}/auth/confirm?next=/redefinir-senha`,
    });

    // Se o usuário já existir no Auth (ex: reenviando convite), não é um erro fatal —
    // ainda garantimos que o registro de GC exista/esteja atualizado.
    if (erroConvite && !erroConvite.message.toLowerCase().includes("already been registered")) {
      return Response.json({ error: erroConvite.message }, { status: 400 });
    }

    const { error: erroGc } = await admin.from("gcs").upsert(
      { nome, email, status: "Ativo" },
      { onConflict: "email" }
    );

    if (erroGc) {
      return Response.json({ error: erroGc.message }, { status: 400 });
    }

    return Response.json({ ok: true, jaExistia: Boolean(erroConvite) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

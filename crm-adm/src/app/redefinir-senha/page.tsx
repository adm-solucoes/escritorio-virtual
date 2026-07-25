"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmar) {
      setError("As senhas não coincidem.");
      return;
    }
    setSaving(true);
    setError(null);

    const { error } = await supabase.auth.updateUser({ password: senha });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-navy/10 p-6">
        <h1 className="text-lg font-extrabold text-navy mb-1">Defina sua senha</h1>
        <p className="text-sm text-navy/60 mb-6">Escolha uma senha para acessar o CRM daqui pra frente.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Nova senha</span>
            <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoFocus />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Confirmar senha</span>
            <input className="input" type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required />
          </label>

          {error && <p className="text-sm text-red">{error}</p>}

          <button type="submit" disabled={saving} className="btn-primary justify-center">
            {saving ? "Salvando..." : "Salvar e entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

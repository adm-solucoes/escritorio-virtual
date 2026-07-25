"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { REGRAS_SENHA_TEXTO, validarSenha } from "@/lib/senha";
import PasswordInput from "@/components/PasswordInput";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const erroRegra = validarSenha(senha);
    if (erroRegra) {
      setError(erroRegra);
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
            <PasswordInput value={senha} onChange={setSenha} required autoFocus autoComplete="new-password" />
            <span className="text-xs text-navy/40">{REGRAS_SENHA_TEXTO}</span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Confirmar senha</span>
            <PasswordInput value={confirmar} onChange={setConfirmar} required autoComplete="new-password" />
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

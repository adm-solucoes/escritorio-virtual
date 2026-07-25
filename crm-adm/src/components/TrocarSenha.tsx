"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { REGRAS_SENHA_TEXTO, validarSenha } from "@/lib/senha";
import PasswordInput from "./PasswordInput";

export default function TrocarSenha() {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSucesso(false);

    const erroRegra = validarSenha(novaSenha);
    if (erroRegra) {
      setError(erroRegra);
      return;
    }
    if (novaSenha !== confirmar) {
      setError("As senhas não coincidem.");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email) {
      const { error: erroSenhaAtual } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: senhaAtual,
      });
      if (erroSenhaAtual) {
        setSaving(false);
        setError("Senha atual incorreta.");
        return;
      }
    }

    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSenhaAtual("");
    setNovaSenha("");
    setConfirmar("");
    setSucesso(true);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-navy/10 shadow-sm p-4 flex flex-col gap-4 max-w-md">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-navy/60 font-medium">Senha atual</span>
        <PasswordInput value={senhaAtual} onChange={setSenhaAtual} required autoComplete="current-password" />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-navy/60 font-medium">Nova senha</span>
        <PasswordInput value={novaSenha} onChange={setNovaSenha} required autoComplete="new-password" />
        <span className="text-xs text-navy/40">{REGRAS_SENHA_TEXTO}</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-navy/60 font-medium">Confirmar nova senha</span>
        <PasswordInput value={confirmar} onChange={setConfirmar} required autoComplete="new-password" />
      </label>

      {error && <p className="text-sm text-red">{error}</p>}
      {sucesso && <p className="text-sm text-green-700">Senha alterada com sucesso!</p>}

      <button type="submit" disabled={saving} className="btn-primary w-fit">
        <Save size={14} /> {saving ? "Salvando..." : "Trocar senha"}
      </button>
    </form>
  );
}

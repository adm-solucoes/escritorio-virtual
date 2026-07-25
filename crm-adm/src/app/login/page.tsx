"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PasswordInput from "@/components/PasswordInput";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    setSaving(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-navy/10 p-6">
        <div className="flex items-center gap-2 mb-6">
          <span className="relative inline-flex w-4 h-4">
            <span className="absolute top-0 right-0 w-3 h-3 rounded-[3px] bg-red" />
            <span className="absolute bottom-0 left-0 w-2 h-2 rounded-[2px] bg-red/70" />
          </span>
          <span className="font-bold text-navy" style={{ fontFamily: "var(--font-serif-accent)" }}>
            ADM Soluções
          </span>
        </div>

        <h1 className="text-lg font-extrabold text-navy mb-1">Entrar</h1>
        <p className="text-sm text-navy/60 mb-6">Acesse o CRM com seu e-mail e senha.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">E-mail</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Senha</span>
            <PasswordInput value={senha} onChange={setSenha} required autoComplete="current-password" />
          </label>

          {error && <p className="text-sm text-red">{error}</p>}

          <button type="submit" disabled={saving} className="btn-primary justify-center">
            {saving ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

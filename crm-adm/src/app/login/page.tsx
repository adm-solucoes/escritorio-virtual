"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import PasswordInput from "@/components/PasswordInput";

const UM_DIA = 60 * 60 * 24;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [manterConectado, setManterConectado] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modoRecuperar, setModoRecuperar] = useState(false);
  const [emailRecuperar, setEmailRecuperar] = useState("");
  const [enviandoRecuperacao, setEnviandoRecuperacao] = useState(false);
  const [mensagemRecuperacao, setMensagemRecuperacao] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Cria um client com a duração do cookie de sessão de acordo com "manter
    // conectado": 30 dias (persiste entre fechamentos do navegador) ou um
    // cookie de sessão (some ao fechar o navegador) quando desmarcado.
    const clientDeLogin = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      manterConectado ? { cookieOptions: { maxAge: UM_DIA * 30 } } : undefined
    );

    const { error } = await clientDeLogin.auth.signInWithPassword({ email, password: senha });

    setSaving(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault();
    setEnviandoRecuperacao(true);
    setMensagemRecuperacao(null);
    try {
      await fetch("/api/auth/esqueci-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailRecuperar }),
      });
    } finally {
      setEnviandoRecuperacao(false);
      setMensagemRecuperacao("Se esse e-mail tiver cadastro, mandamos um link de redefinição pra ele.");
    }
  }

  if (modoRecuperar) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-navy/10 p-6">
          <h1 className="text-lg font-extrabold text-navy mb-1">Esqueci minha senha</h1>
          <p className="text-sm text-navy/60 mb-6">Digite seu e-mail e mandamos um link para redefinir a senha.</p>

          <form onSubmit={handleRecuperar} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-navy/60 font-medium">E-mail</span>
              <input
                className="input"
                type="email"
                value={emailRecuperar}
                onChange={(e) => setEmailRecuperar(e.target.value)}
                required
                autoFocus
              />
            </label>

            {mensagemRecuperacao && <p className="text-sm text-navy/70">{mensagemRecuperacao}</p>}

            <button type="submit" disabled={enviandoRecuperacao} className="btn-primary justify-center">
              {enviandoRecuperacao ? "Enviando..." : "Enviar link"}
            </button>

            <button
              type="button"
              onClick={() => {
                setModoRecuperar(false);
                setMensagemRecuperacao(null);
              }}
              className="text-sm font-semibold text-navy/60 hover:underline"
            >
              Voltar para o login
            </button>
          </form>
        </div>
      </div>
    );
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

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={manterConectado}
                onChange={(e) => setManterConectado(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-navy/70">Manter conectado</span>
            </label>
            <button
              type="button"
              onClick={() => setModoRecuperar(true)}
              className="text-sm font-semibold text-blue hover:underline"
            >
              Esqueci minha senha
            </button>
          </div>

          {error && <p className="text-sm text-red">{error}</p>}

          <button type="submit" disabled={saving} className="btn-primary justify-center">
            {saving ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

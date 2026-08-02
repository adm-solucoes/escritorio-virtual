"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { ArrowLeft } from "lucide-react";
import PasswordInput from "@/components/PasswordInput";
import MarcaAdm from "@/components/MarcaAdm";

const UM_DIA = 60 * 60 * 24;

/** Painel de marca — metade esquerda em telas largas. Puramente decorativo
 * (textura de pontos + mark ampliado), então não atrapalha se alguém não
 * conseguir ver (ex: leitor de tela pula por não ter texto relevante). */
function PainelDeMarca() {
  return (
    <div className="hidden lg:flex lg:w-[44%] xl:w-[40%] relative flex-col justify-between bg-navy text-cream px-12 py-10 overflow-hidden">
      <div className="absolute inset-0 textura-pontos" aria-hidden />
      <div
        className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--adm-red), transparent 70%)" }}
        aria-hidden
      />
      <div
        className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full opacity-15 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--adm-blue), transparent 70%)" }}
        aria-hidden
      />

      <div className="relative flex items-center gap-2.5">
        <MarcaAdm tamanho={18} variante="branco" />
        <span className="font-bold text-cream" style={{ fontFamily: "var(--font-serif-accent)" }}>
          ADM Soluções
        </span>
      </div>

      <div className="relative">
        <span
          className="block text-4xl xl:text-5xl leading-[1.15] text-cream mb-5"
          style={{ fontFamily: "var(--font-serif-accent)" }}
        >
          O comercial da sua consultoria, organizado num só lugar.
        </span>
        <p className="text-cream/60 text-sm max-w-sm leading-relaxed">
          Carteira, pipeline, WhatsApp, Instagram e agenda do time — tudo no mesmo CRM, feito sob medida pra ADM
          Soluções.
        </p>
      </div>

      <p className="relative text-cream/35 text-xs">© {new Date().getFullYear()} ADM Soluções</p>
    </div>
  );
}

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

  return (
    <div className="flex-1 flex min-h-screen">
      <PainelDeMarca />

      <div className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-[380px]">
          <div className="lg:hidden flex items-center gap-2 mb-10 justify-center">
            <MarcaAdm tamanho={16} />
            <span className="font-bold text-navy" style={{ fontFamily: "var(--font-serif-accent)" }}>
              ADM Soluções
            </span>
          </div>

          {modoRecuperar ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setModoRecuperar(false);
                  setMensagemRecuperacao(null);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-navy/45 hover:text-navy mb-6 -ml-0.5"
              >
                <ArrowLeft size={13} /> Voltar para o login
              </button>

              <h1 className="text-2xl font-extrabold text-navy mb-1.5 tracking-tight">Esqueci minha senha</h1>
              <p className="text-sm text-navy/55 mb-8 leading-relaxed">
                Digite seu e-mail e mandamos um link para redefinir a senha.
              </p>

              <form onSubmit={handleRecuperar} className="flex flex-col gap-5">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-navy/70 font-semibold text-xs uppercase tracking-wide">E-mail</span>
                  <input
                    className="input"
                    type="email"
                    value={emailRecuperar}
                    onChange={(e) => setEmailRecuperar(e.target.value)}
                    required
                    autoFocus
                  />
                </label>

                {mensagemRecuperacao && (
                  <p className="text-sm text-navy/70 bg-navy/[0.04] border border-navy/15 rounded-lg px-3.5 py-2.5 leading-relaxed">
                    {mensagemRecuperacao}
                  </p>
                )}

                <button type="submit" disabled={enviandoRecuperacao} className="btn-primary justify-center h-11 mt-1">
                  {enviandoRecuperacao ? "Enviando..." : "Enviar link"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold text-navy mb-1.5 tracking-tight">Bem-vindo de volta</h1>
              <p className="text-sm text-navy/55 mb-8 leading-relaxed">Acesse o CRM com seu e-mail e senha.</p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-navy/70 font-semibold text-xs uppercase tracking-wide">E-mail</span>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-navy/70 font-semibold text-xs uppercase tracking-wide">Senha</span>
                  <PasswordInput value={senha} onChange={setSenha} required autoComplete="current-password" />
                </label>

                <div className="flex items-center justify-between -mt-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={manterConectado}
                      onChange={(e) => setManterConectado(e.target.checked)}
                      className="w-4 h-4 accent-navy"
                    />
                    <span className="text-navy/65">Manter conectado</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setModoRecuperar(true)}
                    className="text-sm font-semibold text-blue hover:underline underline-offset-2"
                  >
                    Esqueci minha senha
                  </button>
                </div>

                {error && (
                  <p className="text-sm text-red bg-red/5 border border-red/15 rounded-lg px-3.5 py-2.5">{error}</p>
                )}

                <button type="submit" disabled={saving} className="btn-primary justify-center h-11 mt-1">
                  {saving ? "Entrando..." : "Entrar"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

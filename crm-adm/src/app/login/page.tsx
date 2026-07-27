"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import LoginDogMascot, { type DogMascotHandle } from "@/components/login/LoginDogMascot";
import LoginForm from "@/components/login/LoginForm";
import RecuperarSenhaForm from "@/components/login/RecuperarSenhaForm";
import usePrefersReducedMotion from "@/components/login/usePrefersReducedMotion";

const UM_DIA = 60 * 60 * 24;

/** Tempo de comemoração do mascote antes de navegar pro dashboard. */
const COMEMORACAO_MS = 1500;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [manterConectado, setManterConectado] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const [modoRecuperar, setModoRecuperar] = useState(false);
  const [emailRecuperar, setEmailRecuperar] = useState("");
  const [enviandoRecuperacao, setEnviandoRecuperacao] = useState(false);
  const [mensagemRecuperacao, setMensagemRecuperacao] = useState<string | null>(null);

  const mascoteRef = useRef<DogMascotHandle>(null);
  const timerNavegacao = useRef<number | null>(null);
  const movimentoReduzido = usePrefersReducedMotion();

  // Nunca deixa o timer de navegação vazando se a página desmontar antes.
  useEffect(() => {
    return () => {
      if (timerNavegacao.current !== null) window.clearTimeout(timerNavegacao.current);
    };
  }, []);

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
      mascoteRef.current?.react("barking");
      return;
    }

    // Sucesso: o mascote comemora e o formulário sai de cena antes de navegar.
    setSucesso(true);
    const espera = movimentoReduzido ? 0 : COMEMORACAO_MS;
    timerNavegacao.current = window.setTimeout(() => {
      timerNavegacao.current = null;
      router.push("/dashboard");
      router.refresh();
    }, espera);
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
    <LoginDogMascot ref={mascoteRef} success={sucesso}>
      {modoRecuperar ? (
        <RecuperarSenhaForm
          email={emailRecuperar}
          enviando={enviandoRecuperacao}
          mensagem={mensagemRecuperacao}
          onEmailChange={setEmailRecuperar}
          onSubmit={handleRecuperar}
          onVoltar={() => {
            setModoRecuperar(false);
            setMensagemRecuperacao(null);
          }}
        />
      ) : (
        <LoginForm
          email={email}
          senha={senha}
          manterConectado={manterConectado}
          saving={saving}
          error={error}
          onEmailChange={setEmail}
          onSenhaChange={setSenha}
          onManterConectadoChange={setManterConectado}
          onSubmit={handleSubmit}
          onEsqueciSenha={() => {
            setModoRecuperar(true);
            mascoteRef.current?.setFocusField(null);
          }}
          onFieldFocus={(campo) => mascoteRef.current?.setFocusField(campo)}
        />
      )}
    </LoginDogMascot>
  );
}

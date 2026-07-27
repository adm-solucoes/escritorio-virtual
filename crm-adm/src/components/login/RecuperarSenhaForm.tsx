"use client";

import type { FormEvent } from "react";
import LoadingScreen from "./LoadingScreen";

interface Props {
  email: string;
  enviando: boolean;
  mensagem: string | null;
  onEmailChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onVoltar: () => void;
}

/** Modo "esqueci minha senha" — mesmo cartão, mesmo palco, mesmo mascote. */
export default function RecuperarSenhaForm({
  email,
  enviando,
  mensagem,
  onEmailChange,
  onSubmit,
  onVoltar,
}: Props) {
  return (
    <div className="relative w-full bg-white rounded-xl shadow-lg shadow-navy/5 border border-navy/10 p-6">
      <h1 className="text-lg font-extrabold text-navy mb-1">Esqueci minha senha</h1>
      <p className="text-sm text-navy/60 mb-6">
        Digite seu e-mail e mandamos um link para redefinir a senha.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-navy/60 font-medium">E-mail</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            required
            autoFocus
            autoComplete="email"
          />
        </label>

        {mensagem && (
          <p className="text-sm text-navy/70" role="status">
            {mensagem}
          </p>
        )}

        <button type="submit" disabled={enviando} className="btn-primary justify-center">
          {enviando ? "Enviando..." : "Enviar link"}
        </button>

        <button
          type="button"
          onClick={onVoltar}
          className="text-sm font-semibold text-navy/60 hover:underline"
        >
          Voltar para o login
        </button>
      </form>

      {enviando && <LoadingScreen texto="Buscando seu cadastro..." />}
    </div>
  );
}

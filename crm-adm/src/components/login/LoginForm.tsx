"use client";

import type { FocusEvent, FormEvent } from "react";
import PasswordInput from "@/components/PasswordInput";
import LoadingScreen from "./LoadingScreen";
import type { FocusField } from "./dogMachine";

interface Props {
  email: string;
  senha: string;
  manterConectado: boolean;
  saving: boolean;
  error: string | null;
  onEmailChange: (v: string) => void;
  onSenhaChange: (v: string) => void;
  onManterConectadoChange: (v: boolean) => void;
  onSubmit: (e: FormEvent) => void;
  onEsqueciSenha: () => void;
  /** Avisa o mascote qual campo está em foco (`null` quando nenhum). */
  onFieldFocus: (campo: FocusField) => void;
}

/** Logotipo compacto da ADM Soluções usado no topo do cartão. */
function MarcaAdm() {
  return (
    <div className="flex items-center gap-2 mb-6">
      <span className="relative inline-flex w-4 h-4">
        <span className="absolute top-0 right-0 w-3 h-3 rounded-[3px] bg-red" />
        <span className="absolute bottom-0 left-0 w-2 h-2 rounded-[2px] bg-red/70" />
      </span>
      <span className="font-bold text-navy" style={{ fontFamily: "var(--font-serif-accent)" }}>
        ADM Soluções
      </span>
    </div>
  );
}

/**
 * Cartão de login. É puramente visual: toda a lógica de autenticação continua
 * em `src/app/login/page.tsx`.
 */
export default function LoginForm({
  email,
  senha,
  manterConectado,
  saving,
  error,
  onEmailChange,
  onSenhaChange,
  onManterConectadoChange,
  onSubmit,
  onEsqueciSenha,
  onFieldFocus,
}: Props) {
  /** Só reporta "sem foco" quando o foco realmente saiu do campo inteiro. */
  function handleBlur(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      onFieldFocus(null);
    }
  }

  return (
    <div className="relative w-full bg-white rounded-xl shadow-lg shadow-navy/5 border border-navy/10 p-6">
      <MarcaAdm />

      <h1 className="text-lg font-extrabold text-navy mb-1">Entrar</h1>
      <p className="text-sm text-navy/60 mb-6">Acesse o CRM com seu e-mail e senha.</p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div onFocus={() => onFieldFocus("email")} onBlur={handleBlur}>
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
        </div>

        <div onFocus={() => onFieldFocus("senha")} onBlur={handleBlur}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Senha</span>
            <PasswordInput
              value={senha}
              onChange={onSenhaChange}
              required
              autoComplete="current-password"
            />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={manterConectado}
              onChange={(e) => onManterConectadoChange(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-navy/70">Manter conectado</span>
          </label>
          <button
            type="button"
            onClick={onEsqueciSenha}
            className="text-sm font-semibold text-blue hover:underline"
          >
            Esqueci minha senha
          </button>
        </div>

        {error && (
          <p className="text-sm text-red" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={saving} className="btn-primary justify-center">
          {saving ? "Entrando..." : "Entrar"}
        </button>
      </form>

      {saving && <LoadingScreen texto="Farejando suas credenciais..." />}
    </div>
  );
}

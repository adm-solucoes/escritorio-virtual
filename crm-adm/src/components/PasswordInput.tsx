"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  placeholder?: string;
}

export default function PasswordInput({ value, onChange, required, autoFocus, autoComplete, placeholder }: Props) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="relative">
      <input
        className="input w-full pr-10"
        type={visivel ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-navy/40 hover:text-navy/70"
        tabIndex={-1}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
      >
        {visivel ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

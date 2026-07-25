"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Empresa, Gc, Icp, Temperatura } from "@/lib/types";
import { normalizarTelefoneE164 } from "@/lib/whatsapp";

interface Props {
  empresa: Empresa | null;
  gcs: Gc[];
  onClose: () => void;
  onSaved: () => void;
}

const empty = {
  nome_empresa: "",
  cnpj: "",
  segmento: "",
  cidade: "",
  estado: "",
  nome_contato: "",
  cargo: "",
  telefone: "",
  email: "",
  origem_lead: "",
  icp: "" as Icp | "",
  temperatura: "" as Temperatura | "",
  gc_responsavel_id: "",
};

function formFromEmpresa(empresa: Empresa | null): typeof empty {
  if (!empresa) return empty;
  return {
    nome_empresa: empresa.nome_empresa ?? "",
    cnpj: empresa.cnpj ?? "",
    segmento: empresa.segmento ?? "",
    cidade: empresa.cidade ?? "",
    estado: empresa.estado ?? "",
    nome_contato: empresa.nome_contato ?? "",
    cargo: empresa.cargo ?? "",
    telefone: empresa.telefone ?? "",
    email: empresa.email ?? "",
    origem_lead: empresa.origem_lead ?? "",
    icp: (empresa.icp as Icp) ?? "",
    temperatura: (empresa.temperatura as Temperatura) ?? "",
    gc_responsavel_id: empresa.gc_responsavel_id ?? "",
  };
}

export default function EmpresaModal({ empresa, gcs, onClose, onSaved }: Props) {
  // Parent must remount this component (e.g. via `key`) when switching between
  // creating a new empresa and editing an existing one, so this initial state stays fresh.
  const [form, setForm] = useState(() => formFromEmpresa(empresa));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome_empresa.trim()) {
      setError("O nome da empresa é obrigatório.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      nome_empresa: form.nome_empresa.trim(),
      cnpj: form.cnpj || null,
      segmento: form.segmento || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      nome_contato: form.nome_contato || null,
      cargo: form.cargo || null,
      telefone: form.telefone || null,
      email: form.email || null,
      origem_lead: form.origem_lead || null,
      icp: form.icp || null,
      temperatura: form.temperatura || null,
      gc_responsavel_id: form.gc_responsavel_id || null,
    };

    const { data: salva, error } = empresa
      ? await supabase.from("empresas").update(payload).eq("id", empresa.id).select("id").single()
      : await supabase.from("empresas").insert(payload).select("id").single();

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (salva?.id) {
      await vincularConversaWhatsapp(salva.id, payload.telefone);
    }

    onSaved();
  }

  // Assim que uma empresa é cadastrada (ou tem o telefone editado), já deixa a conversa de
  // WhatsApp pronta na lista — o GC não precisa esperar o cliente mandar mensagem primeiro
  // nem clicar em "Enviar WhatsApp" pra ela aparecer.
  async function vincularConversaWhatsapp(empresaId: string, telefone: string | null) {
    const telefoneE164 = normalizarTelefoneE164(telefone);
    if (!telefoneE164) return;

    try {
      const { data: existente } = await supabase
        .from("whatsapp_conversas")
        .select("id, empresa_id")
        .eq("telefone", telefoneE164)
        .maybeSingle();

      if (existente) {
        if (existente.empresa_id !== empresaId) {
          await supabase.from("whatsapp_conversas").update({ empresa_id: empresaId }).eq("id", existente.id);
        }
      } else {
        await supabase.from("whatsapp_conversas").insert({ telefone: telefoneE164, empresa_id: empresaId });
      }
    } catch {
      // best-effort — não trava o cadastro da empresa se isso falhar
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-navy/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy/10 sticky top-0 bg-white">
          <h2 className="font-extrabold text-lg text-navy">
            {empresa ? "Editar empresa" : "Nova empresa"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-navy/5 text-navy/60"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome da empresa *" className="sm:col-span-2">
            <input
              className="input"
              value={form.nome_empresa}
              onChange={(e) => set("nome_empresa", e.target.value)}
              required
            />
          </Field>

          <Field label="CNPJ">
            <input className="input" value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} />
          </Field>
          <Field label="Segmento">
            <input className="input" value={form.segmento} onChange={(e) => set("segmento", e.target.value)} />
          </Field>
          <Field label="Cidade">
            <input className="input" value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
          </Field>
          <Field label="Estado">
            <input className="input" maxLength={2} value={form.estado} onChange={(e) => set("estado", e.target.value.toUpperCase())} />
          </Field>

          <Field label="Nome do contato">
            <input className="input" value={form.nome_contato} onChange={(e) => set("nome_contato", e.target.value)} />
          </Field>
          <Field label="Cargo">
            <input className="input" value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
          </Field>
          <Field label="Telefone">
            <input className="input" placeholder="(85) 99999-9999" value={form.telefone} onChange={(e) => set("telefone", e.target.value)} />
          </Field>
          <Field label="E-mail">
            <input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>

          <Field label="Origem do lead" className="sm:col-span-2">
            <input className="input" value={form.origem_lead} onChange={(e) => set("origem_lead", e.target.value)} />
          </Field>

          <Field label="ICP">
            <select className="input" value={form.icp} onChange={(e) => set("icp", e.target.value as Icp)}>
              <option value="">—</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </Field>
          <Field label="Temperatura">
            <select className="input" value={form.temperatura} onChange={(e) => set("temperatura", e.target.value as Temperatura)}>
              <option value="">—</option>
              <option value="Frio">Frio</option>
              <option value="Morno">Morno</option>
              <option value="Quente">Quente</option>
            </select>
          </Field>

          <Field label="GC responsável" className="sm:col-span-2">
            <select className="input" value={form.gc_responsavel_id} onChange={(e) => set("gc_responsavel_id", e.target.value)}>
              <option value="">—</option>
              {gcs.map((gc) => (
                <option key={gc.id} value={gc.id}>
                  {gc.nome}
                </option>
              ))}
            </select>
          </Field>

          {error && <p className="sm:col-span-2 text-sm text-red">{error}</p>}

          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-semibold text-navy/70 hover:bg-navy/5"
            >
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="text-navy/60 font-medium">{label}</span>
      {children}
    </label>
  );
}

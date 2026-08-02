"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Empresa, Gc, InstagramConversa, WhatsappConversa } from "@/lib/types";
import { obterOuCriarConversaWhatsapp } from "@/lib/whatsapp";
import { vincularEmpresaConversaInstagram } from "@/lib/instagram";
import Avatar from "@/components/Avatar";
import CanalBadge, { type Canal } from "@/components/CanalBadge";
import PainelWhatsapp from "@/components/conversas/PainelWhatsapp";
import PainelInstagram from "@/components/conversas/PainelInstagram";

interface ItemUnificado {
  id: string;
  canal: Canal;
  nome: string;
  subtitulo: string;
  naoLidas: number;
  ultimaMensagemEm: string | null;
}

function paramsAtuais() {
  if (typeof window === "undefined") return { conversa: null as string | null, canal: null as Canal | null };
  const sp = new URLSearchParams(window.location.search);
  const canal = sp.get("canal");
  return {
    conversa: sp.get("conversa"),
    canal: canal === "whatsapp" || canal === "instagram" ? (canal as Canal) : null,
  };
}

/** Caixa de entrada única: WhatsApp e Instagram na mesma lista, ordenados por
 * última mensagem, cada um com o selinho do canal em cima do avatar — pra
 * identificar de onde veio sem precisar trocar de tela. */
export default function ConversasPage() {
  const router = useRouter();
  const [conversasWhatsapp, setConversasWhatsapp] = useState<WhatsappConversa[]>([]);
  const [conversasInstagram, setConversasInstagram] = useState<InstagramConversa[]>([]);
  const [gcAtual, setGcAtual] = useState<Gc | null>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<{ id: string; canal: Canal } | null>(() => {
    const p = paramsAtuais();
    return p.conversa && p.canal ? { id: p.conversa, canal: p.canal } : null;
  });
  const [seletorEmpresaAberto, setSeletorEmpresaAberto] = useState(false);
  const [modoSeletor, setModoSeletor] = useState<"iniciar_whatsapp" | "vincular_instagram">("iniciar_whatsapp");
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(false);
  const [buscaEmpresa, setBuscaEmpresa] = useState("");

  useEffect(() => {
    let cancelado = false;
    supabase
      .auth.getUser()
      .then(async ({ data }) => {
        if (cancelado || !data.user?.email) return;
        const { data: gc } = await supabase.from("gcs").select("*").eq("email", data.user.email).maybeSingle();
        if (!cancelado) setGcAtual(gc ?? null);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  function carregarConversas() {
    return Promise.all([
      supabase.from("whatsapp_conversas").select("*, empresas(nome_empresa, telefone)").order("ultima_mensagem_em", { ascending: false, nullsFirst: false }),
      supabase.from("instagram_conversas").select("*, empresas(nome_empresa)").order("ultima_mensagem_em", { ascending: false, nullsFirst: false }),
    ]).then(([wa, ig]) => {
      setConversasWhatsapp((wa.data as unknown as WhatsappConversa[]) ?? []);
      setConversasInstagram((ig.data as unknown as InstagramConversa[]) ?? []);
      setLoading(false);
    });
  }

  useEffect(() => {
    let cancelado = false;
    carregarConversas();
    const intervalo = setInterval(() => {
      if (!cancelado) carregarConversas();
    }, 15000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  const itensUnificados = useMemo((): ItemUnificado[] => {
    const doWhatsapp: ItemUnificado[] = conversasWhatsapp.map((c) => ({
      id: c.id,
      canal: "whatsapp",
      nome: c.empresas?.nome_empresa ?? c.nome_perfil_whatsapp ?? c.telefone,
      subtitulo: c.telefone,
      naoLidas: c.nao_lidas,
      ultimaMensagemEm: c.ultima_mensagem_em,
    }));
    const doInstagram: ItemUnificado[] = conversasInstagram.map((c) => ({
      id: c.id,
      canal: "instagram",
      nome: c.empresas?.nome_empresa ?? c.nome_perfil ?? c.username ?? "—",
      subtitulo: c.username ? `@${c.username}` : "sem @usuário",
      naoLidas: c.nao_lidas,
      ultimaMensagemEm: c.ultima_mensagem_em,
    }));

    const termo = busca.trim().toLowerCase();
    const todos = [...doWhatsapp, ...doInstagram].filter(
      (i) => !termo || i.nome.toLowerCase().includes(termo) || i.subtitulo.toLowerCase().includes(termo)
    );
    return todos.sort((a, b) => {
      if (!a.ultimaMensagemEm) return 1;
      if (!b.ultimaMensagemEm) return -1;
      return new Date(b.ultimaMensagemEm).getTime() - new Date(a.ultimaMensagemEm).getTime();
    });
  }, [conversasWhatsapp, conversasInstagram, busca]);

  const conversaWhatsappSelecionada = useMemo(
    () => (selecionado?.canal === "whatsapp" ? conversasWhatsapp.find((c) => c.id === selecionado.id) : undefined),
    [conversasWhatsapp, selecionado]
  );
  const conversaInstagramSelecionada = useMemo(
    () => (selecionado?.canal === "instagram" ? conversasInstagram.find((c) => c.id === selecionado.id) : undefined),
    [conversasInstagram, selecionado]
  );

  function selecionar(item: ItemUnificado) {
    setSelecionado({ id: item.id, canal: item.canal });
    const url = new URL(window.location.href);
    url.searchParams.set("conversa", item.id);
    url.searchParams.set("canal", item.canal);
    router.replace(`${url.pathname}${url.search}`);
  }

  const empresasFiltradas = useMemo(() => {
    const termo = buscaEmpresa.trim().toLowerCase();
    if (!termo) return empresas;
    return empresas.filter((e) => [e.nome_empresa, e.nome_contato, e.telefone].filter(Boolean).some((v) => v!.toLowerCase().includes(termo)));
  }, [empresas, buscaEmpresa]);

  async function abrirSeletorEmpresa(modo: "iniciar_whatsapp" | "vincular_instagram") {
    setModoSeletor(modo);
    setSeletorEmpresaAberto(true);
    if (empresas.length === 0) {
      setCarregandoEmpresas(true);
      const { data } = await supabase.from("empresas").select("*").order("nome_empresa");
      setEmpresas((data as Empresa[]) ?? []);
      setCarregandoEmpresas(false);
    }
  }

  async function confirmarEmpresa(empresa: Empresa) {
    if (modoSeletor === "iniciar_whatsapp") {
      const resultado = await obterOuCriarConversaWhatsapp(empresa.id, empresa.telefone);
      if ("erro" in resultado) {
        alert(resultado.erro);
        return;
      }
      setSeletorEmpresaAberto(false);
      setBuscaEmpresa("");
      await carregarConversas();
      setSelecionado({ id: resultado.id, canal: "whatsapp" });
    } else {
      if (!selecionado) return;
      const resultado = await vincularEmpresaConversaInstagram(selecionado.id, empresa.id);
      if ("erro" in resultado) {
        alert(resultado.erro);
        return;
      }
      setSeletorEmpresaAberto(false);
      setBuscaEmpresa("");
      carregarConversas();
    }
  }

  if (gcAtual?.role === "sem_acesso") {
    return (
      <div className="max-w-2xl mx-auto w-full px-6 py-16 text-center">
        <h1 className="text-lg font-bold text-navy">Acesso restrito</h1>
        <p className="text-sm text-navy/60 mt-2">Essa área é exclusiva do time comercial. Fale com seu gestor se acha que isso é um engano.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-0 h-[calc(100dvh-56px)] md:h-dvh">
        <div className={`w-full md:w-72 md:shrink-0 border-r border-navy/15 bg-white flex-col min-h-0 ${selecionado ? "hidden md:flex" : "flex"}`}>
          <div className="px-4 py-4 border-b border-navy/15 flex items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-extrabold text-navy">Conversas</h1>
              <p className="text-xs text-navy/50">{itensUnificados.length} no WhatsApp e Instagram</p>
            </div>
            <button
              onClick={() => abrirSeletorEmpresa("iniciar_whatsapp")}
              className="p-2 rounded-md hover:bg-blue/10 text-blue shrink-0"
              title="Iniciar conversa de WhatsApp com uma empresa cadastrada"
            >
              <UserPlus size={18} />
            </button>
          </div>
          <div className="px-3 py-2.5 border-b border-navy/15">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy/40" />
              <input className="input w-full pl-8" placeholder="Buscar conversa..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-navy/50">Carregando...</p>
            ) : itensUnificados.length === 0 ? (
              <p className="p-4 text-sm text-navy/50">Nenhuma conversa ainda.</p>
            ) : (
              itensUnificados.map((item) => (
                <button
                  key={`${item.canal}-${item.id}`}
                  onClick={() => selecionar(item)}
                  className={`w-full text-left px-4 py-3 border-b border-navy/5 hover:bg-navy/[0.03] transition-colors flex items-center gap-3 ${
                    selecionado?.id === item.id && selecionado.canal === item.canal ? "bg-blue/10" : ""
                  }`}
                >
                  <div className="relative shrink-0">
                    <Avatar nome={item.nome} tamanho="md" />
                    <CanalBadge canal={item.canal} tamanho="sm" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-navy truncate">{item.nome}</span>
                      {item.naoLidas > 0 && (
                        <span className="shrink-0 bg-red text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                          {item.naoLidas}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-navy/50 truncate">{item.subtitulo}</div>
                    {item.ultimaMensagemEm && (
                      <div className="text-[11px] text-navy/40 mt-0.5">
                        {new Date(item.ultimaMensagemEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className={`flex-1 flex-col min-w-0 min-h-0 ${selecionado ? "flex" : "hidden md:flex"}`}>
          {conversaWhatsappSelecionada ? (
            <PainelWhatsapp
              conversa={conversaWhatsappSelecionada}
              gcAtual={gcAtual}
              onVoltarMobile={() => setSelecionado(null)}
              onConversaAtualizada={carregarConversas}
            />
          ) : conversaInstagramSelecionada ? (
            <PainelInstagram
              conversa={conversaInstagramSelecionada}
              gcAtual={gcAtual}
              onVoltarMobile={() => setSelecionado(null)}
              onConversaAtualizada={carregarConversas}
              onAbrirSeletorEmpresa={() => abrirSeletorEmpresa("vincular_instagram")}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-navy/40 text-sm">Selecione uma conversa à esquerda</div>
          )}
        </div>
      </div>

      {seletorEmpresaAberto && (
        <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-4" onClick={() => setSeletorEmpresaAberto(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy/15">
              <h2 className="font-bold text-navy">{modoSeletor === "iniciar_whatsapp" ? "Iniciar conversa" : "Vincular a uma empresa"}</h2>
              <button onClick={() => setSeletorEmpresaAberto(false)} className="text-navy/40 hover:text-navy">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-3 border-b border-navy/15">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy/40" />
                <input
                  className="input w-full pl-8"
                  placeholder="Buscar empresa por nome, contato ou telefone..."
                  value={buscaEmpresa}
                  onChange={(e) => setBuscaEmpresa(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {carregandoEmpresas ? (
                <p className="p-4 text-sm text-navy/50">Carregando...</p>
              ) : empresasFiltradas.length === 0 ? (
                <p className="p-4 text-sm text-navy/50">Nenhuma empresa encontrada.</p>
              ) : (
                empresasFiltradas.map((empresa) => (
                  <button
                    key={empresa.id}
                    onClick={() => confirmarEmpresa(empresa)}
                    disabled={modoSeletor === "iniciar_whatsapp" && !empresa.telefone}
                    className="w-full text-left px-5 py-3 border-b border-navy/5 hover:bg-navy/[0.03] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="font-semibold text-sm text-navy">{empresa.nome_empresa}</div>
                    <div className="text-xs text-navy/50">
                      {modoSeletor === "iniciar_whatsapp" ? empresa.telefone ?? "Sem telefone cadastrado" : empresa.nome_contato ?? "—"}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

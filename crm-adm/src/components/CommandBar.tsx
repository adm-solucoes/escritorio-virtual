"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Zap, X, Check, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { parseComando, type ComandoParseado } from "@/lib/acao-rapida-parser";
import { ETAPAS_FUNIL, type AcaoRapidaContato, type Gc } from "@/lib/types";

type Etapa = "comando" | "motivo" | "confirmar" | "resultado";

interface ResultadoCanal {
  ok: boolean;
  erro?: string;
}

interface RespostaConfirmar {
  calendario: ResultadoCanal;
  email: ResultadoCanal;
  whatsapp: ResultadoCanal;
  linkChamada: string | null;
  empresaEncontrada: boolean;
  empresaId: string | null;
  error?: string;
}

const PAGINAS_SEM_MENU = ["/login", "/redefinir-senha", "/auth"];

export default function CommandBar() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("comando");
  const [gcAtual, setGcAtual] = useState<Gc | null>(null);

  const [texto, setTexto] = useState("");
  const [sugestoes, setSugestoes] = useState<AcaoRapidaContato[]>([]);
  const [contatoSelecionadoId, setContatoSelecionadoId] = useState<string | null>(null);
  const [comandoIA, setComandoIA] = useState<ComandoParseado | null>(null);
  const [interpretandoIA, setInterpretandoIA] = useState(false);
  const [erroIA, setErroIA] = useState<string | null>(null);

  const [motivo, setMotivo] = useState("");
  const [motivosRecentes, setMotivosRecentes] = useState<string[]>([]);

  const [empresaJaExiste, setEmpresaJaExiste] = useState(false);
  const [criarNovaEmpresa, setCriarNovaEmpresa] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<RespostaConfirmar | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const esconderNaPagina = PAGINAS_SEM_MENU.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (esconderNaPagina) return;
    let cancelado = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelado || !data.user?.email) return;
      const { data: gc } = await supabase.from("gcs").select("*").eq("email", data.user.email).maybeSingle();
      if (!cancelado) setGcAtual(gc ?? null);
    });
    return () => {
      cancelado = true;
    };
  }, [esconderNaPagina]);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        abrir();
      }
      if (e.key === "Escape" && aberto) {
        fechar();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  function abrir() {
    setAberto(true);
    setEtapa("comando");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function fechar() {
    setAberto(false);
    setEtapa("comando");
    setTexto("");
    setSugestoes([]);
    setContatoSelecionadoId(null);
    setComandoIA(null);
    setErroIA(null);
    setMotivo("");
    setEmpresaJaExiste(false);
    setCriarNovaEmpresa(true);
    setResultado(null);
  }

  const resultadoParse = useMemo(() => (texto.trim() ? parseComando(texto) : null), [texto]);
  const comando: ComandoParseado | null = comandoIA ?? (resultadoParse?.ok ? resultadoParse.comando : null);
  const erroParse = comandoIA ? null : resultadoParse && !resultadoParse.ok ? resultadoParse.erro : null;

  function aoDigitar(novoTexto: string) {
    setTexto(novoTexto);
    setContatoSelecionadoId(null);
    setComandoIA(null);
    setErroIA(null);
  }

  async function tentarComIA(textoParaInterpretar: string) {
    setInterpretandoIA(true);
    setErroIA(null);
    try {
      const res = await fetch("/api/acao-rapida/parse-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: textoParaInterpretar }),
      });
      const dados = await res.json();
      if (dados.comando) {
        setComandoIA(dados.comando);
      } else {
        setErroIA(dados.error ?? "Não consegui entender esse comando.");
      }
    } catch {
      setErroIA("Erro de rede ao tentar interpretar com IA.");
    }
    setInterpretandoIA(false);
  }

  // TESTE: por enquanto a IA entra automaticamente (com debounce) assim que o
  // formato fixo não bate, sem precisar clicar no botão "tentar com IA".
  useEffect(() => {
    if (!erroParse || comandoIA || interpretandoIA) return;
    if (texto.trim().length < 8) return;
    const timer = setTimeout(() => {
      tentarComIA(texto);
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, erroParse]);

  useEffect(() => {
    const nome = comando?.nome ?? "";
    let cancelado = false;
    const consulta =
      nome.length < 2
        ? Promise.resolve({ data: [] as AcaoRapidaContato[] })
        : supabase
            .from("acao_rapida_contatos")
            .select("*")
            .ilike("nome", `%${nome}%`)
            .order("quantidade_usos", { ascending: false })
            .order("ultima_vez_usado", { ascending: false })
            .limit(5);
    consulta.then(({ data }) => {
      if (!cancelado) setSugestoes((data as AcaoRapidaContato[]) ?? []);
    });
    return () => {
      cancelado = true;
    };
  }, [comando?.nome]);

  useEffect(() => {
    if (etapa !== "motivo") return;
    supabase
      .from("acao_rapida_motivos_recentes")
      .select("motivo")
      .order("quantidade_usos", { ascending: false })
      .order("ultima_vez_usado", { ascending: false })
      .limit(5)
      .then(({ data }) => setMotivosRecentes((data ?? []).map((m) => m.motivo)));
  }, [etapa]);

  const emailFinal = useMemo(() => {
    if (contatoSelecionadoId) return sugestoes.find((s) => s.id === contatoSelecionadoId)?.email ?? comando?.email ?? null;
    return comando?.email ?? null;
  }, [comando, contatoSelecionadoId, sugestoes]);

  const telefoneFinal = useMemo(() => {
    if (contatoSelecionadoId) return sugestoes.find((s) => s.id === contatoSelecionadoId)?.telefone ?? comando?.telefone ?? null;
    return comando?.telefone ?? null;
  }, [comando, contatoSelecionadoId, sugestoes]);

  const nomeFinal = comando?.nome ?? "";

  function selecionarContato(contato: AcaoRapidaContato) {
    setContatoSelecionadoId(contato.id);
    setSugestoes([]);
  }

  async function avancarParaMotivo() {
    if (!comando || !emailFinal) return;
    setEtapa("motivo");
  }

  async function avancarParaConfirmar() {
    if (!motivo.trim()) return;

    if (emailFinal) {
      const { data: empresas } = await supabase.from("empresas").select("id, email, telefone");
      const telefoneNormalizado = telefoneFinal?.replace(/\D/g, "") ?? null;
      const match = (empresas ?? []).find((e) => {
        if (e.email && e.email.toLowerCase() === emailFinal.toLowerCase()) return true;
        if (telefoneNormalizado && e.telefone) {
          const normalizado = e.telefone.replace(/\D/g, "");
          return normalizado.length >= 8 && normalizado.slice(-8) === telefoneNormalizado.slice(-8);
        }
        return false;
      });
      setEmpresaJaExiste(Boolean(match));
    }

    setEtapa("confirmar");
  }

  async function confirmar() {
    if (!comando || !gcAtual || !emailFinal) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/acao-rapida/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcId: gcAtual.id,
          nome: nomeFinal,
          email: emailFinal,
          telefone: telefoneFinal,
          dataISO: comando.dataISO,
          hora: comando.hora,
          motivo,
          empresaId: contatoSelecionadoId ? sugestoes.find((s) => s.id === contatoSelecionadoId)?.empresa_id : undefined,
          criarNovaEmpresa: !empresaJaExiste && criarNovaEmpresa,
        }),
      });
      const dados = await res.json();
      setResultado(dados);
      setEtapa("resultado");
    } catch {
      setResultado({
        calendario: { ok: false, erro: "Erro de rede" },
        email: { ok: false, erro: "Erro de rede" },
        whatsapp: { ok: false, erro: "Erro de rede" },
        linkChamada: null,
        empresaEncontrada: false,
        empresaId: null,
      });
      setEtapa("resultado");
    }
    setEnviando(false);
  }

  if (esconderNaPagina || gcAtual?.role === "sem_acesso") return null;

  return (
    <>
      <button
        onClick={abrir}
        className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-red text-white shadow-lg flex items-center justify-center hover:bg-red/90 transition-colors"
        title="Ação rápida (Ctrl+K)"
      >
        <Zap size={20} />
      </button>

      {aberto && (
        <div className="fixed inset-0 z-[60] bg-navy/40 flex items-start justify-center pt-24 p-4" onClick={fechar}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-navy/10">
              <div className="flex items-center gap-2 text-sm font-bold text-navy">
                <Zap size={15} className="text-red" /> Ação rápida
              </div>
              <button onClick={fechar} className="text-navy/40 hover:text-navy">
                <X size={18} />
              </button>
            </div>

            {etapa === "comando" && (
              <div className="p-4 flex flex-col gap-2">
                <input
                  ref={inputRef}
                  className="input w-full"
                  placeholder="reunião 14h com Sergio sergio21@gmail.com 85999999999 amanhã"
                  value={texto}
                  onChange={(e) => aoDigitar(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && comando && emailFinal) avancarParaMotivo();
                  }}
                />
                <p className="text-[11px] text-navy/40">
                  Formato: <strong>reunião [hora] com [nome] [email] [telefone] [dia opcional]</strong> — dia aceita
                  &quot;hoje&quot;, &quot;amanhã&quot; ou DD/MM.
                </p>

                {erroParse && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-red flex items-center gap-1.5">
                      <AlertTriangle size={13} /> {erroParse}
                    </p>
                    {(interpretandoIA || erroIA) && (
                      <button
                        onClick={() => tentarComIA(texto)}
                        disabled={interpretandoIA}
                        className="self-start flex items-center gap-1.5 text-xs font-semibold text-blue hover:underline disabled:opacity-50"
                      >
                        {interpretandoIA && <Loader2 size={12} className="animate-spin" />}
                        {interpretandoIA ? "Interpretando com IA..." : "Tentar de novo com IA"}
                      </button>
                    )}
                    {erroIA && (
                      <p className="text-xs text-red flex items-center gap-1.5">
                        <AlertTriangle size={13} /> {erroIA}
                      </p>
                    )}
                  </div>
                )}

                {comando && !erroParse && (
                  <div className="bg-navy/[0.03] rounded-md p-2.5 text-xs text-navy/70 flex flex-col gap-0.5">
                    {comandoIA && <span className="text-blue font-semibold">Interpretado com IA — confira antes de avançar:</span>}
                    <span>
                      <strong>{new Date(`${comando.dataISO}T00:00:00`).toLocaleDateString("pt-BR")}</strong> às{" "}
                      <strong>{comando.hora}</strong>
                    </span>
                    <span>
                      Com <strong>{nomeFinal}</strong>
                      {emailFinal ? ` · ${emailFinal}` : ""}
                      {telefoneFinal ? ` · ${telefoneFinal}` : ""}
                    </span>
                    {!emailFinal && (
                      <span className="text-amber-700">
                        Sem e-mail no comando — selecione um contato salvo abaixo ou digite o e-mail.
                      </span>
                    )}
                  </div>
                )}

                {sugestoes.length > 0 && (
                  <div className="border border-navy/10 rounded-md overflow-hidden">
                    <p className="text-[10px] font-bold text-navy/40 uppercase px-2 py-1 bg-navy/[0.03]">
                      Contatos salvos
                    </p>
                    {sugestoes.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => selecionarContato(s)}
                        className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-navy/[0.03] ${
                          contatoSelecionadoId === s.id ? "bg-blue/10" : ""
                        }`}
                      >
                        <span className="font-semibold text-navy">{s.nome}</span>{" "}
                        <span className="text-navy/50">
                          {s.email}
                          {s.telefone ? ` · ${s.telefone}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button onClick={avancarParaMotivo} disabled={!comando || !emailFinal} className="btn-primary">
                    Avançar
                  </button>
                </div>
              </div>
            )}

            {etapa === "motivo" && (
              <div className="p-4 flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-navy/60 font-medium">Qual o motivo/cunho dessa reunião? *</span>
                  <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
                </label>

                {motivosRecentes.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-navy/40 uppercase">Recentes</span>
                    <div className="flex flex-wrap gap-1.5">
                      {motivosRecentes.map((m) => (
                        <button
                          key={m}
                          onClick={() => setMotivo(m)}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold bg-navy/5 text-navy/70 hover:bg-navy/10"
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-navy/40 uppercase">Etapas do funil</span>
                  <div className="flex flex-wrap gap-1.5">
                    {ETAPAS_FUNIL.map((etapaFunil) => (
                      <button
                        key={etapaFunil}
                        onClick={() => setMotivo(etapaFunil)}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue/10 text-blue hover:bg-blue/20"
                      >
                        {etapaFunil}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between pt-1">
                  <button onClick={() => setEtapa("comando")} className="btn-secondary">
                    Voltar
                  </button>
                  <button onClick={avancarParaConfirmar} disabled={!motivo.trim()} className="btn-primary">
                    Avançar
                  </button>
                </div>
              </div>
            )}

            {etapa === "confirmar" && comando && (
              <div className="p-4 flex flex-col gap-3">
                <div className="bg-navy/[0.03] rounded-md p-3 text-sm flex flex-col gap-1">
                  <Linha label="Quando" valor={`${new Date(`${comando.dataISO}T00:00:00`).toLocaleDateString("pt-BR")} às ${comando.hora}`} />
                  <Linha label="Nome" valor={nomeFinal} />
                  <Linha label="E-mail" valor={emailFinal ?? "—"} />
                  <Linha label="Telefone" valor={telefoneFinal ?? "— (sem WhatsApp)"} />
                  <Linha label="Motivo" valor={motivo} />
                </div>

                {!empresaJaExiste && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={criarNovaEmpresa}
                      onChange={(e) => setCriarNovaEmpresa(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-navy/70">Cadastrar {nomeFinal} como nova empresa no CRM</span>
                  </label>
                )}
                {empresaJaExiste && <p className="text-xs text-green-700">Já vinculado a uma empresa existente no CRM.</p>}

                <div className="flex justify-between pt-1">
                  <button onClick={() => setEtapa("motivo")} className="btn-secondary">
                    Voltar
                  </button>
                  <button onClick={confirmar} disabled={enviando} className="btn-primary">
                    {enviando && <Loader2 size={14} className="animate-spin" />} {enviando ? "Confirmando..." : "Confirmar"}
                  </button>
                </div>
              </div>
            )}

            {etapa === "resultado" && resultado && (
              <div className="p-4 flex flex-col gap-3">
                {resultado.error ? (
                  <p className="text-sm text-red flex items-center gap-1.5">
                    <AlertTriangle size={14} /> {resultado.error}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <StatusCanal nome="Calendário" resultado={resultado.calendario} />
                    <StatusCanal nome="E-mail" resultado={resultado.email} />
                    <StatusCanal nome="WhatsApp" resultado={resultado.whatsapp} />
                    {resultado.linkChamada && (
                      <a href={resultado.linkChamada} target="_blank" rel="noopener noreferrer" className="text-xs text-blue underline">
                        Link da chamada: {resultado.linkChamada}
                      </a>
                    )}
                  </div>
                )}
                <div className="flex justify-end pt-1">
                  <button onClick={fechar} className="btn-primary">
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-navy/50">{label}</span>
      <span className="text-navy font-semibold text-right">{valor}</span>
    </div>
  );
}

function StatusCanal({ nome, resultado }: { nome: string; resultado: ResultadoCanal }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {resultado.ok ? (
        <Check size={15} className="text-green-600 shrink-0" />
      ) : (
        <AlertTriangle size={15} className="text-red shrink-0" />
      )}
      <span className="font-semibold text-navy">{nome}</span>
      <span className={resultado.ok ? "text-green-700" : "text-red"}>{resultado.ok ? "enviado" : resultado.erro ?? "falhou"}</span>
    </div>
  );
}

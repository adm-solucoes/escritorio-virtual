"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Search, Loader2, ChevronDown } from "lucide-react";

interface Props {
  onClose: () => void;
  onImportado: () => void;
}

interface Resultado {
  encontradas: number;
  totalDisponivel: number;
  importadas: number;
  duplicadas: number;
}

interface OpcaoCnae {
  codigo: string;
  descricao: string;
}

const SITUACOES = ["ATIVA", "BAIXADA", "INAPTA", "NULA", "SUSPENSA"] as const;

function SeletorCnae({ selecionados, onChange }: { selecionados: OpcaoCnae[]; onChange: (v: OpcaoCnae[]) => void }) {
  const [opcoes, setOpcoes] = useState<OpcaoCnae[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    fetch("/api/cnae")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setOpcoes(Array.isArray(d) ? d : []))
      .finally(() => setCarregando(false));
  }, []);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return opcoes.slice(0, 200);
    return opcoes.filter((o) => o.descricao.toLowerCase().includes(termo) || o.codigo.includes(termo)).slice(0, 200);
  }, [opcoes, busca]);

  function alternar(opcao: OpcaoCnae) {
    const jaTem = selecionados.some((s) => s.codigo === opcao.codigo);
    onChange(jaTem ? selecionados.filter((s) => s.codigo !== opcao.codigo) : [...selecionados, opcao]);
  }

  return (
    <div className="relative">
      <label className="text-xs font-semibold text-navy/50 uppercase tracking-wide">CNAE (atividade principal)</label>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="input mt-1 w-full flex items-center justify-between text-left"
      >
        <span className={selecionados.length ? "text-navy" : "text-navy/40"}>
          {carregando
            ? "Carregando lista do IBGE..."
            : selecionados.length
              ? `${selecionados.length} atividade(s) selecionada(s)`
              : "Todas (opcional)"}
        </span>
        <ChevronDown size={14} className="text-navy/40 shrink-0" />
      </button>

      {selecionados.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selecionados.map((s) => (
            <span
              key={s.codigo}
              className="flex items-center gap-1 text-[11px] font-semibold bg-navy/5 text-navy/70 rounded-full pl-2.5 pr-1.5 py-1"
            >
              {s.descricao}
              <button type="button" onClick={() => alternar(s)} className="hover:text-red">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {aberto && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-navy/15 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
          <input
            autoFocus
            className="input rounded-none border-0 border-b border-navy/10 m-0"
            placeholder="Buscar por nome ou código..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <div className="overflow-y-auto">
            {filtradas.length === 0 ? (
              <p className="text-xs text-navy/40 px-3 py-3">Nenhuma atividade encontrada.</p>
            ) : (
              filtradas.map((o) => {
                const marcada = selecionados.some((s) => s.codigo === o.codigo);
                return (
                  <label
                    key={o.codigo}
                    className="flex items-start gap-2 px-3 py-2 text-xs hover:bg-navy/5 cursor-pointer"
                  >
                    <input type="checkbox" className="w-3.5 h-3.5 mt-0.5" checked={marcada} onChange={() => alternar(o)} />
                    <span className="text-navy/80">
                      {o.descricao} <span className="text-navy/40">({o.codigo})</span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <div className="border-t border-navy/10 px-3 py-2 flex justify-end">
            <button type="button" onClick={() => setAberto(false)} className="text-xs font-semibold text-blue">
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportarLeadsModal({ onClose, onImportado }: Props) {
  const [uf, setUf] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [ddd, setDdd] = useState("");
  const [cnae, setCnae] = useState<OpcaoCnae[]>([]);
  const [situacao, setSituacao] = useState<(typeof SITUACOES)[number]>("ATIVA");
  const [comTelefone, setComTelefone] = useState(false);
  const [comEmail, setComEmail] = useState(false);
  const [quantidade, setQuantidade] = useState(50);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function buscarEImportar() {
    setBuscando(true);
    setErro(null);
    setResultado(null);
    try {
      const resposta = await fetch("/api/leads/importar-casa-dos-dados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantidade,
          filtros: {
            uf: uf.trim() ? uf.split(",").map((v) => v.trim().toLowerCase()) : undefined,
            municipio: municipio.trim() ? municipio.split(",").map((v) => v.trim().toLowerCase()) : undefined,
            ddd: ddd.trim() ? ddd.split(",").map((v) => v.trim()) : undefined,
            codigo_atividade_principal: cnae.length ? cnae.map((c) => c.codigo) : undefined,
            situacao_cadastral: [situacao],
            mais_filtros: {
              com_telefone: comTelefone || (ddd.trim() ? true : undefined),
              com_email: comEmail || undefined,
              // O cadastro na Receita Federal às vezes traz o e-mail do
              // escritório de contabilidade que abriu o CNPJ, não da empresa.
              excluir_email_contab: true,
            },
          },
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.error ?? "Falha ao importar.");
      } else {
        setResultado(dados as Resultado);
        if (dados.importadas > 0) onImportado();
      }
    } catch {
      setErro("Falha de conexão com a Casa dos Dados.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-navy/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy/10 sticky top-0 bg-white">
          <h2 className="font-extrabold text-lg text-navy">Importar leads (Casa dos Dados)</h2>
          <button onClick={onClose} className="text-navy/40 hover:text-navy">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <p className="text-xs text-navy/50">
            Busca empresas reais na base da Receita Federal via Casa dos Dados e importa pra sua lista, pulando CNPJs
            que já estão cadastrados aqui. Cada resultado consome saldo da conta da Casa dos Dados.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-navy/50 uppercase tracking-wide">UF</label>
              <input className="input mt-1 w-full" placeholder="ce, sp" value={uf} onChange={(e) => setUf(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-navy/50 uppercase tracking-wide">Município</label>
              <input
                className="input mt-1 w-full"
                placeholder="fortaleza"
                value={municipio}
                onChange={(e) => setMunicipio(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-navy/50 uppercase tracking-wide">DDD do telefone</label>
            <p className="text-xs text-navy/50 mb-1">
              Só traz empresas com telefone registrado nesse(s) DDD(s) — força &quot;só com telefone&quot; automaticamente.
            </p>
            <input className="input w-full" placeholder="85 (opcional, separado por vírgula)" value={ddd} onChange={(e) => setDdd(e.target.value)} />
          </div>

          <SeletorCnae selecionados={cnae} onChange={setCnae} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-navy/50 uppercase tracking-wide">Situação cadastral</label>
              <select
                className="input mt-1 w-full"
                value={situacao}
                onChange={(e) => setSituacao(e.target.value as (typeof SITUACOES)[number])}
              >
                {SITUACOES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-navy/50 uppercase tracking-wide">Quantidade (máx. 1000)</label>
              <input
                type="number"
                min={1}
                max={1000}
                className="input mt-1 w-full"
                value={quantidade}
                onChange={(e) => setQuantidade(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-navy/80">
              <input type="checkbox" className="w-4 h-4" checked={comTelefone} onChange={(e) => setComTelefone(e.target.checked)} />
              Só com telefone
            </label>
            <label className="flex items-center gap-2 text-sm text-navy/80">
              <input type="checkbox" className="w-4 h-4" checked={comEmail} onChange={(e) => setComEmail(e.target.checked)} />
              Só com e-mail
            </label>
          </div>

          {erro && <div className="text-sm text-red bg-red/5 border border-red/20 rounded-lg px-4 py-3">{erro}</div>}

          {resultado && (
            <div className="text-sm text-navy/70 bg-navy/[0.03] border border-navy/10 rounded-lg px-4 py-3">
              Encontradas {resultado.encontradas}. Importadas{" "}
              <strong>{resultado.importadas}</strong>, {resultado.duplicadas} já estavam cadastradas.
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-semibold text-navy/60 hover:bg-navy/5">
              Fechar
            </button>
            <button onClick={buscarEImportar} disabled={buscando} className="btn-primary text-sm disabled:opacity-50">
              {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {buscando ? "Gerando e importando... (pode levar até 1 min)" : "Buscar e importar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

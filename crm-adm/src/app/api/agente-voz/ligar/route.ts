import { createAdminClient } from "@/lib/supabase-admin";
import { exigirSessao } from "@/lib/auth-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CorpoRequisicao {
  baseUrl: string;
  empresaIds: string[];
}

const MAX_POR_DISPARO = 20;

/** Normaliza pra E.164 (+55DDDNUMERO) — mesma lógica do
 * agente-voz-outbound/scripts/dialFromCrm.js, pra bater com o formato que a
 * rota /calls/start exige. */
function normalizarTelefone(bruto: string | null): string | null {
  if (!bruto) return null;
  const primeiro = bruto.split("/")[0];
  const digitos = primeiro.replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.startsWith("55") && digitos.length >= 12) return `+${digitos}`;
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`;
  return `+${digitos}`;
}

/** Dispara ligações reais via agente-voz-outbound pra uma seleção de
 * empresas — botão "Ligar agora" na aba Prospects de /agente-voz. O
 * segredo compartilhado (AGENTE_VOZ_WEBHOOK_SECRET) fica só no servidor;
 * o navegador manda apenas a URL pública (ngrok) do agente, que muda a
 * cada sessão local, e a lista de empresas selecionadas. */
export async function POST(req: Request) {
  const sessao = await exigirSessao();
  if ("erro" in sessao) return Response.json({ error: sessao.erro }, { status: sessao.status });

  const corpo = (await req.json()) as CorpoRequisicao;
  const baseUrl = corpo.baseUrl?.trim().replace(/\/$/, "");
  // Só aceita domínios de túnel conhecidos (ngrok / Cloudflare Tunnel, os
  // dois sugeridos no README do agente de voz). Sem isso, qualquer usuário
  // logado poderia colar uma URL própria aqui e o servidor mandaria o
  // segredo compartilhado (x-api-key) + telefone/nome de leads reais pra
  // ela — vazamento de segredo e de dado pessoal.
  const dominioPermitido = /^https:\/\/[a-z0-9-]+\.(ngrok-free\.app|ngrok\.app|ngrok\.io|trycloudflare\.com)$/i;
  if (!baseUrl || !dominioPermitido.test(baseUrl)) {
    return Response.json(
      { error: "URL do agente de voz inválida — precisa ser um domínio ngrok ou Cloudflare Tunnel (ex: https://xxxx.ngrok-free.app)." },
      { status: 400 }
    );
  }

  const empresaIds = (corpo.empresaIds ?? []).slice(0, MAX_POR_DISPARO);
  if (empresaIds.length === 0) {
    return Response.json({ error: "Nenhuma empresa selecionada." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: empresas, error } = await admin
    .from("empresas")
    .select("id, nome_empresa, nome_contato, telefone")
    .in("id", empresaIds);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const apiKey = process.env.AGENTE_VOZ_WEBHOOK_SECRET;
  const resultados: { empresaId: string; nome: string; ok: boolean; detalhe: string }[] = [];

  for (const empresaId of empresaIds) {
    const empresa = empresas?.find((e) => e.id === empresaId);
    if (!empresa) {
      resultados.push({ empresaId, nome: "?", ok: false, detalhe: "Empresa não encontrada." });
      continue;
    }
    const telefone = normalizarTelefone(empresa.telefone);
    const nome = empresa.nome_contato || empresa.nome_empresa;
    if (!telefone) {
      resultados.push({ empresaId, nome, ok: false, detalhe: "Sem telefone válido." });
      continue;
    }

    try {
      const resposta = await fetch(`${baseUrl}/calls/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
        body: JSON.stringify({ telefone, nome }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        resultados.push({ empresaId, nome, ok: false, detalhe: dados.erro ?? `HTTP ${resposta.status}` });
      } else {
        resultados.push({ empresaId, nome, ok: true, detalhe: `callId ${dados.callId}` });
      }
    } catch (erro) {
      resultados.push({
        empresaId,
        nome,
        ok: false,
        detalhe: erro instanceof Error ? erro.message : "Falha de conexão com o agente de voz.",
      });
    }
  }

  return Response.json({ resultados });
}

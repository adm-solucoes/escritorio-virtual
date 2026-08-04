import { log, limpar } from "./log.js";

const BASE = "https://api.trello.com/1";

/**
 * Limites publicados pelo Trello: 300 requisições / 10s por API key e
 * 100 requisições / 10s por token. O token é o mais apertado, então é ele
 * que a gente respeita. Um intervalo mínimo entre chamadas resolve sem
 * precisar de janela deslizante — este script faz dezenas de chamadas, não
 * milhares, e previsibilidade aqui vale mais que velocidade.
 */
const INTERVALO_MINIMO_MS = 110;

export class ErroTrello extends Error {
  constructor(mensagem, { status, corpo } = {}) {
    super(mensagem);
    this.name = "ErroTrello";
    this.status = status;
    this.corpo = corpo;
  }
}

export class ClienteTrello {
  #apiKey;
  #token;
  #ultimaChamada = 0;
  #dryRun;

  constructor({ apiKey, token, dryRun = false }) {
    this.#apiKey = apiKey;
    this.#token = token;
    this.#dryRun = dryRun;
    this.chamadas = 0;
  }

  async #respeitarRitmo() {
    const desde = Date.now() - this.#ultimaChamada;
    if (desde < INTERVALO_MINIMO_MS) {
      await new Promise((r) => setTimeout(r, INTERVALO_MINIMO_MS - desde));
    }
    this.#ultimaChamada = Date.now();
  }

  /**
   * Faz a chamada com retry. Retenta em 429 (limite de taxa) e 5xx, que são
   * transitórios; NÃO retenta em 4xx como 401/404, que só repetiriam o mesmo
   * erro — nesses casos falhar rápido com uma mensagem clara ajuda mais.
   */
  async #requisitar(metodo, caminho, parametros = {}, { tentativas = 4 } = {}) {
    const url = new URL(BASE + caminho);
    for (const [chave, valor] of Object.entries(parametros)) {
      if (valor !== undefined && valor !== null) url.searchParams.set(chave, String(valor));
    }
    url.searchParams.set("key", this.#apiKey);
    url.searchParams.set("token", this.#token);

    let ultimoErro;

    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      await this.#respeitarRitmo();
      this.chamadas++;

      let resposta;
      try {
        resposta = await fetch(url, {
          method: metodo,
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(20000),
        });
      } catch (err) {
        // Falha de rede/timeout: vale retentar.
        ultimoErro = new ErroTrello(`falha de rede em ${metodo} ${caminho}: ${err.message}`);
        if (tentativa < tentativas) {
          const espera = Math.min(1000 * 2 ** (tentativa - 1), 8000);
          log.aviso(`rede falhou (tentativa ${tentativa}/${tentativas}), repetindo em ${espera}ms...`);
          await new Promise((r) => setTimeout(r, espera));
          continue;
        }
        throw ultimoErro;
      }

      if (resposta.ok) {
        const texto = await resposta.text();
        if (!texto) return null;
        try {
          return JSON.parse(texto);
        } catch {
          return texto; // algumas rotas devolvem texto puro
        }
      }

      const corpo = await resposta.text().catch(() => "");
      const transitorio = resposta.status === 429 || resposta.status >= 500;

      if (!transitorio || tentativa === tentativas) {
        throw new ErroTrello(this.#explicar(resposta.status, corpo, metodo, caminho), {
          status: resposta.status,
          corpo,
        });
      }

      // 429: o Trello não manda Retry-After de forma confiável, então usamos
      // backoff exponencial com um piso generoso (a janela dele é de 10s).
      const espera =
        resposta.status === 429
          ? Math.min(2000 * 2 ** (tentativa - 1), 10000)
          : Math.min(1000 * 2 ** (tentativa - 1), 8000);
      log.aviso(
        `${resposta.status} em ${metodo} ${caminho} (tentativa ${tentativa}/${tentativas}) — repetindo em ${espera}ms`
      );
      await new Promise((r) => setTimeout(r, espera));
    }

    throw ultimoErro;
  }

  /** Transforma o erro cru da API em algo acionável. */
  #explicar(status, corpo, metodo, caminho) {
    const trecho = limpar(corpo).slice(0, 200);
    if (status === 401) {
      return `401 não autorizado em ${metodo} ${caminho}. A chave ou o token está errado/expirado — gere de novo em https://trello.com/app-key. (${trecho})`;
    }
    if (status === 403) {
      return `403 sem permissão em ${metodo} ${caminho}. O token pode não ter escopo de escrita, ou você não é admin do quadro/workspace. (${trecho})`;
    }
    if (status === 404) {
      return `404 não encontrado em ${metodo} ${caminho}. O recurso não existe ou o token não enxerga ele. (${trecho})`;
    }
    return `${status} em ${metodo} ${caminho}: ${trecho}`;
  }

  get(caminho, parametros) {
    // Em dry-run, um recurso "criado" recebe um id fictício (nada foi criado
    // de verdade). Consultar a API com esse id daria 400 "invalid id" e
    // abortaria a simulação no meio — então respondemos vazio, que é a
    // resposta correta: um quadro que não existe não tem listas nem membros.
    if (caminho.includes("/dry-run-")) return Promise.resolve([]);
    return this.#requisitar("GET", caminho, parametros);
  }

  /** Escrita: respeita --dry-run (não altera nada, só relata). */
  async post(caminho, parametros, { descricao } = {}) {
    if (this.#dryRun) {
      log.info(`   [dry-run] POST ${caminho}${descricao ? ` — ${descricao}` : ""}`);
      return { id: `dry-run-${Math.random().toString(36).slice(2, 10)}`, __dryRun: true };
    }
    return this.#requisitar("POST", caminho, parametros);
  }

  async put(caminho, parametros, { descricao } = {}) {
    if (this.#dryRun) {
      log.info(`   [dry-run] PUT ${caminho}${descricao ? ` — ${descricao}` : ""}`);
      return { __dryRun: true };
    }
    return this.#requisitar("PUT", caminho, parametros);
  }

  /** Confirma que as credenciais funcionam antes de qualquer escrita. */
  async verificarCredenciais() {
    const eu = await this.get("/members/me", { fields: "id,username,fullName" });
    return eu;
  }
}

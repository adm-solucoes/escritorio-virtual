/**
 * Controla quantas ligações ficam ATIVAS ao mesmo tempo durante um disparo em
 * lote. Antes disso, batchDial.js/dialFromCrm.js só esperavam um intervalo
 * fixo (BATCH_INTERVALO_SEGUNDOS) entre o INÍCIO de cada ligação — não entre
 * o fim de uma e o início da próxima. Como boa parte das ligações reais dura
 * mais que esse intervalo (94s, 155s, 213s já registrados em
 * logs/custos.log), isso deixava várias ligações rodando ao mesmo tempo sem
 * nenhum limite real, mesmo discando "uma de cada vez" no script.
 *
 * Aqui o disparo da próxima ligação só acontece quando o número de ligações
 * ainda em andamento (consultado de verdade via GET /calls/:callId) cai
 * abaixo do máximo configurado.
 */

const STATUS_FINAIS = new Set(["concluida", "erro", "erro_pos_processamento"]);

// Trava de segurança: se uma ligação nunca chegar a um status final (bug,
// travamento do processo, etc), não deixa o lote inteiro travado esperando
// pra sempre — libera a vaga mesmo assim depois desse tempo.
const TEMPO_MAX_LIGACAO_MS = 5 * 60 * 1000;

const INTERVALO_VERIFICACAO_MS = 4000;

export function criarControladorDeConcorrencia({ baseUrl, maximoSimultaneo }) {
  const ativas = new Map(); // callId -> timestamp de início

  async function consultarStatus(callId) {
    try {
      const resposta = await fetch(`${baseUrl}/calls/${callId}`);
      if (!resposta.ok) return null;
      return await resposta.json();
    } catch {
      return null;
    }
  }

  async function removerFinalizadas() {
    for (const [callId, iniciadoEm] of [...ativas]) {
      const travada = Date.now() - iniciadoEm > TEMPO_MAX_LIGACAO_MS;
      if (travada) {
        ativas.delete(callId);
        continue;
      }
      const registro = await consultarStatus(callId);
      if (!registro || STATUS_FINAIS.has(registro.status)) {
        ativas.delete(callId);
      }
    }
  }

  return {
    /** Bloqueia até haver uma vaga livre (menos de `maximoSimultaneo` em andamento). */
    async aguardarVaga() {
      await removerFinalizadas();
      while (ativas.size >= maximoSimultaneo) {
        await new Promise((r) => setTimeout(r, INTERVALO_VERIFICACAO_MS));
        await removerFinalizadas();
      }
    },

    registrar(callId) {
      ativas.set(callId, Date.now());
    },

    /** Espera todas as ligações em andamento chegarem a um status final. */
    async aguardarTodasTerminarem() {
      await removerFinalizadas();
      while (ativas.size > 0) {
        await new Promise((r) => setTimeout(r, INTERVALO_VERIFICACAO_MS));
        await removerFinalizadas();
      }
    },

    emAndamento() {
      return ativas.size;
    },
  };
}

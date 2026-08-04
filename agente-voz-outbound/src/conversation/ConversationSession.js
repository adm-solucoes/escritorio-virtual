import { chat } from "../services/llm/index.js";
import { criarSessaoTts } from "../services/tts/index.js";
import { iniciarTranscricaoAoVivo } from "../services/stt/deepgram.js";
import { config } from "../config.js";

/**
 * Orquestra uma ligação: recebe áudio do Twilio, manda pro Deepgram, quando
 * o usuário termina de falar manda o histórico pro LLM (streaming), corta a
 * resposta em frases e manda cada frase pro Cartesia assim que fica pronta —
 * sem esperar a resposta inteira do LLM terminar, o que economiza uns bons
 * segundos de latência percebida numa resposta longa.
 *
 * Barge-in (usuário interrompe o agente): qualquer fala nova detectada
 * enquanto o agente está com áudio saindo cancela a fala atual (Cartesia +
 * evento "clear" pro Twilio, que limpa o buffer de reprodução) e ignora
 * qualquer coisa que a geração de LLM antiga ainda mandar depois disso — feito
 * com um contador de "turno" simples em vez de AbortController real, porque o
 * ponto que importa cortar é a entrega de áudio, não a chamada HTTP em si.
 */
const MARCADOR_ENCERRAR = "[ENCERRAR_LIGACAO]";

// Quantas mensagens de conversa (fora o system prompt) seguem pro LLM a cada
// turno. 12 ≈ 6 trocas — sobra pra uma ligação de prospecção, que é curta.
const MAX_MENSAGENS_HISTORICO = 12;

export class ConversationSession {
  constructor({
    callId,
    systemPrompt,
    systemPromptContinuacao,
    aberturaFixa,
    nomeLead,
    horariosDisponiveis,
    onAudioParaTwilio,
    onLimparBufferTwilio,
    onAguardarReproducaoCompleta,
    onEncerrarLigacao,
    onFinalizar,
  }) {
    this.callId = callId;
    this.onAudioParaTwilio = onAudioParaTwilio;
    this.onLimparBufferTwilio = onLimparBufferTwilio;
    this.onAguardarReproducaoCompleta = onAguardarReproducaoCompleta;
    this.onEncerrarLigacao = onEncerrarLigacao;
    this.onFinalizar = onFinalizar;

    // Quando a base já traz o nome do dono (comum — vem da Casa dos Dados),
    // o agente diz o nome da pessoa JÁ NA PRIMEIRA PALAVRA, não só no fim da
    // abertura — em ligação fria, silêncio ou uma abertura genérica nos
    // primeiros segundos é lido como golpe/telemarketing e a pessoa desliga
    // antes de ouvir o resto. Ouvir o próprio nome de cara já sinaliza "não é
    // spam aleatório, sabem quem eu sou" e segura a atenção pra frase seguinte.
    const aberturaComNome = nomeLead
      ? `Oi ${nomeLead}, tudo bem? Aqui é o ${config.agente.nome}, da ADM Soluções.`
      : aberturaFixa;
    const systemPromptFinal = nomeLead
      ? `${systemPrompt}\n\nNOME DO LEAD: ${nomeLead} (dono/decisor da empresa, conforme nossa base). Já confirmou na abertura que é ele/ela. REGRA IMPORTANTE: NÃO repita o nome em quase toda fala — isso soa artificial/vendedor forçado, tipo script de call center. Use o nome NO MÁXIMO mais uma ou duas vezes na ligação inteira, só em momentos que pesem (ex: no convite final pro briefing), nunca em falas seguidas.`
      : systemPrompt;

    this.systemPromptBase = systemPromptFinal;

    // Versão curta pros turnos SEGUINTES ao primeiro. O roteiro completo é
    // reenviado a cada turno (a API é stateless), e só ele já pesava ~2.100
    // tokens — com o limite de 6.000 tokens/MINUTO do plano gratuito da Groq,
    // cabiam só 2 turnos por minuto e a ligação travava no meio da conversa.
    // Depois da abertura, as instruções de abertura não servem mais pra nada;
    // a versão de continuação mantém as regras que ainda decidem comportamento
    // (ponte, 2 frases, não desligar com pergunta aberta, banco de perguntas)
    // e corta o resto. Se não existir o arquivo, cai no roteiro completo.
    this.systemPromptContinuacao = systemPromptContinuacao
      ? nomeLead
        ? `${systemPromptContinuacao}\n\nNOME DO LEAD: ${nomeLead}. NÃO repita o nome em quase toda fala — soa script de call center. No máximo mais uma vez na ligação, num momento que pese.`
        : systemPromptContinuacao
      : systemPromptFinal;

    this.mensagens = [{ role: "system", content: this._montarSystemPrompt(horariosDisponiveis) }];
    this.transcricaoCompleta = [];
    this.tokensEntradaTotal = 0;
    this.tokensSaidaTotal = 0;
    this.caracteresFaladosTotal = 0; // pro custo do TTS quando o provedor cobra por caractere (ElevenLabs)

    this.estado = "falando"; // "falando" | "ouvindo" | "pensando"
    this.turnoAtual = 0; // incrementado a cada barge-in; callbacks de turnos antigos se ignoram
    this.encerrando = false; // true assim que decidimos desligar — barra qualquer turno novo
    this.processandoTurno = false; // trava contra dois turnos de LLM ao mesmo tempo
    this.textoPendente = null; // fala que chegou enquanto um turno já rodava
    this.tts = criarSessaoTts(callId);
    this.falaEmAndamento = null; // { contextId, cancelar }

    this.stt = iniciarTranscricaoAoVivo({
      onFalaConcluida: (texto) => this._aoUsuarioTerminarDeFalar(texto),
      onTranscricaoParcial: (texto) => this._aoDetectarFalaParcial(texto),
      onErro: (err) => console.error(`[${callId}] erro no Deepgram:`, err.message ?? err),
    });

    // A ligação começa com o agente falando (script de abertura), não
    // esperando o lead falar primeiro — é uma ligação outbound de prospecção.
    this._falar(aberturaComNome, { registrarComoAssistente: true });
  }

  /** Monta o system prompt, com ou sem o bloco de horários — usado tanto na
   * construção (sem horários ainda) quanto depois, quando eles chegam.
   * `base` permite montar tanto com o roteiro completo quanto com o de
   * continuação, reaproveitando o mesmo bloco de horários. */
  _montarSystemPrompt(horariosDisponiveis, base = this.systemPromptBase) {
    if (!horariosDisponiveis?.length) return base;
    return (
      base +
      `\n\nHORÁRIOS DISPONÍVEIS PRA BRIEFING (reais, conferidos agora na agenda do time comercial): ${horariosDisponiveis.join(
        ", "
      )}. Quando for propor o briefing, OFEREÇA um desses horários diretamente (ex: "consigo te encaixar quarta às 14h, funciona?") em vez de perguntar em aberto. Se nenhum servir, aí sim pergunte qual seria melhor pra pessoa. Nunca invente um horário que não esteja nessa lista.`
    );
  }

  /**
   * Os horários livres na agenda (consulta ao CRM) NÃO travam mais o início
   * da ligação — antes, o `await` dessa busca (até 3s de timeout) acontecia
   * ANTES da Fernanda conseguir falar a primeira palavra, o que causava
   * silêncio real no início da ligação (visto na prática: pessoa fala "alô?"
   * porque não ouve nada por vários segundos). Agora a busca roda em paralelo
   * lá no media-stream server, e só quando termina (normalmente bem antes do
   * primeiro turno de LLM de verdade, que só acontece depois da pessoa
   * responder à abertura) esse método atualiza o system prompt.
   */
  atualizarHorariosDisponiveis(horariosDisponiveis) {
    if (!horariosDisponiveis?.length) return;
    this.horariosDisponiveis = horariosDisponiveis;
    this.mensagens[0].content = this._montarSystemPrompt(horariosDisponiveis);
  }

  /**
   * Monta o que vai pro LLM: system prompt + só as últimas trocas.
   *
   * O histórico completo continua guardado em `this.mensagens` (vai pra
   * extração no fim), mas mandar tudo em TODO turno fazia o custo crescer
   * quadraticamente — 5 turnos ≈ 19 mil tokens, 10 turnos ≈ 41 mil. Como o
   * plano gratuito da Groq limita por tokens/MINUTO (12 mil medidos), uma
   * ligação um pouco mais longa estourava o teto no meio e o turno morria.
   * Numa ligação de prospecção curta, as últimas trocas bastam pro contexto.
   */
  _mensagensParaLlm() {
    const [system, ...resto] = this.mensagens;

    // Do SEGUNDO turno em diante manda o roteiro de continuação (bem menor):
    // as instruções de abertura já cumpriram seu papel e só ocupam espaço. É
    // o que mantém cada requisição abaixo do teto de tokens/minuto da Groq.
    // O primeiro turno (só a abertura no histórico) segue com o completo.
    const jaPassouDaAbertura = resto.filter((m) => m.role === "assistant").length > 1;
    const systemEfetivo = jaPassouDaAbertura
      ? { role: "system", content: this._montarSystemPrompt(this.horariosDisponiveis, this.systemPromptContinuacao) }
      : system;

    if (resto.length <= MAX_MENSAGENS_HISTORICO) return [systemEfetivo, ...resto];
    return [systemEfetivo, ...resto.slice(-MAX_MENSAGENS_HISTORICO)];
  }

  /** Chamado pelo servidor de media-stream a cada frame de áudio recebido do Twilio. */
  receberAudioDoUsuario(bufferMulaw) {
    this.stt.enviarAudio(bufferMulaw);
  }

  _aoDetectarFalaParcial(_texto) {
    // Barge-in: se o agente está falando e chegou QUALQUER sinal de fala do
    // usuário, interrompe na hora — não espera confirmar a frase inteira,
    // senão a interrupção fica com uma lentidão perceptível e estranha.
    // Exceto se já estamos encerrando a ligação: a despedida final tem que
    // tocar inteira, não pode ser cortada por um ruído captado como fala.
    if (this.estado === "falando" && !this.encerrando) this._cancelarFalaAtual();
  }

  /**
   * Porta de entrada de toda fala do usuário. Serializa os turnos: se uma
   * fala nova chegar enquanto o turno anterior ainda está rodando (LLM
   * gerando ou agente falando), ela NÃO abre um turno concorrente — fica
   * guardada e é processada quando o atual terminar.
   *
   * Sem isso, dois turnos rodavam ao mesmo tempo com o mesmo `turnoAtual`,
   * ambos passavam nas verificações de "meu turno ainda é o atual", ambos
   * chamavam o LLM e ambos tentavam falar — e um barge-in no meio invalidava
   * os dois, deixando o agente mudo pelo resto da ligação.
   */
  async _aoUsuarioTerminarDeFalar(texto) {
    if (this.encerrando) return;

    if (this.processandoTurno) {
      this.textoPendente = this.textoPendente ? `${this.textoPendente} ${texto}` : texto;
      return;
    }

    this.processandoTurno = true;
    try {
      await this._processarTurno(texto);
    } finally {
      this.processandoTurno = false;
      const pendente = this.textoPendente;
      this.textoPendente = null;
      // Fala que chegou durante o turno anterior entra agora, como um turno
      // normal (sem recursão infinita: só roda se realmente houver pendência).
      if (pendente && !this.encerrando) this._aoUsuarioTerminarDeFalar(pendente);
    }
  }

  async _processarTurno(texto) {
    // Uma vez decidido encerrar, nenhum turno novo pode começar — sem essa
    // trava, um ruído/respiração captado como is_final espúrio (mais
    // provável agora que respondemos rápido, no is_final em vez de esperar o
    // UtteranceEnd) dispara um SEGUNDO turno concorrente enquanto o primeiro
    // ainda está na despedida, e o desligamento acontece antes da fala real
    // terminar de tocar — foi visto acontecer na prática.
    if (this.encerrando) return;
    this.transcricaoCompleta.push({ papel: "usuario", texto, ts: new Date().toISOString() });
    this.mensagens.push({ role: "user", content: texto });

    const meuTurno = this.turnoAtual;
    this.estado = "pensando";

    let bufferSentenca = "";
    let respostaCompleta = "";
    const filaFala = []; // garante que as frases saem na ordem, mesmo streaming

    const enfileirarFrase = (frase) => {
      filaFala.push(frase);
      processarFila();
    };
    let processando = false;
    const processarFila = async () => {
      if (processando) return;
      processando = true;
      while (filaFala.length > 0) {
        if (meuTurno !== this.turnoAtual) {
          filaFala.length = 0; // turno foi cancelado por barge-in — descarta o resto
          break;
        }
        const frase = filaFala.shift();
        await this._falar(frase, { registrarComoAssistente: false });
      }
      processando = false;
    };

    try {
      const { texto: textoFinal, tokensEntrada, tokensSaida } = await chat(this._mensagensParaLlm(), {
        onToken: (pedaco) => {
          if (meuTurno !== this.turnoAtual) return; // resposta de um turno já cancelado
          bufferSentenca += pedaco;
          respostaCompleta += pedaco;

          // Corta em frases (pontuação forte) assim que possível, pra já
          // mandar pro TTS sem esperar a resposta inteira.
          const partes = bufferSentenca.split(/(?<=[.!?])\s+/);
          if (partes.length > 1) {
            for (let i = 0; i < partes.length - 1; i++) {
              if (partes[i].trim()) enfileirarFrase(partes[i].trim());
            }
            bufferSentenca = partes[partes.length - 1];
          }
        },
      });

      if (meuTurno !== this.turnoAtual) return; // barge-in aconteceu durante a geração

      const textoFinalLimpo = (textoFinal || respostaCompleta).replace(MARCADOR_ENCERRAR, "").trim();

      // O marcador só pode ter chegado inteiro no resto não-falado (nunca foi
      // cortado em frase por pontuação, então sempre sobra pra cá no final).
      // Trava de segurança: mesmo que o modelo mande o marcador, nunca desliga
      // se a fala terminar em pergunta — já vimos o LLM errar isso na prática
      // (perguntar "qual horário?" e mandar encerrar no mesmo turno).
      const encerrarAoFinalizarFala =
        bufferSentenca.includes(MARCADOR_ENCERRAR) && !textoFinalLimpo.trim().endsWith("?");
      bufferSentenca = bufferSentenca.replace(MARCADOR_ENCERRAR, "").trim();
      if (bufferSentenca) enfileirarFrase(bufferSentenca);
      this.tokensEntradaTotal += tokensEntrada;
      this.tokensSaidaTotal += tokensSaida;
      this.mensagens.push({ role: "assistant", content: textoFinalLimpo });
      this.transcricaoCompleta.push({
        papel: "agente",
        texto: textoFinalLimpo,
        ts: new Date().toISOString(),
      });

      if (encerrarAoFinalizarFala) {
        this.encerrando = true; // barra qualquer novo turno a partir daqui
        // Espera a fila de fala esvaziar (todo o áudio da despedida já
        // ENVIADO pro WebSocket). O teto de tempo é rede de segurança: se por
        // qualquer motivo a fila não drenar (TTS travado, etc), a ligação
        // precisa encerrar mesmo assim em vez de girar aqui pra sempre —
        // esse loop já ficou infinito na prática quando o cancelamento do TTS
        // deixava uma promise pendente sem nunca resolver.
        const limiteEspera = Date.now() + 15000;
        while ((processando || filaFala.length > 0) && Date.now() < limiteEspera) {
          await new Promise((r) => setTimeout(r, 100));
        }
        // ...e SÓ ENTÃO espera a confirmação de que a Twilio já REPRODUZIU
        // esse áudio de verdade no telefone (envio != reprodução — sem isso
        // a ligação desliga com a despedida ainda tocando, cortada no meio).
        if (meuTurno === this.turnoAtual) await this.onAguardarReproducaoCompleta?.();
        if (meuTurno === this.turnoAtual) this.onEncerrarLigacao?.();
      }
    } catch (err) {
      console.error(`[${this.callId}] erro no LLM:`, err.message ?? err);
      if (meuTurno === this.turnoAtual) {
        enfileirarFrase("Desculpa, tive um problema aqui. Pode repetir, por favor?");
      }
    }
  }

  /**
   * Wrapper público: `_falar` de verdade NUNCA deve escapar uma exceção pra
   * fora, porque é chamada "fire-and-forget" em vários lugares (abertura da
   * ligação no construtor, fila de frases do streaming do LLM) sem `await`
   * de quem chama. Um erro (ex: Cartesia fora do ar) que escapasse dali virava
   * unhandledRejection — visto na prática em teste — e por padrão do Node
   * isso derruba o processo, matando todas as outras ligações em andamento.
   */
  async _falar(texto, opcoes) {
    try {
      await this._falarInterno(texto, opcoes);
    } catch (err) {
      console.error(`[${this.callId}] falha ao falar (seguindo em frente):`, err.message ?? err);
      this.estado = "ouvindo";
      this.falaEmAndamento = null;
    }
  }

  async _falarInterno(texto, { registrarComoAssistente }) {
    if (!texto?.trim()) return;
    this.estado = "falando";
    this.caracteresFaladosTotal += texto.length;
    const meuTurno = this.turnoAtual;

    if (registrarComoAssistente) {
      this.mensagens.push({ role: "assistant", content: texto });
      this.transcricaoCompleta.push({ papel: "agente", texto, ts: new Date().toISOString() });
    }

    const { contextId, aguardar, cancelar } = await this.tts.falar(texto, {
      onAudioChunk: (buf) => {
        if (meuTurno === this.turnoAtual) this.onAudioParaTwilio(buf);
      },
    });
    this.falaEmAndamento = { contextId, cancelar };

    try {
      await aguardar();
    } catch (err) {
      // Barge-in agora RESOLVE a promise (não rejeita), então cair aqui é
      // erro de verdade do TTS: engasgo da Cartesia (watchdog), conexão
      // caída, etc. Antes isso era engolido em silêncio e a fala
      // simplesmente sumia no meio, sem nenhum rastro pra investigar.
      if (meuTurno === this.turnoAtual) {
        console.error(`[${this.callId}] TTS falhou durante a fala:`, err.message ?? err);
      }
    }

    if (meuTurno === this.turnoAtual) {
      this.estado = "ouvindo";
      this.falaEmAndamento = null;
    }
  }

  _cancelarFalaAtual() {
    this.turnoAtual += 1; // invalida qualquer callback pendente de LLM/TTS do turno anterior
    if (this.falaEmAndamento) {
      this.falaEmAndamento.cancelar();
      this.falaEmAndamento = null;
    }
    this.onLimparBufferTwilio(); // manda "clear" pro Twilio — para o áudio já enfileirado lá
    this.estado = "ouvindo";
  }

  /** Chamado quando a ligação encerra (evento "stop" do media-stream). */
  encerrar() {
    this.stt.encerrar();
    this.tts.fechar();
    this.onFinalizar({
      transcricaoCompleta: this.transcricaoCompleta,
      mensagens: this.mensagens,
      tokensEntradaTotal: this.tokensEntradaTotal,
      tokensSaidaTotal: this.tokensSaidaTotal,
      caracteresFaladosTotal: this.caracteresFaladosTotal,
    });
  }
}

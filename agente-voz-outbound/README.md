# Agente de voz outbound — prospecção comercial

Agente que liga pra leads, conduz uma conversa em português via LLM, qualifica
o lead e entrega o resultado pro CRM (que dispara o follow-up de WhatsApp).
Stack própria (sem Vapi/Retell/Bland): Twilio + Deepgram + Groq + Cartesia.

## Como funciona (visão geral)

```
POST /calls/start ──> Twilio disca ──> pessoa atende
                                            │
                        POST /twilio/voice ▼ (Twilio pede o TwiML)
                        devolve <Connect><Stream> apontando pro nosso WebSocket
                                            │
              WebSocket /media-stream (bidirecional) ▼
   Twilio ──áudio (mulaw/8000)──> Deepgram (STT) ──texto──> Groq (LLM)
   Twilio <──áudio (mulaw/8000)── Cartesia (TTS) <──texto──────┘

Ligação encerra ──> extração estruturada (LLM) ──> webhook pro CRM
```

Formato de áudio: o Twilio manda e espera `mulaw`/8000Hz. Deepgram aceita
`mulaw` nativamente e a Cartesia foi configurada pra devolver `pcm_mulaw`/8000
direto — **não tem transcodificação de áudio em lugar nenhum do pipeline**,
o que ajuda bastante na latência.

## Setup

```bash
cd agente-voz-outbound
npm install
cp .env.example .env
```

Preencha o `.env` (veja os comentários de cada variável no próprio arquivo).
Pontos que merecem atenção:

### 1. Caller ID (seu número, verificado — não é um número novo do Twilio)

No [console do Twilio](https://console.twilio.com) → **Phone Numbers → Verified
Caller IDs** → adicione seu número. O Twilio liga pra você e pede um código.
Depois disso, use esse número (formato `+55DDDNUMERO`) em
`TWILIO_PHONE_NUMBER`. **Sem isso, a chamada da API do Twilio falha** — não
tem jeito de contornar por código, é um passo manual de verificação deles.

### 2. URL pública (`PUBLIC_BASE_URL`)

A Twilio precisa alcançar seu servidor de fora da sua rede pra dois webhooks
(`/twilio/voice` e o WebSocket `/media-stream`). Em desenvolvimento, use
[ngrok](https://ngrok.com) ou Cloudflare Tunnel:

```bash
ngrok http 3000
# copia a URL https://xxxx.ngrok-free.app e coloca em PUBLIC_BASE_URL no .env
```

### 3. Modelo da Groq

O prompt original pedia `llama-3.1-70b`, que **a Groq aposentou**. O
substituto direto (mesma classe) já está configurado como padrão:
`llama-3.3-70b-versatile`. Se quiser conferir os modelos disponíveis na sua
conta: `GET https://api.groq.com/openai/v1/models` com sua chave.

### 4. Voz da Cartesia

`CARTESIA_VOICE_ID` não tem valor padrão de propósito — escolha uma voz em
PT-BR no [painel da Cartesia](https://play.cartesia.ai) e cole o ID.

### 5. Roteiro de vendas

Edite `prompts/roteiro.txt` (system prompt inteiro da conversa) e
`prompts/abertura.txt` (primeira frase, falada assim que a ligação conecta,
antes de qualquer resposta do LLM — reduz a latência do primeiro contato).
Ambos são texto puro, sem precisar mexer em código.

## Rodando

```bash
npm run dev          # sobe o servidor com reload automático
```

**Sempre teste uma ligação sozinha antes do lote:**

```bash
npm run call:single -- +5511999999999
# ou: node scripts/callSingle.js +5511999999999
```

Acompanhe o resultado:

```bash
curl http://localhost:3000/calls/<callId>
# ou leia data/calls.json direto
```

Quando a ligação de teste soar natural, dispare o lote:

```bash
cp scripts/leads.exemplo.csv leads.csv   # edite com os números reais
npm run call:batch -- leads.csv
```

O CSV precisa de uma coluna `telefone` (formato `+55DDDNUMERO`). O intervalo
entre o início de cada ligação é `BATCH_INTERVALO_SEGUNDOS` no `.env` (padrão
20s) — existe pra não estourar limite de concorrência da sua conta Twilio.

## Estrutura

```
src/
  server.js                 Express + WebSocket, ponto de entrada
  config.js                 carrega e valida o .env
  routes/calls.js           POST /calls/start, GET /calls/:id
  routes/twilioVoice.js     POST /twilio/voice (TwiML), /twilio/status
  mediaStreamServer.js      WebSocket /media-stream — protocolo do Twilio
  conversation/
    ConversationSession.js  o orquestrador: STT → LLM → TTS, barge-in
  services/
    stt/deepgram.js         transcrição ao vivo
    llm/index.js            interface abstrata (troque o provedor aqui)
    llm/groq.js              implementação Groq
    tts/cartesia.js          síntese de voz via WebSocket
    extraction.js            JSON estruturado pós-ligação
    crmWebhook.js            entrega pro CRM (com retry)
    costLogger.js            estimativa de custo por ligação
  db/store.js                persistência simples em JSON
prompts/
  roteiro.txt                system prompt (EDITE — é placeholder)
  abertura.txt                primeira frase falada (EDITE)
  extracao.txt                prompt da extração estruturada
scripts/
  callSingle.js               dispara uma ligação de teste
  batchDial.js                dispara o lote a partir de um CSV
data/calls.json                (gerado em runtime, git-ignorado)
logs/custos.log                (gerado em runtime, git-ignorado)
```

## Trocando de provedor de LLM depois

`src/services/llm/index.js` é a única porta de entrada — todo o resto do
sistema chama `chat(mensagens, opcoes)` sem saber qual provedor está por trás.
Pra usar Claude ou OpenAI: crie `src/services/llm/anthropic.js` (ou
`openai.js`) com a mesma assinatura de `chatGroq`, mapeie em `index.js` e
mude `LLM_PROVIDER` no `.env`. Nada em `ConversationSession.js` ou
`extraction.js` muda.

## Interrupção (barge-in)

Se a pessoa começar a falar enquanto o agente ainda está com áudio saindo, o
sistema: cancela a síntese em andamento na Cartesia, manda um evento `clear`
pro Twilio (que limpa o áudio já enfileirado do lado de lá) e ignora qualquer
resposta do LLM que ainda estivesse "a caminho" daquele turno antigo. Ver
`ConversationSession._cancelarFalaAtual()`.

## Resiliência (por que isso importa aqui)

Um único processo Node atende **todas** as ligações simultâneas do lote (uma
conexão WebSocket por ligação). Isso significa que um erro não tratado em
qualquer chamada de API externa — Cartesia, Deepgram, Groq — pode, por padrão
do Node, **derrubar o processo inteiro e cortar todas as outras ligações em
andamento**. Isso foi reproduzido e corrigido durante o desenvolvimento (ver
comentários em `cartesia.js`, `deepgram.js` e `ConversationSession._falar`) e
há uma rede de segurança adicional em `server.js`
(`uncaughtException`/`unhandledRejection`) — mas trate isso como último
recurso, não como desculpa pra não tratar erro na origem se adicionar código
novo.

## Estimativa de custo por minuto

Todos os valores em `.env` (`CUSTO_*`), porque preço de provedor muda e varia
por rota/plano — **confirme no painel de cada um antes de confiar nisto**.
Referência usada ao montar os padrões (levantada em 2026, pode estar
desatualizada quando você ler isto):

| Item | Valor de referência | Fonte |
|---|---|---|
| Deepgram (streaming, tier Nova) | ~US$ 0,0077/min | preço público pay-as-you-go |
| Cartesia (TTS) | ~US$ 0,03/min | conversão de créditos/caractere |
| Groq `llama-3.3-70b-versatile` | US$ 0,59 / US$ 0,79 por milhão de tokens (entrada/saída) | preço público |
| Twilio (voz outbound → Brasil, celular) | **não confirmado** | varia por operadora de destino — confira em twilio.com/en-us/voice/pricing/br ou na Pricing API do Twilio com sua conta |

Deixei `CUSTO_TWILIO_POR_MINUTO` vazio de propósito em vez de chutar um
número — o `costLogger.js` avisa no log e marca o total como
"`>= X (falta Twilio)`" até você preencher o valor real da sua rota.

Cada ligação gera uma linha em `logs/custos.log` (JSON) com a estimativa
individual. Depois de rodar o piloto de 50, some as linhas pra ter o custo
total real do teste.

## Limitações conhecidas / próximos passos óbvios

- Persistência é um arquivo JSON — ótimo pro piloto, troque `src/db/store.js`
  por um client de banco de verdade antes de escalar volume.
- O disparo em lote é sequencial (uma ligação por vez, respeitando o
  intervalo) — de propósito, pra manter custo e log previsíveis no piloto.
  Paralelismo é a otimização óbvia depois.
- Detecção de fim de turno (`endpointing`/`utterance_end_ms` no Deepgram) foi
  configurada com valores de partida razoáveis pra português falado, mas ainda
  não foi calibrada contra ligações reais — é o primeiro parâmetro a ajustar
  se o agente estiver cortando a pessoa no meio da frase (aumente) ou
  demorando demais pra responder (diminua).

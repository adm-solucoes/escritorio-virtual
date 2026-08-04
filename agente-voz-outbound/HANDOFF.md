# Handoff — Agente de Voz Outbound (agente-voz-outbound)

Documento de contexto pra outra sessão/instância do Claude assumir o projeto sem
precisar reconstruir tudo do zero. Gerado em 2026-07-29, ao final de uma sessão
longa que foi do zero (projeto não existia) até uma ligação real funcionando
ponta a ponta com agendamento automático no Google Calendar.

## O que é isto

Agente de voz outbound (prospecção fria) pra ADM Soluções (consultoria júnior,
Fortaleza-CE, no mercado desde 1992). Liga pra leads, qualifica levemente e
tenta agendar um **briefing** com um consultor humano — não vende nem faz
discovery a fundo, isso é trabalho do briefing. Projeto **separado** do CRM
principal (`../crm-adm/`), mas fortemente integrado com ele (ver seção CRM).

Stack: Node.js/Express/WebSocket. **Twilio** (telefonia + Media Streams) →
**Deepgram** (STT streaming) → **Groq/Llama** (LLM, abstraído) → **Cartesia**
(TTS streaming, abstraído) → extração estruturada pós-ligação → webhook pro
CRM. Tudo em `src/`, prompts em `prompts/*.txt` (texto puro, editável sem
mexer em código), scripts de disparo em `scripts/`.

## Estado atual: FUNCIONA de ponta a ponta

Já validado com ligações reais: Twilio → Deepgram → Groq → Cartesia →
extração → webhook CRM → registro em `ligacoes_agente_voz` → aparece em
`/agente-voz` no CRM. O que ainda **não foi validado numa ligação real** é o
agendamento automático no Google Calendar (feature mais nova, implementada
mas não testada por causa da cota da Groq ter estourado logo depois).

## Bloqueadores reais pra rodar o piloto (50-100 ligações)

1. **Conta Twilio ainda em Trial.** Sem upgrade: só liga pra números
   verificados manualmente um por um, e toca um aviso automático em inglês
   antes de qualquer coisa (exige apertar uma tecla pra continuar — isso é
   comportamento de conta trial, não bug nosso, comportamento documentado e
   confirmado). Upgrade exige cartão de crédito + carga mínima (~$20,
   variável). **O usuário não tinha os $20 disponíveis no momento em que
   esta sessão terminou** — ficou de fazer depois.
2. **Groq (LLM) tem teto de 100.000 tokens/dia no plano gratuito.** Isso
   estourou HOJE só com testes manuais (~15 ligações de teste). Cada ligação
   real usa uns 5-8 mil tokens (reenviamos o histórico completo a cada
   turno). Um lote de 50-100 ligações não cabe no teto diário gratuito —
   precisaria upgrade da Groq também, ou rodar em vários dias.
3. Saldo da Twilio no momento: uns $14 (dá pra ~100-170 ligações de teste
   curtas, mas não cobre o upgrade nem um lote real de conversas mais
   longas).

**Estimativa de custo real** (calculada com dados reais de 15 ligações de
teste de hoje, ~76s médios): ~$0,137/ligação curta, ~$0,215/ligação de ~2min.
100 ligações reais ≈ $14-22 total (Twilio+Deepgram+Cartesia+Groq somados).

## Arquitetura — decisões não óbvias que valem saber antes de mexer

- **Barge-in via contador de turno**, não `AbortController`: só a ENTREGA de
  áudio é cortada quando o usuário interrompe, a chamada HTTP ao LLM
  continua em segundo plano e é ignorada. Ver `ConversationSession.js`.
- **Turno de fala dispara no `is_final` do Deepgram (~300ms), não no
  `UtteranceEnd` (mínimo técnico de ~1s, não dá pra baixar)** — decisão
  consciente de latência: responde mais rápido, mas às vezes corta a pessoa
  no meio de uma pausa. Coberto por barge-in + instrução no roteiro pra se
  recuperar naturalmente ("desculpa, te cortei?").
- **Desligamento automático da ligação** (marcador `[ENCERRAR_LIGACAO]` no
  fim da fala do LLM) passou por VÁRIAS iterações até parar de cortar a
  despedida no meio:
  1. Trava: nunca desligar se a fala terminar em pergunta (LLM já errou isso).
  2. Sincronização via evento `mark` da Twilio (confirma que o buffer
     interno da Twilio já tocou o áudio antes de desligar — não basta ter
     ENVIADO o áudio pro WebSocket).
  3. **Flag `encerrando`** que barra qualquer turno novo (e barge-in) uma vez
     decidido desligar — sem isso, ruído/respiração captado como fala
     espúria (mais provável desde a mudança pro `is_final` rápido) dispara
     um SEGUNDO turno concorrente que atropela a despedida.
  4. Margem fixa de 700ms depois da confirmação do `mark`, antes do
     `calls().update({status:"completed"})` de verdade — sobra uma fração
     de segundo de trânsito de rede/operadora que o `mark` não cobre.
  Se o corte no fim da ligação voltar a acontecer, comece verificando esses
  4 pontos em `ConversationSession.js` + `mediaStreamServer.js`.
- **Crash resilience**: um processo Node serve TODAS as ligações
  concorrentes. Três pontos já causaram crash do processo inteiro em teste
  (matando ligações de outras pessoas) e foram corrigidos: fechamento da
  Cartesia sem try/catch, listener de erro do Deepgram registrado tarde
  demais, `_falar()` fire-and-forget sem captura de exceção. Mais um
  `process.on('uncaughtException'|'unhandledRejection')` em `server.js`
  como rede de segurança final — não é desculpa pra não corrigir na fonte.
- **Voz da Cartesia**: trocada 4 vezes hoje (Larissa → Ana Paula → Beatriz
  [erro: era de Portugal, não Brasil — sempre conferir `country: "BR"`, não
  só `language: "pt"`] → Luana → **Ana Paula de novo**, foi a escolhida no
  final). ID atual está no `.env` (`CARTESIA_VOICE_ID`). Usuário achou ainda
  meio "travada"/não 100% fluida mesmo com a Ana Paula — ponto em aberto,
  não resolvido, pode valer testar outras ou investigar parâmetros de
  velocidade/emoção da Cartesia.
- **Nome do lead**: `POST /calls/start` aceita `nome` opcional. Quando
  presente, personaliza a abertura ("falo com Fulano?") e injeta no system
  prompt uma instrução pra USAR POUCO o nome (LLM já errou repetindo demais
  — "Caio, ..., Caio, ..." — soa vendedor forçado).
- **Horários reais da agenda**: no início de cada ligação, busca
  `GET {CRM}/api/agente-voz/horarios-disponiveis` (timeout curto, falha
  silenciosa) e injeta a lista no system prompt — o agente OFERECE horário
  concreto em vez de perguntar em aberto. Ver seção CRM abaixo pro detalhe
  de como isso é calculado.

## Roteiro (`prompts/roteiro.txt`) — histórico de ajustes e porquês

O roteiro passou por muita iteração baseada em feedback ouvindo ligações
reais. Se for reescrever do zero, pelo menos preserve estas lições (todas
vieram de problemas reais ouvidos em ligação, não de teoria):

- **Não é SPIN Selling completo** — só qualificação leve (1 pergunta de
  situação, no máximo 1 de problema) seguida de uma "devolutiva" mostrando
  que entendeu, ANTES de convidar pro briefing. Versão anterior pulava
  direto pro convite assim que qualquer dor vaga aparecia — soava
  oportunista.
- **Sem clichê de telemarketing** ("consigo falar um minutinho?" etc) — o
  cliente reconhece na hora e desliga a atenção.
- **Sem pedir permissão explícita pra falar** ("peguei você numa boa
  hora?") — dá deixa fácil pra pessoa dizer não antes de começar. Segue com
  confiança, a pessoa avisa se estiver ocupada.
- **Transparência ANTES de perguntar sobre o negócio**: como o agente já
  sabe o nome da pessoa (vem da base), perguntar direto sobre a empresa sem
  antes dizer quem é/por que está ligando gera desconfiança tipo "como ela
  sabe disso?" mesmo que não verbalizada. Ordem certa: nome confirmado →
  quem é + motivo da ligação → só então pergunta sobre o negócio.
- **Fala coloquial, não gramaticalmente perfeita** — "tá"/"pra"/"cê",
  conectores de fala ("então", "beleza") em vez de frases redondas demais
  (isso "entrega" que é IA).
- **Nunca escrever rubricas/parênteses de ação** — vira texto lido em voz
  alta pela TTS (já aconteceu: "(desliga o telefone)" sendo falado).
- **Credibilidade proativa contra "parece golpe"**: cidade (Fortaleza-CE) +
  tempo de mercado (1992) + oferecer mandar dados por WhatsApp/e-mail antes
  de agendar, quando sentir desconfiança.
- **Nome fixo do agente**: Fernanda. LLM inventava nome diferente a cada
  ligação antes disso ser fixado.

## Integração com o CRM (`../crm-adm/`)

Feita hoje, tudo em `crm-adm/src/app/api/agente-voz/*` + `crm-adm/src/app/agente-voz/page.tsx`:

- **`ligacoes_agente_voz`** (tabela nova, migrations `sql/030` e `sql/031`
  na raiz do repo, JÁ RODADAS) — histórico de cada ligação: resultado,
  transcrição completa, interesse, e (novo) `evento_calendario_link`.
- **`POST /api/agente-voz/resultado`** — webhook que o agente de voz chama
  ao fim de cada ligação. Idempotente por `call_id`. Casa telefone→empresa
  por sufixo de dígitos. Se `trigger_whatsapp_followup` vier true, cria
  sugestão pendente (NUNCA envia WhatsApp sozinho — regra de ouro do
  projeto inteiro). **Novo hoje**: se vier `horario_confirmado_gc_id` +
  `_inicio` + `_fim`, cria o evento de verdade no Google Calendar do GC via
  `criarEventoReuniao` (já existia em `lib/google-calendar.ts`, reusado).
- **`GET /api/agente-voz/saldo`** — saldo real de Twilio (API de balance) e
  Deepgram (API de billing). Groq e Cartesia não têm API de saldo pública
  com a chave normal — só link pro painel.
- **`GET /api/agente-voz/horarios-disponiveis`** — calcula slots livres
  (seg-sex, 9h-18h, blocos de 1h) olhando a agenda Google real dos GCs com
  `role = "comercial"` E `compartilhar_agenda = true` (mesma fonte que
  `/calendario` usa). Cada slot retorna com `gcId` (de qual consultor) +
  ISO de início/fim — necessário pra depois criar o evento na agenda CERTA.
  **Filtro por role="comercial" é importante**: sem isso, misturaria agenda
  de outros times (ex: marketing) — decisão explícita do usuário.
- **`/agente-voz`** (página) — duas abas: "Ligações" (histórico + saldo de
  APIs) e "Prospects pra ligar" (filtro por data/status de contato +
  seleção + exportar CSV compatível com `batchDial.js`).

**Fluxo pretendido pelo usuário** (confirmado explicitamente, não
implementado como automação ainda): CSV da Casa dos Dados → importado pro
CRM (tabela `empresas`) → dali pra frente o CRM é a fonte única de leads
pras ligações. `scripts/dialFromCrm.js` já faz exatamente isso (lê
`empresas` direto, pula quem já tem registro em `ligacoes_agente_voz`) —
construído mas **nunca rodado de verdade** ainda.

## Pendências conhecidas (nenhuma é bug escondido, tudo consciente)

- Testar o agendamento automático numa ligação real (nunca validado).
- Portfólio da ADM Soluções — usuário disse que ia mandar, enriqueceria a
  parte de credibilidade do roteiro com casos reais em vez de genérico.
- Voz da Cartesia ainda não 100% satisfatória mesmo depois de 4 trocas.
- CNPJ da ADM Soluções — não está em lugar nenhum do projeto, usuário
  precisa fornecer se for preciso pra algo (ex: cadastro Twilio).
- Upgrade da Twilio (dinheiro) e da Groq (se quiser lote grande num dia só)
  — decisão do usuário, não técnica.

## Onde estão as credenciais

`.env` (gitignored, nunca versionado) tem: Twilio, Deepgram, Groq, Cartesia,
`CRM_WEBHOOK_URL`/`CRM_WEBHOOK_API_KEY` (bate com `AGENTE_VOZ_WEBHOOK_SECRET`
no `crm-adm/.env.local` e na Vercel), `CRM_SUPABASE_URL`/`CRM_SUPABASE_ANON_KEY`
(usado só por `dialFromCrm.js`), `PUBLIC_BASE_URL` (URL do túnel ngrok — muda
toda vez que o túnel reinicia, precisa atualizar + reiniciar o servidor).
`.env.example` documenta cada campo. **Nunca colar valores de `.env` no
chat** — é a regra seguida a sessão inteira.

## Como rodar localmente (dev/teste)

```bash
# terminal 1: túnel público (Twilio precisa alcançar de fora)
bin/ngrok.exe http 3000
# copiar a URL gerada pra PUBLIC_BASE_URL no .env

# terminal 2: servidor
node src/server.js

# terminal 3: ligação de teste (nome é opcional)
node scripts/callSingle.js +55DDDNUMERO "Nome do Lead"
```

**Nota de segurança combinada com o usuário**: nunca disparar ligação de
teste sem perguntar/confirmar antes — ele pode não estar com o celular à
mão ou disponível no momento.

## Sobre o `ngrok.exe`

Foi baixado, mas o Windows Defender o marcou como
`Trojan:Win32/Kepavll!rfn` (falso positivo — sufixo `!rfn` = heurística de
reputação, não assinatura conhecida; binário nunca chegou a executar antes
de ser removido). Resolvido com o usuário adicionando uma exceção do
Defender só pra pasta do projeto. Se o binário sumir de novo (Defender
apaga automaticamente), é isso que está acontecendo — não é malware de
verdade, é heurística genérica contra ferramentas de túnel/proxy reverso.
`cloudflared` foi testado primeiro e descartado — bloqueava seletivamente
requisições da Twilio (curl próprio funcionava, Twilio não), típico de
túneis gratuitos `trycloudflare.com`.

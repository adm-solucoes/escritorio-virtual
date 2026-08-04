# Handoff — sessão de 02-03/08/2026

Resumo pra próxima sessão do Claude assumir sem precisar reler tudo.
Dois projetos: `crm-adm/` (CRM em produção na Vercel) e `agente-voz-outbound/`
(agente de voz, roda local + ngrok).

---

## O que foi feito nesta sessão

### 1. Documento de plano de escala (pronto)
Criado `agente-voz-outbound/docs/plano-escala-50-100-ligacoes-dia.md` + versão
PDF + artifact web. Cobre custo real medido, bloqueadores e as 3 fases pra
escalar (sair do trial → piloto → multi-empresa).

### 2. Sete bugs reais corrigidos no agente de voz
O agente "ficava mudo" no meio das ligações. Causa raiz encontrada com
evidência nos dados, não suposição:

1. **Promise travada no cancelamento do TTS** — barge-in deixava a promise
   pendente pra sempre; no encerramento virava loop infinito.
2. **Buffer do Deepgram morto** (`bufferFalaAtual` era lido e zerado, nunca
   preenchido) — cada fatia de fala abria um turno de LLM concorrente. 5
   ligações tinham falas consecutivas do lead sem resposta, uma com 5 seguidas.
3. **Turnos simultâneos** — agora serializados em `ConversationSession`.
4. **Rate limit da Groq sem retry** — o limite real é **12.000 tokens/MINUTO**,
   não 100k/dia como estava documentado. Era a causa raiz principal.
5. **Histórico completo reenviado a cada turno** — agora limitado a 12 mensagens.
6. **Roteiro inflado** (3.483 tokens) — enxugado 49%.
7. **Race condition no `store.js`** — read-modify-write não atômico perdia
   atualizações. Testado com 20 escritas concorrentes: passa.

Também corrigido: **3 segundos de silêncio** no início da ligação (a busca de
horários no CRM travava a primeira fala com `await`).

### 3. Roteiro melhorado (`prompts/roteiro.txt`)
- Portfólio real adicionado: 6 áreas de solução + clientes reais (Gerdau,
  iByte, Padaria MM, Puro Açaí, Maria Pitanga, ConcurSalas, Ideale Café,
  Santo Espeto). **Proibido inventar cliente ou número fora dessa lista.**
- SPIN Selling (livro lido inteiro): conceito de "Avanço vs Continuação" —
  "depois eu vejo" NÃO é sucesso.
- Gatilhos mentais com dado real (Gong Labs, 90.380 ligações analisadas):
  - Declarar "o motivo da minha ligação é..." = **2,1x mais reuniões**
  - "Peguei você numa boa hora?" = **40% PIOR** (proibido no roteiro)
  - "Não tenho interesse" nos primeiros segundos é **reflexo**, não recusa —
    faz UMA tentativa de reconhecer→reformular→redirecionar, depois respeita.
- **PROIBIDO dizer como conseguiu o contato** ("base de dados", "lista",
  "peguei seu contato"). O Caio identificou isso como o pior erro — soa lista
  comprada. Só responde se perguntarem direto.
- Tom mais humano: nada de "peço desculpa, houve um mal-entendido" ou
  "agradeço a atenção" (soa call center).

### 4. Cartesia → ElevenLabs (funcionando)
Trocado o TTS. Configurável por `TTS_PROVIDER` no `.env` (`cartesia` ou
`elevenlabs`) — dá pra voltar com uma linha.

**Detalhe crítico do protocolo** (descoberto testando): a ElevenLabs precisa
de DUAS mensagens — o texto com `flush: true` E depois `close_context: true`.
Sem a segunda, o áudio chega mas o `isFinal` NUNCA vem, e cada fala trava 8s
no watchdog.

Resultado medido: latência mediana de **279ms**, zero engasgos em 28 falas.

### 4b. Quatro erros de conversa corrigidos (últimos, achados na transcrição)
Ligação `987402ce` mostrou o agente:
- respondendo *"percebi que você está um pouco ocupado"* quando o lead disse
  "pronto, pois não" (= pode falar);
- **descartando a dor que o lead tinha acabado de dar** (*"você disse que não
  é relevante, financeiro, vamos deixar pra lá"*) — era o gancho da reunião;
- tratando pausa normal de quem pensa como problema técnico (*"parece que a
  ligação está sendo cortada"*);
- fazendo pergunta hipotética de consultoria (*"imagine que resolvesse
  amanhã..."*), que o roteiro já proibia.

Corrigido no roteiro: nunca sugerir que a pessoa está ocupada/ligação caindo
sem ela dizer; dor mencionada nunca se perde (e na dúvida de transcrição,
perguntar em vez de assumir o negativo); pausa é normal; sem pergunta
hipotética.

### 5. Nome do agente: Fernanda → **Rafael**
A voz escolhida no ElevenLabs é masculina. Agora é configurável via
`AGENTE_NOME` no `.env` (usa placeholder `{{NOME_AGENTE}}` nos prompts).

---

## Resultado real

Última ligação de teste: **116 segundos, agendamento fechado** ("segunda às
14h", extraído corretamente). Primeira vez que o agente marca reunião de
verdade. O Caio: *"acho que foi a melhor ligação que eu já tive"*.

---

## Custos (medidos, não estimados)

Por ligação **atendida** (~2min): **US$ 0,2053** (~R$ 1,11)
- Twilio 0,128 · TTS 0,044 · Groq 0,018 · Deepgram 0,015

Por ligação **não atendida**: ~US$ 0,017 (~R$ 0,09)

**Projeção 15 ligações/dia × 20 dias (300/mês):**
| Taxa de atendimento | Custo variável/mês |
|---|---|
| 30% (90 conversas) | ~US$ 22 |
| 50% (150 conversas) | ~US$ 33 |

Mais fixos: ElevenLabs US$ 11 + Groq pago ~US$ 5-15.
**Total realista: US$ 45-60/mês (R$ 250-330).**

⚠️ O plano Creator do ElevenLabs (US$ 11) só aguenta até **~30% de taxa de
atendimento** nesse volume. Acima disso estoura os créditos → precisa Pro
(US$ 99) ou créditos avulsos.

---

## PENDENTE — depende do Caio

1. **Upgrade da Twilio (~US$ 20)** — BLOQUEIO ATIVO. A conta está em trial e
   agora **não deixa nem verificar número novo** (SMS bloqueado por país, voz
   bloqueada por ser trial). O número `+5585997224207` não conseguiu ser
   cadastrado por isso.
2. **Plano pago da Groq** — o free tier (12k tokens/min) estoura no meio de
   ligações longas. Já tem retry, mas é remendo.
3. **Bloqueio de spam da operadora** — 10 ligações pro mesmo número em 1h30
   fizeram a operadora rejeitar em 1-2 segundos (o padrão de toque é 60s).
   Não é bug do código: a Twilio não registrou erro nenhum. Evitar testar
   muitas vezes seguidas no mesmo número.

## PENDENTE — trabalho a fazer

4. **Analisador semanal por e-mail** — o Caio APROVOU, mas não foi
   implementado. Ideia: script que roda 1×/semana, lê as transcrições
   (`data/calls.json`), identifica padrões de falha e **sugere** ajustes no
   roteiro, mandando por e-mail. Roda em lote (custo de centavos), não a cada
   turno. **Importante:** deve sugerir, não auto-editar o prompt — risco de
   degradar sozinho sem ninguém perceber.
5. **E-mail semanal do CRM não chegou** — o Caio relatou que não recebeu.
   Ele disse que é "pra depois", mas fica registrado pra investigar.
6. **E-mail de lembrete do Google Calendar** — pendência antiga: avisar
   Catarina Lopes, Danilenda, Evelyn Araújo e Marianne Bezerra pra conectarem
   o Google. Rascunho pronto, nunca enviado (falta confirmação do Caio).
7. **Foto de perfil do Instagram** — código está certo e a API confirma o
   campo `profile_pic`, mas nunca foi validado com uma conversa real (não
   existia nenhuma no banco na hora do teste).

---

## Coisas que valem saber antes de mexer

- **ngrok**: a URL é fixa (`uneasy-rambling-alphabet.ngrok-free.dev`), não muda
  a cada reinício. Se cair, é só religar o túnel — não precisa editar nada.
- **Servidor do agente**: roda com `node --watch src/server.js`. Como o
  `roteiro.txt` é lido uma vez no import, mudanças no prompt exigem tocar um
  `.js` pra forçar restart (`touch src/mediaStreamServer.js`).
- **Regra de ouro do projeto**: nunca disparar ligação de teste sem perguntar
  antes ao Caio — ele pode não estar com o celular à mão.
- **Log novo**: `logs/tts-diagnostico.log` registra cada fala enviada,
  latência do primeiro áudio e engasgos. Usar pra diagnosticar "a voz parou"
  em vez de pedir pro usuário olhar terminal.
- **Concorrência de disparo**: `DISPARO_CONCORRENCIA_MAXIMA` no `.env`
  (padrão 2) — controla quantas ligações rodam ao mesmo tempo em lote.

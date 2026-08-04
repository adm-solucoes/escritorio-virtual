# Plano de investimento — escalar o agente de voz para 50-100 ligações/dia e para outras empresas

Documento gerado em 2026-08-02, atualizado no mesmo dia após implementar controle de
concorrência real no disparo em lote. Base: estado real do projeto `agente-voz-outbound`
(25 ligações de teste já feitas, custos reais medidos, ver `logs/custos.log`) e do
`crm-adm` (produção, já com segurança validada). Tudo aqui é fundamentado em dados
reais do sistema, não em estimativa genérica de mercado.

**Importante sobre o tom deste documento**: listar bloqueadores não é o mesmo que
dizer que o projeto não funciona. O pipeline de ponta a ponta **já funciona de
verdade** — 25 ligações reais provam isso. O que está listado abaixo é o que falta
pra ir de "protótipo validado" pra "produto rodando volume todo dia", que é o
próximo degrau normal de qualquer sistema nesse estágio, não um sinal de que algo
foi malfeito. Quase todo item aqui é resolvível com dinheiro e/ou algumas horas de
trabalho, não é um redesenho do zero — e um deles (controle de concorrência) já foi
resolvido enquanto este documento era escrito.

---

## 1. Onde estamos hoje

- Pipeline **funciona ponta a ponta**: Twilio → Deepgram (STT) → Groq/Llama (LLM) →
  Cartesia (TTS) → extração → webhook pro CRM → registro em `ligacoes_agente_voz`.
- Rodando **localmente**, na sua máquina, exposto via **ngrok** (túnel gratuito).
  Não é infraestrutura de produção — se o seu PC desligar, dormir, atualizar ou
  perder internet, o sistema inteiro cai no meio de uma ligação.
- **Um único processo Node cuida de todas as ligações simultâneas.** Já causou
  crash total (matando ligações de outras pessoas) três vezes em teste; os bugs
  conhecidos foram corrigidos, mas a arquitetura continua sendo "um processo,
  zero redundância".
- Conta Twilio ainda em **modo trial**: só liga pra números verificados manualmente,
  toca aviso em inglês antes de conectar, e não tem lastro pra volume real.
- Groq (LLM) no **plano gratuito**: teto de 100.000 tokens/dia. Um lote de 50-100
  ligações reais não cabe nesse teto (cada ligação usa 5-8 mil tokens).
- ✅ **Resolvido hoje**: disparo de lote agora tem **controle de concorrência real**
  (`scripts/lib/concorrencia.js`, `DISPARO_CONCORRENCIA_MAXIMA` no `.env`, padrão 2).
  Antes, `batchDial.js`/`dialFromCrm.js` só esperavam um intervalo fixo de 20s entre o
  **início** de cada ligação — como várias ligações reais duram mais que isso (94s,
  155s, 213s já registrados), o sistema podia empilhar várias rodando ao mesmo tempo
  sem limite nenhum. Agora ele consulta o status real de cada ligação e só dispara a
  próxima quando uma vaga libera de verdade.

## 2. Custo real por ligação (medido, não estimado)

Do `logs/custos.log`, com uma ligação real já com Twilio confirmado:

| Componente | Custo |
|---|---|
| Twilio (voz, saída pro Brasil) | US$ 0,0663/min |
| Deepgram (STT) | US$ 0,0077/min |
| Cartesia (TTS) | US$ 0,03/min |
| Groq (LLM) | ~US$ 0,0003-0,015/ligação (varia com duração) |

**Ligação curta (~30s): ~US$ 0,02-0,03. Ligação de ~2min: ~US$ 0,13-0,21.**

Projeção pra volume (assumindo mix realista, média 1,5min/ligação, ~70% atendida):

| Volume | Custo de API/dia | Custo de API/mês (22 dias úteis) |
|---|---|---|
| 50 ligações/dia | ~US$ 7-10 | ~US$ 155-220 |
| 100 ligações/dia | ~US$ 14-20 | ~US$ 310-440 |

Isso é **barato** — o gargalo pra escalar não é custo de API, é infraestrutura,
compliance e operação. É aí que o investimento real precisa entrar.

## 3. Bloqueadores para rodar 50-100 ligações/dia (ainda só ADM Soluções)

### 3.1 Infraestrutura (prioridade máxima — hoje o sistema não sobrevive a isso)

- **Sair da sua máquina + ngrok e ir pra um servidor real.** Opções realistas pro
  tamanho do projeto: Railway, Fly.io ou Render (deploy simples, WebSocket
  suportado, US$ 5-20/mês) ou uma VPS pequena (Hetzner/DigitalOcean, ~US$ 6-12/mês).
  Precisa suportar WebSocket persistente (`/media-stream`) — nem toda plataforma
  serverless aguenta isso bem (Vercel, por exemplo, não é boa opção aqui).
- **Domínio próprio + HTTPS fixo** no lugar da URL do ngrok, que muda a cada
  reinício. Sem isso, todo restart exige atualizar `PUBLIC_BASE_URL` na mão.
- **Supervisor de processo** (pm2 ou systemd) com restart automático em crash, +
  alerta (mesmo que só um webhook no Slack/WhatsApp) quando o processo cair.
- ~~Concorrência real~~ — ✅ resolvido (ver item acima na seção 1). Ainda vale lembrar
  que é controle de **disparo**, não de capacidade do processo: com um único processo
  Node atendendo todas as ligações, o teto de concorrência simultânea segura ainda é
  baixo (2-3), não porque falte código, mas porque um processo só não tem como
  garantir isolamento entre ligações — é a mesma pendência do supervisor/servidor
  real acima.

### 3.2 Contas e limites dos provedores

- **Twilio**: sair do trial (precisa de cartão + carga mínima, ~US$ 20). Esse valor
  **não é o teto real** — US$ 20 ÷ US$ 0,0663/min ≈ 300 minutos de voz, o que dá
  ~230-250 ligações no padrão de duração médio já medido (~76s). Depois de sair do
  trial, verificar o **limite de concorrência de chamadas outbound** da conta (por
  padrão é baixo pra contas novas — normalmente 1 chamada/segundo de disparo e um
  teto de concorrência que pode exigir pedido de aumento pro suporte Twilio se for
  discar em rajada — o controle de concorrência da seção 1 já evita bater nesse
  teto, porque nunca dispara mais que `DISPARO_CONCORRENCIA_MAXIMA` de uma vez).
- **Groq é o teto real, não a Twilio**: o free tier (100k tokens/dia) trava em
  **~15-20 ligações reais por dia**, já confirmado batendo nesse teto com só ~15
  ligações de teste manuais num único dia. Os US$ 20 do Twilio sobreviveriam a
  vários dias de volume — é a Groq que corta antes. Migrar pro **plano pago da
  Groq** é o item que realmente destrava 50-100/dia (o custo por ligação é
  centavos, ver seção 2).
- **Deepgram e Cartesia**: confirmar limite de **streams simultâneos** do plano
  atual — streaming STT/TTS concorrente costuma ter teto por plano, não só teto
  de uso total.
- **Número de origem**: hoje é seu número pessoal verificado manualmente
  (`TWILIO_PHONE_NUMBER`), não um número comprado/formal da Twilio. Pra volume
  real, vale comprar um número brasileiro de verdade — o que no Brasil exige
  **cadastro regulatório (Regulatory Bundle da Twilio)**, com CNPJ da ADM
  Soluções. Você mencionou que o CNPJ ainda não está registrado em lugar nenhum
  do projeto — isso vira bloqueio formal nesse momento.

### 3.3 Compliance e reputação (o ponto mais frequentemente esquecido)

- **Sinalização de spam/telemarketing pelas operadoras.** Ligar em volume de um
  único número, em rajadas curtas, é exatamente o padrão que as operadoras
  brasileiras (e apps como "Quem Ligou", TrueCaller etc.) usam pra marcar como
  "possível spam/telemarketing" — o que derruba taxa de atendimento com o tempo.
  Mitigação: throttling por número, múltiplos números em rodízio, e considerar
  registro STIR/SHAKEN se disponível pra números brasileiros na Twilio.
- **Horário de ligação.** Não existe uma lei federal única e específica pra
  telemarketing B2C no Brasil equivalente ao "Não Perturbe" de outros países,
  mas alguns estados/municípios têm normas (ex.: SP tem cadastro "Não Me
  Perturbe" do Procon-SP para chamadas de oferta). Como aqui é **prospecção
  B2B** (falando com CNPJ, não CPF), o risco regulatório é menor, mas ainda
  assim vale travar o agente pra não ligar fora de horário comercial
  (ex: 9h-18h, seg-sex) — hoje isso não está implementado no código, é decisão
  de quem dispara o lote.
- **LGPD.** Os dados vêm da Casa dos Dados (CNPJ, telefone, é dado de pessoa
  jurídica em princípio, mas o telefone pode ser de uma pessoa física — o
  sócio/decisor). Base legal mais defensável pra contato B2B frio é **legítimo
  interesse**, mas isso exige: (1) finalidade clara e documentada, (2) opção
  real de opt-out/bloqueio de novos contatos, e (3) não reter a gravação/
  transcrição além do necessário. Hoje a transcrição fica salva indefinidamente
  em `ligacoes_agente_voz` sem política de retenção — vale definir uma (ex:
  apagar transcrição bruta após N meses, manter só o resumo).
- **Lista de "não ligar mais"**: não existe hoje um mecanismo pra marcar um
  número como "não contatar de novo" e o `dialFromCrm.js`/`batchDial.js`
  respeitarem isso automaticamente. Antes de escalar pra 50-100/dia, isso é
  essencial — senão o mesmo lead pode ser ligado de novo em outro lote.

### 3.4 Qualidade e operação humana

- **QA de ligações**: com volume baixo (15-25 testes) dá pra ouvir cada uma. Com
  50-100/dia isso não escala manualmente. Precisa de uma amostragem sistemática
  (ex: ouvir/revisar 10% das ligações por dia) + métricas automáticas (taxa de
  atendimento, taxa de agendamento, taxa de "desligou no meio").
- **Follow-up humano**: quem confirma os agendamentos que o agente marca? Hoje
  o fluxo depende de um humano acompanhar `/agente-voz` no CRM. Em volume maior
  isso vira trabalho de verdade, não checagem ocasional.
- Voz da Cartesia **ainda não está 100% satisfatória** (nota deixada no
  handoff) — vale resolver antes de escalar volume, porque o mesmo problema de
  naturalidade se multiplica por 100 ligações/dia em vez de mascarar em poucos
  testes.

## 4. Escalar para outras empresas (multi-tenant)

Hoje o sistema é **hardcoded pra uma empresa só** (ADM Soluções): um roteiro fixo
(`prompts/roteiro.txt`), um número de origem, um webhook de CRM, uma agenda. Pra
vender/operar isso pra outras empresas, é uma mudança de arquitetura, não só de
volume. Investimento necessário:

### 4.1 Arquitetura multi-tenant

- Separar por **cliente (tenant)**: cada empresa precisa do próprio roteiro,
  número de origem Twilio (ou pelo menos Caller ID), credenciais de calendário,
  regras de horário e webhook de destino. Isso vira uma tabela `clientes` com
  configuração própria, não arquivos `.txt` editados à mão no `prompts/`.
- **Isolamento de dados**: transcrições e leads de uma empresa não podem vazar
  pra outra — mesmo cuidado de RLS que já foi aplicado no `crm-adm` precisa
  existir aqui desde o design, não como correção depois.
- **Painel de administração** pra cada cliente configurar o próprio roteiro,
  horários e ver as próprias ligações — hoje isso exige alguém mexer em código
  e `.env` manualmente por cliente, o que não escala além de 2-3 clientes.
- **Contas Twilio/Deepgram/Cartesia/Groq**: decidir entre (a) uma conta central
  sua com **subcontas Twilio** por cliente (facilita billing e isolamento de
  número/reputação), ou (b) cada cliente trazer as próprias chaves. (a) é mais
  vendável como produto ("SaaS"), (b) é mais simples de construir primeiro.

### 4.2 Legal e comercial

- **Contrato/DPA (Acordo de Tratamento de Dados)** com cada empresa cliente:
  definir quem é o controlador dos dados dos leads ligados (normalmente o
  cliente, você é operador/processador). Isso é trabalho jurídico, não técnico
  — vale orçar uma consulta com advogado especializado em LGPD antes do
  primeiro cliente externo.
- **CNPJ da ADM Soluções formalizado no projeto** (pendência já conhecida) —
  necessário tanto pro Regulatory Bundle da Twilio quanto pra emitir nota
  fiscal se isso virar produto cobrado de terceiros.
- **Modelo de cobrança**: por ligação, por lead qualificado, ou assinatura
  mensal com teto de ligações — decisão de negócio, mas afeta diretamente como
  o billing técnico precisa ser medido (hoje `logs/custos.log` é local e
  informal, não é billing de produto).

### 4.3 Equipe

Pra rodar isso como produto pra múltiplas empresas, minimamente:

- **1 pessoa técnica** dedicada a manter o pipeline, monitorar erros e evoluir
  o roteiro/config por cliente (pode ser você, mas deixa de ser "projeto
  paralelo" e vira responsabilidade operacional contínua).
- **1 pessoa de onboarding/suporte** por cliente novo — configurar roteiro,
  validar CNPJ/número, acompanhar as primeiras ligações reais.
- Conforme a base de clientes cresce, alguém pra **QA de ligações entre
  clientes** (garantir que o tom/roteiro de cada empresa está adequado, não só
  o seu).

### 4.4 Infraestrutura em escala

- Servidor único aguenta poucos clientes pequenos. Com múltiplas empresas
  ligando em paralelo, migra de "um processo Node" pra **fila de jobs +
  múltiplos workers** (ex: BullMQ + Redis), permitindo escalar horizontalmente
  sem reescrever a lógica de conversa.
- **Observabilidade de verdade**: hoje é `console.log` e um arquivo
  `logs/custos.log`. Com múltiplos clientes, precisa de logging estruturado
  centralizado (ex: Axiom, Better Stack, ou até um Supabase table dedicado) e
  alertas automáticos de erro — não dá pra depender de alguém olhar o terminal.

## 5. Resumo — investimento por fase

| Fase | O que exige | Custo aproximado |
|---|---|---|
| **Fase 1 — sair do trial/local** (pré-requisito pra QUALQUER volume) | ~~Controle de concorrência no disparo~~ ✅ feito · Servidor real (Railway/Fly/VPS), domínio, upgrade Twilio, upgrade Groq, supervisor de processo | ~US$ 30-60 de setup + ~US$ 15-30/mês infra |
| **Fase 2 — 50-100 ligações/dia, 1 empresa** | Fila/throttling, lista de não-ligar, janela de horário, QA amostral, CNPJ formalizado, Regulatory Bundle Twilio | ~US$ 300-450/mês (API) + tempo de operação humana |
| **Fase 3 — multi-tenant, várias empresas** | Arquitetura multi-cliente, painel admin, DPA/jurídico, subcontas Twilio, fila com workers, observabilidade | Depende do nº de clientes — arquitetura + 1-2 pessoas dedicadas |

**Recomendação de ordem**: resolver a Fase 1 inteira antes de qualquer disparo de
lote real (hoje o sistema literalmente não sobrevive a rodar sem sua máquina
ligada). Fase 2 é o piloto real com a ADM Soluções — é ali que se aprende se o
roteiro/conversão funciona em volume antes de vender pra terceiros. Fase 3 só
faz sentido depois de Fase 2 provar taxa de agendamento/conversão consistente,
porque vender um produto que ainda não converteu bem pra você mesmo é o maior
risco reputacional de todos.

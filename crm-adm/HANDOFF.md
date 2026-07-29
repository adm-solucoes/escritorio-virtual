# Handoff — CRM ADM Soluções (crm-adm)

Documento de contexto pra outra sessão/instância do Claude assumir o projeto sem
precisar reconstruir tudo do zero lendo commit por commit. Gerado em 2026-07-28.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**.
- **Supabase** (Postgres + Auth) — `@supabase/ssr` e `@supabase/supabase-js`.
  Schema do banco **não está versionado no repo** (sem pasta de migrations) —
  vive só no painel do Supabase. Se for mexer em tabelas, confirmar estrutura
  atual direto lá antes de assumir.
- **Tailwind CSS v4**.
- **Vercel** — deploy é `npx vercel --prod --yes` direto (não tem `git push`,
  o repo não tem remote configurado). Plano **Hobby** — atenção a limites
  (ex: cron de automações já teve que ser reduzido pra 1x/dia por causa
  disso, ver commit `be0368c`).
- **Integrações externas**: WhatsApp Cloud API (Meta), Instagram Direct,
  Google Calendar (`googleapis`), Resend (e-mail), Anthropic SDK (IA:
  `@anthropic-ai/sdk`, roteamento de modelo por tarefa).
- **3D**: `three` + `@react-three/fiber` + `@react-three/drei` — usado só no
  mascote do login (ver seção própria abaixo).
- **Outros**: `@dnd-kit` (kanban do pipeline), `framer-motion` (transições),
  `reactflow` (canvas visual de automações), `opus-recorder` (áudio do
  WhatsApp).

## Comandos úteis

```bash
npx tsc --noEmit -p tsconfig.json   # typecheck
npx eslint <arquivos>               # lint
npx next build                      # build de produção
npx vercel --prod --yes             # deploy (sem git push, repo sem remote)
```

Regra do projeto: sempre commitar antes de dar deploy; typecheck + lint
limpos antes de build/deploy.

## Estrutura de módulos (por rota em `src/app/`)

- `pipeline/` — kanban de oportunidades (dnd-kit), com página de detalhe em
  `pipeline/[oportunidade_id]`.
- `empresas/` — cadastro de empresas/clientes, perfil 360 em
  `empresas/[id]` (anexos, e-mails registrados manualmente, histórico).
- `dashboard/` — gráficos reais (linha, donut, funil) de vendas/CS.
- `atividades/` — módulo de atividades/tarefas.
- `automacoes/` — canvas visual (reactflow) pra montar automações, com
  motor de execução (`src/lib/automacoes-engine.ts`,
  `automacoes-nos.ts`), IA embutida no motor (`automacao-ia.ts`) e uma
  aba de sugestões (`automacoes/sugestoes`).
- `whatsapp/` — chat integrado via WhatsApp Cloud API: mídia, notas
  internas, gravação de áudio (ogg/opus via `opus-recorder`, não
  `MediaRecorder` — motivo: formato instável, ver commits `6af0315`/`3cc86e6`),
  assinatura do vendedor, gestão de múltiplos números.
- `instagram/` — Instagram Direct, mesmo padrão do WhatsApp (commit `4cd8ff1`).
- `calendario/` — agenda compartilhada da equipe, opt-in por GC (Gerente de
  Contas?) via Google Calendar.
- `relatorios/` — relatórios com envio automático por e-mail (Resend),
  resumo por IA, comparativos e alertas.
- `configuracoes/` — configurador do funil, membros, metas, checklists por
  etapa (Onboarding/Renovação), automações de tarefa/alerta.
- `login/`, `auth/confirm`, `redefinir-senha` — autenticação (Supabase Auth),
  "Esqueci minha senha", "Manter conectado".
- `mascote/` — página de prévia do mascote 3D (ver seção própria).
- `api/` — rotas server-side: `acao-rapida` (parser de comando por texto,
  com fallback de IA), `assistente` (chat comercial de IA, com busca web e
  agendamento via Google Calendar), `whatsapp`/`instagram` (webhooks +
  envio), `automacoes/executar`, `calendario/eventos`, `google/conectar`
  + `google/callback` (OAuth), `leads/capturar` (captura pública),
  `membros/convidar`, `notificacoes/gerar`, `pipeline/snapshot`,
  `relatorios/enviar`, `solicitacoes/notificar`.

## Funcionalidades por "fase" (ordem cronológica, do commit log)

O projeto foi construído em fases nomeadas (A, B... e depois "Fase 1/2/3
RevOps", depois retomou letras). Não existe um doc de roadmap formal — a
melhor fonte da verdade é `git log --oneline`. Alguns marcos:

- **MVP inicial**: schema do banco, cadastro de empresas, pipeline kanban.
- **RevOps Fase 1-3**: histórico de etapa, snapshot de pipeline, split
  Comercial/CS, perfil 360, permissionamento por papel, Health Score, NPS,
  nutrição pausável, alerta de renovação, captura pública de leads.
- **Fase A**: centraliza chamadas de IA com roteamento de modelo por tarefa
  (`src/lib/ai.ts`) — ponto único que decide qual modelo Claude usar pra
  cada tipo de tarefa (custo vs qualidade).
- **Fases F-O**: checklist por etapa, central de notificações in-app,
  anexos por empresa/oportunidade, log de auditoria, exportação CSV, e-mail
  manual no perfil 360, funil de conversão + ciclo de vendas no Dashboard,
  probabilidade ajustada por tempo parado na etapa, Dashboard com gráficos
  reais, Instagram Direct, motor de automações com IA (Fase O).
- **Assistente comercial de IA**: chat aberto (substituiu a "Ação Rápida"
  antiga, que ficou desativada), com busca web e agendamento de reunião via
  Google Calendar (commit mais recente antes do mascote: `196f1d7`).
- **Mascote 3D do login**: trabalho mais recente, ver seção dedicada abaixo.

## Mascote 3D do login — estado atual (contexto mais recente/quente)

Esse foi o foco da sessão mais recente e é onde há mais coisa "morna" —
decisões tomadas, mas ainda incompleta.

**Onde vive**: `src/components/login3d/` (`DogModel.tsx`, `DogCanvas.tsx`,
`IntroStage.tsx`, `introTimeline.ts`, `constants.ts`) + página de prévia em
`src/app/mascote/page.tsx`.

**Modelo atual**: `public/models/labrador-dog.glb` — um Labrador de
terceiro (não autoral), com rig IK completo, textura PBR real (cor +
normal + roughness) já embutida no material, e 1 clipe de animação de 13s
cobrindo cabeça/pescoço/boca (mas **não usado** — ver abaixo). Trocado
recentemente de um modelo custom (`ADMSOLUCOES.glb`, ainda em
`public/models/adm-dog.glb` mas sem nenhuma referência no código — pode
ser removido se quiser liberar espaço) depois de comparar 3 candidatos
(Labrador, Pastor Alemão, Shiba Inu) — o Labrador venceu por vir pronto
pra uso (textura real, sem precisar de bump map procedural nem
recoloração manual por material como o modelo anterior exigia).

**Arquitetura de animação**: 100% pose absoluta por código, não usa
NENHUM clipe de animação de arquivo — nem o clipe embutido do Labrador. A
cada frame, cada osso controlado recebe `rotação = pose_de_repouso +
offset`, onde a pose de repouso é lida uma única vez (bind pose do
arquivo). Isso foi decisão deliberada pra manter controle fino sobre
olhar/estados da intro sem um clipe rodando por baixo brigando com essas
poses. Ver `DogModel.tsx` (função `pose()` + `WeakMap` de poses de
repouso).

**O que tem animado hoje**: orelha balançando, rabo abanando (cadeia de 6
ossos), respiração sutil no peito/torso, cabeça+pescoço seguindo o cursor
do mouse (com decaimento pra olhar aleatório quando o cursor para).

**O que NÃO tem**: **nenhum ciclo de perna** — nem andar, nem correr. As
pernas ficam sempre na pose de bind (paradas), inclusive durante as cenas
da intro cinematográfica em que o cachorro "desliza" de um lado pra outro
da tela (a posição X do grupo inteiro se move, mas as pernas não se
mexem). Isso é uma lacuna conhecida, não escondida — ver comentário em
`IntroStage.tsx`.

**Intro cinematográfica** (`IntroStage.tsx` + `introTimeline.ts`): máquina
de estados com 10 cenas (vazio → corre pra dentro → fareja o ambiente →
corre pra fora → volta com um "painel" → posiciona → empurra → solta →
comemora → idle). O "painel" hoje é um placeholder visual (`div` com
blur) — a ideia é que ele vire o formulário de login de verdade numa
etapa futura ("Etapa 4", ainda não feita). A página `/mascote` tem um
seletor de cena pra pular direto pra qualquer uma sem assistir a
sequência inteira (necessário porque o ambiente de dev usado nas sessões
anteriores nem sempre conseguia renderizar 3D — isso mudou nesta sessão,
que teve acesso a um Browser pane funcional com screenshot).

**Pendência mais importante**: o mascote **ainda não está integrado na
tela de login de verdade** (`src/app/login/page.tsx`) — ele só existe na
página de prévia `/mascote`. Isso é a "Etapa 4" mencionada nos comentários
do código. Não é regressão de nada, é trabalho que nunca foi feito.

**Se for tentar um ciclo de marcha**: já foi testado (nesta sessão,
descartado depois) aplicar um clipe de animação de "andar" (`Walk`)
separado, extraído de um pack de animações Unity, sobre um Pastor Alemão
FBX — o retargeting por nome de osso funcionou (bones batiam certinho),
mas o clipe trazia trilhas de `.scale` que conflitavam com a escala de
importação da malha base e distorciam/encolhiam o modelo visualmente. Se
for escrever um ciclo de marcha pro Labrador atual, o caminho mais
robusto provavelmente é escrever as poses de perna à mão em código (rotação
por osso, mesmo padrão do resto do `DogModel.tsx`), não tentar importar
um clipe de terceiro — evita esse tipo de conflito de escala/retarget.

**Bug já corrigido nesta sessão que vale lembrar**: sombra do modelo
(`castShadow`/`receiveShadow`) causava "shadow acne" (padrão xadrez
visível na pelagem) até adicionar `shadow-normalBias={0.02}` na luz
direcional principal em `DogCanvas.tsx`. Se trocar de modelo de novo e
ver um padrão estranho na textura, é o primeiro suspeito.

## Convenções gerais observadas no código

- Comentários e nomes de variável majoritariamente em **português**
  (nomes de função tipo `pose`, `repousoDe`, mas variáveis/comментários em
  PT-BR: `cabeca`, `orelhaE`, `pescoco`).
- Comentários explicam o **porquê**, não o quê — evitar reintroduzir
  comentários óbvios ao editar.
- Padrão de deploy: nunca `git push` (sem remote); commit local +
  `npx vercel --prod --yes` direto.
- Typecheck (`tsc --noEmit`) e lint (`eslint`) sempre limpos antes de
  build/deploy — checado a cada mudança nesta sessão.
- Nenhum conteúdo gerado por IA deve chegar a clientes/usuários reais sem
  confirmação humana (princípio geral do projeto, visto em outras partes
  como automações e relatórios por e-mail).

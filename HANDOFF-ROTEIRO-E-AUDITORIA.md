# Handoff — roteiro do agente de voz + auditoria de segurança pendente

Dois assuntos independentes. O **item 1 é o prioritário** (impacta custo e qualidade das ligações).

---

# 1. Reescrever o roteiro da Fernanda (`agente-voz-outbound/prompts/roteiro.txt`)

## O problema, medido

Análise de 17 ligações reais com transcrição (`agente-voz-outbound/data/calls.json`):

| Métrica | Valor real |
|---|---|
| Fernanda fala | **20.891 chars** |
| Lead fala | **2.763 chars** |
| **Razão** | **7,56x** — ela fala 7,5x mais que o lead |
| Média por ligação | 920 chars (mediana 698) |
| Turnos dela por ligação | ~5 |
| Duração média | 72,8s |

Confirmado pelo usuário: **797 créditos ElevenLabs em 2 ligações** (~400/ligação). Bate com o cálculo — e confirma que o Flash v2.5 a 0,5 crédito/char está ativo.

**Isso é o oposto de uma boa pré-venda.** Numa ligação de qualificação, quem tem que falar é o lead.

## Defeitos concretos vistos na transcrição real

Da ligação de 214s (a mais longa), em ordem de gravidade:

1. **PLACEHOLDER NÃO PREENCHIDO NO AR** — ela fala literalmente `[NOME DA CONSULTORIA]` e `[SEU NOME]` para o lead. Isso é um bug ativo, não estilo. Corrigir independente do resto.
2. **Responde a própria pergunta** — *"É algo relacionado à gestão, ao crescimento da empresa ou talvez à otimização...?"*. Entrega as opções e o lead só escolhe. Pergunta de qualificação tem que ser aberta.
3. **Apresentação de 242 chars** antes da primeira pergunta.
4. **517 chars nos últimos 5 turnos** só de despedida ("de nada brother", "beijo brother", "até amanhã"). Pago, inútil.
5. **329 chars pra confirmar um horário** que o lead já tinha aceitado.
6. Ecoa/parafraseia o lead antes de responder ("Entendi perfeitamente! Gestão comercial pode ser um desafio grande...") — custa caractere e não agrega.

## Alvo do novo roteiro

| | Hoje | Alvo |
|---|---|---|
| Chars falados por ligação | 920 | **~400** |
| Razão agente/lead | 7,5x | **≤1x** |
| Créditos/ligação (Flash 0,5) | ~400 | **~200** |
| 300 ligações/mês | 119k créditos (estoura Creator) | **60k (50% de folga)** |

**Atenção ao mal-entendido:** o usuário mencionou "5.000 caracteres" — ele estava confundindo o tamanho do *roteiro* (11.338 chars de instruções) com o que a Fernanda *fala* (920). O alvo é **reduzir a fala para ~400**, não aumentar para 5.000.

## Diretrizes para a reescrita

- Cada fala da Fernanda: **teto de ~100 caracteres**, salvo a abertura.
- **Perguntas abertas e curtas.** "O que trava hoje no comercial de vocês?" em vez de listar opções.
- **Proibido**: parafrasear o que o lead disse, elogiar a resposta ("Entendi perfeitamente!", "Ótima pergunta!"), repetir informação já confirmada.
- **Encerramento seco**: confirmou o horário → despede em 1 turno e usa o marcador `[ENCERRAR_LIGACAO]`. Nada de "brother/beijo/até mais".
- Manter SPIN leve, mas **1 pergunta por turno**.
- Manter o marcador `[ENCERRAR_LIGACAO]` (a lógica de desligamento em `mediaStreamServer.js` depende dele) e a injeção de horários disponíveis, que já funcionam.

## Como validar depois

O script abaixo mede a razão agente/lead em cima das ligações reais — rodar depois de novas ligações com o roteiro novo, comparando com o baseline 7,56:

```bash
cd agente-voz-outbound && node -e '
const fs=require("fs");
const cs=Object.values(JSON.parse(fs.readFileSync("data/calls.json","utf8")))
  .filter(c=>Array.isArray(c.transcricaoCompleta)&&c.transcricaoCompleta.length>4);
let A=0,L=0;
for(const x of cs) for(const t of x.transcricaoCompleta){
  const q=(t.texto||"").length; if(t.papel==="agente")A+=q; else L+=q;
}
console.log("Fernanda:",A,"| Lead:",L,"| razao:",(A/Math.max(L,1)).toFixed(2),"| chars/ligacao:",Math.round(A/cs.length));
'
```

## Custo de referência (300 ligações/mês = 15/dia × 20 dias)

Baseado em dados reais (duração média 1,21 min):

| Item | Mês |
|---|---|
| Twilio ($0,0663/min, celular BR) | $24,14 |
| Deepgram ($0,0077/min) | $2,80 |
| Groq (~17,5k tok in / 300 out por ligação) | $3,18 |
| **Variável** | **$30,12** |
| ElevenLabs Creator ($22 — os $11 são só o 1º mês) | 121.000 créditos |
| ElevenLabs Pro | $99 / 600.000 créditos |

Com o roteiro atual (~400 créditos/ligação): 119.400/mês → **cabe no Creator com apenas 1.600 de folga (1,3%)**. Inseguro.
Com o roteiro enxuto (~200): ~60.000/mês → Creator com folga confortável. **Total ~$52/mês.**

⚠️ O custo do Groq é o único estimado — os tokens nunca foram gravados (campo vem zerado em `calls.json`). Vale instrumentar isso.

---

# 2. Auditoria de segurança do `crm-adm` — o que ficou pendente

**Já feito, testado e funcionando** (não mexer):
- Rate limiting em **35/35 rotas**, centralizado em `src/proxy.ts` + `src/lib/rate-limit.ts`, com store no Postgres (`sql/040_rate_limits.sql`, **migration já rodada**). Testado: limite por IP e limite por e-mail (cenário botnet) ambos barram com 429 + `Retry-After`.
- Scan de segredos: **limpo** (nada hardcoded, nada de env server-only no client, nenhum `.env` no histórico do git).
- `zod` fixado como dependência direta (4.4.3) — antes era só transitivo.
- Helper de validação em `src/lib/validacao.ts` (Content-Type → tamanho 1MB → JSON → schema, com 400 genérico).
- Schemas zod aplicados em: `auth/esqueci-senha`, `membros/convidar`, `leads/capturar`, `acao-rapida/parse-ia`, `assistente/perguntar`, `assistente/cancelar-reuniao` (parcial — ver abaixo).

## ⚠️ PENDÊNCIA IMEDIATA — build possivelmente quebrado

A última edição em `src/app/api/assistente/cancelar-reuniao/route.ts` adicionou o import do `zod` e o `schema`, **mas o corpo da função ainda usa `await request.json()` direto**. O `schema` declarado não é usado → o ESLint vai reclamar de variável não usada e o build pode falhar.

**Primeira coisa a fazer:** rodar `cd crm-adm && npx tsc --noEmit && npx eslint src` e terminar essa rota (trocar o `request.json()` pelo `lerCorpoValidado(request, schema)`, seguindo o padrão de `acao-rapida/parse-ia/route.ts`).

## Rotas que ainda faltam schema zod (11)

Todas já têm rate limit, exigem sessão e validam campos obrigatórios na mão — o risco é baixo, é polimento:

`acao-rapida/confirmar` · `assistente/confirmar-reuniao` · `automacoes/sugestoes` · `calendario/eventos` (+`[id]`) · `whatsapp/enviar` · `whatsapp/numeros` (+`ativar`/`verificar`) · `instagram/enviar` · `membros/atualizar` · `solicitacoes/notificar` · `leads/importar-casa-dos-dados` · `agente-voz/ligar`

**Padrão a seguir** (ver `src/app/api/acao-rapida/parse-ia/route.ts`):
```ts
import { z } from "zod";
import { lerCorpoValidado, textoLivre, uuidValido } from "@/lib/validacao";

const schema = z.object({ campo: textoLivre(200).min(1) });

// dentro do handler, no lugar de `await request.json()`:
const corpo = await lerCorpoValidado(request, schema);
if (!corpo.ok) return corpo.resposta;
const { campo } = corpo.dados;
```

**Deixar `agente-voz/resultado` como está** — webhook em produção, protegido por `x-api-key`, com validação manual já correta. Mexer sem necessidade arrisca quebrar o agente de voz.

## Não verificado

**Isenção de rate limit nas rotas de cron** — `CRON_SECRET` só existe na Vercel, não no `.env.local`, então não deu pra testar localmente. A lógica está correta por código (`ehCronAutorizado` em `src/lib/rate-limit.ts`), mas **confirmar após o deploy** que os 5 crons de `vercel.json` continuam rodando. É o único ponto que pode surpreender em produção.

## Nada disso foi para produção ainda
Deploy: `cd crm-adm && npx vercel --prod --yes` (rodar no terminal do usuário — o classificador do Claude Code bloqueia deploy de produção).

---

# 3. Ação de segurança pendente do usuário

O usuário colou uma **chave da ElevenLabs em texto puro no chat** (`sk_0daac...`). Ela está no histórico da conversa e **precisa ser rotacionada**: elevenlabs.io → API Keys → revogar e gerar nova, colocando direto no `.env` sem passar pelo chat.

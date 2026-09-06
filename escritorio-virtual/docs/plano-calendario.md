# Plano: calendario da sede

Referencia: `referencias/Captura de tela 2026-09-06 111656.png` (o Calendar do
Gather).

## 1. Decisao: a sede le a agenda do CRM

**Primeira versao deste plano dizia "calendario interno, sem Google", com o
argumento de que Google exigiria criar projeto no Google Cloud e resolver
OAuth. Estava errado: o CRM (`crm-adm`) ja tem tudo isso pronto** - projeto no
Google Cloud, OAuth, `googleapis`, tokens por pessoa no Supabase
(`integracoes_google`, com a flag `compartilhar_agenda`) e a funcao
`listarEventosPeriodo` em `src/lib/google-calendar.ts`.

Entao a sede **nao cria uma segunda agenda**: ela le a agenda que o time ja
usa, atraves do CRM. Uma agenda so pra empresa.

O que isso **nao** significa: a sede nao fala com o Google direto e nao guarda
token de ninguem. Ela pergunta ao CRM, que ja tem a permissao de cada pessoa.

> O `server/reunioes.js` que eu tinha comecado (agenda propria em JSON) fica
> **sem uso**. Nao apaguei: se um dia a sede precisar de reuniao que nao existe
> no Google, ele ja esta escrito e testado no formato do projeto.

### Consentimento

So aparece a agenda de quem marcou `compartilhar_agenda = true` no CRM. Esse
opt-in ja existe la e continua sendo a unica porta - a sede nao contorna isso.

## 2. Como os dois servidores conversam

```
navegador da sede  ->  servidor da sede  ->  CRM  ->  Google Agenda
                        (cache 60s)        (token ja
                                            de cada pessoa)
```

O navegador **nunca** fala com o CRM. Quem chama e o servidor da sede, de
servidor pra servidor, com um segredo compartilhado - o mesmo padrao do
`ehCronAutorizado` que o CRM ja usa pro cron da Vercel:

```
Authorization: Bearer ${SEDE_TOKEN}
```

Variaveis novas: `CRM_URL` e `SEDE_TOKEN` na sede, `SEDE_TOKEN` no CRM. Sem
elas, o painel aparece dizendo que a agenda nao esta configurada - nao quebra.

**Cache de 60s** na sede: sem isso, cada pessoa abrindo o painel viraria uma
chamada ao Google por pessoa do time, e a cota acaba rapido.

## 3. Quem e quem

A sede identifica por conta propria (`usuarios.json`), o CRM por `gcs`. Os dois
tem **e-mail**, e e por ele que casam - normalizado do mesmo jeito que a sede ja
faz em `chaveEmail` (minusculo, sem espaco).

Quem esta na agenda do CRM mas nao tem conta na sede aparece pelo nome do CRM.
Quem tem conta na sede e nao conectou o Google simplesmente nao tem evento.

## 4. O que entra

1. **Painel lateral + grade da semana**, no visual da referencia: navegacao
   `<` `>` `Hoje`, mes por extenso, sete colunas, linhas de hora e a **linha
   vermelha do horario atual**.
2. **Eventos do time na grade**, cor por pessoa (a mesma ideia do CRM: cor e
   identidade da pessoa, nao status).
3. **Aviso de "comeca em 5 minutos"** pros seus proprios eventos.

## 5. O que NAO entra agora

- **Criar evento pela sede.** O CRM ja tem `criarEventoReuniao`, entao da pra
  fazer depois pelo mesmo caminho - mas escrever na agenda de alguem e um passo
  maior que ler, e merece a sua confirmacao antes.
- Ligar evento a uma sala do mapa. Evento do Google nao tem `salaId`, entao o
  "Entrar" que caminha ate a sala nao se aplica direto. Ideia pra depois: a
  sede deixar fixar um evento numa sala.
- "Meeting Notes" (a segunda aba da referencia).
- Reuniao recorrente aparece como evento normal, ja expandido pelo Google
  (`singleEvents: true`).

## 6. Arquivos

| Arquivo | Papel |
|---|---|
| `crm-adm/src/app/api/calendario/sede/route.ts` | rota nova, autenticada por segredo |
| `escritorio-virtual/server/agenda-crm.js` | busca no CRM, cache, casa por e-mail |
| `escritorio-virtual/server/index.js` | manda a agenda no `init` e atualiza |
| `escritorio-virtual/public/js/calendario.js` | painel e grade |
| `escritorio-virtual/public/index.html` / `style.css` | botao no trilho e estilos |

`server/reunioes.js` fica escrito porem desligado (ver secao 1).

## 7. Resultado dos testes

Testado em 06/09/2026, no navegador, **pelo caminho real**: um stub em
`localhost:4599` imitando a rota `/api/calendario/sede`, com a sede configurada
via `CRM_URL` e `SEDE_TOKEN`. Nao injetei nada no cliente - a ideia era exercitar
o `fetch`, o token e o casamento por e-mail de verdade.

| O que | Resultado |
|---|---|
| Grade da semana desenha | ok - 7 colunas, regua 7h-21h, mes por extenso |
| Evento posicionado na hora certa | ok - 5 eventos, cada um no dia e horario certos |
| Cor por pessoa | ok - Dev, Ana Paula e Bruno com cores diferentes |
| Circulo vermelho no dia de hoje | ok (`temHoje: true`, 24px) |
| Linha vermelha do horario atual | ok |
| Casamento por e-mail | ok - evento de `dev@local` virou `uid` da conta e o nome passou a ser "Dev", o da sede; quem nao tem conta ficou com o nome do CRM e `uid: null` |
| "Seus proximos compromissos" | ok - so os meus e so os que ainda nao acabaram |
| Aviso de "comeca em 5 min" | ok - disparou com evento comecando em 3 min |
| Sem `CRM_URL`/`SEDE_TOKEN` | ok - painel abre e avisa "Agenda nao configurada", sem quebrar |
| Console | limpo |

**Um susto que nao era bug:** a lista lateral apareceu vazia no primeiro teste.
Era comportamento certo - os eventos do dia ja tinham acabado (era 17:47 e eles
eram das 9h e das 14h), e a lista so mostra o que ainda vai acontecer. So deu
pra confirmar depois de por no stub um evento comecando em 3 minutos.

### Ainda nao testado com o CRM de verdade

O stub responde no formato certo, mas **a rota real do CRM
(`crm-adm/src/app/api/calendario/sede/route.ts`) nao foi exercitada** - exige o
CRM rodando, Supabase e alguem com Google conectado. Vale rodar os dois juntos
uma vez antes de confiar.

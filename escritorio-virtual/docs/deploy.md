# Sair do local: colocar o escritorio no ar

O projeto ja esta pronto pra rodar fora da sua maquina: o servidor usa
`process.env.PORT`, o cookie de sessao vira `Secure` sozinho quando
`NODE_ENV=production`, e a flag `SEM_LOGIN` e ignorada em producao.

Falta escolher **onde** hospedar e resolver **duas coisas que so aparecem
quando sai do localhost** (disco e chamada de video). Estao nas secoes 3 e 4 -
vale ler antes de subir.

---

## 0. Link rapido com tunel (pra hoje, sem hospedar nada)

Se a ideia e so **mandar um link pro pessoal entrar agora**, da pra abrir a sua
propria maquina pra internet por um tunel, sem Render nem deploy.

```
npm run publicar          # so isso: sobe a sede E abre o tunel
```

**Um comando so.** Ele imprime um quadro com o **link https** e os dois codigos:

```
  +---------------------------------------------------------------+
  |  Link pra mandar pra pessoa testar:                           |
  |                                                               |
  |    https://algo.ngrok-free.dev                                |
  |                                                               |
  |  Codigo da sede (todo mundo precisa, pra criar conta):        |
  |    adm-coco-2525                                              |
  |  Codigo de diretoria (so pra quem vai decorar o escritorio):  |
  |    chefe-vento-8987                                           |
  +---------------------------------------------------------------+
```

Por baixo ele e o `npm start` com as tres variaveis ja no lugar:
`NODE_ENV=production` (cookie `Secure`, e a flag `SEM_LOGIN` passa a ser
ignorada), mais um `CODIGO_SEDE` e um `ADMIN_CODE` sorteados. Os codigos ficam
salvos em `server/data/` - **nao mudam** no proximo restart, entao quem ja tem o
codigo continua entrando.

Manda o link **junto com o codigo da sede** - sem ele ninguem cria conta.
`Ctrl+C` derruba o servidor e o tunel juntos.

Precisa do **ngrok instalado e logado** uma vez (`ngrok config add-authtoken
...`, conta gratuita em ngrok.com). Se ele nao estiver no PATH, o `publicar`
avisa e o servidor local continua de pe - da pra abrir o tunel na mao com
`ngrok http 3600`.

**O que esse caminho nao resolve:**

- **So funciona com o seu PC ligado e o terminal aberto.** Fechou, o link morre.
- **O endereco muda** toda vez que voce reinicia o ngrok (no plano gratuito).
- Quem abre vai ver uma tela do ngrok antes ("Visit Site"), tambem do plano
  gratuito.
- Continua valendo a secao 4: sem servidor TURN, parte do time nao consegue
  fechar a chamada de video.

Pra um link que fica de pe sozinho, e a secao 2 (Render).

> **Nunca use `npm run dev` pra isso.** Com `SEM_LOGIN=1` **todo mundo que
> abrisse o link entraria na mesma conta** - mesmo nome, mesmo boneco, e lendo
> as DMs uns dos outros. O `publicar` recusa rodar se essa variavel estiver
> ligada, justamente por isso.

## 1. O que subir

Tudo que esta no git. `server/data/` **nao** vai junto (esta no `.gitignore`) -
e isso e o certo: sao as contas e a decoracao, que pertencem ao servidor de
producao, nao ao repositorio.

## 2. Passo a passo no Render

O `render.yaml` na raiz do projeto ja descreve o servico.

1. Suba o repositorio no GitHub (o Render le de la). **Deixe privado**: a pasta
   `referencias/` tem prints do Gather, que nao sao nossos pra republicar. O
   plano free do Render funciona com repo privado normalmente.
   Se o codigo estiver num monorepo junto com outros projetos, mande so esta
   pasta:

   ```bash
   # na raiz do monorepo, com o repo novo ja criado e vazio no GitHub
   git remote add sede git@github.com:SEU-USUARIO/escritorio-virtual.git
   git subtree push --prefix=escritorio-virtual sede main
   ```

   Assim o CRM e os outros projetos **nao vao junto**.
2. No Render: **New > Blueprint**, aponte pro repositorio. Ele le o
   `render.yaml` sozinho.
3. Confirme as variaveis. `CODIGO_SEDE`, `ADMIN_CODE` e `SESSION_SECRET` estao
   como `generateValue: true`, entao o Render sorteia um valor forte pra cada
   uma - **anote os dois primeiros**, sao eles que o time vai usar pra criar
   conta e pra virar diretoria. O `SESSION_SECRET` voce nunca precisa ver.
4. Deploy. O primeiro leva uns minutos; depois o link e fixo.

O `render.yaml` esta no **plano free**: nao pede cartao. Em troca, o servico
dorme depois de ~15 min sem ninguem (a visita seguinte demora ~1 min pra
acordar) e nao tem disco - veja a secao 3.

Se preferir subir na mao (sem Blueprint): runtime Node, build `npm ci`, start
`npm start`, e as variaveis `NODE_ENV=production`, `CODIGO_SEDE` e
`ADMIN_CODE` definidas por voce.

> **Nao defina `SEM_LOGIN` em producao.** O codigo ja ignora, mas nao custa.

## 3. Disco: a pegadinha do plano free

`server/data/` guarda **contas, senhas e a decoracao do mapa** em JSON no disco.

- No **plano free do Render o disco e efemero**: some a cada deploy e a cada
  restart automatico. Na pratica todo mundo perde a conta e o escritorio volta
  pra planta original de tempos em tempos.
- O `render.yaml` ja pede um disco de 1 GB montado em `server/data`, mas
  **disco exige plano pago** (o Starter, mais barato). Sem ele o bloco `disk`
  e recusado.

Escolha uma:

| Caminho | O que da | Custo |
|---|---|---|
| **Render Starter + disco** | funciona como esta escrito, sem mexer no codigo | pago (mensal) |
| **Plano free, aceitando perder** | serve pra mostrar/testar; conta e decoracao somem sozinhas | gratis |
| **Trocar o JSON por um banco** | resolve de vez, e o certo se virar ferramenta do dia a dia | Postgres free do Render/Neon, mas **exige reescrever `usuarios.js` e `mapa-editado.js`** |

Isso e decisao sua - nao da pra fugir dela so com codigo.

## 4. Chamada de video: vai falhar pra parte do time

Hoje o WebRTC usa **so STUN** (`stun:stun.l.google.com:19302`), em
`public/js/calls.js`.

STUN sozinho resolve a maioria das redes domesticas, mas **nao** resolve NAT
simetrico - tipico de rede corporativa, faculdade e alguns 4G. Nessas, os dois
lados se veem no mapa e a chamada simplesmente nao conecta. No localhost isso
nunca aparece, porque nao ha NAT no meio.

Pra fechar isso precisa de um **servidor TURN**, que retransmite o audio/video
quando a conexao direta falha. Opcoes: um TURN gerenciado (Twilio, Metered,
Cloudflare Calls) ou subir um `coturn`. Em qualquer caso e so acrescentar o
servidor na lista `ICE_SERVERS`, com usuario e senha vindos de variavel de
ambiente.

Enquanto nao tiver TURN, vale avisar o time: "se a chamada nao abrir, e a rede".

## 5. Antes do primeiro deploy

- [ ] Apagar `server/data/usuarios.json` local, ou pelo menos saber que as
      contas de teste (`diretoria@admsolucoes.com` e `dev@local`) **nao** vao
      junto - elas nao estao no git, entao o servidor novo comeca vazio.
- [ ] Anotar `CODIGO_SEDE` e `ADMIN_CODE` gerados.
- [ ] Criar a sua conta de diretoria logo no primeiro acesso.
- [ ] Conferir que a URL abre em **https** (o cookie de sessao so vai com
      `Secure` em producao; em http ele e descartado e ninguem consegue logar).

# Escritorio Virtual - ADM Solucoes

Escritorio 2D multiplayer (estilo Gather.town) para a ADM Solucoes, empresa junior de
administracao da UECE. Cada pessoa monta seu boneco, entra no escritorio e anda pelo
espaco em tempo real junto com o resto do time — quem chega perto de alguem entra
automaticamente numa chamada de video/audio com essa pessoa, como no Gather de verdade.

## Stack

- **Backend:** Node.js + Express + Socket.io (WebSocket para posicao em tempo real e
  sinalizacao das chamadas)
- **Frontend:** HTML5 Canvas + JavaScript puro (sem framework, sem build step)
- **Chamadas:** WebRTC peer-to-peer nativo do navegador (o servidor so entrega o
  "bilhete" de conexao entre dois navegadores; o video/audio nunca passa por ele)
- **Sem banco de dados:** o perfil (nome + aparencia) fica salvo no `localStorage` do
  navegador de quem acessa; a presenca (quem esta online e onde) vive só em memoria no
  servidor Node enquanto ele estiver rodando

## Estrutura de pastas

```
escritorio-virtual/
├── server/
│   ├── index.js       # servidor Express + Socket.io
│   └── map.js          # mapa (grid de tiles) e colisao, usado pelo servidor
├── public/
│   ├── index.html      # tela de criar boneco + tela do escritorio
│   ├── css/style.css   # visual pixel-art escuro
│   ├── assets/lpc/      # sprites do boneco (LPC, ver CREDITS.md dentro da pasta)
│   └── js/
│       ├── map.js         # copia do mapa/colisao para uso no navegador
│       ├── pathfinding.js # BFS em grid p/ o clique contornar mesas/paredes
│       ├── character.js   # composicao/recolorizacao dos sprites do boneco
│       ├── network.js     # cliente Socket.io
│       ├── calls.js       # chamada de video/audio por proximidade (WebRTC)
│       ├── creator.js     # logica da tela "montar boneco"
│       ├── game.js        # loop do jogo, render, movimento, mapa
│       └── main.js        # liga as duas telas
├── package.json
└── README.md
```

## Como rodar localmente

Pre-requisito: [Node.js](https://nodejs.org) 18 ou mais recente.

```bash
cd escritorio-virtual
npm install
npm start
```

O servidor sobe em **http://localhost:3500** (porta configuravel pela variavel de
ambiente `PORT`). Abra esse endereco no navegador — cada aba/computador que acessar
entra como um jogador diferente.

Para testar o multiplayer sozinho, abra o mesmo link em duas abas ou dois navegadores.

## Funcionalidades

- Tela de criacao de avatar: nome, tom de pele, cor da camisa, estilo/cor de cabelo e
  oculos, com preview animado e botao "aleatorio". O perfil fica salvo no navegador,
  entao da proxima vez que a pessoa entrar ja vem preenchido.
- Boneco com sprites reais estilo RPG (banco de assets aberto LPC - Liberated Pixel
  Cup), compostos em camadas (corpo, roupa, cabelo) e recoloridos no navegador conforme
  as escolhas da criacao de avatar — ver creditos em `public/assets/lpc/CREDITS.md`.
- Mapa baseado na planta real da sede da ADM Solucoes: Entrada, Sala principal e uma
  salinha (cada uma com porta e armario embutido) na frente, e uma area aberta com 5
  mesas de trabalho atras. Colisao impede atravessar mesas/armarios/paredes.
- Movimento por clique (point-and-click) com pathfinding: clique em qualquer ponto do
  escritorio e o boneco calcula um caminho contornando mesas/paredes/sofa para chegar la.
- Multiplayer real via Socket.io: posicao, aparencia e nome de todo mundo sao
  sincronizados, com interpolacao suave para os bonecos dos outros jogadores.
- **Chamada por proximidade:** clique no botao de camera (canto superior direito) pra
  ligar sua camera/microfone. Quando seu boneco chega perto do de outra pessoa (que
  tambem tenha a camera ligada), os navegadores se conectam direto via WebRTC e aparece
  uma bolha com o video dela acima do boneco — se afastar encerra a chamada sozinho.
  Sem TURN server configurado, em redes corporativas muito restritivas a conexao pode
  falhar (funciona bem em internet doméstica/4G normal).
- **Status de disponibilidade:** botao ao lado do indicador de conexao que alterna entre
  Livre (teal), Focado (ambar) e Em reuniao (vermelho) — vira um aneizinho colorido em
  volta do boneco, visivel pra todo mundo.
- **Aceno + reacoes rapidas:** barra de emojis na parte de baixo da tela (👋 👍 🎉 😂 ❤️ 👏)
  — clique e o emoji flutua acima do seu boneco por alguns segundos, pra todo mundo ver.
- **Minimapa:** no canto inferior direito, mostra o contorno do escritorio e um pontinho
  colorido pra cada pessoa (o seu em ambar).
- **Papel de administrador:** na tela de criar avatar, um campo opcional "Sou da
  diretoria" aceita um codigo compartilhado (variavel de ambiente `ADMIN_CODE` no
  servidor, padrao `adm-solucoes-2026` — troque isso em producao). Quem entra com o
  codigo certo ganha uma coroa 👑 do lado do nome. Por enquanto e so um selo visual;
  ainda nao da poderes extras (editar mapa, mover gente etc. ficam pra depois).
- Tela cheia com vinheta e iluminacao quente ("escritorio ao entardecer"), indicador de
  conexao e botao de trocar avatar flutuando como overlay discreto nos cantos.
- Interface e todo o texto em portugues (pt-BR).

## Deploy (para o time acessar por um link)

Como o backend precisa manter WebSocket (Socket.io) ativo, escolha um servico que rode
um processo Node persistente (não é um site estatico). As opcoes mais simples:

### Render (gratuito, mais simples)

1. Suba esta pasta para um repositorio no GitHub.
2. Em [render.com](https://render.com), crie um **New Web Service** apontando para o repo.
3. Configure:
   - **Root Directory:** `escritorio-virtual` (se o repo tiver outras pastas)
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. O Render define a variavel `PORT` automaticamente — o servidor ja respeita isso.
   Se quiser trocar o codigo de administrador do padrao, adicione a variavel de
   ambiente `ADMIN_CODE` com o valor que preferir.
5. Ao final, o Render gera um link tipo `https://escritorio-adm.onrender.com` para
   compartilhar com o time.

No plano gratuito o servico "dorme" depois de um tempo sem uso e demora alguns segundos
para acordar no primeiro acesso do dia — normal, nao é bug.

### Railway

1. Suba o codigo para o GitHub.
2. Em [railway.app](https://railway.app), crie um projeto **Deploy from GitHub repo**.
3. Se o repo tiver mais coisas alem deste projeto, configure o **Root Directory** como
   `escritorio-virtual` nas settings do servico.
4. Railway detecta o `package.json` e roda `npm install` + `npm start` sozinho.
5. Gere um dominio publico em Settings → Networking → Generate Domain.

### Fly.io

Mais trabalhoso (usa Docker), mas funciona bem se voce ja tiver `flyctl` instalado:

```bash
cd escritorio-virtual
fly launch    # cria o app e um Dockerfile basico de Node quando perguntado
fly deploy
```

Garanta que a porta exposta no `fly.toml` bata com a que o servidor usa (`PORT`, padrao
3500) ou defina `PORT=8080` (padrao do Fly) nas variaveis de ambiente do app.

## Limitacoes atuais (por ser um MVP sem banco de dados)

- Se o servidor reiniciar, todo mundo cai e precisa entrar de novo (o estado de quem
  esta online vive so em memoria).
- **Camera/microfone exigem HTTPS** (ou `localhost`): navegadores bloqueiam
  `getUserMedia` fora de um contexto seguro. Rodando local em `http://localhost` funciona
  normalmente; qualquer um dos deploys sugeridos abaixo (Render/Railway/Fly) ja serve com
  HTTPS por padrao, entao nao precisa configurar nada extra.
- **Chamadas sem TURN server:** as chamadas usam so um STUN publico do Google para
  achar o caminho direto entre os dois navegadores. Funciona bem na grande maioria das
  redes, mas em redes corporativas com firewall/NAT bem restritivo a conexao pode nao
  fechar. Se isso acontecer com frequencia no dia a dia da ADM Solucoes, da pra
  adicionar um TURN server (ex: [Twilio STUN/TURN](https://www.twilio.com/docs/stun-turn)
  ou um [coturn](https://github.com/coturn/coturn) proprio) depois, sem mudar o resto do app.
- Nao ha autenticacao de verdade: qualquer pessoa com o link pode entrar com o nome que
  quiser. O "codigo de administrador" e so um selo visual (coroa), nao uma senha forte —
  da pra ver o codigo certo inspecionando o trafego da rede se alguem realmente quiser.
  Para um uso interno da ADM Solucoes isso costuma ser suficiente, mas se quiser
  restringir o acesso de verdade mais pra frente, da pra adicionar um login por tras.

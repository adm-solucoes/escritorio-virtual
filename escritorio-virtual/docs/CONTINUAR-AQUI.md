# Continuar daqui — handoff pro proximo Claude

Escrito em 06/09/2026, no fim de uma sessao longa. O Caio pediu pra parar e deixar
o estado registrado. **Le isso inteiro antes de mexer no codigo.**

---

## 1. O que e o projeto

Escritorio virtual 2D multiplayer da **ADM Solucoes** (empresa junior da UECE), no
espirito do Gather. Node + Express + Socket.io no servidor, Canvas + JS puro no
navegador, **sem banco externo** (JSON em disco). Interface toda em pt-BR.

Rodar:

```bash
cd escritorio-virtual && npm install && npm start
```

Sobe em `http://localhost:3500`. **Use o preview do Claude Code** (`preview_start`
com o nome `escritorio-virtual`), nunca `npm start` via Bash.

---

## 2. Documentos que valem mais que este

Cada feature grande tem um plano com decisao, protocolo e o resultado dos testes:

| Doc | Cobre |
|---|---|
| `docs/plano-chat.md` | canais, DMs, reacoes, nao lidas |
| `docs/plano-login.md` | contas, sessao por cookie, o furo que o login fechou |
| `docs/plano-decorador.md` | decorador, camada de objetos, sentar na cadeira |
| `referencias/README.md` | **as medidas tiradas dos prints do Gather** |

O Caio gosta desse formato: **planeja, salva o plano no projeto, executa, e
registra o resultado dos testes no proprio plano**. Mantem isso.

---

## 3. Onde a sessao parou (o ponto quente)

A ultima coisa em andamento era **melhorar a qualidade da arte dos moveis**. O Caio
reclamou tres vezes que estava "sem detalhe" e por fim pediu: **"faça em 128px"**.

### O que foi feito

- `RENDER_SCALE` passou de **2 para 4** em `public/js/game.js`. Cada tile de 32
  agora e desenhado em **128 pixels de verdade**.
- Entrou uma grade fina de desenho: `U = 32/128` e os helpers **`q()`**,
  **`qArred()`** (canto arredondado) e **`qContorno()`** (so a casca). Tudo em
  unidades de 0..128 por tile.
- Ja foram **redesenhados nessa grade**: tampo de mesa, monitor (com inclinacao
  em "V"), teclado, mouse, cadeira de escritorio (4 direcoes) e os objetos da
  camada de cima (notebook, caneca, papelada, telefone, luminaria, plantinha,
  livros).
- Tem um **fallback**: se o canvas 4x nao couber na memoria, cai pra 2x e depois
  1x (`prerenderMap` testa escrevendo 1 pixel). O canvas 4x da **~96 MB** e o
  redesenho completo leva **~55 ms** na maquina do Caio.

### ~~O que NAO foi verificado~~ — VERIFICADO em 06/09

O ultimo lote (os objetos de mesa em 128) ficou sem conferir no navegador. **Foi
conferido depois e esta ok**: os 10 objetos (monitor, monitor duplo, notebook,
teclado, caneca, papelada, telefone, luminaria, plantinha, livros) desenham sem
erro e pousam certo no tampo da mesa.

Como conferir arte **sem passar pelo login** (util, porque o app agora pede
conta e ninguem deve digitar senha de teste a toa): a tela de login ja carrega
`map.js` e `game.js`, e o `window.Game` expoe `desenharObjeto`, `desenharApoiado`
e `desenharPiso` (usados pelas miniaturas do decorador). Da pra montar uma folha
de contato com tudo lado a lado:

```js
const TILE = OfficeMap.TILE, ESC = 4, CEL = TILE * ESC, COLUNAS = 8;
const tipos = Object.entries(OfficeMap)
  .filter(([k, v]) => typeof v === 'number' && k === k.toUpperCase()
    && !['TILE', 'COLS', 'ROWS', 'LIVRE'].includes(k))
  .sort((a, b) => a[1] - b[1]);
const cv = document.createElement('canvas');
cv.width = COLUNAS * CEL;
cv.height = Math.ceil(tipos.length / COLUNAS) * (CEL + 20);
cv.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f3e9db;width:100%';
document.body.appendChild(cv);
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
tipos.forEach(([nome, valor], i) => {
  const cx = (i % COLUNAS) * CEL, cy = Math.floor(i / COLUNAS) * (CEL + 20);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(ESC, ESC);
  Game.desenharPiso(ctx, 0, 0, TILE, 'tijolo');
  Game.desenharObjeto(ctx, 0, 0, valor, TILE, [[0, 0, 0], [0, valor, 0], [0, 0, 0]]);
  ctx.restore();
  ctx.fillStyle = '#2b3038'; ctx.font = '600 11px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(nome, cx + CEL / 2, cy + CEL + 14);
});
```

Ver tudo junto e o jeito mais rapido de achar o que ainda esta na grade antiga:
o item chapado ao lado de um refeito denuncia sozinho.

### ~~O que falta~~ — MIGRACAO CONCLUIDA

**Acabou.** Os 42 tipos de tile e os 10 objetos de mesa estao todos na grade de
128. Os helpers da grade antiga (`p()`, `sombra()`, `contornoParcial()`) foram
**removidos do arquivo** - nao da mais pra desenhar fora da grade fina sem
reintroduzir um.

Eram 115 chamadas de `p()` (a estimativa de ~95 no handoff estava baixa), mais
uma leva de `ctx.fillRect` / `ctx.arc` direto que nao aparecia nessa conta -
quadro, lousa, cerca, tapete, mesa de reuniao e mesa de centro. **Se for
auditar, contar so `p(` engana**; procure tambem por `ctx.fillRect`,
`ctx.arc(` e `ctx.ellipse` dentro de `drawObstacleTile`.

Helper novo: **`blob()`**, elipse em degraus na grade fina. `ctx.arc` saia liso
e vetorial, que era justamente o que fugia da cara de sprite do resto. Usado em
copa de arvore, arbusto, pedra, flores, relogio e tapete redondo.

Duas licoes da leva de piso/parede/sofa/estante, que valem pras proximas:

- **Traco de 1 unidade some.** O canvas e feito em 4x, mas a tela desenha ele em
  zoom 2, ou seja, pela metade. Detalhe de 1 unidade vira meio pixel e evapora.
  Use **2 unidades** pro tracinho mais fino que precisa aparecer (foi o que
  aconteceu com a junta do tijolinho).
- **Contorno e faixa por tile riscam o movel inteiro.** Parede desenhava face de
  cima e rodape em todo tile, e um muro vertical virava faixas horizontais
  repetidas; o contorno em todo tile riscava uma grade por cima do muro. O certo
  e usar `bordasParede()` / `bordasDoMovel()` e so desenhar **na ponta do
  bloco**. Mesma ideia no sofa: uma almofada por tile, com o vao caindo na
  emenda — foi isso que fez ele deixar de parecer uma frente de gavetas.

Migrar um item e mecanico: trocar `p(ctx, x + A, y + B, W, H, cor)` por
`q(ctx, x, y, A*4, B*4, W*4, H*4, cor)` e depois **aproveitar o espaco novo** pra
por contorno, luz no topo, sombra na base e canto arredondado. Sem esse segundo
passo o item so fica igual, nao melhor.

---

## 4. Coisas que voce precisa saber pra nao quebrar nada

### O mapa tem DUAS copias

`server/map.js` e `public/js/map.js` sao mantidos em sincronia **na mao** (o
projeto nao tem bundler). Toda vez que mexer em constante de tile, `SOLID_TILES`,
`ASSENTOS`, `DIRECAO_ASSENTO`, `SUPERFICIES` ou `OBJETOS`, mexe **nos dois** e
roda a comparacao:

```bash
cd escritorio-virtual && node -e "
const s=require('./server/map.js');
const fs=require('fs'), vm=require('vm');
const ctx={window:{}, console}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('public/js/map.js','utf8'), ctx);
const c=ctx.window.OfficeMap;
let dif=0; for(let r=0;r<s.ROWS;r++) for(let col=0;col<s.COLS;col++) if(s.baseTiles[r][col]!==c.tiles[r][col]) dif++;
console.log('tiles diferentes:', dif);
console.log('direcoes iguais:', JSON.stringify(s.DIRECAO_ASSENTO)===JSON.stringify(c.DIRECAO_ASSENTO));
"
```

Tem que dar **0 diferentes** e `true`.

### Duas grades de coordenada convivendo

- `p(ctx, x, y, w, h, cor)` — grade antiga, unidades de tile (0..32).
- `q(ctx, x, y, ax, ay, aw, ah, cor)` — grade nova, unidades de 1/128 do tile
  (0..128), com `x, y` sendo o canto do tile.

**Nao misture os dois numeros no mesmo item.** Foi assim que apareceu um bug de
digitacao no meio da sessao.

### Pular o login no desenvolvimento

`npm run dev` liga `SEM_LOGIN=1` e o servidor entra sozinho numa conta fixa
(`dev@local`, criada no arranque). A tela de login nao aparece. `npm start`
continua com login normal.

**O que isso NAO faz:** nao devolve pro cliente o direito de dizer quem ele e.
A conta continua saindo do servidor (`sessao.usuarioDaRequisicao` /
`usuarioDoSocket` retornam a conta de dev), o `join` segue sem aceitar `uid`,
`nome` nem codigo de admin do cliente, e a flag e ignorada quando
`NODE_ENV=production`. O furo das DMs continua fechado.

Pra tirar: `npm start` em vez de `npm run dev`, ou apagar `SEM_LOGIN` do script.

### Duas identidades diferentes

- `socket.id` = a conexao, muda a cada F5. Serve pra posicao, chamada e mesa.
- `uid` = a pessoa, e o **id da conta**, vem do cookie assinado. Nomeia as DMs.

O `join` **nao aceita** `uid`, `name` nem `adminCode` do cliente — tudo vem da
conta. Isso fechou um furo real (dava pra ler DM dos outros). Nao volte atras.

### Camada de objetos

`OfficeMap.objetos` e uma segunda grade do tamanho do mapa. Ela e desenhada
**depois** dos moveis (por isso o monitor pousa em cima da mesa e pode estourar o
tile pra cima) e **nao entra na colisao**. Trocar o movel de baixo por algo que
nao segura nada derruba junto o que estava em cima.

---

## 5. Estado do disco (limpar antes de entregar)

- `server/data/mapa.json` esta **sujo com decoracao de teste minha**: umas mesas em
  (17..20, 22..23) e (24..25, 26) mais duas cadeiras. Se o Caio nao tiver comecado
  a decorar de verdade, e so apagar o arquivo e reiniciar o servidor — o mapa
  volta pra planta original.
- `server/data/usuarios.json` tem contas de teste (`diretoria@admsolucoes.com` e
  outras, senha `senhaforte123`). **Senha fraca e conhecida** — apague o arquivo
  antes de qualquer deploy. A pasta `server/data/` esta no `.gitignore`.
- `public/tmp-preview.png` esta solto no repo e nao e usado por nada. Provavelmente
  lixo de sessao antiga; confirme e apague.
- **Nada foi commitado nesta sessao.** Tem muita coisa nova sem versionar
  (`server/auth.js`, `sessao.js`, `usuarios.js`, `mapa-editado.js`,
  `public/js/auth.js`, `entrada.js`, `decorador.js`, a pasta `docs/`). Se o Caio
  pedir commit, cuide pra `server/data/` **nao** entrar.

---

## 6. Como o Caio trabalha (importante)

- Fala em pt-BR e responde curto. Manda print e espera que voce **estude o print**,
  nao que voce chute. Quando ele diz "olhe a referencia", a pasta e
  `escritorio-virtual/referencias/` e os PNGs **estao la** (o README da pasta ja
  foi corrigido; antes dizia que faltavam).
- Ele repete a critica ate resolver. "Ta feio", "sem detalhe", "nao tem nada a ver
  com a referencia" quase sempre querem dizer **falta densidade de pixel e
  sombreado**, nao mudanca de cor.
- Ele interrompe no meio da execucao pra corrigir o rumo. Le a mensagem nova antes
  de continuar o que estava fazendo.
- Ele valoriza teste de verdade no navegador (screenshot), nao "deve funcionar".

---

## 7. O que ficou pendente de decisao com ele

1. **Layout do escritorio.** No Gather cada mesa e um bloco separado com vao entre
   elas; nas salas do nosso mapa as mesas sao uma bancada corrida colada. Eu
   ofereci reorganizar em pods e ele **ainda nao respondeu**. Isso mexe no mapa
   base (as duas copias), entao **pergunte antes**.
2. **Esqueci minha senha.** Nao existe. Sem servico de e-mail, hoje a saida e a
   diretoria apagar a conta do JSON. Da pra fazer um reset feito pela diretoria
   pela propria interface se ele quiser.
3. **Disco no deploy.** No plano gratuito do Render o disco e efemero:
   `server/data/` some a cada deploy. Precisa de disco persistente montado em
   `server/data`. Esta anotado no README principal.

---

## 8. Checklist rapido antes de dizer "pronto"

- [ ] `node --check` em todo arquivo tocado.
- [ ] Script de sincronia dos dois mapas: 0 diferentes.
- [ ] Abrir numa **aba nova** e conferir console limpo (abas velhas guardam erro
      de restart do servidor e enganam).
- [ ] Screenshot do que mudou, com zoom, comparando com o print da referencia.
- [ ] Registrar o resultado do teste no plano da feature.

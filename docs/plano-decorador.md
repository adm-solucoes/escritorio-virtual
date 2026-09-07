# Plano — Decorador do escritorio

Igual ao "Decorator" do Gather que o Caio mandou: um painel lateral com busca,
abas de categoria e uma grade de objetos pra colocar no mapa.

## 1. A ideia central

O escritorio ja e uma **grade de tiles** (48x32), e cada tipo de tile ja sabe se
bloqueia passagem (`SOLID_TILES`) e como se desenha (`drawObstacleTile`). Entao
decorar = **escrever um tile numa celula**. Nao precisa de sistema de objetos novo,
de camada nova nem de assets novos: colisao, pathfinding e render vem de graca.

Consequencia boa: o que a pessoa coloca ja bloqueia o boneco na hora, e a
miniatura no catalogo e desenhada pela **mesma funcao** que desenha no mapa — o
que voce ve na grade e exatamente o que vai aparecer.

Consequencia aceita: e uma celula por objeto, entao nao da pra girar nem colocar
"meio tile pra direita". Objetos maiores (mesa comprida, sofa) se montam
encostando varias celulas, que e como o mapa ja e feito hoje.

## 2. Quem pode decorar

So quem tem `isAdmin` (a conta criada com o codigo da diretoria). O botao nem
aparece pros outros, **e** o servidor recusa o evento de quem nao e admin — a
checagem que vale e a do servidor.

## 3. Onde guarda

`server/data/mapa.json`, do lado das contas:

```json
{
  "mudancas": [ { "c": 12, "r": 8, "t": 8 } ],
  "objetos":  [ { "c": 12, "r": 8, "o": 1 } ]
}
```

E uma **lista de diferencas** em cima do mapa base do `server/map.js`, nao o mapa
inteiro. Assim o mapa base continua sendo a fonte da planta da sede e o arquivo
fica pequeno. No boot o servidor aplica as mudancas por cima; uma celula editada
duas vezes guarda so a ultima.

Gravacao atomica (`.tmp` + rename), igual ao `usuarios.js`.

## 4. Protocolo

| Evento | Direcao | Payload | Observacao |
|---|---|---|---|
| `init` | servidor → cliente | ganha `mudancasMapa` e `objetosMapa` | o cliente aplica no `OfficeMap` e redesenha |
| `mapa-editar` | cliente → servidor | `{ c, r, t }` | so admin; valida coordenada e se `t` e um tile do catalogo |
| `mapa-atualizado` | servidor → todos | `{ c, r, t }` | todo mundo redesenha na hora |
| `mapa-objeto` | cliente → servidor | `{ c, r, o }` | so admin; camada de cima (0 = tirar) |
| `mapa-objeto-atualizado` | servidor → todos | `{ c, r, o }` | tambem sai sozinho quando o movel de baixo some |

Validacoes: `c`/`r` inteiros dentro do mapa, `t` na lista de tiles permitidos, e a
celula **nao pode ser a que alguem esta pisando** (senao da pra prender a pessoa
dentro de um armario).

## 5. Catalogo

Agrupado como no Decorator da referencia, com **variacoes** dentro de cada aba (o
Gather tem varias versoes do mesmo movel, nao uma so):

| Aba | Itens |
|---|---|
| Trabalho | **mesa 2 monitores**, mesa com monitor, mesa com notebook, bancada, mesa de reuniao, mesa de centro, cadeira, cadeira vermelha, impressora, lousa |
| Decoracao | planta, planta grande, vaso de flores, cacto, quadro, relogio, televisao, cavalete, cabide, tapete, tapete redondo |
| Estar | sofa (encosto), sofa (assento), poltrona, banco, estante, armario, balcao, bebedouro |
| Estrutura | parede, janela, cerca |
| Area externa | arvore, arbusto, pedra, agua |

Mais a **borracha**, que escreve `LIVRE` e devolve o chao.

Cada item tem nome em pt-BR (a busca filtra por ele) e a miniatura e um
`<canvas>` 32x32 desenhado com `drawObstacleTile`.

### Qualidade do desenho

A primeira versao usava forma vetorial lisa (`roundRect`, `arc`) e ficou longe da
referencia. Os moveis foram refeitos em **pixel art**: retangulos inteiros, com
contorno escuro de 1px (`TRACO`) e tres tons por material (claro em cima, base,
sombra embaixo). Os helpers ficam em `game.js`: `p()` (pixel), `caixa()`,
`monitor()`, `teclado()`, `caneca()`, `tampoDeMesa()` e `cadeiraDeEscritorio()` —
reaproveitados entre os itens pra tudo ficar da mesma familia.

## 5b. Sentar na cadeira

As cadeiras sao **caminhaveis** e cada tipo tem uma **direcao**, no mapa
`DIRECAO_ASSENTO` (nas duas copias do mapa):

| Tile | Direcao | Como aparece |
|---|---|---|
| `CADEIRA` / `CADEIRA_VERMELHA` | `up` | de costas pra gente, como na foto da referencia |
| `CADEIRA_BAIXO` / `..._VERMELHA_BAIXO` | `down` | de frente: da pra ver o rosto de quem senta |
| `CADEIRA_ESQ` / `..._VERMELHA_ESQ` | `left` | de perfil, encosto do lado direito |
| `CADEIRA_DIR` / `..._VERMELHA_DIR` | `right` | de perfil, encosto do lado esquerdo |
| `POLTRONA` | `up` | — |

`ASSENTOS` sai desse mapa, entao adicionar uma cadeira nova e so por uma linha la.

Quando o boneco para em cima de uma delas:

- encaixa no centro da celula e **vira pro lado que a cadeira aponta**;
- para a animacao de caminhada e desce 6px, pra sentar no assento em vez de subir
  em cima da mesa da celula de tras;
- o **encosto e redesenhado por cima** do corpo (`desenharEncostoPorCima`), senao o
  boneco parece em pe sobre a cadeira em vez de sentado nela. O recorte segue a
  direcao: `up` cobre o corpo todo (a cabeca fica acima do tile e continua
  visivel), `left`/`right` cobrem so a metade de tras, e `down` **nao cobre nada**
  porque nessa direcao o encosto fica atras da pessoa;
- `sentado` viaja no evento `move` e o servidor **confere** que a celula e mesmo um
  assento antes de repassar — nao da pra "sentar" no meio do corredor.

## 6. Interface

Painel encostado na direita, no formato da referencia:

```
┌──────────────────────────┐
│ Decorador             ✕  │
│ [ Buscar objeto...     ] │
│ [🖥][🪴][🛋][🧱][🌳][⌫]  │  <- abas
│  ┌────┐ ┌────┐ ┌────┐    │
│  │ 🖥 │ │ 🪴 │ │ 🛋 │    │  <- grade de miniaturas
│  └────┘ └────┘ └────┘    │
│ ...                      │
│ [↶] [↷]                  │  <- desfazer / refazer
└──────────────────────────┘
```

- Com um item selecionado, o cursor no mapa mostra um quadrado fantasma na celula
  sob o mouse (verde se pode, vermelho se nao pode) e **clicar coloca**.
- Arrastar com o botao pressionado pinta varias celulas seguidas.
- `Esc` larga o item selecionado.
- Desfazer/refazer sao locais (pilha do que **eu** coloquei nesta sessao) e
  reenviam a operacao inversa — nao e um historico global.

Enquanto o decorador esta aberto, o clique no mapa **decora** em vez de andar.

## 7. Como validar

- [x] Nao-admin: botao nao aparece e o evento na mao pelo console e recusado.
- [x] Colocar uma planta e ver aparecer na outra aba na hora.
- [x] Recarregar e a planta continua la.
- [x] Reiniciar o servidor e a planta continua la (veio do `mapa.json`).
- [x] Colocar uma parede em cima de alguem: a celula onde a pessoa esta e recusada.
- [x] Colocar mesa/armario e conferir que o boneco nao atravessa (colisao).
- [x] Borracha devolve o chao da zona certa.
- [x] Desfazer/refazer.

### Resultado

| Teste | O que aconteceu |
|---|---|
| Painel | abriu com busca, 6 abas e a grade; cada miniatura desenhada pela mesma funcao do mapa |
| Fantasma no cursor | previa translucida da planta com contorno verde na celula livre |
| Colocar | planta apareceu no mapa e `mapa.json` ficou com `{c:20, r:15, t:8}` |
| Colisao | `isTileWalkable(20,15)` virou `false` na hora |
| Desfazer / refazer | tile voltou pra `0` e depois pra `8` |
| Em cima de gente | forcado pelo console na propria celula: servidor **recusou**, tile ficou `0` |
| Nao-admin | botao escondido **e** `mapa-editar` forcado pelo console ignorado |
| Ao vivo | admin apagou numa aba e a aba do nao-admin atualizou sozinha |
| Restart do servidor | a planta voltou do `mapa.json` |
| Borracha | celula voltou ao original e **saiu** do arquivo de diferencas (ficou `[]`) |

Console limpo numa aba nova.

### Depois: variacoes, arte e sentar

| Teste | O que aconteceu |
|---|---|
| Catalogo | 10 itens em Trabalho, 11 em Decoracao, 8 em Estar (antes eram 6, 6 e 6) |
| Mapa cliente x servidor | script de comparacao: **0 tiles diferentes** depois de adicionar os 11 tipos novos |
| Mesa da referencia | duas `MESA_DUPLA` lado a lado viram uma bancada com 4 monitores, teclados e canecas |
| Sentar | andou ate a cadeira, encaixou no centro, virou pra mesa e a animacao parou |
| Sentar (outra pessoa) | a segunda aba recebeu `sentado: true` e desenhou sentado tambem |
| Arte | moveis refeitos em pixel art com contorno e tres tons — mesa, cadeira, sofa, banco, armario, balcao, plantas, TV, relogio, bebedouro |

### Depois: mesa grande e camada de cima

Comparando com as fotos do Gather que o Caio mandou, faltavam tres coisas:

1. **A mesa e branca**, com um gaveteiro cinza fino na frente e dois puxadores —
   nao de madeira. O `tampoDeMesa` foi refeito nesse padrao.
2. **A mesa tem duas fileiras.** O gaveteiro sai **uma vez so**, na fileira da
   frente; a fileira do fundo e so tampo. Por isso as pecas do catalogo agora sao
   2 de altura por padrao (2x2, 3x2, 4x2, 6x2) — com uma fileira so fica aquela
   mesinha estreita que nao parecia a referencia.
3. **Os monitores sobem por cima da mesa.** Sao desenhados maiores que a celula e
   estouram o tile pra cima; da certo porque a camada de objetos e desenhada
   depois de todo o resto do mapa.

E a cadeira sobe 5px dentro da celula, pra encostar na mesa como na foto em vez de
ficar solta embaixo. Quem senta aparece so com a cabeca acima do encosto.

| Teste | O que aconteceu |
|---|---|
| Mesa 3x2 | saiu como uma placa branca unica, com o gaveteiro so na frente |
| Objetos em cima | monitor, teclado, papelada e luminaria pousados no tampo, monitores passando pra cima da mesa |
| Apagar a mesa | o que estava em cima sumiu junto (`objetoCaiu`) |
| Desfazer peca grande | um clique desfez as 4 celulas de uma 2x2 |
| Restart do servidor | mesa e objetos voltaram do `mapa.json` |
| Tres postos lado a lado | ficou igual a foto de longe: placa, gaveteiro, cadeira encostada e uma pessoa sentada |

### Depois: quatro direcoes de cadeira e as gavetas certas

Duas correcoes vindo das fotos:

- **A pessoa so sentava numa posicao.** Agora existem quatro cadeiras (↑ ↓ ← →),
  nas duas cores, e o boneco senta virado pro lado que a cadeira aponta. O desenho
  muda por direcao: de costas mostra o encosto de tela inteiro, de frente mostra o
  assento e os bracos, de perfil mostra o encosto de lado.
- **As gavetas.** Antes saia um puxador por celula, entao uma bancada de 3 celulas
  tinha 6 gavetas. Agora o puxador so sai nas **pontas** da mesa (celula sem
  vizinha do lado), entao qualquer mesa fica com **dois** puxadores, como na foto.

| Teste | O que aconteceu |
|---|---|
| Sentar nas 4 cadeiras | `dir` voltou `up`, `down`, `left` e `right`, `sentado: true` nas quatro |
| Encosto por cima | de costas cobre o corpo; de frente aparece o rosto; de perfil cobre so as costas |
| Mapa cliente x servidor | 0 tiles diferentes e `DIRECAO_ASSENTO` identico nos dois lados |

# De onde veio cada peca da arte

Este documento responde uma pergunta so: **de onde saiu cada imagem que o jogo
desenha?** Serve pra auditoria de licenca, pra achar a peca original quando a gente
quiser trocar de celula, e pra saber o que ja esta baixado antes de sair procurando
de novo.

Complementa, nao substitui, o [`public/assets/lpc-moveis/CREDITS.md`](../public/assets/lpc-moveis/CREDITS.md),
que e o arquivo de credito propriamente dito e precisa ficar do lado dos PNGs.

---

## 1. O que foi procurado, e o que foi descartado

A pergunta original era se dava pra **copiar a arte do Gather e dar os creditos**.
Nao da: sao assets de um produto comercial de terceiro, e credito nao e licenca.
O projeto ja tinha tomado essa decisao antes — o README do espelho registra que a
pasta `referencias/` (prints do Gather) fica fora do repositorio publico.

Entao a busca foi por **banco de arte aberta** que servisse pra um escritorio 2D
visto de cima. O que apareceu e o que aconteceu com cada um:

| Candidato | Licenca | Decisao |
|---|---|---|
| Arte do proprio Gather | proprietaria | **Descartado.** Nao ha atribuicao que autorize copiar. |
| [ElizaWy/LPC](https://github.com/ElizaWy/LPC) (LPC Revised) | CC-BY 3.0 / OGA-BY 3.0 | **Adotado.** Ver secao 2. |
| [Tiddybub/2d-assets](https://github.com/Tiddybub/2d-assets) → `modern-urban/oga-crimelike-furniture` | CC0 | Descartado. E CC0 e tem movel moderno 32x32, mas o conjunto e tematico de cena de crime (`bath_bloody_*`) e nao casa com o boneco que ja usamos. |
| [Kenney](https://kenney.nl) (via o mesmo repo) | CC0 | Descartado. Estilo mais chapado/vetorial, destoa do pixel do boneco. |
| [\[LPC\] Floors](https://opengameart.org/content/lpc-floors) e [\[LPC\] Walls](https://opengameart.org/content/lpc-walls) (bluecarrot16) | CC-BY-SA 3.0 | Nao foi preciso: o ElizaWy/LPC ja traz `Structure/Floor` e `Structure/Walls`. Ficam anotados como plano B. |
| [LimeZu — Modern Interiors / Modern Office](https://limezu.itch.io/moderninteriors) | paga | Descartado. E o que mais parece com o Gather, mas nao e aberta. |

O desempate a favor do LPC foi um detalhe que ja estava no projeto: **o boneco ja e
LPC** (`public/assets/lpc/`). Adotar o mesmo banco pro cenario faz personagem e
ambiente serem a mesma arte, e isso aparece na tela.

---

## 2. A fonte adotada

- **Repositorio:** https://github.com/ElizaWy/LPC
- **Ramo:** `main`
- **Commit baixado:** `f07f7f5892e67c932c68f70bb04472f2c64e46bc` (2023-12-01)
- **Pastas trazidas:** `Objects/`, `Structure/`, `Terrain/`, `FX/`
- **Total local:** 320 PNGs + 28 `credits.txt`, 5,0 MB
- **Licenca declarada pelo repositorio:**

  > All of our assets are licensed under the Creative Commons Attribution 3.0
  > (CC-BY-3.0) or OGA-by 3.0 License, allowing you to freely use, modify, and
  > distribute these assets in your own projects, provided you give appropriate
  > attribution.

O repositorio **nao tem arquivo `LICENSE` na raiz**. O que vale como concessao de
licenca sao o texto do README acima e os `credits.txt` de cada pasta, que dizem a
licenca peca por peca. Por isso esses `credits.txt` foram copiados junto, **sem
edicao**, e ficam ao lado dos PNGs.

### Como foi baixado

Dois caminhos, por um motivo pratico:

1. **`Objects/`** — pela API de conteudo do GitHub (`/repos/ElizaWy/LPC/contents/...`),
   percorrendo pasta por pasta. 200 arquivos.
2. **`Structure/`, `Terrain/`, `FX/`** — a API respondeu **403** no meio do caminho
   (limite de 60 requisicoes/hora sem autenticacao). Troquei por clone esparso, que
   nao usa API nenhuma:

   ```bash
   git clone --filter=blob:none --sparse --depth 1 https://github.com/ElizaWy/LPC.git
   git -C LPC sparse-checkout set "Structure" "Terrain" "FX"
   ```

   O `--filter=blob:none` e o que evita puxar os 47.446 PNGs de personagem do repo.

### Regra de renome

Os nomes originais tem espaco e virgula (`Chair, Office.png`), o que atrapalha em URL.
Na copia local viraram slug, e a pasta virou prefixo:

```
Objects/Furniture/Seating/Chair, Office.png  ->  furniture-seating/chair-office.png
Structure/Floor/Wood Floor A.png             ->  structure-floor/wood-floor-a.png
Terrain/trees_summer.png                     ->  terrain/trees-summer.png
```

O mapeamento completo, arquivo por arquivo, esta em
`public/assets/lpc-moveis/lista.json` (Objects) e `lista-ambiente.json`
(Structure/Terrain/FX), gerados no proprio download.

---

## 3. Tile do mapa -> celula da folha -> arquivo original

Esta e a tabela que responde "de onde saiu essa cadeira". A coluna **Celula** e a
coordenada dentro da folha, em tiles de 32px, no formato `coluna,linha (largura x
altura)` — os mesmos numeros que estao em [`public/js/sprites.js`](../public/js/sprites.js).

| Onde aparece no mapa | Celula | Arquivo local | Caminho original no pacote |
|---|---|---|---|
| `CADEIRA`, `CADEIRA_BAIXO`, `CADEIRA_DIR`, `CADEIRA_ESQ` | 0,0 / 0,2 / 1,0 / 1,1 (1×1) | `furniture-seating/chair-office.png` | `Objects/Furniture/Seating/Chair, Office.png` |
| `CADEIRA_VERMELHA` (+3 direcoes), `POLTRONA` | 3,1 / 0,1 / 1,1 / 2,1 / 3,2 (1×1) | `furniture-seating/chair-sofa-a.png` | `Objects/Furniture/Seating/Chair, Sofa A.png` |
| `PUFE` | 2,0 (1×1) | `furniture-seating/ottoman-small-a.png` | `Objects/Furniture/Seating/Ottoman, Small A.png` |
| `SOFA_BAIXO` | 0,0 (3×2) | `furniture-seating/sofa-casual-a.png` | `Objects/Furniture/Seating/Sofa, Casual A.png` |
| `MESA` (+7 variantes de direcao) | 2,2 (2×2) | `furniture/desk-office.png` | `Objects/Furniture/Desk, Office.png` |
| `MESA_CENTRO` | 0,0 (1×2) | `furniture/end-table.png` | `Objects/Furniture/End Table.png` |
| `ESTANTE`, `ARMARIO` | 2,3 / 0,0 (1×2) | `furniture/cabinet.png` | `Objects/Furniture/Cabinet.png` |
| `BALCAO` | 3,4 (1×2) | `furniture/countertop.png` | `Objects/Furniture/Countertop.png` |
| `GELADEIRA` | 0,0 (1×2) | `furniture/fridge.png` | `Objects/Furniture/Fridge.png` |
| `BEBEDOURO` | 0,0 (1×2) | `furniture/water-cooler.png` | `Objects/Furniture/Water Cooler.png` |
| `IMPRESSORA` | 0,0 (1×2) | `furniture/copy-machine.png` | `Objects/Furniture/Copy Machine.png` |
| `LUMINARIA_PE` | 0,0 (1×2) | `furniture/lighting-floor.png` | `Objects/Furniture/Lighting, Floor.png` |
| `PLANTA`, `PLANTA_GRANDE`, `CACTO` | 4,1 (1×2) / 2,0 (1×3) / 3,0 (1×3) | `furniture/planter.png` | `Objects/Furniture/Planter.png` |
| `VASO_FLORES` | 0,0 (1×1) | `small-items/flowers.png` | `Objects/Small Items/Flowers.png` |
| `ARVORE` | 4,0 (3×4) | `terrain/trees-summer.png` | `Terrain/trees_summer.png` |
| `ARBUSTO` | 2,0 (1×1) | `terrain/plants-summer.png` | `Terrain/plants_summer.png` |
| `PEDRA` | 3,2 (1×1) | `terrain/rocks-grasslands.png` | `Terrain/Rocks, Grasslands.png` |
| piso `tijolo` (corredor) | 3,1 (1×2) | `structure-floor/wood-floor-a.png` | `Structure/Floor/Wood Floor A.png` |
| piso `ladrilho` (reuniao) | 0,0 (2×2) | `structure-floor/tile-c.png` | `Structure/Floor/Tile C.png` |
| piso `carpete_roxo`, `carpete_azul` | 3,0 / 4,0 (1×1) | `structure-floor/geometric-carpet-c.png` | `Structure/Floor/Geometric Carpet C.png` |

---

## 4. Autoria e licenca de cada folha em uso

Copiado dos `credits.txt` do proprio pacote. A ultima coluna e o conjunto LPC **mais
antigo** de onde a peca veio, quando o pacote informa — varias sao redesenhos ou
recolorizacoes de arte de 2012.

| Arquivo local | Autores | Licenca | Conjunto LPC de origem |
|---|---|---|---|
| `furniture-seating/chair-office.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | original do LPC Revised |
| `furniture-seating/chair-sofa-a.png` | Lanea Zimmerman (Sharm), BlueCarrot16, Eliza Wyatt | OGA-BY 3.0 | [LPC Upholstery](https://opengameart.org/content/lpc-upholstery) |
| `furniture-seating/ottoman-small-a.png` | Lanea Zimmerman (Sharm), BlueCarrot16, Eliza Wyatt | OGA-BY 3.0 | [LPC Upholstery](https://opengameart.org/content/lpc-upholstery) |
| `furniture-seating/sofa-casual-a.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | original do LPC Revised |
| `furniture/cabinet.png` | Lanea Zimmerman (Sharm), Eliza Wyatt | OGA-BY 3.0 | [LPC modified base tiles](https://opengameart.org/content/lpc-modified-base-tiles) |
| `furniture/copy-machine.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | original do LPC Revised |
| `furniture/countertop.png` | Lanea Zimmerman (Sharm), Eliza Wyatt | OGA-BY 3.0 | [LPC modified base tiles](https://opengameart.org/content/lpc-modified-base-tiles) |
| `furniture/desk-office.png` | Lanea Zimmerman (Sharm), Eliza Wyatt | OGA-BY 3.0 | [LPC modified base tiles](https://opengameart.org/content/lpc-modified-base-tiles) |
| `furniture/end-table.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | original do LPC Revised |
| `furniture/fridge.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | original do LPC Revised |
| `furniture/lighting-floor.png` | Lanea Zimmerman (Sharm), Eliza Wyatt | OGA-BY 3.0 | [LPC modified base tiles](https://opengameart.org/content/lpc-modified-base-tiles) + [LPC Interior Castle Tiles](https://opengameart.org/content/lpc-interior-castle-tiles) |
| `furniture/planter.png` | Lanea Zimmerman (Sharm) | OGA-BY 3.0 | [LPC Interior Castle Tiles](https://opengameart.org/content/lpc-interior-castle-tiles) |
| `furniture/water-cooler.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | original do LPC Revised |
| `small-items/flowers.png` | Lanea Zimmerman (Sharm), Eliza Wyatt | OGA-BY 3.0 | [LPC Interior Castle Tiles](https://opengameart.org/content/lpc-interior-castle-tiles) |
| `structure-floor/tile-c.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | original do LPC Revised |
| `structure-floor/wood-floor-a.png` | Lanea Zimmerman (Sharm), Eliza Wyatt | OGA-BY 3.0 | [LPC modified base tiles](https://opengameart.org/content/lpc-modified-base-tiles) |
| `structure-floor/geometric-carpet-c.png` | **nao consta** (ver abaixo) | OGA-BY 3.0 (presumida) | — |
| `terrain/trees-summer.png` | Lanea Zimmerman (Sharm), Eliza Wyatt | OGA-BY 3.0 | [LPC base assets](https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles) |
| `terrain/plants-summer.png` | Lanea Zimmerman (Sharm), Eliza Wyatt, Hyptosis | OGA-BY 3.0 | [Lots of free 2D tiles and sprites (Hyptosis)](https://opengameart.org/content/lots-of-free-2d-tiles-and-sprites-by-hyptosis) |
| `terrain/rocks-grasslands.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | original do LPC Revised |

### Um buraco no credito de origem

O `Structure/Floor/credits.txt` do pacote lista **Geometric Carpet A** e **B**, mas
nao o **C** — que e justamente o que estamos usando no carpete das salas. Pelo padrao
(A e B sao originais da Eliza Wyatt, OGA-BY 3.0) o C quase certamente e o mesmo, mas
**o pacote nao afirma isso**, entao esta tabela nao afirma tambem.

Se isso incomodar, duas saidas limpas: trocar pro `geometric-carpet-a.png` ou
`-b.png`, que tem credito explicito, ou perguntar no repositorio de origem.

---

## 5. O que esta baixado e ainda nao entrou

O download foi do pacote inteiro, de proposito — sai mais barato baixar tudo uma vez
que voltar na API a cada peca nova. Contagem por pasta local (so PNG):

| Pasta local | PNGs | Serve pra |
|---|---|---|
| `furniture` | 43 | mesa, geladeira, TV, estante, balcao, impressora, maquina de vender, relogio de pe, biombo, espelho |
| `furniture-seating` | 30 | 7 modelos de sofa, 6 de cadeira de jantar, banquetas, otomanas, namoradeiras |
| `furniture-beds` | 15 | camas e cabeceiras |
| `furniture-rugs` | 4 | tapetes |
| `small-items` | 26 | notebook, cafeteira, papel, telefone, louca, almofada, luminaria de mesa |
| `small-items-food` | 25 | comida |
| `small-items-fabric`, `small-items-ores-e-ingots` | 13 | tecido, minerio |
| `wall-items` | 13 | quadros (4 estilos), posteres, cortinas, luminaria de parede, espelhos |
| `structure-walls` | 20 | parede (**ver ressalva**) |
| `structure-wall-borders` | 7 | rodateto |
| `structure-floor` | 16 | madeira, ladrilho, carpete geometrico e floral, subpiso |
| `structure-windows` | 7 | janela, com versao iluminada (`-emission`) |
| `structure-doors-*` | 13 | porta e batente, em 3 alturas |
| `structure-roofing`, `-stairs`, `-bridges`, `-fences`, `-pillars`, `-platforms`, `-signs`, `-structures`, `-misc` | 35 | telhado, escada, ponte, cerca, pilar, placa |
| `terrain` | 29 | grama, arvore, planta, pedra, penhasco, cachoeira — nas 4 estacoes |
| `furniture-smithing`, `furniture-sewing-e-weaving`, `moveable`, `fx` | 24 | ferraria, costura, cadeira de rodas, ondulacao de agua |

**Total: 320 PNGs.**

---

## 6. O que continua desenhado a mao (e por que)

O `sprites.js` pergunta ao pacote primeiro e **cai no desenho antigo** quando nao
acha. Estes ainda caem:

| Peca | Motivo |
|---|---|
| **Parede** | No pacote a parede e **elevacao**: face de 3 tiles de altura vista de frente, mais rodateto por cima. Nosso mapa trata parede como bloco de 1 tile visto de cima. Nao e trocar a imagem, e mudar como o mapa desenha parede. |
| **Grama** | Vem como autotile (borda, quina, transicao pra terra). Precisa de logica de vizinhanca que ainda nao existe. |
| **Agua do lago** | Mesmo caso da grama, mais animacao. |
| **TV, lousa, cavalete, aquario, cabide, relogio de parede, banco, cerca** | Ou o pacote nao tem equivalente, ou falta so escolher a celula. |
| **Mesa de reuniao, mesa redonda, tapete** | Falta escolher a celula. |
| **Janela** | O pacote tem, mas a janela dele acompanha a parede em elevacao. Depende de resolver a parede antes. |

---

## 7. Como conferir ou refazer

As duas paginas de apoio nao entram no jogo, so desenham:

- **`/pacote.html`** — folhas cruas em 3x, com a grade de 32px e o numero de cada
  celula por cima. E daqui que saem as coordenadas da secao 3.
- **`/sprites.html`** — todas as pecas ja trocadas, desenhadas pelo mesmo caminho que
  o mapa usa (`Game.desenharObjeto` numa grade falsa), pra conferir emenda de peca
  larga sem andar pelo mapa.
- **`/mapa.html`** — o andar inteiro numa tela, em 2x ou 4x.

Pra tracar um arquivo local ate a origem sem abrir nada:

```bash
grep -A2 '"local": "furniture/desk-office.png"' public/assets/lpc-moveis/lista.json
```

---

## 8. Se o pacote for descartado

Apagar `public/assets/lpc-moveis/` inteiro (junto com o `CREDITS.md` e este
documento) e tirar `<script src="js/sprites.js">` do `index.html` e do `mapa.html`.
O desenho a mao continua inteiro no `game.js` e volta sozinho — a camada de sprites
foi feita com reserva justamente pra isso.

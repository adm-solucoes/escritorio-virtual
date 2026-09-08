# O mapa: como e montado e o que o guarda

O mapa vive em **duas copias** (`public/js/map.js` e `server/map.js`), mantidas
iguais na mao - nao ha bundler. `npm run teste` compara as duas; se divergirem,
quebra.

## A planta

O andar segue a planta da referencia, levantada tile a tile em
[planta-referencia.md](planta-referencia.md). O desenho geral e:

- **Faixa norte (linhas 3-7):** quatro pods de 5x5 - Diretoria, Financeiro,
  Projetos, Marketing - com o patio do lago entre o segundo e o terceiro. Cada
  pod tem janelao de 3, uma planta no canto, mesa 3x1 e cadeira. So isso.
- **Colunas laterais (linhas 9-21):** duas salas fechadas de cada lado. Copa e
  Sala de Reuniao a oeste; Treinamento e Huddle a leste.
- **Salao (linha 8 pra baixo):** tijolinho creme de ponta a ponta. As areas de
  trabalho **nao sao salas**: sao ilhas de carpete soltas dentro dele, sem
  parede e sem porta. Duas baias de 11x6, com tres mesas por fileira.
- **Faixa sul (linhas 23-28):** lounge, recepcao e a mesa de conferencia, essa
  tambem solta no salao.

Duas medidas que valem em tudo, porque sao da referencia:

- **Mesa e 3x1 e a cadeira fica na linha de baixo.** Nao 3x2. A profundidade a
  mais e o que fazia a baia parecer mesa de refeitorio.
- **Reuniao tem duas escalas.** Huddle = mesa redonda de 1 tile com um assento
  por lado. Conferencia = mesa 3x2 com dez poltronas vermelhas.

## Como decorar sem quebrar

Tres armadilhas ja aconteceram aqui, e as tres eram invisiveis: o servidor sobe,
o mapa desenha bonito, e so quem tenta andar descobre.

1. **A porta e um vao de DOIS tiles**, nas colunas `c0+2` e `c0+3` de cada pod
   (11-12, 17-18, 30-31, 36-37) e nas linhas 11-12 e 18-19 das colunas 8 e 39.
   Dois tiles em vez de um porque com um so, um vaso mal posto selava a sala -
   ja aconteceu com tres de uma vez.
2. **A volta em torno do lago tem UM tile de largura.** Peca solida nas duas
   pontas do corredor de fora fecha um bolso de nove celulas. Aconteceu com dois
   arbustos; sobrou um so, e no canto.
3. **A entrada principal e o unico elo com o jardim.** Ela fica na parede sul,
   colunas 16 e 17. Sem ela o verde de fora inteiro - 356 celulas - fica sem
   ligacao com o predio.

`testes/mapa.js` cobre os tres: sala sem chao alcancavel, mesa sem onde sentar e
area grande ilhada. Rode antes de dizer que esta pronto.

> Hoje o mapa fecha em **zero** celula ilhada. O teto de 40 do teste e folga
> pra quem mexer; se passar disso, tem passagem entupida.

## Densidade

A referencia (`referencias/Captura de tela 2026-09-07 172652.png`) mostra um
escritorio **cheio**: quase nao ha parede sem estante, quadro ou planta. Quinze
tipos de movel existiam no codigo e nunca tinham sido usados no mapa - foi de
onde veio a passada de densidade, sem desenhar nada novo.

Por sala, o que a referencia mostra e o que foi aplicado:

| Sala | Referencia | Aqui |
|---|---|---|
| Salas da frente (172719) | quadro, planta de porte, armario | idem, com a peca de parede variando por sala |
| Corredor (172652) | parede continua de estante/quadro/planta | idem, alternando pra nao virar paredao |
| Lounge (172725) | estante no fundo, sofa, mesa redonda, **pufes** | idem, com 4 pufes e tapete redondo |
| Conferencia (172825) | mesa 3x2 com dez **poltronas vermelhas**, solta no salao | idem - e o unico ponto de cor forte do andar |
| Huddle (172815, 172804) | **mesa redonda** com um assento por lado | idem, e agora sao quatro salas assim |
| Lago (172749) | poca com pedra em volta e assento olhando pra ela | idem, pedra nas quinas e assento em cima e embaixo |
| Lobby (172839) | tapete de losangos, sofa e balcao de recepcao | idem, na faixa sul |

## Tiles novos

| Tile | Por que |
|---|---|
| `PUFE` (49) | o pufe e o que da cara de lounge, mais que o sofa. Assento caminhavel; a cor varia pela posicao |
| `MESA_REDONDA` (50) | as duas salas de huddle da referencia usam mesa redonda, nao retangular |
| `GELADEIRA` (51) | a copa da referencia (172742) tem geladeira de porta de vidro; as latas coloridas sao o que a identifica de longe |
| `AQUARIO` (52) | esta na sala de huddle (172815) |
| `LUMINARIA_PE` (53) | idem - a de globos, que da a luz quente do canto |

O **balcao** (`BALCAO`) ja existia sem uso e serve pros dois: e o balcao da
recepcao e a bancada da copa.

## Lobby e copa

Antes eles nao cabiam: o corredor tinha 4 linhas e viraram duas ilhas espremidas
dentro dele. Com o salao aberto da referencia sobrou espaco, e os dois viraram o
que sao na referencia - a **copa** e sala fechada de 5x6 na coluna oeste, e o
**lobby** e a faixa sul, com tapete de losangos, sofa e balcao de recepcao.

**A largura da arte tem que bater com a largura do movel no mapa.** A mesa
passou a ser 3x1 e a arte era de 2 tiles: o ladrilho repetia a coluna do meio e
saia mesa emendada torto. Quando a arte e mais larga ou mais alta que a celula,
o modo e `'alto'` - uma celula so desenha, e a peca inteira sai dela.

**`SOFA_CIMA` nao tem desenho proprio.** Quem pinta o sofa inteiro e
`SOFA_BAIXO` (arte de 3x2, em `'alto'`). Posto sozinho, `SOFA_CIMA` nao
aparece - o lounge ficou com um vao no lugar do sofa ate isso cair a ficha.

**Assento com desenho proprio precisa sair do ramo generico.** `POLTRONA` e
`PUFE` estao em `ASSENTOS`, e o ramo que desenha cadeira de escritorio pega tudo
que esta la - sem a excecao, o pufe saia como cadeira de escritorio.

**Movel de pe unico desenha o tampo ALTO na celula.** Centrado, o tampo cobre o
proprio pe e a mesa vira um ovo flutuando.


## Piso e fonte, medidos na referencia

**O tijolo do corredor era quatro vezes mais fino que o do Gather.** Medindo o
print `172839` com a cadeira de regua (1 cadeira = 1 tile = ~45px naquele zoom),
o tijolo dele tem **1 tile de largura por meio de altura**: 2 fiadas por tile e
junta vertical a cada tile. O nosso era 1/2 x 1/4 - quatro vezes mais tijolo na
mesma area, e dai a textura miuda e ocupada.

E ele e **chapado**. A nossa versao tinha junta escura, luz na quina de cima e
sombra na de baixo: com as tres, o tijolo virava azulejo de banheiro biselado.
Ficou junta quase do tom da base e um fio de luz so.

**A fonte passou de Manrope pra Inter.** Manrope e geometrica e de cara propria;
a referencia usa uma sans neutra de interface. Vale pro CSS e pros textos
desenhados no canvas (nome de sala, plaquinha da mesa, balao de contexto).

**E o nome da sala saiu do pre-render.** Trocar a familia nao bastava: a
etiqueta era assada no canvas do mapa em `RENDER_SCALE` e depois reduzida na
hora de desenhar. Com o alisamento desligado - que e o que mantem a arte
pixelada - o texto vinha serrilhado, e nenhuma fonte ia salvar isso. Na
referencia o nome da sala e texto de INTERFACE, nitido. Agora ele e desenhado na
camada viva, onde o rasterizador da fonte trabalha no tamanho final da tela.

> A regra geral: arte vai pro pre-render, texto vai pra camada viva. A plaquinha
> da mesa e o balao de contexto ja estavam certos.


## Comparacao peca a peca com a referencia

Feita olhando cada movel ao lado do print correspondente. Sete estavam
diferentes de um jeito que da pra apontar:

| Peca | Estava | Referencia | Print |
|---|---|---|---|
| Sofa | sem braco - lia como balcao estofado | braco fechando cada ponta | 172725 |
| Banco | azul | ripa de MADEIRA | 172725, 172749 |
| Poltrona | bloco marrom chapado | encosto alto e um braco de cada lado | 172815 |
| Pufe | pequeno, cara de almofada | ocupa quase o tile, do porte de uma poltrona | 172725 |
| Cadeira vermelha | cadeira de escritorio pintada de vermelho | **poltrona** vermelha, sem pe de estrela | 172825 |
| Mesa de centro | disco chapado no chao | borda grossa e pe aparecendo | 172725 |
| Mesa de reuniao | madeira | branca | 172825, 172704 |

Cadeira de escritorio, estante e armario ja batiam.

**Poltrona virou uma arte so** (`poltronaEstofada`), com direcao, servindo pra
`POLTRONA` e pra familia `CADEIRA_VERMELHA`. Sao a mesma peca em cores
diferentes - manter duas artes seria manter dois lugares pra errar.

**Movel de pe unico desenha o tampo alto na celula** (mesa de centro e mesa
redonda). Centrado, o tampo cobre o proprio pe e a peca vira um disco no chao.

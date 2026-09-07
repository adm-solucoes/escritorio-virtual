# O mapa: como e montado e o que o guarda

O mapa vive em **duas copias** (`public/js/map.js` e `server/map.js`), mantidas
iguais na mao - nao ha bundler. `npm run teste` compara as duas; se divergirem,
quebra.

## Como decorar sem quebrar

Tres armadilhas ja aconteceram aqui, e as tres eram invisiveis: o servidor sobe,
o mapa desenha bonito, e so quem tenta andar descobre.

1. **As portas das salas da frente sao um vao de UMA celula.** O
   `set(11, meio, LIVRE)` abre a porta; a coluna dela nas colunas 7, 15, 31 e 39.
   Movel na linha 12 nessas colunas **sela a sala**. Aconteceu: tres salas
   ficaram inalcancaveis.
2. **O anel em volta do lago tem UM tile de largura.** Peca solida ali parte a
   volta - e como o jardim de fora so se liga ao resto pelo patio, o mapa inteiro
   fora do predio ficou sem acesso. Poltrona e pufe sao assento **caminhavel** e
   servem; banco nao.
3. **Fechar o retangulo do lago em vez do contorno da agua** tampa a passagem de
   cima do patio. A pedra segue a agua, nao o retangulo.

`testes/mapa.js` cobre os tres: sala sem chao alcancavel, mesa sem onde sentar e
area grande ilhada. Rode antes de dizer que esta pronto.

> Os 26 tiles ilhados que o teste aceita sao a faixa de grama atras da parede
> sul, que nunca teve acesso e nao incomoda.

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
| Reuniao (172825) | mesa grande com **cadeiras vermelhas** | idem - e o unico ponto de cor forte do andar |
| Huddle (172815) | **mesa redonda** com um assento por lado | idem, num canto da sala de reuniao |
| Lago (172749) | poca **cercada de pedra**, com assento olhando pra ela | idem, com poltrona nos quatro lados |

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

## Lobby e copa: o que nao coube

A referencia tem um **lobby** (172839) e uma **copa** (172742) como comodos
proprios. Aqui nao cabem: o corredor tem 4 linhas de altura. Viraram duas ilhas
dentro dele - o movel ocupa a linha 13 e sobram as linhas 14 e 15 pra passar.

E ai mora a armadilha de novo: a linha 13 nas colunas 7, 15, 31 e 39 e a saida
das portas. Movel ali deixa quem sai da sala num bolso de duas celulas. Foi o
que aconteceu com a geladeira na primeira tentativa, e `testes/mapa.js` pegou.

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

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

## Tiles novos desta passada

| Tile | Por que |
|---|---|
| `PUFE` (49) | o pufe e o que da cara de lounge, mais que o sofa. Assento caminhavel; a cor varia pela posicao |
| `MESA_REDONDA` (50) | as duas salas de huddle da referencia usam mesa redonda, nao retangular |

**Assento com desenho proprio precisa sair do ramo generico.** `POLTRONA` e
`PUFE` estao em `ASSENTOS`, e o ramo que desenha cadeira de escritorio pega tudo
que esta la - sem a excecao, o pufe saia como cadeira de escritorio.

**Movel de pe unico desenha o tampo ALTO na celula.** Centrado, o tampo cobre o
proprio pe e a mesa vira um ovo flutuando.

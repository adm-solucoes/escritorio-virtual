# Como a chamada por proximidade decide abrir

Tres problemas, achados testando com o bot (`/?bot=1`), e todos com a mesma
raiz: a proximidade era **so uma conta de distancia em linha reta**.

## 1. Abria de longe demais

Era `130px` pra entrar. Numa grade de 32px isso da **4,1 tiles** - e com o zoom
em 2x, meia tela de distancia. A chamada abria com gente que voce mal via.

Agora o alcance e medido em TILES, que e a unidade do mapa e da pra conferir
olhando: **3 tiles pra entrar, 4,5 pra sair**. A folga entre os dois continua
existindo pelo mesmo motivo de antes - sem ela a chamada pisca quando voce anda
em cima da borda.

## 2. Atravessava parede

O pior dos tres. Duas pessoas em salas diferentes, cada uma do seu lado do muro,
entravam em chamada - porque em linha reta estavam a dois tiles.

Agora a reta entre os dois e percorrida de quarto em quarto de tile, e se
encontrar **PAREDE ou JANELA** a chamada nao abre (e fecha, se ja estava aberta).

**So parede e janela cortam, movel nao.** Conversar por cima de uma mesa e a
coisa mais normal de um escritorio, e mesa e tile solido igual a parede: barrar
por "solido" calaria a sede inteira.

## 3. So um dos dois lados propunha

`updateProximity` roda no laco de desenho, e o navegador **congela esse laco em
aba de segundo plano**. A regra antiga dizia que so o lado de id menor propunha a
chamada. Entao, se justamente essa pessoa estivesse com a aba atras - alt-tab, o
tempo todo -, a chamada **nunca abria**, e nao havia como desconfiar do porque:
as duas ficavam lado a lado, camera ligada, e nada acontecia.

Agora qualquer um dos dois propoe. Os dois propondo junto nao e problema: o
`tratarSinal` ja resolvia colisao de ofertas desde antes (o de id maior desfaz a
propria e aceita a do outro). Essa regra continua sendo a que decide quem cede -
ela so deixou de ser tambem a que decide quem convida.

## De quebra: o volume cai com a distancia

Antes era liga/desliga. Agora e volume cheio ate 1,5 tile e vai sumindo ate zero
no raio de saida, como no Gather - a conversa aparece e some aos poucos em vez de
estourar de uma vez.

## E a conexao presa

Uma conexao que nasce e nunca conecta virava lixo que **bloqueava**: como
`peers.has(id)` continuava verdadeiro, a proximidade nunca tentava de novo. As
duas pessoas ficavam lado a lado sem chamada, pra sempre - so curava se alguem
se afastasse.

Acontece de verdade quando o outro lado recarrega a pagina no meio da
negociacao. Agora, depois de 12s sem conectar, o par e derrubado e a proximidade
refaz a chamada sozinha no quadro seguinte.

## Resultado dos testes

Medido no jogo de pe, com o bot como segunda pessoa.

| O que | Resultado |
|---|---|
| Bot dentro da sala, Dev do outro lado da parede, **2 tiles** | chamada **nao** abre |
| Dev da a volta e entra na sala, 1,2 tiles | chamada abre, video chega |
| Dev com id MAIOR que o do bot, bot em aba de fundo | chamada abre (antes nao abria) |

E o volume, medindo enquanto se afasta:

| Distancia | Volume |
|---|---|
| 1,2 tiles | 1,00 |
| 1,9 tiles | 0,86 |
| 3,0 tiles | 0,51 |
| 5,1 tiles (com parede no meio) | chamada fechada |

A ultima linha merece nota: a chamada fechou antes dos 4,5 tiles porque havia
uma parede no caminho (tile 20,6). Conferido, nao e o raio errado - e a regra 2
funcionando.

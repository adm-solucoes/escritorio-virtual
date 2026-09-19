# Areas: mover e mudar o tamanho de cada sala

Como a "area" do Gather: cada sala da sede e um retangulo com nome, e a
diretoria arrasta esse retangulo pra mudar de lugar e puxa a borda ou a quina
pra mudar o tamanho, como se fosse uma foto. Muda na hora pra todo mundo que
esta na sede, e fica salvo.

Codigo: `public/js/areas.js` (o editor), `public/js/map.js` (regra e aplicacao
no cliente), `server/mapa-editado.js` (regra que vale e gravacao), evento
`mapa-area` no `server/index.js`. Teste de ponta a ponta: `testes/areas.js`.

## O que a area decide (e por isso anda junto)

- **Chamada fechada**: quem esta numa sala privativa (cabines, reuniao, huddles)
  so conversa com quem esta nela (`calls.js`).
- **Sala silenciosa**: na biblioteca a chamada por proximidade nao abre.
- **Piso**: o carpete dos bairros, o ladrilho das salas de reuniao, a madeira da
  recepcao. Diminuiu a area, o carpete diminui junto; o que sobra vira corredor.
- **Etiqueta** com o nome, **Visao de salas** e **minimapa**.
- **Modelo de cadeira** (cadeira comum na copa, de escritorio nos bairros).
  Cadeira de frente pra mesa de trabalho e sempre a de escritorio, em qualquer
  area - senao as mesas que ficam fora de uma area diminuida ganhariam cadeira
  de copa.

## O que NAO anda junto

**Parede e movel.** Igual ao Gather: a area e uma camada por cima da planta. Pra
mudar a parede ou tirar mesa, sao as outras abas do decorador (Estrutura,
Borracha...). Tambem ficam onde estao os **tapetes** (sala de reuniao,
biblioteca) e a **soleira** da porta - sao como movel.

## Como usar

1. **Decorar** (so aparece pra diretoria) > aba **📐 Areas**.
2. Escolha a area na lista (a camera vai ate ela) ou clique nela no mapa.
3. **Arraste o meio** pra mudar de lugar; **puxe a borda ou a quina** pra mudar
   o tamanho. Tudo encaixa nos tiles.
4. Soltou, salvou. Se nao pode (em cima de outra area, por exemplo), o
   retangulo fica vermelho durante o arraste, a area volta pro lugar e o motivo
   aparece no painel.
5. **Esc** desfaz o arraste em andamento (ou solta a selecao). **Voltar ao
   tamanho original** poe a area de volta na planta de fabrica.

Enquanto o editor esta aberto, clicar no mapa nao anda com o boneco.

## As regras (as mesmas no cliente e no servidor; quem decide e o servidor)

| Regra | Por que |
|---|---|
| So a diretoria | como o resto do decorador; o botao escondido e so conforto, a checagem que vale e a do servidor |
| Area nao fica em cima de outra | a pessoa estaria em duas salas ao mesmo tempo, e a chamada fechada de uma vazaria pra outra |
| Dentro do mapa, no minimo 2x2 | area de 1 tile nao cabe gente |
| `hall` e `jardim` nao se editam | sao o fundo, que pega o que nenhuma area cobre |
| Voltar ao original tambem passa pela regra | outra area pode ter ido pro lugar dela; ai recusa com o nome de quem esta la |

## Onde fica salvo

`DATA_DIR/mapa.json`, chave `areas` - so as que sairam do lugar de fabrica, ao
lado da decoracao (`mudancas`, `objetos`, `conteudos`). Cada sede tem a sua
pasta de dados, entao **cada cliente ajusta a planta da propria sede** sem
mexer na dos outros (docs/varias-sedes.md).

No arranque o arquivo e conferido **inteiro**, e nao area por area: uma area
pode ter ido pro lugar que outra deixou livre, e lendo uma de cada vez a
primeira bateria na posicao velha da outra. Se o conjunto nao fecha (arquivo
editado a mao com uma area em cima da outra), fica a planta de fabrica e o log
diz por que.

## O que ainda nao faz

- Criar area nova ou apagar uma.
- Renomear, trocar a cor ou o tipo (fechada / silenciosa / aberta).
- Desfazer varias vezes (so existe o "voltar ao tamanho original").
- Arrastar pelo celular (o gesto e de mouse; no celular a diretoria usa o
  computador pra isso).

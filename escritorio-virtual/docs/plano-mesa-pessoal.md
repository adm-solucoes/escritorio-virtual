# Plano: mesa pessoal

O Caio pediu "personalizacao da mesa" seguindo as referencias, "fazer todos"
os itens. Sao duas coisas que so servem juntas:

1. **O catalogo de itens** - hoje sao 10; a referencia tem muito mais.
2. **Quem coloca** - hoje **so a diretoria**, pelo decorador. Enquanto for
   assim, nao e personalizacao da mesa: e decoracao do escritorio.

## 1. O que a referencia mostra

Os prints do decorador do Gather (`referencias/4x-decorator-*.png`) sao
divididos em abas. As que interessam pra cima da mesa:

| Aba | O que tem |
|---|---|
| Eletronicos (`153719`, `40-...`) | monitor + torre, setup retro, monitor com caixas de som, dois monitores, teclado gamer, tablet |
| Comida e bebida (`153801`) | cafeteira, copo de cafe, garrafa, donut, tigela, pote |
| Escritorio (`153746`) | plantinhas de vaso pequeno |
| Parede (`153815`) | porta-retrato, quadrinho |

E o print `13-menu-largar-mesa.png` mostra o outro lado da mecanica: **"Unclaim
my desk" fica no cartao do proprio perfil**, nao no mapa. Ou seja, no Gather a
mesa reivindicada **e da conta e sobrevive a sessao**.

## 2. O que esta quebrado pra isso funcionar

Duas coisas, achadas lendo o codigo:

**A mesa e do socket, nao da conta.** Em `server/index.js` o mapa `mesas`
guarda `chave -> socket.id`, e o `disconnect` apaga a entrada. Ou seja: voce
reivindica a mesa, fecha a aba, e a mesa deixa de ser sua. Personalizar uma
mesa que some quando voce fecha o navegador nao tem graca.

**Nada disso vai pro disco.** `mesas` e um `Map` em memoria. Reiniciou o
servidor, acabou.

## 3. Decisoes

### A mesa passa a ser da conta e vai pro disco

`mesas` guarda `chave -> uid` (o id da conta, o mesmo do cookie assinado) e e
salva em `server/data/mesas.json`, junto com os itens. O `disconnect` **nao**
larga mais a mesa.

Como largar entao: clicando na propria mesa (ja funciona) e pelo cartao do
perfil, como na referencia.

> No plano free do Render `server/data/` some a cada deploy - a mesa e a
> decoracao vao junto com as contas. Esta anotado em `docs/deploy.md`.

### Quem decora a propria mesa e o dono, sem ser diretoria

Evento novo `mesa-item`, separado do `mapa-objeto` do decorador. A checagem que
vale e a do servidor:

- a celula tem que ser de uma mesa **reivindicada por voce**;
- o item tem que estar no catalogo de itens de mesa.

O `mapa-objeto` do decorador continua exigindo `isAdmin` e continua existindo -
sao coisas diferentes: um decora o escritorio, o outro a sua mesa.

### Um item por celula

A camada de objetos ja e `objetos[r][c]` - um item por celula. Como a mesa
agora tem 3 celulas de largura, dao 3 itens por pessoa (6 nas de duas
fileiras). Nao vale inventar sub-grade agora: 3 itens ja da pra ter
personalidade e mantem o desenho legivel no zoom do jogo.

## 4. O catalogo

10 que ja existem, marcados com *. Os novos seguem o mesmo padrao de desenho:
grade fina de 128, apoiando por volta de `y=90` (o `drawObjectTile` levanta
sozinho quando o tampo acaba antes).

| Grupo | Itens |
|---|---|
| Computador | MONITOR*, MONITOR_DUPLO*, MONITOR_ULTRAWIDE, NOTEBOOK*, TORRE_PC, SETUP_GAMER |
| Perifericos | TECLADO*, HEADSET, TABLET, CAIXAS_SOM |
| Cafe e comida | CANECA*, COPO_CAFE, GARRAFA, DONUT, TIGELA |
| Papelada | PAPELADA*, LIVROS*, PORTA_LAPIS, CADERNO, CALENDARIO, POST_ITS |
| Pessoal | PLANTINHA*, LUMINARIA*, TELEFONE*, CACTINHO, PORTA_RETRATO, TROFEU, BONECO |

Total: 28 itens, 18 novos.

## 5. Ordem

O Caio pediu pra inverter: primeiro a posse da mesa, pra ele ja testar
personalizando de verdade, e os itens depois.

1. **Mesa da conta + a mesa inteira** - feito, secao 6.
2. Painel de personalizar a propria mesa (o dono coloca item sem ser diretoria).
3. Catalogo dos 18 itens novos.

## 6. Etapa 1: a mesa e da conta e vem inteira

`server/mesas.js` passa a ser o dono do assunto (o `index.js` so repassa). A
varredura do movel (`celulasDaMesa`) mora no `map.js`, que e o arquivo espelhado
entre cliente e servidor - assim os dois concordam sobre onde a mesa comeca e
termina, e o cliente consegue acender o movel inteiro no hover de uma mesa que
ainda nao e de ninguem.

**A chave da mesa e a celula de cima a esquerda do bloco.** Clicar em qualquer
canto cai na mesma chave; e isso que faz a mesa nao se dividir em pedacos.

O mapa tem **12 mesas**: 4 salas da frente com 2 celulas e 8 baias com 6. Somam
as 56 celulas de `MESA_MONITOR` que existem, ou seja, nenhuma mesa gruda na
vizinha por engano.

### Resultado dos testes (07/09/2026)

Regras, pelo `server/mesas.js` direto (duas pessoas nao dao pra testar numa aba
so - o `SEM_LOGIN` poe todo mundo na mesma conta): **16 de 16 passaram**.

| O que | Resultado |
|---|---|
| Pegar clicando no canto da mesa | ok - guarda a chave `15,18` e as 6 celulas |
| Outra pessoa nao rouba a mesa | ok - recusa e a mesa continua da primeira |
| Trocar de mesa larga a anterior | ok - continua 1 mesa por pessoa |
| Largar pelo perfil | ok - e largar duas vezes nao faz nada |
| Clicar no chao | ok - nao pega nada |
| Disco | ok - `server/data/mesas.json` guarda chave + uid |

No navegador:

| O que | Resultado |
|---|---|
| Contorno | ok - cobre o movel inteiro, nao uma celula |
| Plaquinha do dono | ok - uma so, centrada na frente da mesa |
| Hover numa mesa livre | ok - acende o movel todo e mostra "Mesa livre" |
| **Fechar e voltar** | **ok - a mesa continua sua** (era o furo: o dono era o socket) |
| Botao "Largar minha mesa" | ok - so aparece pra quem tem mesa, e some ao largar |
| Console | limpo |

> `server/data/mesas.json` e mais um arquivo que o plano free do Render apaga a
> cada deploy, junto com as contas. Ver `docs/deploy.md`, secao 3.

# A estante: o acervo de livros da sede

Encostar numa estante do mapa abre o acervo da ADM num painel lateral. A ideia e
tirar o atrito: a pasta de livros existe, mas mora num link que ninguem lembra.
Na estante, ela fica onde uma pessoa procuraria por um livro.

## Como funciona

| Peca | Onde | O que faz |
|---|---|---|
| `server/estante.js` | servidor | le e grava `server/data/estante.json` |
| rotas `/api/estante*` | `server/index.js` | listar, por, tirar, e definir a pasta |
| `public/js/estante.js` | cliente | o painel e a proximidade |
| `.painel-estante` | `public/css/style.css` | painel LATERAL, nao tela cheia |

O laco do jogo chama `Estante.verProximidade(eu)` a cada quadro. Ele mede a
distancia ate a celula de `ESTANTE` mais perto:

- **46 px** (pouco mais de um tile) abre;
- **78 px** fecha.

O raio de sair e maior que o de entrar de proposito: com um raio so, andar na
beira da estante ficava abrindo e fechando o painel.

Fechar no X **nao** reabre enquanto voce nao sair de perto - senao o painel
voltaria no quadro seguinte. Abrir pelo botao do trilho e diferente: esse fica
aberto ate voce fechar, porque nao foi a proximidade que pediu.

O painel e lateral, e nao de tela cheia como o do Trello, por causa disso: ele
abre **sozinho**, entao nao pode tapar o mapa nem impedir de continuar andando.

## O acervo

E **um so pra sede inteira**: qualquer estante do mapa abre a mesma lista.
Estante por sala seria mais bonito e mais inutil - ninguem ia lembrar em qual
sala esta qual livro.

- Qualquer pessoa logada poe um livro (titulo e link obrigatorios; autor e tema
  opcionais).
- Tirar so quem pos, ou a diretoria. O servidor confere de novo: esconder o
  botao na tela e conveniencia, nao seguranca.
- A **pasta do Drive** e uma so, e so a diretoria muda.

Link so entra se for `http` ou `https`. Sem essa checagem, `javascript:` colado
no campo vira codigo rodando na sessao de quem abrir a estante.

## O que falta

- **Listar a pasta do Drive sozinho.** Hoje a pasta e um link e os livros sao
  uma lista feita na mao. Ler o conteudo da pasta exigiria o escopo `drive` no
  OAuth (hoje o projeto so pede `calendar.readonly`) e uma credencial de
  servico, porque a pasta e da empresa e nao de quem esta logado.
- **Marcar quem esta lendo o que.** A estante sabe o que tem; nao sabe quem
  pegou.

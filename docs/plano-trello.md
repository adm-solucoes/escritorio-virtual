# Plano: aba do Trello na sede

O Caio pediu "uma aba de trello como o crm usando a mesma api". E isso mesmo:
**o mesmo quadro, a mesma API, as mesmas credenciais** que o CRM ja usa.

## 1. Decisao

Diferente do calendario, aqui **nao ha OAuth por pessoa**: o Trello do CRM usa
um **token unico da conta**, com um quadro fixo (`TRELLO_BOARD_ID`). A sede
reaproveita esse mesmo trio de variaveis.

**Somente leitura.** O quadro continua sendo editado no Trello; a sede e pra
bater o olho sem sair da sede. Criar cartao (o CRM tem
`criarCartaoDeSolicitacao`) fica pra depois, se o Caio quiser - escrever e um
passo maior que ler.

## 2. O token nunca vai pro navegador

O proprio `crm-adm/src/lib/trello.ts` avisa: **quem tem o `TRELLO_TOKEN` acessa
a conta inteira do Trello**. Por isso as variaveis nao tem prefixo
`NEXT_PUBLIC_` la, e por isso aqui:

- `server/trello.js` e **so servidor**;
- o cliente pede pelo socket (`trello-pedir`) e recebe **o quadro ja montado**,
  nunca a credencial;
- erro do Trello nao repassa o corpo cru da resposta, so o status - resposta de
  erro as vezes ecoa a query, e a query leva `key` e `token`.

## 3. Variaveis

As **mesmas** que o CRM ja tem:

| Variavel | Pra que |
|---|---|
| `TRELLO_API_KEY` | chave da API |
| `TRELLO_TOKEN` | token da conta |
| `TRELLO_BOARD_ID` | o quadro "Kanban - Marketing / Gente / Gestao" |

Sem elas o painel abre e avisa que nao esta configurado, em vez de quebrar.

## 4. Cache

2 minutos, mais folgado que o do calendario: quadro muda devagar (e alguem
arrastando cartao), e nao vale bater na API a cada abertura de painel. Tem
botao **Atualizar** pra quem quiser forcar - ele so refaz o pedido, entao dentro
da janela de cache ainda devolve o mesmo; passou dela, busca de novo.

## 5. Arquivos

| Arquivo | Papel |
|---|---|
| `server/trello.js` | le o quadro (quadro + listas + cartoes), cache |
| `server/index.js` | evento `trello-pedir` |
| `public/js/trello.js` | painel com as colunas |
| `public/index.html` / `style.css` | botao no trilho e estilos |

## 6. Resultado dos testes

Testado em 06/09/2026 com um stub da API do Trello em `localhost:4600`,
apontando o `BASE` do `server/trello.js` pra ele (revertido depois).

| O que | Resultado |
|---|---|
| Sem as variaveis | ok - painel avisa "Trello nao configurado", sem quebrar |
| Quadro monta | ok - titulo, link "Abrir no Trello" e 4 colunas |
| Contagem por coluna | ok - Backlog 2, Fazendo 1, Revisao 1, Feito 1 |
| Etiquetas coloridas | ok - Gestao roxo, Gente verde, Marketing laranja |
| Prazo | ok - "amanha", atrasado em vermelho, concluido em verde |
| Membros | ok - iniciais no rodape do cartao, nome completo no title |
| Stub sem credencial | ok - o stub recusa com 401 e a sede mostra o aviso |
| Console | limpo |

### Ainda nao testado com o Trello de verdade

O stub responde no formato da API, mas o quadro real nao foi lido - exige as
credenciais. Vale abrir uma vez com elas antes de confiar, principalmente pra
conferir se os nomes das listas do quadro real cabem na coluna.

# A estante: o acervo de livros da sede

Clicar numa estante do mapa abre o acervo da ADM num painel lateral. A ideia e
tirar o atrito: a pasta de livros existe, mas mora num link que ninguem lembra.
Na estante, ela fica onde uma pessoa procuraria por um livro.

## Como abre e como fecha

**Abre no clique, e so no clique.** A primeira versao abria por proximidade e
era irritante do jeito mais bobo: voce fechava o painel, dava um passo, e ele
voltava - o mapa tem estante em quase toda parede.

**Fecha quando voce vai embora**: clicar no chao pra andar, `Esc`, ou o X. Sair
dali e sair dali.

O clique vale tambem na celula **acima** da estante. A estante tem 2 tiles de
arte e so 1 de chao, entao a metade que a pessoa mais ve - as prateleiras - cai
na celula de cima. Amarrado so ao tile do chao, clicar no meio da estante nao
abria nada.

O painel e lateral, e nao de tela cheia como o do Trello: o mapa continua
visivel atras, e clicar no chao ja fecha a estante e leva a pessoa embora.

## O que aparece

**So a capa.** Nao e economia de tela, e o jeito que a gente procura livro: bate
o olho na lombada e reconhece. Titulo e autor entram no passar do mouse.

Livro sem capa nao fica com buraco branco: a tela desenha uma, com o titulo em
serifada e a cor tirada do proprio titulo - o mesmo livro tem sempre a mesma
capa, senao a estante deixaria de ser reconhecivel de relance, que e o ponto
dela. Capa que nao carrega cai na mesma desenhada.

Aqui **nao** se cadastra livro nem se mexe na pasta. Estante e pra pegar e ler.

## Como poem livro na estante

O acervo vive em `server/data/estante.json` (fora do git, como todo o
`server/data/`):

```json
{
  "pasta": "https://drive.google.com/drive/folders/...",
  "livros": [
    {
      "id": "qualquer-texto-unico",
      "titulo": "Nome do livro",
      "autor": "Quem escreveu",
      "capa": "https://.../capa.jpg",
      "url": "https://drive.google.com/file/d/.../view",
      "tag": ""
    }
  ]
}
```

- `titulo` e `url` sao obrigatorios; `capa`, `autor` e `tag` sao opcionais.
- `pasta` e o link que vira o "Pasta no Drive" no topo do painel.
- `url` e `capa` so aceitam `http`/`https`. Sem essa checagem, `javascript:`
  colado ali vira codigo rodando na sessao de quem abrir a estante.

As rotas `POST /api/estante/livro` e `DELETE /api/estante/livro/:id` continuam
existindo (com as mesmas regras: tirar so quem pos, ou a diretoria) - servem pra
uma tela de gestao no futuro. Hoje nenhuma tela chama.

## O acervo e um so

Qualquer estante do mapa abre a mesma lista. Estante por sala seria mais bonito
e mais inutil - ninguem ia lembrar em qual sala esta qual livro.

Todo abrir busca a lista de novo. A primeira versao buscava uma vez e guardava:
livro posto por outra pessoa nao aparecia pra mais ninguem ate recarregar a
pagina, o que numa estante compartilhada e a coisa toda.

## O que falta

- **Listar a pasta do Drive sozinho.** Hoje a pasta e um link e os livros sao
  uma lista no JSON. Ler o conteudo da pasta exigiria o escopo `drive` no OAuth
  (hoje o projeto so pede `calendar.readonly`) e uma credencial de servico,
  porque a pasta e da empresa e nao de quem esta logado.
- **Uma tela pra gerenciar.** Enquanto nao existe, e o JSON na mao.
- **Marcar quem esta lendo o que.** A estante sabe o que tem; nao sabe quem
  pegou.

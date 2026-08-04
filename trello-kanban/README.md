# Configuração do quadro Kanban no Trello

Script que cria (ou reutiliza) um quadro Kanban no Trello com listas,
etiquetas e um cartão-modelo, e convida as pessoas do time por e-mail.

**É idempotente:** pode rodar quantas vezes quiser que não duplica lista,
etiqueta, cartão nem reenvia convite pra quem já entrou.

---

## 1. Instalar

Precisa de **Node.js 18 ou superior** (usa o `fetch` nativo).

```bash
cd trello-kanban
npm install
```

## 2. Gerar a chave e o token do Trello

> ⚠️ **O antigo `trello.com/app-key` foi descontinuado.** Hoje ele redireciona
> pra outro lugar — e se você tiver conta Atlassian, pode acabar caindo na
> tela de *"Tokens de API"* da Atlassian (`id.atlassian.com`). **Aquela tela
> é do Jira/Confluence e NÃO serve aqui.** O Trello tem fluxo próprio.

### 2.1 — API Key

A chave do Trello hoje fica amarrada a um "Power-Up" (mesmo que você não vá
publicar nada — é só o contêiner da credencial).

1. Faça login no Trello com a conta que vai ser **dona do quadro**.
2. Acesse **<https://trello.com/power-ups/admin>**.
3. Clique em **"Criar novo Power-Up"**.
4. Preencha o mínimo: nome (ex: `Setup Kanban Interno`), o workspace, seu
   e-mail e o autor. Não precisa de URL de iframe nem ícone.
5. Abra o Power-Up criado → aba **"API Key"** → **"Generate a new API Key"**.
6. Copie o valor → é o `TRELLO_API_KEY`.

### 2.2 — Token

Cole esta URL no navegador, **trocando `SUA_CHAVE_AQUI`** pela chave do passo
anterior:

```
https://trello.com/1/authorize?expiration=never&scope=read,write,account&response_type=token&key=SUA_CHAVE_AQUI
```

Clique em **"Allow"** / **"Permitir"**. O token aparece na tela → é o
`TRELLO_TOKEN`.

Sobre os parâmetros:

| Parâmetro | Por que esse valor |
|---|---|
| `scope=read,write,account` | `write` cria quadro/listas/etiquetas; `account` é o que permite **convidar por e-mail** |
| `expiration=never` | pra não precisar regerar. Aceita também `1hour`, `1day`, `30days` |

> **O token é uma senha.** Quem tiver ele acessa sua conta do Trello. Nunca
> mande por WhatsApp, não coloque em print e não versione o `.env`
> (já está no `.gitignore`). Se vazar, revogue em
> <https://trello.com/my/account> → *Allowed Applications*.

## 3. Preencher o `.env`

```bash
cp .env.example .env
```

Abra o `.env` e preencha:

| Variável | Obrigatória | O que é |
|---|---|---|
| `TRELLO_API_KEY` | sim | a "Key" do passo anterior |
| `TRELLO_TOKEN` | sim | o token do passo anterior |
| `QUADRO_NOME` | não | nome do quadro (já vem preenchido) |
| `TRELLO_WORKSPACE` | não | id/nome do Workspace. Vazio = espaço pessoal |
| `CONVITE_TIPO` | não | `normal` (padrão), `admin` ou `observer` |

### E-mail personalizado (opcional)

O convite do Trello **já dispara um e-mail automático** pra pessoa. As
variáveis SMTP servem só pra mandar um e-mail **adicional**, escrito por nós,
explicando o fluxo do quadro. Deixe em branco pra pular — o script funciona
normalmente sem elas.

| Variável | O que é |
|---|---|
| `SMTP_HOST` | ex: `smtp.gmail.com` |
| `SMTP_PORT` | `587` (padrão) ou `465` para SSL |
| `SMTP_USER` | o e-mail que envia |
| `SMTP_PASS` | a senha |
| `SMTP_FROM` | remetente exibido (vazio = usa o `SMTP_USER`) |

> **Gmail:** a senha normal **não funciona**. Gere uma *Senha de app* em
> <https://myaccount.google.com/apppasswords> (exige verificação em duas
> etapas ligada) e use ela no `SMTP_PASS`.

## 4. Preencher o `members.json`

```bash
cp members.example.json members.json
```

Uma lista de objetos, com **área exatamente** `Marketing`, `Gente` ou `Gestão`:

```json
[
  { "nome": "Ana Ribeiro", "email": "ana@empresa.com.br", "area": "Marketing" },
  { "nome": "Carla Menezes", "email": "carla@empresa.com.br", "area": "Gente" },
  { "nome": "Diego Farias", "email": "diego@empresa.com.br", "area": "Gestão" }
]
```

O script valida o arquivo inteiro **antes** de fazer qualquer chamada de rede
e lista todos os problemas de uma vez (e-mail inválido, área errada, nome
faltando, e-mail repetido). Nada é criado se houver erro.

## 5. Executar

Primeiro veja o que vai acontecer, sem alterar nada:

```bash
npm run dry-run
```

Depois, pra valer:

```bash
npm start
```

---

## O que o script faz

1. **Confere as credenciais** antes de qualquer escrita.
2. **Quadro** — procura pelo nome nos seus quadros; reutiliza se achar, cria
   se não achar. Criado com `defaultLists=false` e `defaultLabels=false` pra
   não vir com as listas "To Do/Doing/Done" e 6 etiquetas vazias que o Trello
   adiciona por padrão.
3. **Listas**, nesta ordem: `📥 Backlog / Ideias`, `📋 A Fazer`,
   `🔄 Em Progresso`, `👀 Em Revisão / Aprovação`, `✅ Concluído`,
   `🗄️ Arquivado`.
4. **Etiquetas:** Marketing (azul), Gente (verde), Gestão (amarelo),
   Urgente (vermelho), Bloqueado (preto).
5. **Cartão-modelo** no Backlog, com descrição de template e um checklist de
   5 itens.
6. **Convida cada pessoa** do `members.json` e, se o SMTP estiver
   configurado, manda o e-mail personalizado com o link e a explicação do
   fluxo.

Cada passo é registrado como **criado** (`+`), **já existia** (`·`) ou
**erro** (`✗`), e no fim sai um resumo.

## Como a idempotência funciona

| Recurso | Como evita duplicar |
|---|---|
| Quadro | busca por nome exato (ignorando maiúsculas e espaços extras) |
| Listas / Etiquetas | compara com as que já existem no quadro, cria só o que falta |
| Cartão-modelo | procura pelo nome dentro da lista Backlog |
| Convites | registro local `.estado-convites.json` + nome dos membros do quadro |

### Por que existe o `.estado-convites.json`

A API do Trello **não devolve o e-mail** dos membros de um quadro — é dado
privado. Então não dá pra perguntar "esta pessoa do meu `members.json` já
está no quadro?" só com o que a API entrega.

A solução cruza duas fontes: o **registro local** (quem este script já
convidou) e o **nome completo** dos membros atuais do quadro (pra pegar quem
foi convidado manualmente por fora).

Consequência prática: **se você apagar esse arquivo**, o script pode
reconvidar alguém que já é membro caso o nome no `members.json` esteja
escrito diferente do nome da conta Trello da pessoa. Não quebra nada no
Trello, mas a pessoa recebe um e-mail repetido. O arquivo está no
`.gitignore` porque é estado local, não código.

## Erros e limites

- **Limite de taxa:** o Trello permite 100 requisições / 10s por token. O
  script espaça as chamadas e, se levar `429`, espera e tenta de novo
  (até 4 tentativas, com espera crescente de 2s → 4s → 8s).
- **Erros transitórios** (`429`, `5xx`, queda de rede) são retentados.
- **Erros permanentes** (`401`, `403`, `404`) falham na hora com uma
  explicação do que fazer — retentar só perderia tempo.
- **Falha em uma pessoa não derruba o lote:** as outras continuam sendo
  convidadas, e o resumo final lista quem falhou. Rodar de novo tenta só
  quem faltou.
- **SMTP fora do ar não invalida o trabalho:** os convites do Trello já
  foram enviados; o script avisa e segue.

## Segurança

- Nenhuma credencial fica no código — tudo vem do `.env`.
- `.env`, `members.json` e `.estado-convites.json` estão no `.gitignore`.
- **Tokens e senhas nunca são impressos.** Todo log passa por uma função que
  substitui segredos conhecidos por `***` e também apaga qualquer
  `key=`/`token=`/`pass=` que apareça em URL de mensagem de erro.

## Resolvendo problemas

| Mensagem | O que fazer |
|---|---|
| `401 não autorizado` | Chave ou token errado/expirado. Gere de novo (passo 2). |
| `403 sem permissão` | O token não tem escopo de escrita, ou você não é admin do Workspace. |
| `members.json não encontrado` | Rode `cp members.example.json members.json`. |
| `área "X" inválida` | A área tem que ser exatamente `Marketing`, `Gente` ou `Gestão`. |
| SMTP falhando no Gmail | Use uma *Senha de app*, não a senha da conta. |

Pra ver o stack trace completo em qualquer erro:

```bash
DEBUG=1 npm start
```

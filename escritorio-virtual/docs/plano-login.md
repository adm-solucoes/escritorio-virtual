# Plano — Login do escritorio virtual

Escrito antes de implementar, no mesmo espirito do `plano-chat.md`.

## 1. Por que

Hoje qualquer pessoa com o link digita um nome e entra. Isso cria tres problemas:

1. **Ninguem e ninguem.** O nome nao prova nada: da pra entrar como "Caio" duas vezes.
2. **A identidade e do navegador, nao da pessoa.** O `uid` que nomeia as DMs mora no
   `localStorage`: trocou de computador, perdeu as conversas; limpou o navegador,
   virou outra pessoa.
3. **O `uid` vem do cliente.** Como o servidor confia no que a aba manda, uma aba
   maliciosa podia se dizer dona de outro uid e **ler as DMs de outra pessoa**. Esse
   e o furo mais serio e e o login que fecha ele.

Decisoes tomadas com o Caio antes de comecar:
- Cadastro **aberto, mas com codigo da sede** — a pessoa se cadastra sozinha, so
  precisa do codigo que a diretoria compartilha.
- **Sem entrada de visitante**: login obrigatorio.

## 2. O que muda de conceito

O `uid` deixa de ser "um id que o navegador inventou" e passa a ser **o id da conta**,
decidido pelo servidor. Todo o resto do chat continua igual — DM, historico e reacoes
ja andam por uid (ver `plano-chat.md`, secao 4). Ou seja: o login nao reescreve o
chat, so troca de onde vem a identidade.

| | Antes | Depois |
|---|---|---|
| Quem define o uid | o navegador (`localStorage`) | o servidor (a conta) |
| Onde mora o nome | `localStorage` | conta, no servidor |
| Onde mora o avatar | `localStorage` | conta, no servidor (segue voce em qualquer maquina) |
| Admin | codigo digitado na tela do avatar | flag da conta, dada no cadastro |
| Da pra forjar identidade? | **da** | nao: vem do cookie assinado |

## 3. Onde guarda

Continua **sem banco externo**, como o resto do projeto: um arquivo JSON no disco do
servidor, em `server/data/usuarios.json` (fora do git).

```
Usuario = {
  id,               // uuid, e o uid do chat
  email,            // como digitado
  emailChave,       // minusculo/trim, e por ele que a busca acontece
  nome,             // como aparece no cracha
  senhaHash, salt,  // scrypt
  isAdmin,
  appearance,       // null ate montar o avatar na primeira entrada
  criadoEm, ultimoAcesso
}
```

- Escrita **atomica** (grava num `.tmp` e renomeia) pra um desligamento no meio nao
  deixar o arquivo pela metade.
- `server/data/config.json` guarda o segredo de assinatura das sessoes, gerado na
  primeira execucao. Assim reiniciar o servidor **nao** desloga todo mundo.

O historico do chat continua so em memoria — persistir mensagem e outra conversa e
nao entra aqui.

## 4. Senha e sessao

- **Hash**: `crypto.scrypt` (vem no Node, sem dependencia nova), salt de 16 bytes por
  usuario, comparacao com `timingSafeEqual`. Senha nunca sai do servidor, nem em log.
- **Sessao**: cookie `adm_sessao`, `HttpOnly` + `SameSite=Lax` + `Path=/`, 30 dias.
  O valor e `base64(idDoUsuario.expiraEm).hmacSha256` assinado com o segredo — sem
  estado em memoria, entao sobrevive a restart.
- `Secure` ligado quando `NODE_ENV=production` (no Render/Railway o app fica em
  HTTPS). Em `localhost` fica desligado, senao o navegador descarta o cookie.
- **Freio de forca bruta**: por IP, 10 tentativas erradas em 15 min derrubam pro
  429. Simples, em memoria, o suficiente pra um app dessa escala.

## 5. Rotas

| Rota | Corpo | O que faz |
|---|---|---|
| `POST /api/registrar` | `{ nome, email, senha, codigo }` | valida o codigo da sede, cria a conta e ja loga |
| `POST /api/entrar` | `{ email, senha }` | confere e loga |
| `POST /api/sair` | — | limpa o cookie |
| `GET /api/eu` | — | quem esta logado (ou 401) |
| `PUT /api/perfil` | `{ nome?, appearance }` | salva o avatar na conta |

Erros voltam como `{ erro: "mensagem em pt-BR" }` e a tela mostra do jeito que veio.
Login errado responde sempre **a mesma** mensagem ("E-mail ou senha invalidos"),
sem dizer se o e-mail existe.

Variaveis de ambiente: `CODIGO_SEDE` (padrao `adm-solucoes`) e `ADMIN_CODE` (o que
ja existe, agora usado no cadastro pra marcar a conta como diretoria).

## 6. Socket

O `join` **deixa de aceitar** `uid`, `name` e `adminCode` do cliente. No handshake o
servidor le o cookie, valida a assinatura e carrega a conta; sem sessao valida, a
conexao cai na hora. Nome, uid e `isAdmin` do player passam a vir do arquivo de
usuarios. O cliente so continua mandando `appearance` (e ela e salva na conta).

## 7. Telas

Uma tela nova **antes** de tudo, no mesmo visual claro do resto:

```
┌───────────────────────────────┐
│  ADM Solucoes                 │
│  Escritorio virtual           │
│                               │
│  [ Entrar ] [ Criar conta ]   │  <- duas abas
│  e-mail                       │
│  senha                        │
│  (no cadastro: nome + codigo) │
│  [        Entrar         ]    │
│  mensagem de erro em vermelho │
└───────────────────────────────┘
```

Fluxo ao abrir a pagina:

1. `GET /api/eu`
2. 401 → **tela de login**
3. 200 sem `appearance` → **tela do avatar** (primeiro acesso)
4. 200 com `appearance` → **entra direto no escritorio**

O botao de sair do trilho passa a chamar `POST /api/sair` e voltar pro login (hoje
so recarrega a pagina). O campo "codigo da diretoria" sai da tela do avatar e vai
pro cadastro.

## 8. Como validar

- [x] Criar conta sem o codigo da sede → recusa.
- [x] Criar conta com o codigo → entra e cai na tela do avatar.
- [x] Recarregar → entra direto, sem pedir senha de novo.
- [x] Sair → volta pro login; recarregar continua no login.
- [x] Senha errada 11 vezes → 429.
- [x] Mesmo e-mail duas vezes → recusa.
- [x] Abrir em duas identidades e conferir que a DM continua funcionando e privada.
- [x] Forjar: mandar `join` com o uid de outra pessoa pelo console e conferir que o
      servidor ignora.
- [x] Trocar o avatar, recarregar e ver que ele voltou (agora vem da conta).

### Resultado

| Teste | O que aconteceu |
|---|---|
| Cadastro com codigo errado | 403 "Codigo da sede invalido. Peca pra diretoria." |
| Cadastro com codigo certo | entrou e caiu no editor de avatar, com o nome da conta ja preenchido |
| E-mail repetido | 409, e pega **sem diferenciar maiusculas** (`CAIO@` bate com `caio@`) |
| Senha curta / e-mail torto | 400 com a mensagem certa |
| F5 depois de logado | entra direto no escritorio, mesmo uid, avatar vindo da conta |
| Sair pelo menu do trilho | volta pro login e `/api/eu` passa a responder 401 |
| Logar de novo | **mesmo uid de antes** — a identidade e da conta, nao do navegador |
| `join` forjando `uid`, `name` e `adminCode` de outra pessoa | ignorado: voltou o uid e o nome da propria conta, `isAdmin: false` |
| Handshake do Socket.io sem cookie | recusado com `{"message":"sem-sessao"}` |
| DM de uma conversa alheia via `chat-historico` | servidor nao respondeu nada |
| Conta nova mandando DM e a outra logando depois | a mensagem estava la, com a pessoa offline na lista |
| 12 senhas erradas seguidas | 401 ate a decima, depois 429 — e a senha certa tambem trava na janela |

O teste de duas contas so vale em **navegadores diferentes**: duas abas do mesmo
navegador dividem o cookie, entao sao a mesma pessoa.

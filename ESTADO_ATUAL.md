# Estado atual do projeto — documento de continuidade

> Documento vivo. Quem assumir o trabalho (inclusive outra sessão do Claude) deve
> ler isto primeiro para saber **o que está feito, o que não está, e por quê**.
>
> Última atualização: 2026-07-27 · Sessão: mascote 3D no login (Etapa 1)
>
> Complementa o histórico anterior em `SESSAO_2026-07-26.md`, que cobre Instagram,
> IA nas automações, e-mail de relatório, avatares e correções de rolagem.

---

## 1. Onde o projeto está agora

CRM da ADM Soluções em `crm-adm/`, publicado em <https://crm-adm.vercel.app>.
Next.js 16.2.11 (App Router) · React 19.2.4 · Tailwind v4 · Supabase · Vercel.

**Tudo que estava em produção continua em produção.** O trabalho desta sessão
(mascote 3D) está isolado numa rota de prévia e **não** afeta o login real ainda.

---

## 2. O que foi feito nesta sessão

### 2.1 Tela de login voltou ao formulário simples

Antes do 3D, houve duas tentativas de mascote 2D que **não** deram certo:

1. **SVG desenhado à mão** — saiu deformado (sem olhos, proporções erradas,
   rabo solto). Causa raiz: foi desenhado sem nunca ver o resultado renderizado.
2. **Foto real da pelúcia + vídeo de intro** — o usuário achou ruim também.

Por decisão do usuário, o login foi **revertido ao formulário padrão**
(commit `4bb0384`). A lógica de autenticação (Supabase, cookie de "manter
conectado", recuperação de senha) nunca foi alterada em nenhuma das tentativas.

### 2.2 Mascote 3D — Etapa 1 (aguardando aprovação)

Plano completo de 12 etapas acordado com o usuário. **Etapa 1 entregue**, as
demais não começaram.

**Modelo escolhido:** Husky low-poly da Quaternius (CC0, uso comercial livre,
sem atribuição), baixado de <https://poly.pizza/m/wcWiuEqwzq> e salvo em
`crm-adm/public/models/dog.glb` (906 KB, 1.920 triângulos).

**Fatos medidos no arquivo — não presumidos** (isto economiza muito tempo de
quem continuar):

| Fato | Valor |
|---|---|
| Escala/orientação | raiz com `scale=100` e rotação −90° em X (Z-up → Y-up) |
| Dimensões no mundo | ~1,0 larg × 3,2 alt × 3,9 comp |
| Origem | pés em Y=0; focinho aponta pro **+Z** (de frente pra câmera padrão) |
| Texturas | **nenhuma** — 5 materiais de cor chapada (por isso dá pra recolorir por código) |
| Ossos | 49, incluindo 4 por orelha e 6 na cauda |
| Clipes | 12 únicos (duplicados com prefixo `AnimalArmature\|`) |

**Clipes disponíveis:** `Idle`, `Idle_2`, `Idle_2_HeadLow`, `Idle_HitReact_Left`,
`Idle_HitReact_Right`, `Walk`, `Gallop`, `Gallop_Jump`, `Jump_ToIdle`, `Attack`,
`Eating`, `Death`.

#### Duas armadilhas já resolvidas (não repita)

1. **O GLTFLoader remove o ponto dos nomes de osso.** No arquivo é `Ear1.L`; no
   three.js vira **`Ear1L`**. Usar o nome do arquivo faz `getObjectByName`
   devolver `undefined` e a orelha simplesmente não mexe — **sem erro nenhum**.
   Isso custou um bom tempo pra descobrir.
2. **Convenção de eixos do rig** (validada girando osso por osso e olhando o
   render): `rotation.z` = lateral (virar cabeça, abanar rabo, orelha caindo) ·
   `rotation.x` = inclinar (cima/baixo) · `rotation.y` = torcer.

#### Arquivos criados

```
crm-adm/public/models/dog.glb              modelo (CC0)
crm-adm/src/components/login3d/
  constants.ts     cores, nomes de osso, clipes, eixos, queda das orelhas
  DogModel.tsx     carrega o GLTF, recolore, roda Idle + camada aditiva
  DogCanvas.tsx    palco: luzes, sombra, câmera, fallback de WebGL
crm-adm/src/app/mascote/page.tsx           PÁGINA TEMPORÁRIA de prévia
```

**Como funciona a animação:** o clipe `Idle` escreve a pose base todo frame via
mixer; em seguida o `useFrame` do `DogModel` **soma** offsets por cima (orelha
caída, rabo, respiração, olhar ocioso, piscada). Usar `+=` é aditivo de verdade
porque o mixer reescreve a pose a cada frame — não acumula.

**Piscada:** o rig não tem osso de olho nem morph target, então "fechar o olho"
é pintar esclera e pupila da cor da pelagem por ~110 ms. Em modelo low-poly
isso lê como piscada. **Ainda não foi validado visualmente.**

---

## 3. O que NÃO foi feito, e por quê

### 3.1 Etapas 2 a 12 do mascote — não começaram

Aguardando aprovação da Etapa 1. Ordem acordada: olhar/cursor → intro
cinematográfica → formulário → senha em foco → login errado → login correto →
tela de sucesso → cumbuca → comer → interrupções → polimento.

### 3.2 Limitações do modelo que não têm solução por código

Foram acordadas com o usuário antes de começar:

- **Não é fotorrealista.** 1.920 triângulos, cor chapada. Fica um cachorro 3D
  estilizado bonito, não um Rhodesian Ridgeback fotorrealista. Só fecha essa
  lacuna com asset autorado (Blender ou Meshy AI gerando um `.glb` custom).
- **Sem mandíbula** (não há osso) — não dá pra abrir a boca.
- **Patas cobrindo os olhos: impossível.** Não há clipe e a anatomia quadrúpede
  não permite improvisar sem parecer quebrado. **Substituição já aprovada pelo
  usuário:** na Etapa 5, o cachorro **vira a cabeça e abaixa as orelhas**.
- **Olhos não seguem o cursor** (não há osso de olho). O rastreio da Etapa 2 é
  de **cabeça**, não de olhos.
- É um **husky**, não um Ridgeback — sem crista dorsal. Coleira e pingente, se
  quiserem, entram como primitivas 3D presas ao osso `Neck3`.

### 3.3 Verificação visual — a maior dificuldade desta sessão

**O ambiente de automação não compõe frames**: não sai screenshot e o
`ResizeObserver` nunca dispara, então o canvas do R3F fica travado em 300×150 e
nunca é medido. Isso foi o que fez as duas tentativas 2D anteriores falharem —
eu escrevia animação sem nunca ver o resultado.

**Solução encontrada (importante para as próximas etapas):** existe uma
ferramenta local em `crm-adm/public/_dbg/` (gitignored, nunca vai pro deploy)
que renderiza o **mesmo** modelo com as **mesmas** cores, luzes, câmera e ossos,
usando three.js puro, tamanho fixo e render manual. Com `preserveDrawingBuffer`
ligado dá pra fazer `canvas.toDataURL()` e enviar a imagem para um receptor
Node local, que grava em disco — e aí a imagem pode ser aberta e inspecionada.

```
# receptor (grava as capturas no scratchpad)
node <scratchpad>/receptor.js        # sobe em http://localhost:4599

# no navegador, dentro de /_dbg/mascote.html:
fetch("http://localhost:4599", { method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({ nome:"x.jpg", base64: window.__capturar(820) }) })
```

A página expõe `window.__raiz`, `__cena`, `__render()`, `__repouso` e
`__capturar()` justamente pra testar poses e capturar o resultado.

**O que foi validado visualmente:** recoloração (caramelo com dorso escuro,
patas claras, focinho escuro), enquadramento, sombra no chão, orelhas caídas e
giro de cabeça.

**O que ainda NÃO foi validado visualmente:** a animação em movimento
(respiração, abanar de rabo, piscada) e o componente React em si — só a página
de debug foi capturada. O `DogCanvas` real passou em lint, typecheck, build,
carrega o `.glb` (HTTP 200) e não gera erro de console, mas o canvas dele nunca
chegou a ser medido neste ambiente.

**Portanto: o usuário precisa olhar `/mascote` num navegador de verdade.**

---

## 4. Pendências herdadas da sessão anterior

- **Instagram**: código publicado, mas **não funciona** até cadastrarem na Vercel
  `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID` e
  `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, e configurarem o app no Meta for Developers.
  Confirmado: nenhuma das três está cadastrada.
- **WhatsApp**: o bloqueio de janela de 24h foi removido do CRM. A Meta continua
  aplicando a regra dela — o erro agora aparece na hora do envio. A solução real
  é criar um template em português e submeter pra aprovação.
- **6 automações com IA** estão semeadas como **rascunho** (não disparam nada).
- Migrations `025`–`029` já rodaram no Supabase (verificado direto no banco).

---

## 5. Como publicar

```bash
cd crm-adm
npx eslint <arquivos alterados>
npx tsc --noEmit
npm run build
npx vercel --prod
```

Commitar antes de publicar. **Este repo não tem remoto** — o deploy é direto
pela Vercel CLI, `git push` não existe aqui.

---

## 6. Regras de trabalho combinadas com o usuário

- Entregar **uma etapa por vez** e **esperar validação** antes da seguinte.
- Ao fim de cada etapa: resumo do que mudou, migrations necessárias e o que
  testar manualmente.
- Nenhuma automação nova manda dado pra fora (e-mail, WhatsApp, notificação) sem
  o usuário confirmar o comportamento antes.
- Saída de IA voltada ao cliente é **sempre rascunho**, nunca envio direto.
- Se algo exigir decisão de produto, **perguntar** em vez de assumir.
- **O 3D nunca pode impedir alguém de entrar no CRM**: se o WebGL falhar, cai no
  formulário limpo (já implementado em `DogCanvas` com detecção + error boundary).
- Manter este documento atualizado a cada mudança relevante.

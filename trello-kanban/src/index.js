import { carregarConfig, ErroDeConfiguracao } from "./config.js";
import { ClienteTrello } from "./trello.js";
import { garantirQuadro, garantirListas, garantirEtiquetas, garantirCartaoModelo, LISTAS } from "./quadro.js";
import { garantirMembros } from "./membros.js";
import { enviarEmails } from "./email.js";
import { log } from "./log.js";

async function principal() {
  const config = carregarConfig();

  log.info("");
  log.info("═══ Configuração do quadro Kanban no Trello ═══");
  if (config.dryRun) {
    log.aviso("MODO DRY-RUN: nada será criado, convidado ou enviado. Só mostra o que aconteceria.");
  }

  const cliente = new ClienteTrello({ ...config.trello, dryRun: config.dryRun });

  // 0. Credenciais antes de tudo — melhor falhar aqui do que no meio.
  log.passo("Verificando credenciais");
  const eu = await cliente.verificarCredenciais();
  log.ok(`autenticado como ${eu.fullName} (@${eu.username})`);

  // 1. Quadro
  log.passo("Quadro");
  const quadro = await garantirQuadro(cliente, { nome: config.quadroNome, workspace: config.workspace });
  const quadroUrl = quadro.url || quadro.shortUrl || "(url disponível após a criação real)";
  log.info(`   ${quadroUrl}`);

  // 2. Listas
  log.passo(`Listas (${LISTAS.length})`);
  const listas = await garantirListas(cliente, quadro.id);

  // 3. Etiquetas
  log.passo("Etiquetas");
  await garantirEtiquetas(cliente, quadro.id);

  // 4. Cartão-modelo
  log.passo("Cartão-modelo");
  await garantirCartaoModelo(cliente, {
    listaBacklogId: listas[LISTAS[0]],
    quadroId: quadro.id,
  });

  // 5. Membros
  log.passo(`Membros (${config.membros.length})`);
  const resultados = await garantirMembros(cliente, {
    quadroId: quadro.id,
    quadroUrl,
    membros: config.membros,
    tipoConvite: config.tipoConvite,
    dryRun: config.dryRun,
  });

  // 6. E-mail personalizado (opcional) — só pra quem foi convidado agora.
  log.passo("E-mail personalizado");
  let comEmail = [];
  if (config.smtp.avisoIncompleto) {
    log.aviso(config.smtp.avisoIncompleto);
  } else if (!config.smtp.ativo) {
    log.pulado("SMTP não configurado — só o convite automático do Trello foi enviado");
  } else {
    const novos = resultados.filter((r) => r.situacao === "convidado");
    comEmail = await enviarEmails({
      smtp: config.smtp,
      destinatarios: novos,
      quadroNome: quadro.name || config.quadroNome,
      quadroUrl,
      dryRun: config.dryRun,
    });
  }

  imprimirResumo({ quadro, quadroUrl, resultados, comEmail, chamadas: cliente.chamadas, dryRun: config.dryRun });
}

function imprimirResumo({ quadro, quadroUrl, resultados, comEmail, chamadas, dryRun }) {
  const conta = (s) => resultados.filter((r) => r.situacao === s).length;
  const emailsOk = comEmail.filter((r) => r.emailPersonalizado).length;
  const erros = resultados.filter((r) => r.situacao === "erro");

  log.info("");
  log.info("═══ Resumo ═══");
  const situacaoQuadro = quadro.jaExistia ? "reutilizado" : dryRun ? "seria criado" : "criado agora";
  log.info(`Quadro       : ${quadro.name || quadro.__nomePretendido || "(sem nome)"} (${situacaoQuadro})`);
  log.info(`Link         : ${quadroUrl}`);
  log.info(`Convidados   : ${conta("convidado")}`);
  log.info(`Já eram membro: ${conta("ja_membro") + conta("ja_convidado")}`);
  if (emailsOk) log.info(`E-mails extras: ${emailsOk}`);
  if (erros.length) log.info(`Falhas       : ${erros.length}`);
  log.info(`Chamadas API : ${chamadas}`);

  if (erros.length) {
    log.info("");
    log.aviso("Pessoas que falharam (rode de novo — o script não repete quem já deu certo):");
    for (const e of erros) log.info(`   - ${e.nome} <${e.email}>: ${e.erro}`);
  }

  if (dryRun) {
    log.info("");
    log.aviso("Isto foi um dry-run. Rode sem --dry-run para valer.");
  }
}

principal().catch((err) => {
  log.info("");
  if (err instanceof ErroDeConfiguracao) {
    log.erro(`Configuração incompleta:\n   ${err.message}`);
    log.info("\nVeja o README.md para o passo a passo.");
  } else {
    log.erro(err.message);
    if (process.env.DEBUG) console.error(err);
    else log.info("\n(rode com DEBUG=1 para ver o stack trace completo)");
  }
  process.exitCode = 1;
});

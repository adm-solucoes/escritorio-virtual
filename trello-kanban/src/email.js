import nodemailer from "nodemailer";
import { log } from "./log.js";

/** Explicação curta do fluxo, por área. Duas linhas, como pedido — o objetivo
 * é a pessoa entender o que fazer sem abrir manual nenhum. */
const EXPLICACAO_FLUXO =
  "O Kanban funciona da esquerda pra direita: toda demanda entra no <strong>Backlog</strong> e vai andando " +
  "pelas colunas até <strong>Concluído</strong>. Puxe um cartão pra <strong>Em Progresso</strong> só quando " +
  "for realmente começar — assim o quadro mostra a situação real do time, e não uma lista de intenções.";

function montarHtml({ nome, area, quadroNome, quadroUrl }) {
  const primeiroNome = nome.split(" ")[0];
  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(9,30,66,.13);">
        <tr>
          <td style="padding:28px 32px 8px;">
            <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5e6c84;">${area}</p>
            <h1 style="margin:0;font-size:21px;line-height:1.3;color:#172b4d;">Você foi adicionado ao quadro do time</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 0;">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#42526e;">
              Oi, ${primeiroNome}! Você agora tem acesso ao <strong>${quadroNome}</strong>,
              o quadro onde o time de ${area} acompanha as demandas.
            </p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#42526e;">${EXPLICACAO_FLUXO}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 8px;">
            <a href="${quadroUrl}" style="display:inline-block;background:#0052cc;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:6px;">Abrir o quadro</a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 28px;">
            <p style="margin:0;font-size:13px;line-height:1.5;color:#7a869a;">
              Você também recebeu um convite automático do Trello. Se ainda não tem conta,
              use o mesmo e-mail deste convite ao criar a sua.
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#7a869a;">Enviado automaticamente na configuração do quadro.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function montarTexto({ nome, area, quadroNome, quadroUrl }) {
  const primeiroNome = nome.split(" ")[0];
  return [
    `Oi, ${primeiroNome}!`,
    "",
    `Você foi adicionado ao "${quadroNome}", o quadro onde o time de ${area} acompanha as demandas.`,
    "",
    "O Kanban funciona da esquerda pra direita: toda demanda entra no Backlog e vai andando pelas",
    "colunas até Concluído. Puxe um cartão pra Em Progresso só quando for realmente começar — assim",
    "o quadro mostra a situação real do time, e não uma lista de intenções.",
    "",
    `Abrir o quadro: ${quadroUrl}`,
    "",
    "Você também recebeu um convite automático do Trello. Se ainda não tem conta, use o mesmo",
    "e-mail deste convite ao criar a sua.",
  ].join("\n");
}

/**
 * Envia o e-mail personalizado (além do convite automático do Trello).
 * Só recebe as pessoas que foram convidadas AGORA — quem já era membro não
 * leva e-mail repetido.
 */
export async function enviarEmails({ smtp, destinatarios, quadroNome, quadroUrl, dryRun }) {
  if (!destinatarios.length) {
    log.info("   nenhum e-mail personalizado a enviar (ninguém novo foi convidado)");
    return [];
  }

  if (dryRun) {
    for (const p of destinatarios) log.info(`   [dry-run] e-mail iria para ${p.nome} <${p.email}>`);
    return destinatarios.map((p) => ({ ...p, emailPersonalizado: false }));
  }

  const transporte = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.porta,
    // 465 é SSL implícito; as demais (587/25) usam STARTTLS.
    secure: smtp.porta === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  try {
    await transporte.verify();
    log.ok(`SMTP conectado (${smtp.host}:${smtp.porta})`);
  } catch (err) {
    // Falhar aqui NÃO invalida o trabalho: os convites do Trello já saíram e
    // o e-mail nativo dele já foi entregue. Avisa e segue.
    log.erro(`SMTP indisponível — e-mails personalizados não serão enviados: ${err.message}`);
    log.info("   (os convites do Trello já foram enviados normalmente)");
    return destinatarios.map((p) => ({ ...p, emailPersonalizado: false }));
  }

  const resultados = [];
  for (const pessoa of destinatarios) {
    const dados = { nome: pessoa.nome, area: pessoa.area, quadroNome, quadroUrl };
    try {
      await transporte.sendMail({
        from: smtp.from,
        to: pessoa.email,
        subject: `Você entrou no quadro ${quadroNome}`,
        text: montarTexto(dados),
        html: montarHtml(dados),
      });
      log.criado(`e-mail enviado para ${pessoa.nome}`);
      resultados.push({ ...pessoa, emailPersonalizado: true });
    } catch (err) {
      log.erro(`falha ao enviar e-mail para ${pessoa.nome}: ${err.message}`);
      resultados.push({ ...pessoa, emailPersonalizado: false, erroEmail: err.message });
    }
  }

  transporte.close();
  return resultados;
}

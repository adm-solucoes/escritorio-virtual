import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { log } from "./log.js";
import { RAIZ } from "./config.js";

const ARQUIVO_ESTADO = path.join(RAIZ, ".estado-convites.json");

/**
 * POR QUE EXISTE UM ARQUIVO DE ESTADO LOCAL
 *
 * O ideal seria perguntar ao Trello "esta pessoa já está no quadro?" usando o
 * e-mail. Só que a API NÃO devolve o e-mail dos membros de um quadro — é
 * dado privado, `GET /boards/{id}/members` traz id, username e fullName, mas
 * não e-mail. Então não dá pra casar `members.json` com os membros atuais só
 * pelo que a API entrega.
 *
 * A saída é cruzar duas fontes, nesta ordem:
 *   1. o registro local (quem este script já convidou) — exato e confiável;
 *   2. o nome completo dos membros do quadro — pega quem entrou por fora,
 *      convidado manualmente por alguém.
 *
 * Reconvidar quem já é membro não quebra nada no Trello (a chamada é
 * idempotente do lado deles), mas dispararia e-mail repetido pra pessoa —
 * que é justamente o que queremos evitar.
 */
function lerEstado() {
  if (!existsSync(ARQUIVO_ESTADO)) return { convidados: {} };
  try {
    const dados = JSON.parse(readFileSync(ARQUIVO_ESTADO, "utf8"));
    return { convidados: dados.convidados ?? {} };
  } catch (err) {
    log.aviso(`.estado-convites.json ilegível (${err.message}) — tratando como vazio`);
    return { convidados: {} };
  }
}

function gravarEstado(estado) {
  writeFileSync(ARQUIVO_ESTADO, JSON.stringify(estado, null, 2), "utf8");
}

/** Normaliza nome pra comparação: sem acento, minúsculo, espaços colapsados. */
function chaveNome(nome) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Convida cada pessoa do members.json, pulando quem já está no quadro.
 * Retorna o que aconteceu com cada uma, pro resumo final e pro e-mail.
 */
export async function garantirMembros(cliente, { quadroId, quadroUrl, membros, tipoConvite, dryRun }) {
  const estado = lerEstado();
  const jaConvidados = estado.convidados[quadroId] ?? {};

  const membrosAtuais =
    (await cliente.get(`/boards/${quadroId}/members`, { fields: "id,username,fullName" })) || [];
  const nomesNoQuadro = new Set(membrosAtuais.map((m) => chaveNome(m.fullName || m.username || "")));

  log.info(`   ${membrosAtuais.length} pessoa(s) já no quadro · ${membros.length} na sua lista`);

  const resultados = [];

  for (const pessoa of membros) {
    const registro = jaConvidados[pessoa.email];
    const pareceNoQuadro = nomesNoQuadro.has(chaveNome(pessoa.nome));

    if (registro) {
      log.pulado(`${pessoa.nome} — já convidado em ${new Date(registro.em).toLocaleDateString("pt-BR")}`);
      resultados.push({ ...pessoa, situacao: "ja_convidado", emailPersonalizado: false });
      continue;
    }

    if (pareceNoQuadro) {
      log.pulado(`${pessoa.nome} — já é membro do quadro (entrou por fora)`);
      // Registra pra não precisar recorrer ao nome de novo na próxima rodada.
      jaConvidados[pessoa.email] = { em: new Date().toISOString(), origem: "ja_era_membro" };
      resultados.push({ ...pessoa, situacao: "ja_membro", emailPersonalizado: false });
      continue;
    }

    try {
      await cliente.put(
        `/boards/${quadroId}/members`,
        { email: pessoa.email, type: tipoConvite },
        { descricao: `convidar ${pessoa.nome}` }
      );
      log.criado(
        dryRun
          ? `${pessoa.nome} (${pessoa.area}) SERIA convidado`
          : `${pessoa.nome} (${pessoa.area}) convidado — o Trello já mandou o e-mail automático`
      );
      if (!dryRun) jaConvidados[pessoa.email] = { em: new Date().toISOString(), origem: "convite" };
      resultados.push({ ...pessoa, situacao: "convidado", emailPersonalizado: false });
    } catch (err) {
      // Uma falha individual não pode derrubar o lote — as outras pessoas
      // ainda precisam ser convidadas.
      log.erro(`${pessoa.nome}: falha ao convidar — ${err.message}`);
      resultados.push({ ...pessoa, situacao: "erro", erro: err.message, emailPersonalizado: false });
    }
  }

  if (!dryRun) {
    estado.convidados[quadroId] = jaConvidados;
    gravarEstado(estado);
  }

  return resultados;
}

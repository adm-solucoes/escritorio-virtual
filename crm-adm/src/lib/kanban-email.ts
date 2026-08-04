/** Templates dos e-mails do Kanban. Só montam HTML — quem envia é a rota. */

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://crm-adm.vercel.app";

function moldura(conteudo: string, rodape?: string) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#150638">
      <div style="background:#150638;padding:16px 20px;border-radius:10px 10px 0 0">
        <span style="color:#fbf3e7;font-weight:800;font-size:16px">ADM Soluções</span>
      </div>
      <div style="border:1px solid #eee;border-top:0;border-radius:0 0 10px 10px;padding:24px">
        ${conteudo}
        ${
          rodape ??
          `<p style="font-size:12px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:14px">
             Você recebeu este aviso porque está no quadro Kanban do CRM.
           </p>`
        }
      </div>
    </div>`;
}

function botao(texto: string, url: string) {
  return `<p style="text-align:center;margin:26px 0">
    <a href="${url}" style="background:#c81e1e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block">${texto}</a>
  </p>`;
}

function formatarData(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

/** Alguém foi colocado como responsável por um cartão. */
export function emailAtribuicao(dados: {
  nomeDestinatario: string;
  quemAtribuiu: string;
  tituloCartao: string;
  nomeQuadro: string;
  nomeLista: string;
  prazo: string | null;
  descricao: string | null;
}) {
  const prazo = formatarData(dados.prazo);
  return {
    assunto: `${dados.quemAtribuiu} colocou você em "${dados.tituloCartao}"`,
    html: moldura(`
      <p style="font-size:14px;color:#333;margin-top:0">
        Oi, ${dados.nomeDestinatario.split(" ")[0]}! <strong>${dados.quemAtribuiu}</strong> colocou você como
        responsável por um cartão no quadro <strong>${dados.nomeQuadro}</strong>.
      </p>
      <div style="background:#f5f6fa;border-radius:8px;padding:16px;margin:18px 0">
        <p style="font-size:16px;font-weight:700;margin:0 0 6px">${dados.tituloCartao}</p>
        <p style="font-size:13px;color:#666;margin:0">Coluna: ${dados.nomeLista}</p>
        ${prazo ? `<p style="font-size:13px;color:#c81e1e;margin:8px 0 0"><strong>Prazo:</strong> ${prazo}</p>` : ""}
        ${
          dados.descricao
            ? `<p style="font-size:13px;color:#444;margin:12px 0 0;white-space:pre-wrap">${dados.descricao.slice(0, 300)}</p>`
            : ""
        }
      </div>
      ${botao("Abrir o quadro", `${BASE}/kanban`)}
    `),
  };
}

/** Comentaram num cartão do qual a pessoa é responsável. */
export function emailComentario(dados: {
  nomeDestinatario: string;
  quemComentou: string;
  tituloCartao: string;
  nomeQuadro: string;
  texto: string;
}) {
  return {
    assunto: `${dados.quemComentou} comentou em "${dados.tituloCartao}"`,
    html: moldura(`
      <p style="font-size:14px;color:#333;margin-top:0">
        Oi, ${dados.nomeDestinatario.split(" ")[0]}! <strong>${dados.quemComentou}</strong> comentou num cartão
        pelo qual você é responsável, no quadro <strong>${dados.nomeQuadro}</strong>.
      </p>
      <div style="background:#f5f6fa;border-radius:8px;padding:16px;margin:18px 0">
        <p style="font-size:15px;font-weight:700;margin:0 0 10px">${dados.tituloCartao}</p>
        <p style="font-size:14px;color:#333;margin:0;white-space:pre-wrap;border-left:3px solid #c81e1e;padding-left:12px">${dados.texto.slice(0, 500)}</p>
      </div>
      ${botao("Responder no quadro", `${BASE}/kanban`)}
    `),
  };
}

/** Resumo diário de prazos — um e-mail por pessoa, com todos os cartões dela. */
export function emailPrazos(dados: {
  nomeDestinatario: string;
  vencidos: { titulo: string; quadro: string; prazo: string }[];
  vencemHoje: { titulo: string; quadro: string }[];
}) {
  const { vencidos, vencemHoje } = dados;

  const listaVencidos = vencidos.length
    ? `<p style="font-size:13px;font-weight:700;color:#c81e1e;margin:18px 0 8px">Prazo vencido</p>
       ${vencidos
         .map(
           (c) => `<div style="background:#fdeaea;border-radius:6px;padding:10px 12px;margin-bottom:6px">
             <span style="font-size:14px;font-weight:600">${c.titulo}</span><br>
             <span style="font-size:12px;color:#666">${c.quadro} · venceu em ${formatarData(c.prazo)}</span>
           </div>`
         )
         .join("")}`
    : "";

  const listaHoje = vencemHoje.length
    ? `<p style="font-size:13px;font-weight:700;color:#a15c00;margin:18px 0 8px">Vence hoje</p>
       ${vencemHoje
         .map(
           (c) => `<div style="background:#fdf1dc;border-radius:6px;padding:10px 12px;margin-bottom:6px">
             <span style="font-size:14px;font-weight:600">${c.titulo}</span><br>
             <span style="font-size:12px;color:#666">${c.quadro}</span>
           </div>`
         )
         .join("")}`
    : "";

  const total = vencidos.length + vencemHoje.length;
  return {
    assunto: `${total} ${total === 1 ? "cartão precisa" : "cartões precisam"} da sua atenção hoje`,
    html: moldura(`
      <p style="font-size:14px;color:#333;margin-top:0">
        Oi, ${dados.nomeDestinatario.split(" ")[0]}! Passando pra lembrar dos prazos dos seus cartões.
      </p>
      ${listaVencidos}
      ${listaHoje}
      ${botao("Ver meus cartões", `${BASE}/kanban`)}
    `),
  };
}

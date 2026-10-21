// Gera Diagnostico-Branding-CJB.pptx (ADM Soluções). Animações são adicionadas depois por animar.py
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");
const React = require("react");
const RDS = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
const NOTAS = require("./notas.js");
const SKILL = process.env.PPTX_SKILL;
const { applyTheme } = require(path.join(SKILL, "scripts/apply_theme.js"));

// ---- paleta oficial ADM Soluções (não criar novas cores institucionais) ----
const ROXO = "2A087D", ROXO_ESC = "11003A", ROXO2 = "29077A", ROXO_PROF = "0F014B", PRETO = "0A0429";
const VERM = "CD171B", VERM_ESC = "BD0200";
// neutros apenas para legibilidade
const BRANCO = "FFFFFF", CINZA_BG = "F3F3F6", CINZA_LN = "DAD7E5", CINZA_TX = "5F5B73", LAV = "DAD7E5";

const THEME = {
  name: "ADM Soluções",
  headFontFace: "DM Sans",
  bodyFontFace: "Inter",
  colors: {
    dk1: PRETO, lt1: BRANCO, dk2: ROXO_ESC, lt2: CINZA_BG,
    accent1: ROXO, accent2: VERM, accent3: ROXO_PROF, accent4: VERM_ESC, accent5: ROXO2, accent6: ROXO_ESC,
    hlink: ROXO, folHlink: ROXO2,
  },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.author = "ADM Soluções";
pres.company = "ADM Soluções";
pres.title = "Diagnóstico de Branding — Colégio João Batista";
const S = pres.shapes;

["Capa","Abertura","Contexto e método","Pesquisa com as famílias","Canais digitais","Cenário competitivo","Conversa com a direção","Próximos passos","Encerramento"].forEach((t) => pres.addSection({ title: t }));
const FOOT = "ADM Soluções · Diagnóstico de Branding · Colégio João Batista · Material preliminar";
pres.defineSlideMaster({
  title: "CAPA",
  background: { color: ROXO_ESC },
  objects: [],
});
pres.defineSlideMaster({
  title: "CONTEUDO",
  background: { color: BRANCO },
  objects: [
    { text: { text: FOOT, options: { x: 0.6, y: 7.04, w: 9, h: 0.28, fontSize: 10, color: CINZA_TX, fontFace: "Inter", margin: 0 } } },
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.72, w: 12.1, h: 0.62, fontSize: 28, bold: true, fontFace: "DM Sans", color: ROXO_ESC, valign: "top", align: "left", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: 12.1, y: 7.04, w: 0.63, h: 0.28, fontSize: 10, color: CINZA_TX, fontFace: "Inter", align: "right" },
});
pres.defineSlideMaster({
  title: "ESCURO",
  background: { color: ROXO_ESC },
  objects: [],
});

// ---- helpers ----
const T = (text, o = {}) => ({ text, options: { fontFace: "Inter", fontSize: 14, color: PRETO, ...o } });
// lista de parágrafos [text, opts]; quebra de linha entre eles
function P(items) {
  return items.map((it, i) => {
    const [text, o] = Array.isArray(it) ? it : [it, {}];
    return T(text, { ...o, breakLine: i < items.length - 1 });
  });
}
const nm = (g, k, label) => `a${g}${k}_${label}`;

function base(slide, kicker, title, n) {
  slide.addText(kicker.toUpperCase(), { x: 0.6, y: 0.36, w: 9, h: 0.28, fontSize: 11, bold: true, color: VERM, fontFace: "Inter", charSpacing: 2, margin: 0, isTextBox: true, objectName: "Kicker" });
  slide.addText(title, { placeholder: "title", align: "left", objectName: "Titulo" });
  slide.addNotes(notaTxt(n));
}
function notaTxt(n) {
  const x = NOTAS[n - 1];
  return [
    `SLIDE ${n} — ${x.titulo}`,
    ``,
    `1. OBJETIVO\n${x.objetivo}`,
    `2. EXPLICAÇÃO\n${x.explicacao}`,
    `3. FALA SUGERIDA\n${x.fala}`,
    `4. TRANSIÇÃO\n${x.transicao}`,
    `5. PERGUNTA ESTRATÉGICA\n${x.pergunta}`,
    `6. CUIDADOS\n${x.cuidados}`,
  ].join("\n\n");
}

function card(s, o) {
  const { x, y, w, h, g, k = "f", label, fill = BRANCO, line = CINZA_LN, runs, valign = "top", shadow = true, dash } = o;
  const m0 = o.margin === undefined ? 12 : o.margin;
  const margin = Array.isArray(m0) ? [m0[3], m0[1], m0[2], m0[0]] : m0; // entrada [topo, dir, base, esq] -> pptxgenjs [esq, dir, base, topo]
  s.addText(runs || [T("")], {
    shape: S.ROUNDED_RECTANGLE, rectRadius: 0.07, x, y, w, h,
    fill: { color: fill }, line: { color: line, width: o.lw || 1, dashType: dash || "solid" },
    valign, margin, isTextBox: true, objectName: nm(g, k, label),
    shadow: shadow ? { type: "outer", color: "000000", opacity: 0.1, blur: 6, offset: 2, angle: 90 } : undefined,
  });
}
const CHIP = {
  "Realizado": { fill: ROXO, color: BRANCO, line: ROXO },
  "Em andamento": { fill: BRANCO, color: ROXO, line: ROXO },
  "Observado": { fill: ROXO_PROF, color: BRANCO, line: ROXO_PROF },
  "Hipótese": { fill: BRANCO, color: ROXO, line: ROXO, dash: "dash" },
  "Pendente": { fill: VERM, color: BRANCO, line: VERM },
  "Recomendação": { fill: PRETO, color: BRANCO, line: PRETO },
  "Não medido": { fill: VERM, color: BRANCO, line: VERM },
  "Não aplicada": { fill: VERM, color: BRANCO, line: VERM },
};
function chip(s, type, x, y, g, o = {}) {
  const st = CHIP[type];
  const w = o.w || (0.26 + type.length * 0.092);
  s.addText(o.text || type, {
    shape: S.ROUNDED_RECTANGLE, rectRadius: 0.15, x, y, w, h: o.h || 0.3,
    fill: { color: o.fill || st.fill }, line: { color: o.line || st.line, width: 1.25, dashType: st.dash || "solid" },
    color: o.color || st.color, fontFace: "Inter", fontSize: o.fs || 11, bold: true, align: "center", valign: "middle", margin: 0,
    isTextBox: true, objectName: nm(g, "f", "Chip-" + type.replace(/\s/g, "")),
  });
  return w;
}
function num(s, n, x, y, g, o = {}) {
  const d = o.d || 0.46;
  s.addText(String(n), {
    shape: S.OVAL, x, y, w: d, h: d, fill: { color: o.fill || ROXO }, line: { color: o.fill || ROXO, width: 0.5 },
    color: o.color || BRANCO, fontFace: "DM Sans", fontSize: o.fs || 16, bold: true, align: "center", valign: "middle", margin: 0,
    isTextBox: true, objectName: nm(g, "f", "Num" + n),
  });
}
async function icon(Comp, color, size = 256) {
  const svg = RDS.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
function iconBadge(s, data, x, y, g, o = {}) {
  const d = o.d || 0.62;
  s.addShape(S.OVAL, { x, y, w: d, h: d, fill: { color: o.fill || ROXO }, line: { color: o.fill || ROXO, width: 0.5 }, objectName: nm(g, "f", "IcoFundo") });
  s.addImage({ data, x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52, objectName: nm(g, "f", "Ico"), altText: o.alt || "ícone" });
}
// espaço reservado para logo (não redesenhamos logos)
function logoSlot(s, txt, x, y, w, h, dark = true, g = 1) {
  s.addText(txt, {
    shape: S.ROUNDED_RECTANGLE, rectRadius: 0.06, x, y, w, h, fill: { type: "none" },
    line: { color: dark ? LAV : CINZA_TX, width: 1, dashType: "dash" },
    color: dark ? LAV : CINZA_TX, fontFace: "Inter", fontSize: 11, align: "center", valign: "middle", margin: 4, isTextBox: true,
    objectName: nm(g, "f", "LogoPlaceholder"),
  });
}

// logos oficiais (arquivos enviados pela equipe; não redesenhados)
const LOGO_ADM = "image/png;base64," + fs.readFileSync(path.join(__dirname, "assets/adm-solucoes-logo.png")).toString("base64");
const LOGO_CJB = "image/png;base64," + fs.readFileSync(path.join(__dirname, "assets/cjb-logo-horizontal.png")).toString("base64");
const CJB_RATIO = 1280 / 262;
// ADM: ícone quadrado com fundo roxo próprio; CJB: logo em azul sobre placa branca para manter contraste no fundo escuro
function logos(s, x, y, h, g) {
  s.addImage({ data: LOGO_ADM, x, y, w: h, h, altText: "Logo ADM Soluções", objectName: nm(g, "f", "LogoADM") });
  const pad = 0.16, lh = h - 2 * pad, lw = lh * CJB_RATIO, px = x + h + 0.2;
  s.addShape(S.ROUNDED_RECTANGLE, { x: px, y, w: lw + 2 * pad + 0.1, h, rectRadius: 0.08, fill: { color: BRANCO }, line: { color: BRANCO, width: 0.5 }, objectName: nm(g, "f", "PlacaCJB") });
  s.addImage({ data: LOGO_CJB, x: px + pad + 0.05, y: y + pad, w: lw, h: lh, altText: "Logo Colégio João Batista", objectName: nm(g, "f", "LogoCJB") });
  return px + lw + 2 * pad + 0.1; // borda direita
}

(async () => {
  const ico = {
    insta: await icon(fa.FaInstagram, BRANCO), face: await icon(fa.FaFacebookF, BRANCO), whats: await icon(fa.FaWhatsapp, BRANCO),
    link: await icon(fa.FaLink, BRANCO), star: await icon(fa.FaRegStar, BRANCO), users: await icon(fa.FaUsers, BRANCO),
  };

  // ================= 1. CAPA =================
  {
    const s = pres.addSlide({ masterName: "CAPA", sectionTitle: "Capa" });
    s.addNotes(notaTxt(1));
    s.addShape(S.OVAL, { x: 8.6, y: -1.4, w: 7.4, h: 7.4, fill: { color: ROXO2 }, line: { color: ROXO2, width: 0.5 }, objectName: nm(1, "f", "CirculoGrande") });
    s.addShape(S.OVAL, { x: 10.4, y: 3.7, w: 4.6, h: 4.6, fill: { color: ROXO }, line: { color: ROXO, width: 0.5 }, objectName: nm(2, "f", "CirculoMedio") });
    s.addShape(S.OVAL, { x: 9.55, y: 5.25, w: 0.42, h: 0.42, fill: { color: VERM }, line: { color: VERM, width: 0.5 }, objectName: nm(3, "f", "PontoVermelho") });
    logos(s, 0.8, 0.6, 0.85, 1);
    s.addText("ADM SOLUÇÕES · EMPRESA JÚNIOR DA UECE", { x: 0.8, y: 2.35, w: 7.4, h: 0.3, fontSize: 12, bold: true, color: LAV, fontFace: "Inter", charSpacing: 2, margin: 0, isTextBox: true, objectName: nm(2, "f", "Kicker") });
    s.addText("Diagnóstico\nde Branding", { x: 0.8, y: 2.75, w: 7.6, h: 1.9, fontSize: 46, bold: true, color: BRANCO, fontFace: "Lovelo", margin: 0, valign: "top", isTextBox: true, objectName: nm(2, "f", "Titulo") });
    s.addText("Colégio João Batista · Messejana, Fortaleza-CE", { x: 0.8, y: 4.75, w: 7.6, h: 0.4, fontSize: 20, bold: true, color: BRANCO, fontFace: "DM Sans", margin: 0, isTextBox: true, objectName: nm(3, "f", "Subtitulo") });
    s.addText("Andamento inicial do projeto e reunião estratégica com a direção", { x: 0.8, y: 5.2, w: 7.6, h: 0.35, fontSize: 15, color: LAV, fontFace: "Inter", margin: 0, isTextBox: true, objectName: nm(3, "f", "Descricao") });
    chip(s, "Hipótese", 0.8, 6.15, 4, { text: "Material preliminar · versão de trabalho · out/2026", w: 4.7, fill: ROXO_ESC, color: BRANCO, line: LAV, fs: 11 });
  }

  // ================= 2. OBJETIVO E PAUTA =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Abertura" });
    base(s, "Abertura", "O que vamos fazer juntos nesta reunião", 2);
    const goals = [
      ["Mostrar o caminho", "O que a equipe está investigando e por que cada análise importa para a marca."],
      ["Validar o que vimos", "Observações preliminares sobre canais digitais e concorrentes, para a direção corrigir ou aprofundar."],
      ["Ouvir a direção", "Objetivos, diferenciais, público e dados que só quem vive o colégio conhece."],
    ];
    goals.forEach((gl, i) => {
      const y = 1.75 + i * 1.5;
      num(s, i + 1, 0.6, y + 0.2, 1);
      card(s, { x: 1.25, y, w: 5.4, h: 1.3, g: 1, label: "Objetivo" + (i + 1), margin: 14, valign: "middle",
        runs: P([[gl[0], { bold: true, fontSize: 18, fontFace: "DM Sans", color: ROXO_ESC, paraSpaceAfter: 4 }], [gl[1], { fontSize: 14, color: PRETO }]]) });
    });
    s.addText("Pauta", { x: 7.3, y: 1.75, w: 5.4, h: 0.4, fontSize: 20, bold: true, fontFace: "DM Sans", color: ROXO_ESC, margin: 0, isTextBox: true, objectName: nm(2, "f", "PautaTitulo") });
    const pauta = [["Contexto e método", "slides 3–6"], ["Pesquisa com as famílias", "slides 7–8"], ["Canais digitais", "slides 9–11"], ["Cenário competitivo e SWOT", "slides 12–15"], ["Conversa com a direção e próximos passos", "slides 16–19"]];
    pauta.forEach((p, i) => {
      const y = 2.3 + i * 0.68;
      num(s, i + 1, 7.3, y, 2, { d: 0.42, fs: 14, fill: i === 4 ? VERM : ROXO });
      s.addText([T(p[0], { bold: true, fontSize: 15, breakLine: true }), T(p[1], { fontSize: 11, color: CINZA_TX })], { x: 7.9, y: y - 0.04, w: 4.8, h: 0.55, margin: 0, valign: "middle", isTextBox: true, objectName: nm(2, "f", "Pauta" + (i + 1)) });
    });
    card(s, { x: 7.3, y: 5.85, w: 5.4, h: 0.85, g: 3, label: "Aviso", fill: ROXO_ESC, line: ROXO_ESC, shadow: false, valign: "middle",
      runs: P([[ "Não é uma apresentação de conclusões: é um ponto de partida para validar e completar.", { color: BRANCO, fontSize: 14, bold: true } ]]) });
  }

  // ================= 3. CONTEXTO =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Contexto e método" });
    base(s, "Contexto e método", "Por que diagnosticar antes de definir a marca", 3);
    const fases = [["Diagnóstico", "Entender família, mercado e comunicação", true], ["Estratégia de marca", "Posicionamento e proposta de valor", false], ["Branding Book", "Diretrizes e identidade", false]];
    fases.forEach((f, i) => {
      const x = 0.6 + i * 2.5;
      card(s, { x, y: 1.75, w: 2.25, h: 1.35, g: 1, label: "Fase" + (i + 1), fill: f[2] ? ROXO : BRANCO, line: f[2] ? ROXO : CINZA_LN, valign: "middle", shadow: !f[2] ? true : false,
        runs: P([[f[0], { bold: true, fontSize: 17, fontFace: "DM Sans", color: f[2] ? BRANCO : ROXO_ESC, paraSpaceAfter: 3 }], [f[1], { fontSize: 12, color: f[2] ? BRANCO : PRETO }]]) });
      if (i < 2) s.addShape(S.RIGHT_ARROW, { x: x + 2.28, y: 2.28, w: 0.2, h: 0.3, fill: { color: CINZA_TX }, line: { color: CINZA_TX, width: 0.5 }, objectName: nm(1, "w", "Seta" + i) });
    });
    chip(s, "Em andamento", 0.6, 3.25, 1, { text: "Estamos aqui", w: 1.5, fill: VERM, color: BRANCO, line: VERM });
    s.addText("O diagnóstico responde a três perguntas", { x: 0.6, y: 3.85, w: 7.4, h: 0.38, fontSize: 18, bold: true, fontFace: "DM Sans", color: ROXO_ESC, margin: 0, isTextBox: true, objectName: nm(2, "f", "PerguntasTitulo") });
    const q = ["Quem escolhe o CJB e por quê?", "Como o colégio é percebido e encontrado?", "O que o diferencia, e com quais provas?"];
    q.forEach((t, i) => {
      num(s, i + 1, 0.6, 4.42 + i * 0.7, 2, { d: 0.4, fs: 14 });
      s.addText(t, { x: 1.2, y: 4.42 + i * 0.7, w: 6.6, h: 0.4, fontSize: 16, valign: "middle", margin: 0, fontFace: "Inter", color: PRETO, isTextBox: true, objectName: nm(2, "f", "Pergunta" + (i + 1)) });
    });
    card(s, { x: 8.3, y: 1.75, w: 4.4, h: 4.95, g: 3, label: "Hipotese", fill: BRANCO, line: ROXO, dash: "dash", lw: 1.75, shadow: false, margin: [62, 20, 14, 20],
      runs: P([
        ["Direção em discussão", { bold: true, fontSize: 20, fontFace: "DM Sans", color: ROXO_ESC, paraSpaceAfter: 8 }],
        ["Fortalecer a percepção do colégio como referência regional em educação de qualidade, com atenção a:", { fontSize: 16, paraSpaceAfter: 8 }],
        ["resultados de aprendizagem", { bullet: true, fontSize: 16, paraSpaceAfter: 4 }],
        ["acompanhamento dos estudantes", { bullet: true, fontSize: 16, paraSpaceAfter: 4 }],
        ["proximidade com as famílias", { bullet: true, fontSize: 16, paraSpaceAfter: 14 }],
        ["A validar com a direção e com a pesquisa de público.", { fontSize: 14, italic: true, color: CINZA_TX }],
      ]) });
    chip(s, "Hipótese", 8.5, 1.92, 3, { w: 1.3 });
  }

  // ================= 4. LEGENDA =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Contexto e método" });
    base(s, "Contexto e método", "Como separamos o que sabemos do que ainda supomos", 4);
    const cats = [
      ["Realizado", "Atividade efetivamente executada.", "Ex.: questionário elaborado."],
      ["Observado", "Evidência de uma verificação inicial.", "Ex.: um link não abriu o destino esperado no teste."],
      ["Hipótese", "Interpretação que ainda precisa ser testada.", "Ex.: acompanhamento próximo como diferencial."],
      ["Pendente", "Atividade ou dado que ainda precisa ser obtido.", "Ex.: aplicação da pesquisa com as famílias."],
      ["Recomendação", "Ação proposta com base no diagnóstico disponível.", "Ex.: revisar a organização da bio e dos destaques."],
    ];
    const cw = 2.3, gap = 0.15;
    cats.forEach((c, i) => {
      const x = 0.6 + i * (cw + gap);
      card(s, { x, y: 1.95, w: cw, h: 3.55, g: i + 1, label: "Cat" + (i + 1), margin: [66, 12, 10, 12],
        runs: P([[c[1], { fontSize: 16, bold: true, color: ROXO_ESC, paraSpaceAfter: 12 }], [c[2], { fontSize: 14, color: CINZA_TX }]]) });
      chip(s, c[0], x + 0.15, 2.13, i + 1, { w: cw - 0.3, h: 0.34, fs: 12 });
    });
    card(s, { x: 0.6, y: 5.8, w: 12.1, h: 0.85, g: 6, label: "Aviso", fill: CINZA_BG, line: CINZA_BG, shadow: false, valign: "middle", margin: 16,
      runs: P([["Ao longo da apresentação, cada informação aparece com a etiqueta correspondente: quem precisar, pode nos cobrar a categoria.", { fontSize: 15, color: PRETO }]]) });
  }

  // ================= 5. ETAPAS =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Contexto e método" });
    base(s, "Contexto e método", "Etapas do Branding e onde estamos hoje", 5);
    s.addShape(S.LINE, { x: 1.2, y: 2.35, w: 9.4, h: 0, line: { color: ROXO, width: 2.5 }, objectName: nm(1, "w", "LinhaTempo") });
    const fases = [
      ["Diagnóstico institucional", "Estrutura inicial montada. Falta alinhar dados e visão com a direção.", "Em andamento"],
      ["Pesquisa e análise", "Questionário preparado (não aplicado), benchmark iniciado, observação digital preliminar.", "Em andamento"],
      ["Definição estratégica", "Posicionamento, essência e proposta de valor. Dependem das evidências.", "Pendente"],
      ["Branding Book", "Diretrizes da marca e validação das entregas com o colégio.", "Pendente"],
    ];
    fases.forEach((f, i) => {
      const x = 0.6 + i * 3.05, g = i + 2;
      num(s, i + 1, x + 0.3, 2.12, g, { fill: f[2] === "Pendente" ? CINZA_TX : ROXO });
      card(s, { x, y: 2.85, w: 2.85, h: 3.0, g, label: "Etapa" + (i + 1), margin: [14, 14, 10, 14],
        runs: P([[f[0], { bold: true, fontSize: 17, fontFace: "DM Sans", color: ROXO_ESC, paraSpaceAfter: 8 }], [f[1], { fontSize: 14 }]]) });
      chip(s, f[2] === "Pendente" ? "Pendente" : "Em andamento", x + 0.2, 5.35, g, { text: f[2] === "Pendente" ? (i === 2 ? "Aguarda evidências" : "Não iniciado") : "Em andamento", w: 1.9 });
    });
    s.addText("Prazos e responsáveis: a definir em conjunto com a direção.", { x: 0.6, y: 6.2, w: 12.1, h: 0.4, fontSize: 14, italic: true, color: CINZA_TX, fontFace: "Inter", margin: 0, isTextBox: true, objectName: nm(6, "f", "Prazos") });
  }

  // ================= 6. O QUE JÁ FOI FEITO =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Contexto e método" });
    base(s, "Contexto e método", "O que a equipe já fez até aqui", 6);
    const rows = [
      ["Estruturação inicial do diagnóstico", "Realizado", "Roteiro e critérios de análise definidos."],
      ["Questionário para clientes atuais", "Realizado", "Preparado, mas ainda não aplicado. Sem respostas."],
      ["Observações sobre os canais digitais", "Observado", "Verificação inicial; não é medição de desempenho."],
      ["Benchmark de instituições concorrentes", "Em andamento", "Início do levantamento; leitura direta das fontes pendente."],
      ["Perguntas e pendências para a direção", "Realizado", "Base da conversa de hoje."],
    ];
    s.addText("Atividade", { x: 0.75, y: 1.7, w: 4.6, h: 0.3, fontSize: 12, bold: true, color: CINZA_TX, margin: 0, isTextBox: true, objectName: nm(1, "f", "Cab1") });
    s.addText("Estágio", { x: 5.55, y: 1.7, w: 2, h: 0.3, fontSize: 12, bold: true, color: CINZA_TX, margin: 0, isTextBox: true, objectName: nm(1, "f", "Cab2") });
    s.addText("O que significa na prática", { x: 7.75, y: 1.7, w: 4.9, h: 0.3, fontSize: 12, bold: true, color: CINZA_TX, margin: 0, isTextBox: true, objectName: nm(1, "f", "Cab3") });
    rows.forEach((r, i) => {
      const y = 2.05 + i * 0.93, g = i + 1;
      card(s, { x: 0.6, y, w: 12.1, h: 0.8, g, label: "Linha" + (i + 1), margin: [0, 16, 0, 16], valign: "middle",
        runs: P([[r[0], { bold: true, fontSize: 16, color: ROXO_ESC }]]) });
      // sobrepõe o texto da coluna 3 limitando largura do card de título
      s.addText(r[2], { x: 7.75, y: y + 0.1, w: 4.8, h: 0.6, fontSize: 14, valign: "middle", margin: 0, color: PRETO, fontFace: "Inter", isTextBox: true, objectName: nm(g, "f", "Sig" + (i + 1)) });
      chip(s, r[1], 5.55, y + 0.25, g, { w: 1.7 });
    });
  }

  // ================= 7. PESQUISA: ESTRUTURA =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Pesquisa com as famílias" });
    base(s, "Pesquisa com as famílias", "Pesquisa com as famílias: preparada, ainda não aplicada", 7);
    card(s, { x: 0.6, y: 1.75, w: 3.6, h: 4.75, g: 1, label: "Status", fill: ROXO_ESC, line: ROXO_ESC, shadow: false, margin: 18,
      runs: P([
        ["Por que ouvir as famílias", { bold: true, fontSize: 18, fontFace: "DM Sans", color: BRANCO, paraSpaceAfter: 8 }],
        ["Quem escolhe uma escola é a família. Precisamos entender como ela decide, o que a preocupa e como vê o CJB.", { fontSize: 14, color: BRANCO, paraSpaceAfter: 14 }],
        ["Público: clientes atuais", { fontSize: 13, bold: true, color: LAV, paraSpaceAfter: 4 }],
        ["Aplicação: canal, período e amostra a alinhar com a direção.", { fontSize: 13, color: LAV }],
      ]) });
    chip(s, "Não aplicada", 0.8, 5.85, 1, { text: "Preparado · não aplicado", w: 2.5, fs: 12, h: 0.36 });
    const dims = [
      ["Perfil e contexto", "Quem são as famílias e qual a rotina delas."],
      ["Necessidades e critérios", "O que buscam e o que pesa na escolha."],
      ["Objeções e barreiras", "O que gera dúvida, insegurança ou desistência."],
      ["Canais de comunicação", "Onde se informam e como preferem falar com a escola."],
      ["Percepção da marca", "Que características associam ao colégio."],
      ["Concorrentes e alternativas", "Quais outras escolas consideram."],
    ];
    dims.forEach((d, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 4.5 + col * 4.15, y = 1.75 + row * 1.55, g = 2 + row;
      card(s, { x, y, w: 4.0, h: 1.42, g, label: "Dim" + (i + 1), margin: [12, 14, 8, 62],
        runs: P([[d[0], { bold: true, fontSize: 16, fontFace: "DM Sans", color: ROXO_ESC, paraSpaceAfter: 4 }], [d[1], { fontSize: 13 }]]) });
      num(s, i + 1, x + 0.14, y + 0.15, g, { d: 0.42, fs: 14 });
    });
    s.addText("Ainda não há respostas, percentuais ou conclusões desta pesquisa.", { x: 4.5, y: 6.45, w: 8.2, h: 0.3, fontSize: 13, bold: true, color: VERM_ESC, margin: 0, isTextBox: true, objectName: nm(5, "f", "Aviso") });
  }

  // ================= 8. O QUE DESCOBRIR =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Pesquisa com as famílias" });
    base(s, "Pesquisa com as famílias", "O que a pesquisa precisa nos ajudar a descobrir", 8);
    const qs = [
      "O que mais pesa na escolha de uma escola?", "Quais informações a família precisa encontrar antes de entrar em contato?",
      "Quais fatores geram confiança ou insegurança?", "O que valoriza no acompanhamento escolar?",
      "Quais outras escolas considera?", "Como conheceu o colégio?",
      "Quais características associa à instituição?", "O que gostaria que fosse diferente?",
    ];
    qs.forEach((q, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 0.6 + col * 3.85, y = 1.75 + row * 1.2, g = 1 + row;
      card(s, { x, y, w: 3.7, h: 1.05, g, label: "Perg" + (i + 1), margin: [8, 12, 8, 12], valign: "middle", runs: P([[q, { fontSize: 14 }]]) });
    });
    s.addText("Aspectos a investigar", { x: 8.5, y: 1.75, w: 4.2, h: 0.4, fontSize: 18, bold: true, fontFace: "DM Sans", color: ROXO_ESC, margin: 0, isTextBox: true, objectName: nm(5, "f", "AspTitulo") });
    s.addText("Sem ordem de importância prévia", { x: 8.5, y: 2.15, w: 4.2, h: 0.3, fontSize: 12, italic: true, color: CINZA_TX, margin: 0, isTextBox: true, objectName: nm(5, "f", "AspSub") });
    ["Qualidade de ensino", "Localização", "Acompanhamento", "Acolhimento", "Resultados", "Custo-benefício"].forEach((a, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      s.addText(a, { shape: S.ROUNDED_RECTANGLE, rectRadius: 0.15, x: 8.5 + col * 2.15, y: 2.65 + row * 0.7, w: 2.05, h: 0.5,
        fill: { color: BRANCO }, line: { color: ROXO, width: 1.25, dashType: "dash" }, color: ROXO, fontFace: "Inter", fontSize: 13, bold: true, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: nm(5, "f", "Asp" + (i + 1)) });
    });
    chip(s, "Hipótese", 8.5, 4.9, 5, { text: "Aspectos a investigar, não resultados", w: 3.1, fs: 11 });
    s.addText("A ordem de importância virá das famílias, e não de nós.", { x: 8.5, y: 5.4, w: 4.2, h: 0.7, fontSize: 14, color: PRETO, margin: 0, valign: "top", isTextBox: true, objectName: nm(5, "f", "AspNota") });
  }

  // ================= 9. DIAGNÓSTICO DIGITAL =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Canais digitais" });
    base(s, "Canais digitais", "Canais digitais: o que observamos em um primeiro teste", 9);
    const obs = [
      [ico.insta, "Bio do Instagram", "Oferece poucas informações institucionais."],
      [ico.insta, "Destaques", "Inconsistências na identificação e nas capas."],
      [ico.link, "Link criado no Canva", "Não direcionou ao destino esperado durante o teste."],
      [ico.face, "Facebook", "Página percebida como desorganizada e desatualizada."],
      [ico.whats, "WhatsApp", "1ª pergunta com resposta rápida; a 2ª seguia sem resposta no momento da observação."],
    ];
    const pos = [[0.6, 1.75], [4.75, 1.75], [8.9, 1.75], [0.6, 4.05], [4.75, 4.05]];
    obs.forEach((o, i) => {
      const [x, y] = pos[i], g = i + 1;
      card(s, { x, y, w: 3.95, h: 2.1, g, label: "Obs" + (i + 1), margin: [66, 16, 8, 16],
        runs: P([[o[1], { bold: true, fontSize: 17, fontFace: "DM Sans", color: ROXO_ESC, paraSpaceAfter: 4 }], [o[2], { fontSize: 14 }]]) });
      iconBadge(s, o[0], x + 0.2, y + 0.18, g, { d: 0.55, alt: o[1] });
      chip(s, "Observado", x + 3.95 - 1.3, y + 0.28, g, { w: 1.15 });
    });
    card(s, { x: 8.9, y: 4.05, w: 3.8, h: 2.1, g: 6, label: "Leitura", fill: ROXO_ESC, line: ROXO_ESC, shadow: false, valign: "middle", margin: 16,
      runs: P([["Como ler estes pontos", { bold: true, fontSize: 16, fontFace: "DM Sans", color: BRANCO, paraSpaceAfter: 6 }], ["Observações de um teste pontual. Não provam perda de matrículas nem avaliam todo o atendimento.", { fontSize: 14, color: BRANCO }]]) });
    s.addText("Registrar data e hora de cada teste antes da reunião.", { x: 0.6, y: 6.4, w: 8, h: 0.3, fontSize: 12, italic: true, color: CINZA_TX, margin: 0, isTextBox: true, objectName: nm(7, "f", "Nota") });
  }

  // ================= 10. JORNADA DIGITAL =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Canais digitais" });
    base(s, "Canais digitais", "Oportunidades de melhoria na jornada digital", 10);
    const ops = [
      ["Clareza das informações", "A família entende quem é o colégio em segundos?"],
      ["Organização dos canais", "Instagram, Facebook e WhatsApp contam a mesma história?"],
      ["Facilidade de navegação", "Links e caminhos levam ao lugar esperado?"],
      ["Consistência da comunicação", "Identificação, capas e tom seguem um padrão?"],
      ["Continuidade do atendimento", "A conversa segue depois da primeira resposta?"],
      ["Achar o essencial", "Informações-chave estão a poucos toques?"],
    ];
    ops.forEach((o, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 0.6 + col * 3.95, y = 1.75 + row * 1.65, g = 1 + row;
      card(s, { x, y, w: 3.8, h: 1.5, g, label: "Op" + (i + 1), margin: [12, 14, 8, 14],
        runs: P([[o[0], { bold: true, fontSize: 16, fontFace: "DM Sans", color: ROXO_ESC, paraSpaceAfter: 4 }], [o[1], { fontSize: 14 }]]) });
    });
    card(s, { x: 8.7, y: 1.75, w: 4.0, h: 4.8, g: 4, label: "Essencial", fill: ROXO_ESC, line: ROXO_ESC, shadow: false, margin: 18,
      runs: P([
        ["O que a família precisa achar rápido", { bold: true, fontSize: 18, fontFace: "DM Sans", color: BRANCO, paraSpaceAfter: 10 }],
        ["Proposta pedagógica", { bullet: true, fontSize: 17, color: BRANCO, paraSpaceAfter: 12 }],
        ["Etapas de ensino", { bullet: true, fontSize: 17, color: BRANCO, paraSpaceAfter: 12 }],
        ["Localização", { bullet: true, fontSize: 17, color: BRANCO, paraSpaceAfter: 12 }],
        ["Contato", { bullet: true, fontSize: 17, color: BRANCO, paraSpaceAfter: 12 }],
        ["Como fazer a matrícula", { bullet: true, fontSize: 17, color: BRANCO }],
      ]) });
    chip(s, "Recomendação", 8.9, 5.95, 4, { text: "Recomendação · a validar", w: 2.3, fs: 11 });
  }

  // ================= 11. INDICADORES =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Canais digitais" });
    base(s, "Canais digitais", "Indicadores para avaliar a comunicação digital depois", 11);
    const H = (t) => ({ text: t, options: { bold: true, color: BRANCO, fill: { color: ROXO_ESC }, fontFace: "Inter", fontSize: 12, valign: "middle" } });
    const C = (t, o = {}) => ({ text: t, options: { fontFace: "Inter", fontSize: 13, color: PRETO, valign: "middle", ...o } });
    const NM = () => ({ text: "Não medido", options: { fontFace: "Inter", fontSize: 12, bold: true, color: BRANCO, fill: { color: VERM }, align: "center", valign: "middle" } });
    const rows = [
      ["Alcance", "Quantas pessoas veem o conteúdo", "Insights do Instagram/Facebook"],
      ["Visitas ao perfil", "Interesse após ver o conteúdo", "Insights do Instagram"],
      ["Cliques nos links", "Se o caminho até o contato funciona", "Ferramenta de links / insights"],
      ["Tempo de resposta", "Agilidade e continuidade do atendimento", "WhatsApp / registros da secretaria"],
      ["Perguntas recorrentes", "Informações que faltam nos canais", "Atendimento e secretaria"],
      ["Agendamentos de visita", "Interesse concreto das famílias", "Gestão / secretaria"],
      ["Conversão em matrículas", "Resultado final do funil", "Gestão / secretaria"],
    ];
    const data = [[H("Indicador"), H("O que revela"), H("Onde obter"), H("Situação")]];
    rows.forEach((r, i) => {
      const f = i % 2 ? { fill: { color: CINZA_BG } } : {};
      data.push([C(r[0], { bold: true, color: ROXO_ESC, ...f }), C(r[1], f), C(r[2], f), NM()]);
    });
    s.addTable(data, { x: 0.6, y: 1.75, w: 12.1, colW: [2.9, 4.2, 3.6, 1.4], rowH: 0.52, border: { type: "solid", color: CINZA_LN, pt: 0.75 }, margin: [0.03, 0.1, 0.03, 0.1], objectName: nm(1, "f", "Tabela") });
    s.addText("Nenhum indicador foi medido nesta etapa. Os dados dependem de acesso aos canais e de informações da gestão.", { x: 0.6, y: 6.2, w: 12.1, h: 0.5, fontSize: 14, bold: true, color: VERM_ESC, margin: 0, valign: "middle", isTextBox: true, objectName: nm(2, "f", "Aviso") });
  }

  // ================= 12. METODOLOGIA =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Cenário competitivo" });
    base(s, "Cenário competitivo", "Análise competitiva: como vamos comparar", 12);
    const passos = [["Coletar", "Fontes públicas e oficiais de cada instituição."], ["Registrar", "Sempre com data da consulta e fonte."], ["Comparar", "Pelos mesmos critérios para todas."]];
    passos.forEach((p, i) => {
      const y = 1.75 + i * 1.6, g = i + 1;
      num(s, i + 1, 0.6, y + 0.37, g);
      card(s, { x: 1.25, y, w: 3.7, h: 1.25, g, label: "Passo" + (i + 1), margin: [8, 14, 8, 14], valign: "middle",
        runs: P([[p[0], { bold: true, fontSize: 18, fontFace: "DM Sans", color: ROXO_ESC, paraSpaceAfter: 3 }], [p[1], { fontSize: 14 }]]) });
    });
    s.addText("Dez critérios equivalentes", { x: 5.3, y: 1.75, w: 4, h: 0.4, fontSize: 18, bold: true, fontFace: "DM Sans", color: ROXO_ESC, margin: 0, isTextBox: true, objectName: nm(4, "f", "CritTitulo") });
    const crit = ["Proposta de valor comunicada", "Público com quem dialoga", "Diferenciais apresentados", "Tom de voz", "Identidade visual", "Conteúdo e frequência", "Clareza das informações", "Experiência digital", "Evidências de resultados", "Pontos a investigar"];
    s.addText(crit.map((c, i) => T(c, { bullet: { type: "number" }, fontSize: 14, breakLine: i < crit.length - 1, paraSpaceAfter: 3 })), { x: 5.3, y: 2.2, w: 3.9, h: 4.2, margin: 0, valign: "top", isTextBox: true, objectName: nm(4, "f", "Criterios") });
    card(s, { x: 9.5, y: 1.75, w: 3.2, h: 3.15, g: 5, label: "StatusFontes", fill: BRANCO, line: VERM, lw: 1.75, shadow: false, margin: [44, 14, 8, 14],
      runs: P([["Leitura direta de sites e redes oficiais ainda não concluída.", { fontSize: 14, bold: true, paraSpaceAfter: 6 }], ["Até lá, só registramos indícios de fontes secundárias, sempre sinalizados.", { fontSize: 13 }]]) });
    chip(s, "Pendente", 9.68, 1.92, 5, { w: 1.1 });
    card(s, { x: 9.5, y: 5.1, w: 3.2, h: 1.55, g: 6, label: "Para que serve", fill: ROXO_ESC, line: ROXO_ESC, shadow: false, valign: "middle", margin: 14,
      runs: P([["Para que serve", { bold: true, fontSize: 14, color: BRANCO, paraSpaceAfter: 3 }], ["Entender o cenário, achar espaços de diferenciação e evitar comunicação genérica.", { fontSize: 13, color: BRANCO }]]) });
  }

  // ================= 13. BENCHMARK =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Cenário competitivo" });
    base(s, "Cenário competitivo", "Benchmark preliminar: três referências do entorno", 13);
    const H = (t) => ({ text: t, options: { bold: true, color: BRANCO, fill: { color: ROXO_ESC }, fontFace: "DM Sans", fontSize: 14, valign: "middle", align: "left" } });
    const L = (t) => ({ text: t, options: { bold: true, color: ROXO_ESC, fill: { color: CINZA_BG }, fontFace: "Inter", fontSize: 12, valign: "middle" } });
    const C = (t, o = {}) => ({ text: t, options: { fontFace: "Inter", fontSize: 12, color: PRETO, valign: "middle", ...o } });
    const AV = (t) => ({ text: t, options: { fontFace: "Inter", fontSize: 12, bold: true, color: VERM_ESC, valign: "middle" } });
    const data = [
      [H(""), H("Colégio Cônego Francisco Pereira"), H("Colégio Paiva Andrade"), H("Patronato Padre Luiz Barbosa Moreira")],
      [L("Território a investigar (hipótese)"), C("Tradição, disciplina, valores e resultados acadêmicos"), C("Infraestrutura, inovação, recursos educacionais e preparação para o futuro"), C("Formação humana, valores cristãos e desenvolvimento integral")],
      [L("Site oficial"), C("conego.com.br"), C("colegiopaivaandrade.com.br"), C("patronatoplbm.com.br")],
      [L("Indícios de fontes secundárias (a confirmar)"), C("Nada confiável encontrado até aqui"), C("Aparece em Messejana; citado como fundado em 2004"), C("Aparece em Messejana; ligado ao Instituto Josefino; educação cristã-humanista")],
      [L("Proposta de valor, diferenciais, tom, identidade visual"), AV("A verificar"), AV("A verificar"), AV("A verificar")],
      [L("Experiência digital, resultados e credibilidade"), AV("A verificar"), AV("A verificar"), AV("A verificar")],
    ];
    s.addTable(data, { x: 0.6, y: 1.65, w: 12.1, colW: [2.5, 3.2, 3.2, 3.2], rowH: [0.5, 0.8, 0.42, 0.85, 0.6, 0.6], border: { type: "solid", color: CINZA_LN, pt: 0.75 }, margin: [0.03, 0.1, 0.03, 0.1], objectName: nm(1, "f", "TabelaBenchmark") });
    s.addText([
      T("Territórios são hipóteses de comunicação, e não avaliações da qualidade das escolas. Nenhuma é considerada superior ou inferior nesta etapa.", { fontSize: 12, bold: true, color: PRETO, breakLine: true }),
      T("Fontes secundárias consultadas em 21/10/2026: Quero Bolsa (Paiva Andrade; Patronato), escol.as (Paiva Andrade), página da FPA Paiva Andrade no Guia da Carreira e parecer do Conselho Estadual de Educação do Ceará (2011). Sites oficiais: leitura direta pendente.", { fontSize: 10, color: CINZA_TX }),
    ], { x: 0.6, y: 6.2, w: 12.1, h: 0.75, margin: 0, valign: "top", isTextBox: true, objectName: nm(2, "f", "Fontes") });
  }

  // ================= 14. TERRITÓRIOS E MAPA =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Cenário competitivo" });
    base(s, "Cenário competitivo", "Territórios de comunicação e oportunidades a investigar", 14);
    const terr = [["Cônego", "Tradição, disciplina, valores, resultados"], ["Paiva Andrade", "Infraestrutura, inovação, preparação para o futuro"], ["Patronato", "Formação humana, valores cristãos, desenvolvimento integral"]];
    terr.forEach((t, i) => {
      card(s, { x: 0.6, y: 1.75 + i * 1.0, w: 4.4, h: 0.88, g: 1, label: "Terr" + (i + 1), margin: [6, 14, 6, 14], valign: "middle",
        runs: P([[t[0], { bold: true, fontSize: 14, color: ROXO_ESC }], [t[1], { fontSize: 13 }]]) });
    });
    card(s, { x: 0.6, y: 4.75, w: 4.4, h: 0.88, g: 2, label: "TerrCJB", fill: BRANCO, line: VERM, dash: "dash", lw: 1.75, shadow: false, margin: [6, 14, 6, 14], valign: "middle",
      runs: P([["Colégio João Batista", { bold: true, fontSize: 14, color: VERM_ESC }], ["Território a definir com a direção e a pesquisa", { fontSize: 13 }]]) });
    // mapa
    const mx = 5.6, my = 1.75, mw = 4.1, mh = 3.88;
    s.addShape(S.RECTANGLE, { x: mx, y: my, w: mw, h: mh, fill: { color: CINZA_BG }, line: { color: CINZA_LN, width: 1 }, objectName: nm(3, "f", "MapaFundo") });
    s.addShape(S.LINE, { x: mx + mw / 2, y: my + 0.1, w: 0, h: mh - 0.2, line: { color: CINZA_TX, width: 1, dashType: "dash" }, objectName: nm(3, "w", "EixoV") });
    s.addShape(S.LINE, { x: mx + 0.1, y: my + mh / 2, w: mw - 0.2, h: 0, line: { color: CINZA_TX, width: 1, dashType: "dash" }, objectName: nm(3, "w", "EixoH") });
    s.addText("Resultado\nacadêmico", { x: mx + 0.05, y: my + mh / 2 + 0.05, w: 1.3, h: 0.5, fontSize: 11, color: CINZA_TX, margin: 0, isTextBox: true, objectName: nm(3, "f", "EixoA1") });
    s.addText("Desenvolvimento\nhumano", { x: mx + mw - 1.4, y: my + mh / 2 + 0.05, w: 1.35, h: 0.5, fontSize: 11, color: CINZA_TX, align: "right", margin: 0, isTextBox: true, objectName: nm(3, "f", "EixoA2") });
    s.addText("Institucional", { x: mx + mw / 2 + 0.08, y: my + mh - 0.3, w: 1.6, h: 0.25, fontSize: 11, color: CINZA_TX, margin: 0, isTextBox: true, objectName: nm(3, "f", "EixoB1") });
    s.addText("Próximo", { x: mx + mw / 2 + 0.08, y: my + 0.05, w: 1.2, h: 0.25, fontSize: 11, color: CINZA_TX, margin: 0, isTextBox: true, objectName: nm(3, "f", "EixoB2") });
    s.addText("Mapa a construir:\nsem posições antes\ndas evidências", { x: mx + 0.15, y: my + 0.5, w: mw / 2 - 0.3, h: 0.8, fontSize: 12, bold: true, color: ROXO, align: "left", margin: 0, isTextBox: true, objectName: nm(3, "f", "MapaAviso") });
    s.addText("Eixos propostos para discussão: foco da comunicação (horizontal) e tom (vertical).", { x: mx, y: my + mh + 0.1, w: mw, h: 0.55, fontSize: 11, italic: true, color: CINZA_TX, margin: 0, isTextBox: true, objectName: nm(3, "f", "MapaLegenda") });
    card(s, { x: 10.0, y: 1.75, w: 2.7, h: 4.9, g: 4, label: "Hipotese", fill: ROXO_ESC, line: ROXO_ESC, shadow: false, margin: [16, 14, 12, 14],
      runs: P([
        ["Hipótese a investigar", { fontSize: 11, bold: true, color: LAV, paraSpaceAfter: 8 }],
        ["Qualidade de ensino demonstrável + acompanhamento próximo + relacionamento com as famílias.", { fontSize: 18, fontFace: "Bree Serif", color: BRANCO, paraSpaceAfter: 14 }],
        ["Não é espaço de mercado comprovadamente vazio, nem recomendação definitiva.", { fontSize: 13, color: LAV }],
      ]) });
  }

  // ================= 15. SWOT =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Cenário competitivo" });
    base(s, "Cenário competitivo", "SWOT preliminar: fatos, hipóteses e lacunas", 15);
    const q = [
      ["Forças (internas)", "Nenhuma classificada como confirmada ainda.", "Acompanhamento próximo e relação com as famílias, a comprovar."],
      ["Fraquezas (internas)", "Pontos digitais observados (slide 9); relevância para a matrícula ainda desconhecida.", "Podem dificultar a decisão da família."],
      ["Oportunidades (externas)", "Nenhuma comprovada ainda.", "Diferenciar-se com evidências de qualidade e comunicação mais clara."],
      ["Ameaças (externas)", "Indício de outras escolas em Messejana (fontes secundárias, a confirmar).", "Concorrentes com territórios fortes podem concentrar a atenção."],
    ];
    q.forEach((c, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 0.6 + col * 6.1, y = 1.7 + row * 2.05, g = 1 + row;
      card(s, { x, y, w: 6.0, h: 1.95, g, label: "Quad" + (i + 1), margin: [10, 14, 6, 14],
        runs: [
          T(c[0], { bold: true, fontSize: 17, fontFace: "DM Sans", color: ROXO_ESC, breakLine: true, paraSpaceAfter: 4 }),
          T("Observado: ", { bold: true, fontSize: 13 }), T(c[1], { fontSize: 13, breakLine: true, paraSpaceAfter: 4 }),
          T("Hipótese: ", { bold: true, fontSize: 13, color: ROXO }), T(c[2], { fontSize: 13 }),
        ] });
    });
    card(s, { x: 0.6, y: 5.85, w: 12.1, h: 0.95, g: 3, label: "Lacunas", fill: BRANCO, line: VERM, lw: 1.5, shadow: false, valign: "middle", margin: [6, 16, 6, 150],
      runs: P([["Resultados e provas, perfil e demanda das famílias, concorrentes diretos segundo a direção, dados de atendimento e matrícula, leitura direta do benchmark.", { fontSize: 13 }]]) });
    chip(s, "Pendente", 0.8, 6.15, 3, { text: "A levantar", w: 1.2 });
  }

  // ================= 16. O QUE A DIREÇÃO FORNECE =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Conversa com a direção" });
    base(s, "Conversa com a direção", "O que só a direção pode confirmar ou fornecer", 16);
    const cols = [
      ["Confirmar", ["Etapas de ensino oferecidas", "Bairros de origem dos estudantes", "Perfil de família que deseja atrair e manter", "Concorrentes diretos"]],
      ["Dados", ["Desempenho dos canais digitais", "Contatos, visitas e matrículas", "Perguntas frequentes pré-matrícula", "Faixa de mensalidade por etapa e serviços incluídos (se possível)"]],
      ["Materiais", ["Logos oficiais e identidade atual", "Projeto pedagógico", "Fotos e vídeos autorizados", "Materiais de matrícula e comunicados"]],
      ["Decisões", ["Canal e período da pesquisa", "Responsável por cada canal", "Prioridades para os próximos 3 anos", "Quem valida as entregas"]],
    ];
    cols.forEach((c, i) => {
      const x = 0.6 + i * 3.05, g = i + 1;
      card(s, { x, y: 1.75, w: 2.9, h: 4.35, g, label: "Col" + (i + 1), margin: [50, 14, 10, 14],
        runs: P(c[1].map((t, j) => [t, { bullet: true, fontSize: 15, paraSpaceAfter: 10 }])) });
      s.addText(c[0], { x: x + 0.15, y: 1.9, w: 2.6, h: 0.4, fontSize: 18, bold: true, fontFace: "DM Sans", color: ROXO, margin: 0, valign: "middle", isTextBox: true, objectName: nm(g, "f", "ColTitulo" + (i + 1)) });
    });
    chip(s, "Pendente", 0.6, 6.35, 5, { text: "Tudo isto é pendente e pode ser combinado por etapas", w: 4.6, fs: 11, h: 0.3 });
  }

  // ================= 17. PERGUNTAS =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Conversa com a direção" });
    base(s, "Conversa com a direção", "Perguntas para a nossa conversa", 17);
    const t = [
      ["Objetivos e futuro", "Como o colégio deve ser reconhecido daqui a três anos?"],
      ["Público e mercado", "Quem são os concorrentes diretos? Por que as famílias escolhem o CJB, ou desistem?"],
      ["Diferenciais e evidências", "Que resultados, projetos ou reconhecimentos podem ser comprovados e divulgados?"],
      ["Experiência das famílias", "Quais dúvidas surgem antes da matrícula? O que mais se elogia ou sugere?"],
      ["Operação e comunicação", "Quem cuida de cada canal? Há dados de visitas, contatos e matrículas?"],
      ["Validação", "O que preservar da identidade atual? O que corrigir no que mostramos?"],
    ];
    t.forEach((c, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 0.6 + col * 4.1, y = 1.75 + row * 2.45, g = 1 + row;
      card(s, { x, y, w: 3.95, h: 2.3, g, label: "Tema" + (i + 1), margin: [14, 16, 10, 16],
        runs: P([[c[0], { bold: true, fontSize: 16, fontFace: "DM Sans", color: ROXO, paraSpaceAfter: 8 }], [c[1], { fontSize: 17, fontFace: "Bree Serif", color: ROXO_ESC }]]) });
      num(s, i + 1, x + 3.95 - 0.58, y + 0.14, g, { d: 0.4, fs: 14, fill: ROXO_ESC });
    });
    s.addText("Uma pergunta principal por tema; as complementares (no checklist) surgem a partir das respostas.", { x: 0.6, y: 6.62, w: 12.1, h: 0.3, fontSize: 12, italic: true, color: CINZA_TX, margin: 0, isTextBox: true, objectName: nm(3, "f", "Nota") });
  }

  // ================= 18. PRÓXIMOS PASSOS =================
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Próximos passos" });
    base(s, "Próximos passos", "Próximos passos até o Branding Book", 18);
    const steps = [
      "Reunião de alinhamento e coleta com a direção", "Revisão e validação dos dados institucionais", "Aplicação da pesquisa com o público-alvo",
      "Consolidação dos resultados da pesquisa", "Aprofundamento da análise competitiva e da experiência digital", "Construção ou validação da SWOT e do mapa de posicionamento",
      "Definição estratégica da marca", "Desenvolvimento das diretrizes do Branding Book", "Validação das entregas com o cliente",
    ];
    steps.forEach((t, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 0.6 + col * 4.1, y = 1.75 + row * 1.62, g = 1 + row;
      card(s, { x, y, w: 3.95, h: 1.45, g, label: "Passo" + (i + 1), fill: i === 0 ? ROXO : BRANCO, line: i === 0 ? ROXO : CINZA_LN, shadow: i !== 0, margin: [8, 14, 8, 62], valign: "middle",
        runs: P([[t, { fontSize: 15, bold: i === 0, color: i === 0 ? BRANCO : PRETO }]]) });
      num(s, i + 1, x + 0.14, y + 0.5, g, { d: 0.44, fs: 15, fill: i === 0 ? BRANCO : ROXO, color: i === 0 ? ROXO : BRANCO });
    });
    chip(s, "Em andamento", 0.6, 6.55, 4, { text: "Estamos no passo 1", w: 1.9, fill: VERM, color: BRANCO, line: VERM });
    s.addText("Prazos e responsáveis: a definir em conjunto, conforme a rotina do colégio.", { x: 2.7, y: 6.52, w: 10, h: 0.36, fontSize: 14, italic: true, color: CINZA_TX, margin: 0, valign: "middle", isTextBox: true, objectName: nm(4, "f", "Prazos") });
  }

  // ================= 19. ENCERRAMENTO =================
  {
    const s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Encerramento" });
    s.addNotes(notaTxt(19));
    s.addShape(S.OVAL, { x: 10.4, y: -2.8, w: 5.2, h: 5.2, fill: { color: ROXO2 }, line: { color: ROXO2, width: 0.5 }, objectName: nm(1, "f", "CirculoGrande") });
    s.addText("ENCERRAMENTO E ALINHAMENTO FINAL", { x: 0.8, y: 0.7, w: 8, h: 0.3, fontSize: 12, bold: true, color: LAV, fontFace: "Inter", charSpacing: 2, margin: 0, isTextBox: true, objectName: nm(1, "f", "Kicker") });
    s.addText("O que levamos desta reunião", { x: 0.8, y: 1.1, w: 10, h: 0.8, fontSize: 36, bold: true, color: BRANCO, fontFace: "DM Sans", margin: 0, isTextBox: true, objectName: nm(1, "f", "Titulo") });
    const al = [
      ["Corrigir e aprofundar", "O que precisa ser ajustado no que apresentamos."],
      ["Dados e materiais", "O que será enviado e quem é a pessoa de contato."],
      ["Pesquisa e próxima conversa", "Como e quando aplicar a pesquisa e quando nos falamos de novo."],
    ];
    al.forEach((a, i) => {
      const x = 0.8 + i * 4.0, g = i + 2;
      card(s, { x, y: 2.4, w: 3.75, h: 2.2, g, label: "Alinh" + (i + 1), fill: ROXO, line: ROXO, shadow: false, margin: [60, 18, 10, 18],
        runs: P([[a[0], { bold: true, fontSize: 18, fontFace: "DM Sans", color: BRANCO, paraSpaceAfter: 6 }], [a[1], { fontSize: 14, color: BRANCO }]]) });
      num(s, i + 1, x + 0.18, 2.58, g, { d: 0.46, fill: BRANCO, color: ROXO });
    });
    s.addText("Marca forte começa por ouvir bem.", { x: 0.8, y: 5.05, w: 8.5, h: 0.6, fontSize: 28, color: BRANCO, fontFace: "Contrail One", margin: 0, isTextBox: true, objectName: nm(5, "f", "Frase") });
    const fim = logos(s, 0.8, 6.0, 0.85, 6);
    logoSlot(s, "Contato ADM Soluções\n[a preencher]", fim + 0.2, 6.0, 2.9, 0.85, true, 6);
  }

  const out = path.join(__dirname, "tmp_semanim.pptx");
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  fs.writeFileSync(path.join(__dirname, "notas.json"), JSON.stringify(NOTAS, null, 1));
  console.log("ok", out);
})();

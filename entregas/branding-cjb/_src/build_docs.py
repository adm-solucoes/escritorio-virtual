#!/usr/bin/env python3
"""Gera Roteiro-de-Apresentacao-CJB.docx e Checklist-de-Reuniao-CJB.docx a partir de notas.json."""
import json, os
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
NOTAS = json.load(open(os.path.join(HERE, "notas.json"), encoding="utf-8"))
ROXO, ROXO_ESC, VERM, CINZA = RGBColor(0x2A, 0x08, 0x7D), RGBColor(0x11, 0x00, 0x3A), RGBColor(0xCD, 0x17, 0x1B), RGBColor(0x5F, 0x5B, 0x73)

def novo():
    d = Document()
    for s in d.sections:
        s.left_margin = s.right_margin = Cm(2.2); s.top_margin = Cm(2); s.bottom_margin = Cm(2)
    st = d.styles["Normal"]; st.font.name = "Inter"; st.font.size = Pt(10.5)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), "Inter")
    st.paragraph_format.space_after = Pt(6)
    for name, size, color in (("Heading 1", 20, ROXO_ESC), ("Heading 2", 14, ROXO), ("Heading 3", 11.5, ROXO_ESC)):
        h = d.styles[name]; h.font.name = "DM Sans"; h.font.size = Pt(size); h.font.bold = True; h.font.color.rgb = color
        h.element.rPr.rFonts.set(qn("w:eastAsia"), "DM Sans")
        h.paragraph_format.space_before = Pt(14 if name != "Heading 3" else 8); h.paragraph_format.space_after = Pt(4)
    return d

def shade(cell, hex_):
    tcPr = cell._tc.get_or_add_tcPr(); shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), hex_); tcPr.append(shd)

def rotulo(d, label, texto, cor=ROXO):
    p = d.add_paragraph(); r = p.add_run(label + " "); r.bold = True; r.font.color.rgb = cor
    p.add_run(texto); return p

def tabela(d, header, rows, widths=None):
    t = d.add_table(rows=1, cols=len(header)); t.style = "Table Grid"; t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(header):
        c = t.rows[0].cells[i]; c.text = ""; r = c.paragraphs[0].add_run(h); r.bold = True; r.font.color.rgb = RGBColor(255, 255, 255); shade(c, "11003A")
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = v
    if widths:
        t.autofit = False
        for i, w in enumerate(widths): t.columns[i].width = Cm(w)
        for row in t.rows:
            for i, w in enumerate(widths): row.cells[i].width = Cm(w)
    for row in t.rows:
        for c in row.cells:
            for p in c.paragraphs:
                p.paragraph_format.space_after = Pt(2)
                for r in p.runs: r.font.size = Pt(9.5)
    d.add_paragraph()
    return t

def rodape(d, texto):
    p = d.sections[0].footer.paragraphs[0]; p.text = texto; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for r in p.runs: r.font.size = Pt(8.5); r.font.color.rgb = CINZA

def capa(d, titulo, sub):
    lg = d.add_paragraph(); r = lg.add_run()
    r.add_picture(os.path.join(HERE, "assets/adm-solucoes-logo.png"), height=Cm(1.4)); lg.add_run("   ")
    lg.add_run().add_picture(os.path.join(HERE, "assets/cjb-logo-horizontal.png"), height=Cm(1.0))
    p = d.add_paragraph(); r = p.add_run("ADM SOLUÇÕES · EMPRESA JÚNIOR DA UECE"); r.bold = True; r.font.size = Pt(9); r.font.color.rgb = VERM
    d.add_heading(titulo, 0).runs[0].font.color.rgb = ROXO_ESC
    p = d.add_paragraph(sub); p.runs[0].font.color.rgb = CINZA
    for r in d.paragraphs[2].runs: r.font.name = "DM Sans"

# ====================== ROTEIRO ======================
d = novo(); rodape(d, "ADM Soluções · Roteiro de apresentação · Diagnóstico de Branding · Colégio João Batista · Material preliminar")
capa(d, "Roteiro de apresentação", "Diagnóstico de Branding · Colégio João Batista (Messejana, Fortaleza-CE). Documento de apoio a quem conduzirá a reunião com a direção.")

d.add_heading("1. Como usar este roteiro", 1)
d.add_paragraph("O roteiro acompanha o arquivo Diagnostico-Branding-CJB.pptx slide a slide (19 slides). O mesmo texto está nas notas do apresentador de cada slide. Cada bloco traz objetivo, explicação técnica, fala sugerida, transição, pergunta estratégica, cuidados e uma dica de como reagir caso a direção responda de determinada maneira.")
d.add_heading("Princípios para conduzir a reunião", 2)
for t in [
    "Falar com as famílias e a direção em mente, e não ler os slides. Os slides são apoio visual; a explicação está na fala.",
    "Usar sempre a legenda do slide 4: Realizado, Observado, Hipótese, Pendente e Recomendação. Antes de dizer qualquer coisa, saber em qual categoria ela está.",
    "Ouvir mais do que falar na segunda metade da reunião (slides 16 a 19). Anotar as palavras da direção.",
    "Perguntar uma coisa por vez e aprofundar com perguntas complementares do checklist apenas quando a resposta pedir.",
    "Nunca transformar observação em prova. Os testes digitais são pontuais; não indicam perda de matrículas nem avaliam todo o atendimento.",
    "Quando não houver dado, dizer que o dado é pendente. Não improvisar números sobre mensalidades, alunos, resultados, aprovações, infraestrutura, equipe ou satisfação.",
    "Anotar correções, decisões, responsáveis e prazos combinados, e enviar um resumo por escrito após a reunião.",
]:
    d.add_paragraph(t, style="List Bullet")
d.add_heading("Legenda de evidências", 2)
tabela(d, ["Categoria", "Significado", "Exemplo neste projeto"], [
    ["Realizado", "Atividade efetivamente executada", "Questionário elaborado"],
    ["Observado", "Evidência de uma verificação inicial", "Link do Canva não abriu o destino esperado no teste"],
    ["Hipótese", "Interpretação que ainda precisa ser testada", "Acompanhamento próximo como diferencial"],
    ["Pendente", "Atividade ou dado que ainda precisa ser obtido", "Aplicação da pesquisa com as famílias"],
    ["Recomendação", "Ação proposta com base no diagnóstico disponível", "Revisar a organização da bio e dos destaques"],
], [3.2, 6.3, 7])
d.add_heading("Antes da reunião (checar)", 2)
for t in [
    "Preencher o contato da ADM Soluções no slide 19 (as logos oficiais já estão aplicadas na capa e no encerramento).",
    "Instalar as fontes da identidade (DM Sans, Inter, Lovelo, Bree Serif e Contrail One). Sem elas, o PowerPoint substitui por fontes próximas e os textos podem mudar ligeiramente de largura.",
    "Reler os sites e redes oficiais dos três concorrentes em um navegador comum e atualizar o slide 13 com data e fonte. Na consulta de 21/10/2026 a partir do ambiente de trabalho da equipe os três sites não puderam ser abertos, e só foram usadas fontes secundárias.",
    "Repetir o teste dos canais digitais (slide 9) e registrar data e hora. Só anexar capturas de tela se representarem os canais corretos e puderem ser exibidas.",
    "Confirmar a data real da reunião (a capa traz “out/2026”).",
    "Abrir o arquivo no modo de apresentação para conferir as animações: elas ocorrem automaticamente, sem cliques.",
]:
    d.add_paragraph(t, style="List Bullet")

d.add_heading("2. Roteiro slide a slide", 1)
blocos = [("Abertura", range(1, 3)), ("Contexto e método", range(3, 7)), ("Pesquisa com as famílias", range(7, 9)),
          ("Canais digitais", range(9, 12)), ("Cenário competitivo", range(12, 16)), ("Conversa com a direção", range(16, 18)), ("Próximos passos e encerramento", range(18, 20))]
nome_bloco = {i: b for b, r in blocos for i in r}
vistos = set()
for i, n in enumerate(NOTAS, 1):
    b = nome_bloco[i]
    if b not in vistos:
        vistos.add(b); d.add_heading(b, 2)
    d.add_heading(f"Slide {i} — {n['titulo']}", 3)
    rotulo(d, "Objetivo:", n["objetivo"])
    rotulo(d, "Explicação:", n["explicacao"])
    p = rotulo(d, "Fala sugerida:", "")
    q = d.add_paragraph(n["fala"]); q.paragraph_format.left_indent = Cm(0.6)
    for r in q.runs: r.italic = True
    rotulo(d, "Transição:", n["transicao"])
    rotulo(d, "Pergunta estratégica:", n["pergunta"])
    rotulo(d, "Como reagir:", n["se"])
    rotulo(d, "Cuidados:", n["cuidados"], VERM)

d.add_heading("3. Fontes consultadas (21/10/2026)", 1)
d.add_paragraph("As fontes abaixo são secundárias e foram usadas apenas como indícios a confirmar. Os sites oficiais dos concorrentes não puderam ser lidos a partir do ambiente de trabalho (erro de acesso ao endereço) e a leitura direta continua pendente.")
for t in [
    "Quero Bolsa, Colégio Paiva Andrade: https://querobolsa.com.br/escolas/colegio-paiva-andrade",
    "escol.as, Paiva Andrade Colégio: https://www.escol.as/310519-paiva-andrade-colegio",
    "Guia da Carreira, FPA Paiva Andrade (página que cita a fundação do colégio em 2004): https://www.guiadacarreira.com.br/faculdades/fpa-paiva-andrade/cursos/educacao-especial",
    "Quero Bolsa, Patronato Padre Luiz Barbosa Moreira: https://querobolsa.com.br/escolas/luiz-barbosa-moreira-patronato-pe",
    "Conselho Estadual de Educação do Ceará, parecer nº 0733/2011: https://www.ce.gov.br/wp-content/uploads/sites/85/2013/10/par0733.2011-.pdf",
    "Sites oficiais a consultar: https://conego.com.br/ · https://www.colegiopaivaandrade.com.br/ · https://www.patronatoplbm.com.br/",
]:
    d.add_paragraph(t, style="List Bullet")
d.add_paragraph("Observação: mensalidades listadas em diretórios de terceiros não foram utilizadas nem citadas.")
d.save(os.path.join(OUT, "Roteiro-de-Apresentacao-CJB.docx"))

# ====================== CHECKLIST ======================
c = novo(); rodape(c, "ADM Soluções · Checklist de reunião · Colégio João Batista · Material preliminar")
capa(c, "Checklist de reunião", "Reunião de diagnóstico de Branding com a direção do Colégio João Batista. Marque durante a reunião e registre as respostas.")

def lista(titulo, itens, intro=None):
    c.add_heading(titulo, 1)
    if intro: c.add_paragraph(intro)
    t = c.add_table(rows=1, cols=3); t.style = "Table Grid"
    for i, h in enumerate(["☐", "Item", "Resposta / observação"]):
        cell = t.rows[0].cells[i]; cell.text = ""; r = cell.paragraphs[0].add_run(h); r.bold = True; r.font.color.rgb = RGBColor(255, 255, 255); shade(cell, "11003A")
    for it in itens:
        cells = t.add_row().cells; cells[0].text = "☐"; cells[1].text = it; cells[2].text = ""
    t.autofit = False
    for i, w in enumerate((0.9, 8.6, 7)): t.columns[i].width = Cm(w)
    for row in t.rows:
        row.cells[0].width = Cm(0.9); row.cells[1].width = Cm(8.6); row.cells[2].width = Cm(7)
        for cell in row.cells:
            for p in cell.paragraphs:
                p.paragraph_format.space_after = Pt(2)
                for r in p.runs: r.font.size = Pt(9.5)
    c.add_paragraph()

c.add_heading("Como usar", 1)
c.add_paragraph("Priorize as perguntas principais (marcadas com ★) e use as complementares apenas quando as respostas pedirem. Dados financeiros e de matrícula são opcionais e sensíveis: peça somente o que a direção se sentir à vontade para compartilhar.")

lista("1. Informações para confirmar com a direção", [
    "★ Como a direção gostaria que o colégio fosse reconhecido nos próximos três anos?",
    "Quais são as prioridades institucionais para esse período?",
    "Que mudanças a instituição considera mais importantes?",
    "★ Quais etapas de ensino são oferecidas atualmente?",
    "De quais bairros vêm a maioria dos estudantes?",
    "Qual é o perfil de família que o colégio deseja atrair e manter?",
    "★ Quais instituições a direção considera concorrentes diretas? Os três do benchmark estão corretos?",
    "★ Por que as famílias escolhem o CJB e por quais motivos podem desistir?",
    "★ Quais são os principais diferenciais da proposta pedagógica?",
    "★ Quais resultados, projetos, atividades ou reconhecimentos podem ser comprovados e divulgados?",
    "O que a instituição faz de maneira consistente que gostaria que mais famílias conhecessem?",
    "★ Quais são as dúvidas mais frequentes antes da matrícula?",
    "Como funciona a comunicação entre escola e responsáveis?",
    "Quais reclamações, elogios ou sugestões aparecem com mais frequência?",
    "Como ocorre o acompanhamento do desempenho e do desenvolvimento dos estudantes?",
    "★ Quem administra cada canal digital? Há responsáveis definidos pelo atendimento? Quais canais são prioritários?",
    "★ O que a direção considera mais importante preservar na identidade atual?",
    "Existe alguma percepção sobre o colégio que gostaria de mudar?",
    "Quais informações ou conclusões apresentadas precisam de correção ou aprofundamento?",
    "A direção reconhece as observações do teste digital (bio, destaques, link do Canva, Facebook, WhatsApp)? Há explicações para elas?",
    "A direção concorda em tratar a direção estratégica (referência regional em educação de qualidade) como hipótese a testar com a pesquisa?",
])
lista("2. Dados a solicitar", [
    "Dados de desempenho digital (alcance, visitas ao perfil, cliques nos links), quando disponíveis",
    "Registros de contatos, visitas agendadas e matrículas por período, se houver",
    "Perguntas frequentes recebidas pelo atendimento e pela secretaria",
    "Tempo médio e horário de atendimento no WhatsApp, se registrado",
    "Motivos de desistência ou de não matrícula já conhecidos",
    "Faixa de mensalidade por etapa e serviços incluídos (opcional; apenas se a direção puder compartilhar)",
    "Resultados, projetos, premiações e reconhecimentos comprováveis",
    "Pesquisas de satisfação ou estudos anteriores, se existirem",
], "Não solicitar dados pessoais de alunos ou de famílias. Anotar o prazo combinado para o envio.")
lista("3. Materiais institucionais úteis", [
    "Logos oficiais do colégio (arquivos vetoriais) e manual ou guia de identidade visual atual",
    "Projeto político-pedagógico ou apresentação da proposta pedagógica",
    "Fotos e vídeos autorizados da estrutura, atividades e eventos",
    "Materiais de matrícula, folders, comunicados e peças já usadas em campanhas",
    "Depoimentos e conteúdos que a direção autoriza divulgar",
    "Acesso ou relatório dos canais digitais (Instagram, Facebook, WhatsApp, links)",
])
lista("4. Decisões a alinhar", [
    "Canal, período e amostra para aplicar a pesquisa com as famílias (clientes atuais)",
    "Quem divulga a pesquisa e como (grupo de responsáveis, e-mail, agenda, formulário)",
    "Concorrentes diretos que entram no benchmark",
    "Canais digitais prioritários e responsável por cada um",
    "Prioridades institucionais para os próximos três anos",
    "Quem valida as entregas pelo colégio e em quais etapas",
    "Forma e frequência de acompanhamento (reuniões, relatórios curtos, mensagens)",
    "Datas importantes do calendário do colégio que afetam o cronograma",
])

c.add_heading("5. Próximas ações e responsáveis", 1)
c.add_paragraph("Responsáveis e prazos não foram definidos: devem ser preenchidos em conjunto com a direção durante a reunião.")
acoes = [
    ["Resumo escrito dos combinados da reunião", "A definir", "A definir", ""],
    ["Receber dados e materiais solicitados", "A definir", "A definir", ""],
    ["Revisão e validação dos dados institucionais", "A definir", "A definir", ""],
    ["Ajustar o questionário, se necessário, e aplicar a pesquisa", "A definir", "A definir", ""],
    ["Consolidar os resultados da pesquisa", "A definir", "A definir", ""],
    ["Leitura direta dos sites e redes dos concorrentes e atualização do benchmark", "A definir", "A definir", ""],
    ["Aprofundar a experiência digital (repetir testes, registrar data e hora)", "A definir", "A definir", ""],
    ["Construir ou validar SWOT e mapa de posicionamento (com evidências)", "A definir", "A definir", ""],
    ["Definição estratégica da marca", "A definir", "A definir", ""],
    ["Diretrizes do Branding Book e validação das entregas", "A definir", "A definir", ""],
]
tabela(c, ["Ação", "Responsável", "Prazo", "Status"], acoes, [8.4, 3, 2.8, 2.3])

c.add_heading("6. Registro rápido da reunião", 1)
for t in ["Participantes e cargos:", "Correções pedidas ao material:", "Informações novas relevantes:", "Pontos que a direção quer preservar / mudar:", "Pendências e combinados:"]:
    p = c.add_paragraph(); r = p.add_run(t); r.bold = True
    c.add_paragraph("______________________________________________________________________________")
c.save(os.path.join(OUT, "Checklist-de-Reuniao-CJB.docx"))
print("docs ok")

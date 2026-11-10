"""Generate clearly labelled, fictional PDF samples for the portfolio.

Run: python3 scripts/generate_samples.py
Requires ReportLab. Open Sans is used when installed; Helvetica is the fallback.
No customer information or actual technical findings are included.
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "exemplos"
OUT.mkdir(parents=True, exist_ok=True)

FONT_DIR = Path("/usr/share/fonts/truetype/open-sans")
if (FONT_DIR / "OpenSans-Regular.ttf").exists():
    pdfmetrics.registerFont(TTFont("Body", str(FONT_DIR / "OpenSans-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("Strong", str(FONT_DIR / "OpenSans-Semibold.ttf")))
    FONT, STRONG = "Body", "Strong"
else:
    FONT, STRONG = "Helvetica", "Helvetica-Bold"

W, H = A4
LEFT, RIGHT = 46, W - 46
INK = colors.HexColor("#2A2B28")
MUTED = colors.HexColor("#64645E")
LINE = colors.HexColor("#D8D7D1")
PAPER = colors.HexColor("#F4F3EF")
RUST = colors.HexColor("#88523C")


def text(c, value, x, top, size=10, color=INK, strong=False, width=None, leading=None):
    style = ParagraphStyle(
        "body", fontName=STRONG if strong else FONT, fontSize=size,
        leading=leading or size * 1.5, textColor=color, alignment=TA_LEFT,
    )
    p = Paragraph(value, style)
    _, height = p.wrap(width or RIGHT - x, H)
    p.drawOn(c, x, top - height)
    return top - height


def header(c, title, subtitle, code):
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(RUST)
    c.rect(LEFT, H - 56, 4, 16, fill=1, stroke=0)
    text(c, "EXEMPLO ILUSTRATIVO", LEFT + 14, H - 39, 9, RUST, True)
    text(c, code, W - 102, H - 39, 8, MUTED, width=56)
    y = text(c, title, LEFT, H - 93, 27, INK, True, leading=34)
    y = text(c, subtitle, LEFT, y - 11, 11, MUTED, leading=17)
    c.setStrokeColor(LINE)
    c.line(LEFT, y - 21, RIGHT, y - 21)
    return y - 45


def section(c, number, title, body, top):
    text(c, number, LEFT, top, 10, RUST, True, width=25)
    y = text(c, title, LEFT + 32, top + 1, 12, INK, True)
    y = text(c, body, LEFT + 32, y - 5, 10, MUTED, leading=16)
    return y - 21


def footer(c):
    c.setStrokeColor(LINE)
    c.line(LEFT, 82, RIGHT, 82)
    text(c, "Modelo demonstrativo de apresentação e organização de informações.", LEFT, 67, 8, MUTED)
    text(c, "Não corresponde a um imóvel real nem substitui avaliação técnica profissional.", LEFT, 54, 8, MUTED)
    text(c, "01 / 01", W - 84, 34, 7, MUTED, width=38)
    c.showPage()
    c.save()


def new_file(filename, title):
    c = canvas.Canvas(str(OUT / filename), pagesize=A4, pageCompression=1)
    c.setTitle(title + " — exemplo ilustrativo")
    c.setAuthor("Portfólio de engenharia — modelo demonstrativo")
    c.setSubject("Amostra ilustrativa, sem dados de clientes ou conclusões técnicas reais")
    return c


def report():
    c = new_file("relatorio-ilustrativo.pdf", "Estrutura de relatório de vistoria")
    y = header(c, "Relatório de vistoria", "Uma visão de como as observações podem ser registradas, explicadas e organizadas para orientar os próximos passos.", "MODELO 01")
    y = section(c, "01", "Objetivo e contexto", "Identificação da demanda, finalidade da visita, áreas previstas para observação e documentos disponibilizados. O escopo e os limites da avaliação são definidos para cada contratação.", y)
    y = section(c, "02", "Registro da visita", "Organização de fotografias e anotações por ambiente ou elemento observado. Cada registro pode reunir localização, descrição e referência visual para facilitar a leitura.", y)
    # A schematic record frame intentionally contains no image of an actual property.
    c.setFillColor(colors.HexColor("#E7E6E0"))
    c.roundRect(LEFT + 32, y - 80, RIGHT - LEFT - 32, 77, 4, fill=1, stroke=0)
    text(c, "ESPAÇO DE REGISTRO ILUSTRATIVO", LEFT + 46, y - 15, 8, MUTED, True)
    text(c, "Ambiente: a identificar  ·  Referência: foto / anotação", LEFT + 46, y - 36, 9, MUTED)
    text(c, "Descrição e evidências são preenchidas após a avaliação.", LEFT + 46, y - 54, 9, MUTED)
    y -= 102
    y = section(c, "03", "Pontos a avaliar", "Apresentação das questões identificadas, das informações ainda necessárias e de eventuais análises complementares. Este exemplo não apresenta diagnóstico, classificação de risco ou recomendação de intervenção.", y)
    section(c, "04", "Próximos passos", "Síntese das decisões a organizar: documentos a reunir, esclarecimentos a solicitar e especialidades a consultar, quando aplicável. Formato de entrega e responsabilidades são acordados no escopo.", y)
    footer(c)


def checklist():
    c = new_file("checklist-ilustrativo.pdf", "Checklist para organizar a demanda")
    y = header(c, "Antes da nossa conversa", "Um checklist simples para organizar sua necessidade e aproveitar melhor o primeiro contato sobre o imóvel.", "MODELO 02")
    groups = [
        ("Seu objetivo", ["Descreva o que você quer entender, resolver ou planejar.", "Indique o tipo de imóvel e a cidade ou região.", "Conte em que etapa está: avaliação, projeto, obra ou recebimento."]),
        ("O que você já tem", ["Separe plantas e projetos existentes, se disponíveis.", "Reúna registros anteriores, documentos e informações relevantes.", "Organize fotos que ajudem a explicar a demanda."]),
        ("Como organizar o atendimento", ["Informe prazos, restrições de acesso e pessoas envolvidas.", "Anote as dúvidas que gostaria de esclarecer.", "Confirme o escopo, o formato das entregas e os próximos passos."]),
    ]
    for i, (title, items) in enumerate(groups, 1):
        y = text(c, f"0{i}  {title}", LEFT, y, 12, INK, True) - 15
        for item in items:
            c.setStrokeColor(RUST)
            c.setLineWidth(.8)
            c.roundRect(LEFT + 2, y - 12, 10, 10, 1, fill=0, stroke=1)
            bottom = text(c, item, LEFT + 25, y + 1, 10, MUTED, leading=16)
            y = bottom - 14
        y -= 12
    c.setFillColor(colors.HexColor("#E7E6E0"))
    c.roundRect(LEFT, y - 62, RIGHT - LEFT, 59, 4, fill=1, stroke=0)
    text(c, "VOCÊ PODE COMEÇAR COM UMA DÚVIDA.", LEFT + 14, y - 15, 9, RUST, True)
    text(c, "Não é necessário conhecer a especialidade técnica para explicar o que precisa.", LEFT + 14, y - 34, 9, MUTED)
    footer(c)


def scope():
    c = new_file("escopo-ilustrativo.pdf", "Escopo de assessoria e coordenação")
    y = header(c, "Escopo bem definido", "Uma estrutura para alinhar necessidades, profissionais envolvidos e entregas antes de começar.", "MODELO 03")
    data = [
        ("01", "Necessidade e resultado esperado", "Registrar a demanda do cliente, o contexto do imóvel e as questões que precisam de orientação. Definir o que será incluído e os limites do atendimento."),
        ("02", "Disciplinas e profissionais", "Mapear as especialidades necessárias, como vistoria, projeto estrutural ou hidrossanitário, conforme o caso. Cada profissional assume as atribuições e entregas de sua contratação."),
        ("03", "Entregas e formatos", "Relacionar relatórios, registros, projetos ou orientações previstos no escopo. Definir o formato de recebimento, as revisões e a forma de apresentação. Exemplo de formato: arquivo digital em PDF."),
        ("04", "Organização e responsabilidades", "Alinhar quem fornece informações, quem desenvolve cada entrega e como ocorre a comunicação entre as partes. A assessoria ajuda a organizar as etapas e os encaminhamentos combinados."),
        ("05", "Condições de contratação", "Confirmar etapas, prazos, investimento, dependências e critérios de conclusão em proposta específica. Valor conforme o escopo. Atividades adicionais são alinhadas previamente."),
    ]
    for number, title, body in data:
        y = section(c, number, title, body, y)
    footer(c)


if __name__ == "__main__":
    report()
    checklist()
    scope()
    for path in sorted(OUT.glob("*.pdf")):
        print(f"{path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)")

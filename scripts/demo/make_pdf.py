"""Build the sample price-list PDF the demo videos upload.

Run with the backend venv (reportlab lives there):
    backend/.venv/bin/python scripts/demo/make_pdf.py

The heuristic extractor (backend/app/services/config_extractor.py) reads
`Name - £price` lines as services, `Q:/A:` pairs as FAQs and `<Title> policy:`
followed by its paragraph as a policy, so policies go last.
"""

from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = Path(__file__).parent / "assets" / "brightline-prices.pdf"

LINES = [
    ("Helvetica-Bold", 20, "Brightline Plumbing & Heating"),
    ("Helvetica", 12, "Price list 2026 - all prices include VAT"),
    ("", 0, ""),
    ("Helvetica-Bold", 13, "Services"),
    ("Helvetica", 12, "Powerflush - £395"),
    ("Helvetica", 12, "Boiler service - £89"),
    ("Helvetica", 12, "Radiator replacement - £180"),
    ("Helvetica", 12, "Landlord gas safety certificate - £75"),
    ("Helvetica", 12, "Emergency call-out (out of hours) - £120"),
    ("Helvetica", 12, "Unvented cylinder service - £110"),
    ("", 0, ""),
    ("Helvetica-Bold", 13, "Frequently asked questions"),
    ("Helvetica", 12, "Q: Do you work weekends?"),
    ("Helvetica", 12, "A: Yes, Saturday mornings for emergencies only."),
    ("Helvetica", 12, "Q: Are your engineers Gas Safe registered?"),
    ("Helvetica", 12, "A: Yes, every engineer is Gas Safe registered and insured."),
    ("Helvetica", 12, "Q: Do you offer a warranty?"),
    ("Helvetica", 12, "A: All work comes with a 12 month workmanship guarantee."),
    ("", 0, ""),
    ("Helvetica-Bold", 13, "Cancellation policy:"),
    ("Helvetica", 12, "Please give 48 hours notice or a £40 fee applies."),
    ("", 0, ""),
    ("Helvetica-Bold", 13, "Payment policy:"),
    ("Helvetica", 12, "Card or bank transfer on completion. A 25% deposit secures large jobs."),
]


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=A4)
    y = 790
    for font, size, text in LINES:
        if text:
            c.setFont(font, size)
            c.drawString(60, y, text)
        else:
            # A space-only line survives pypdf extraction as a blank line, which is what
            # the extractor's FAQ/policy regexes use as a section boundary.
            c.drawString(60, y, " ")
        y -= 22 if size <= 13 else 30
    c.save()
    print(f"-> {OUT.relative_to(Path.cwd()) if OUT.is_relative_to(Path.cwd()) else OUT}")


if __name__ == "__main__":
    main()

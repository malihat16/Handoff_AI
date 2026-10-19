"""Generate a sample PDF invoice (needs reportlab): python scripts/make_sample_pdf.py"""
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parent.parent / "samples" / "pdf" / "palm_logistics_invoice.pdf"

LINES = [
    ("Palm Logistics FZCO", 16),
    ("TAX INVOICE", 12),
    ("", 10),
    ("Invoice No: PL-2026-0455", 11),
    ("Invoice Date: 2026-10-06", 11),
    ("Due Date: 2026-11-05", 11),
    ("Bill To: Northwind Retail", 11),
    ("", 10),
    ("Freight Dubai - Riyadh (12 pallets)      AED 3,200.00", 11),
    ("Customs handling                         AED 400.00", 11),
    ("", 10),
    ("Subtotal: AED 3,600.00", 11),
    ("VAT (5%): AED 180.00", 11),
    ("Total Amount Due: AED 3,780.00", 12),
]

OUT.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(OUT), pagesize=A4)
y = 780
for text, size in LINES:
    c.setFont("Helvetica-Bold" if size > 11 else "Helvetica", size)
    c.drawString(60, y, text)
    y -= 22
c.save()
print(f"wrote {OUT}")

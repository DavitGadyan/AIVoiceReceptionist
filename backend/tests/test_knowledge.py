import io

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def make_pdf() -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    y = 800
    for line in [
        "Brightline Price List 2026",
        "",
        "Powerflush - £395",
        "Radiator replacement - £180",
        "",
        "Cancellation policy:",
        "Please give 48 hours notice or a £40 fee applies.",
        "",
        "Q: Do you work weekends?",
        "A: Yes, Saturday mornings for emergencies only.",
    ]:
        c.drawString(60, y, line)
        y -= 18
    c.save()
    return buf.getvalue()


async def test_pdf_upload_extract_and_apply(client, auth):
    r = await client.post("/knowledge/upload", headers=auth,
                          files={"file": ("prices.pdf", make_pdf(), "application/pdf")})
    assert r.status_code == 200, r.text
    doc = r.json()
    changes = doc["proposed_changes"]
    names = [s["name"] for s in changes.get("services", [])]
    assert "Powerflush" in names
    assert changes.get("faqs")

    hits = (await client.get("/knowledge/search", params={"q": "weekends saturday"}, headers=auth)).json()["results"]
    assert hits and "Saturday" in hits[0]

    r = await client.post(f"/knowledge/{doc['id']}/apply", json={"accept": ["services", "faqs"]}, headers=auth)
    prof = r.json()["profile"]
    assert any(s["name"] == "Powerflush" and s["price_from"] == 395 for s in prof["services"])
    assert any(s["name"].startswith("Emergency") for s in prof["services"]), "merge keeps existing services"


async def test_bad_upload_rejected(client, auth):
    r = await client.post("/knowledge/upload", headers=auth, files={"file": ("empty.txt", b"   ", "text/plain")})
    assert r.status_code == 422

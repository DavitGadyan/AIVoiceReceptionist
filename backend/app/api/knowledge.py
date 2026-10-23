from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import delete, select

from app.api.deps import Me, Session, owned
from app.models import KnowledgeChunk, KnowledgeDoc
from app.services import config_extractor, knowledge, profiles

router = APIRouter(prefix="/knowledge", tags=["knowledge"])
MAX_BYTES = 15 * 1024 * 1024


def _doc(d: KnowledgeDoc) -> dict:
    return {"id": d.id, "filename": d.filename, "pages": d.pages, "chars": d.chars, "status": d.status,
            "proposed_changes": d.proposed_changes, "created_at": d.created_at}


@router.get("")
async def list_docs(p: Me, session: Session):
    rows = (await session.scalars(select(KnowledgeDoc).where(KnowledgeDoc.tenant_id == p.tenant_id)
                                  .order_by(KnowledgeDoc.created_at.desc()))).all()
    return [_doc(d) for d in rows]


@router.post("/upload")
async def upload(p: Me, session: Session, file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large (15 MB max)")
    name = file.filename or "document"
    if name.lower().endswith(".pdf") or data[:4] == b"%PDF":
        try:
            text, pages = knowledge.extract_pdf_text(data)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(422, f"Could not read PDF: {exc}") from exc
    else:
        text, pages = data.decode("utf-8", errors="ignore"), 1
    if not text.strip():
        raise HTTPException(422, "No text found — scanned PDFs need OCR first.")
    doc = await knowledge.ingest(session, p.tenant_id, name, text, pages)
    doc.proposed_changes = await config_extractor.propose(text)
    await session.commit()
    return _doc(doc)


class ApplyIn(BaseModel):
    accept: list[str]
    mode: str = "merge"


@router.post("/{doc_id}/apply")
async def apply_changes(doc_id: str, body: ApplyIn, p: Me, session: Session):
    doc = await owned(session, KnowledgeDoc, doc_id, p.tenant_id)
    current, _ = await profiles.get_live(session, p.tenant_id)
    updated = config_extractor.apply(current, doc.proposed_changes, body.accept, body.mode)
    version = await profiles.save(session, p.tenant_id, updated, actor=p.user_id,
                                  note=f"Imported {', '.join(body.accept)} from {doc.filename}")
    return {"version": version, "profile": updated.model_dump(mode="json")}


@router.delete("/{doc_id}")
async def delete_doc(doc_id: str, p: Me, session: Session):
    doc = await owned(session, KnowledgeDoc, doc_id, p.tenant_id)
    await session.execute(delete(KnowledgeChunk).where(KnowledgeChunk.doc_id == doc.id))
    await session.delete(doc)
    await session.commit()
    return {"deleted": True}


@router.get("/search")
async def search(q: str, p: Me, session: Session):
    return {"results": await knowledge.search(session, p.tenant_id, q)}

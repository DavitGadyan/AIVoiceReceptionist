"""PDF/text ingestion and retrieval for the search_knowledge tool."""

import io
import re

from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KnowledgeChunk, KnowledgeDoc
from app.services import llm


def extract_pdf_text(data: bytes) -> tuple[str, int]:
    reader = PdfReader(io.BytesIO(data))
    pages = [(p.extract_text() or "") for p in reader.pages]
    return "\n\n".join(pages), len(pages)


def chunk_text(text: str, size: int = 900, overlap: int = 150) -> list[str]:
    text = re.sub(r"[ \t]+", " ", text).strip()
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    buf = ""
    for p in paras:
        if len(buf) + len(p) + 1 <= size:
            buf = f"{buf}\n{p}".strip()
            continue
        if buf:
            chunks.append(buf)
        while len(p) > size:
            chunks.append(p[:size])
            p = p[size - overlap :]
        buf = p
    if buf:
        chunks.append(buf)
    return chunks


async def ingest(session: AsyncSession, tenant_id: str, filename: str, text: str, pages: int) -> KnowledgeDoc:
    doc = KnowledgeDoc(tenant_id=tenant_id, filename=filename, pages=pages, chars=len(text))
    session.add(doc)
    await session.flush()
    pieces = chunk_text(text)
    vectors = await llm.embed(pieces) or [None] * len(pieces)
    for i, (piece, vec) in enumerate(zip(pieces, vectors, strict=True)):
        session.add(KnowledgeChunk(tenant_id=tenant_id, doc_id=doc.id, ordinal=i, text=piece, embedding=vec))
    await session.commit()
    return doc


_WORD = re.compile(r"[a-z0-9£$€]+")


def _keyword_score(query: str, text: str) -> float:
    q = set(_WORD.findall(query.lower())) - {"the", "a", "an", "do", "you", "is", "are", "what", "how", "i", "my", "can"}
    if not q:
        return 0.0
    t = set(_WORD.findall(text.lower()))
    return len(q & t) / len(q)


async def search(session: AsyncSession, tenant_id: str, query: str, k: int = 3) -> list[str]:
    rows = (await session.scalars(select(KnowledgeChunk).where(KnowledgeChunk.tenant_id == tenant_id))).all()
    if not rows:
        return []
    qvec = await llm.embed([query])
    scored: list[tuple[float, str]] = []
    for r in rows:
        if qvec and r.embedding:
            score = llm.cosine(qvec[0], r.embedding)
        else:
            score = _keyword_score(query, r.text)
        scored.append((score, r.text))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [t for s, t in scored[:k] if s > 0.15]

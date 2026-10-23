from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import Principal, current_principal

Session = Annotated[AsyncSession, Depends(get_session)]
Me = Annotated[Principal, Depends(current_principal)]


async def owned(session: AsyncSession, model, obj_id: str, tenant_id: str):
    """Fetch a row only if it belongs to the caller's tenant — cross-tenant access looks like 404."""
    obj = await session.get(model, obj_id)
    if obj is None or getattr(obj, "tenant_id", None) != tenant_id:
        raise HTTPException(404, "Not found")
    return obj

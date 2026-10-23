from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, ProfileVersion
from app.schemas.profile import BusinessProfile


async def get_live(session: AsyncSession, tenant_id: str) -> tuple[BusinessProfile, int]:
    row = await session.scalar(
        select(ProfileVersion)
        .where(ProfileVersion.tenant_id == tenant_id)
        .order_by(ProfileVersion.version.desc())
        .limit(1)
    )
    if row is None:
        return BusinessProfile(), 0
    return BusinessProfile.model_validate(row.data), row.version


async def save(
    session: AsyncSession, tenant_id: str, profile: BusinessProfile, actor: str, note: str = ""
) -> int:
    current = await session.scalar(
        select(func.max(ProfileVersion.version)).where(ProfileVersion.tenant_id == tenant_id)
    )
    version = (current or 0) + 1
    session.add(
        ProfileVersion(
            tenant_id=tenant_id,
            version=version,
            data=profile.model_dump(mode="json"),
            note=note,
            created_by=actor,
        )
    )
    session.add(AuditLog(tenant_id=tenant_id, actor=actor, action="profile.saved", data={"version": version, "note": note}))
    await session.commit()
    return version

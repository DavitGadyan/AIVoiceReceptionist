from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import Me, Session
from app.models import ProfileVersion, Tenant
from app.schemas.profile import BusinessProfile
from app.services import presets, profiles
from app.services.prompt_builder import build_system_prompt

router = APIRouter(tags=["settings"])


@router.get("/presets")
async def list_presets():
    return [
        {"key": k, "label": v.get("label", k), "summary": v.get("summary", ""), "profile": v.get("profile", {})}
        for k, v in presets.load_presets().items()
    ]


@router.get("/settings/profile")
async def get_profile(p: Me, session: Session):
    profile, version = await profiles.get_live(session, p.tenant_id)
    return {"version": version, "profile": profile.model_dump(mode="json")}


@router.put("/settings/profile")
async def put_profile(body: BusinessProfile, p: Me, session: Session, note: str = ""):
    version = await profiles.save(session, p.tenant_id, body, actor=p.user_id, note=note or "Edited in settings")
    tenant = await session.get(Tenant, p.tenant_id)
    if tenant:
        tenant.name, tenant.industry = body.business_name, body.industry
        await session.commit()
    return {"version": version}


class PresetIn(BaseModel):
    industry: str
    keep_business_details: bool = True


@router.post("/settings/apply-preset")
async def apply_preset(body: PresetIn, p: Me, session: Session):
    if body.industry not in presets.load_presets():
        raise HTTPException(422, "Unknown preset")
    current, _ = await profiles.get_live(session, p.tenant_id)
    keep = {}
    if body.keep_business_details:
        keep = current.model_dump(include={"business_name", "address", "website", "timezone", "currency", "hours",
                                           "escalation", "transfer_number", "assistant_name", "voice"})
    new = presets.profile_from_preset(body.industry, **keep)
    version = await profiles.save(session, p.tenant_id, new, actor=p.user_id, note=f"Applied {body.industry} preset")
    return {"version": version, "profile": new.model_dump(mode="json")}


@router.get("/settings/versions")
async def versions(p: Me, session: Session):
    rows = (await session.scalars(select(ProfileVersion).where(ProfileVersion.tenant_id == p.tenant_id)
                                  .order_by(ProfileVersion.version.desc()).limit(50))).all()
    return [{"version": r.version, "note": r.note, "created_by": r.created_by, "created_at": r.created_at} for r in rows]


@router.post("/settings/versions/{version}/restore")
async def restore(version: int, p: Me, session: Session):
    row = await session.scalar(select(ProfileVersion).where(ProfileVersion.tenant_id == p.tenant_id, ProfileVersion.version == version))
    if row is None:
        raise HTTPException(404, "Not found")
    v = await profiles.save(session, p.tenant_id, BusinessProfile.model_validate(row.data), actor=p.user_id, note=f"Restored v{version}")
    return {"version": v}


@router.get("/settings/prompt-preview")
async def prompt_preview(p: Me, session: Session):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    profile, _ = await profiles.get_live(session, p.tenant_id)
    return {"prompt": build_system_prompt(profile, datetime.now(ZoneInfo(profile.timezone)))}

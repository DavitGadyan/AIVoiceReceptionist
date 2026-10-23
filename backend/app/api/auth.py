import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.api.deps import Me, Session
from app.core.security import create_token, hash_password, verify_password
from app.models import PhoneNumber, Tenant, User
from app.services import presets, profiles

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


class SignupIn(BaseModel):
    business_name: str
    industry: str = "generic"
    email: EmailStr
    password: str
    name: str = ""
    phone_number: str | None = None
    timezone: str = "Europe/London"
    currency: str = "GBP"


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:50] or "tenant"


@router.post("/login")
async def login(body: LoginIn, session: Session):
    user = await session.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return {"token": create_token(user.id, user.tenant_id, user.role), "tenant_id": user.tenant_id}


@router.post("/signup")
async def signup(body: SignupIn, session: Session):
    if await session.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "Email already registered")
    if body.industry not in presets.load_presets():
        raise HTTPException(422, f"Unknown industry; choose one of {sorted(presets.load_presets())}")
    slug = _slug(body.business_name)
    if await session.scalar(select(Tenant).where(Tenant.slug == slug)):
        slug = f"{slug}-{len(slug)}{body.email[:3]}"
    tenant = Tenant(slug=slug, name=body.business_name, industry=body.industry)
    session.add(tenant)
    await session.flush()
    user = User(tenant_id=tenant.id, email=body.email.lower(), name=body.name, password_hash=hash_password(body.password))
    session.add(user)
    if body.phone_number:
        session.add(PhoneNumber(tenant_id=tenant.id, e164=body.phone_number))
    await session.flush()
    profile = presets.profile_from_preset(body.industry, business_name=body.business_name,
                                          timezone=body.timezone, currency=body.currency)
    await profiles.save(session, tenant.id, profile, actor=user.email, note=f"Created from {body.industry} preset")
    return {"token": create_token(user.id, tenant.id, user.role), "tenant_id": tenant.id, "slug": tenant.slug}


@router.get("/me")
async def me(p: Me, session: Session):
    user = await session.get(User, p.user_id)
    tenant = await session.get(Tenant, p.tenant_id)
    if user is None or tenant is None:
        raise HTTPException(401, "Unknown user")
    return {
        "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role},
        "tenant": {"id": tenant.id, "slug": tenant.slug, "name": tenant.name, "industry": tenant.industry, "plan": tenant.plan},
    }

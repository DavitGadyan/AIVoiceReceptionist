"""Database tables. Every operational row carries tenant_id; all queries filter on it."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.ids import new_id, utcnow


def pk() -> Mapped[str]:
    return mapped_column(String(32), primary_key=True, default=new_id)


def tenant_fk() -> Mapped[str]:
    return mapped_column(String(32), ForeignKey("tenants.id", ondelete="CASCADE"), index=True)


def created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[str] = pk()
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    industry: Mapped[str] = mapped_column(String(64), default="generic")
    plan: Mapped[str] = mapped_column(String(32), default="starter")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = created()


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    email: Mapped[str] = mapped_column(String(200), unique=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[str] = mapped_column(String(32), default="owner")
    password_hash: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = created()


class ProfileVersion(Base):
    """Versioned business profile. The latest row is live; calls record which version they ran."""

    __tablename__ = "profile_versions"
    __table_args__ = (UniqueConstraint("tenant_id", "version"),)
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    version: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    note: Mapped[str] = mapped_column(String(300), default="")
    created_by: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = created()


class PhoneNumber(Base):
    __tablename__ = "phone_numbers"
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    e164: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(100), default="Main line")
    country: Mapped[str] = mapped_column(String(4), default="GB")
    provider: Mapped[str] = mapped_column(String(32), default="vapi")
    provider_ref: Mapped[str] = mapped_column(String(100), default="")
    forwarding_mode: Mapped[str] = mapped_column(String(32), default="dedicated")  # dedicated | forward_unanswered
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = created()


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("tenant_id", "phone"),)
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    name: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(32), index=True)
    email: Mapped[str] = mapped_column(String(200), default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    kind: Mapped[str] = mapped_column(String(32), default="lead")  # lead | customer | staff | vendor | spam
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    spam_score: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = created()


class Call(Base):
    __tablename__ = "calls"
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    provider: Mapped[str] = mapped_column(String(32), default="vapi")
    provider_call_id: Mapped[str] = mapped_column(String(100), default="", index=True)
    channel: Mapped[str] = mapped_column(String(16), default="phone")  # phone | web | chat | sim
    direction: Mapped[str] = mapped_column(String(16), default="inbound")
    from_number: Mapped[str] = mapped_column(String(32), default="")
    to_number: Mapped[str] = mapped_column(String(32), default="")
    contact_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="live")  # live | ended
    outcome: Mapped[str] = mapped_column(String(40), default="")
    intent: Mapped[str] = mapped_column(String(40), default="")
    urgency: Mapped[str] = mapped_column(String(16), default="normal")
    summary: Mapped[str] = mapped_column(Text, default="")
    transcript: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    extracted: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    recording_url: Mapped[str] = mapped_column(String(500), default="")
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    after_hours: Mapped[bool] = mapped_column(Boolean, default=False)
    needs_attention: Mapped[bool] = mapped_column(Boolean, default=False)
    profile_version: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = created()
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CallEvent(Base):
    """Tool calls and notable moments during a call, for audit and the timeline view."""

    __tablename__ = "call_events"
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    call_id: Mapped[str] = mapped_column(String(32), ForeignKey("calls.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(40))
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = created()


class Appointment(Base):
    __tablename__ = "appointments"
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    contact_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=True)
    call_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    service: Mapped[str] = mapped_column(String(200), default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="booked")  # booked | cancelled | completed | no_show
    notes: Mapped[str] = mapped_column(Text, default="")
    external_ref: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = created()


class Task(Base):
    """The 'needs attention' queue: callbacks, escalations, failures, unconverted leads."""

    __tablename__ = "tasks"
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    call_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    contact_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    kind: Mapped[str] = mapped_column(String(40))  # CALLBACK_REQUIRED | URGENT | STAFF_MESSAGE | ...
    title: Mapped[str] = mapped_column(String(300))
    detail: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[str] = mapped_column(String(16), default="normal")
    status: Mapped[str] = mapped_column(String(16), default="open")  # open | done
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = created()


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    call_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    channel: Mapped[str] = mapped_column(String(16))  # sms | whatsapp | email | webhook
    to: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued | sent | failed | simulated
    error: Mapped[str] = mapped_column(Text, default="")
    send_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = created()


class KnowledgeDoc(Base):
    __tablename__ = "knowledge_docs"
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    filename: Mapped[str] = mapped_column(String(300))
    pages: Mapped[int] = mapped_column(Integer, default=0)
    chars: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="ready")
    proposed_changes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = created()


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    doc_id: Mapped[str] = mapped_column(String(32), ForeignKey("knowledge_docs.id", ondelete="CASCADE"), index=True)
    ordinal: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(JSON, nullable=True)


class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    url: Mapped[str] = mapped_column(String(500))
    events: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["call.ended"])
    secret: Mapped[str] = mapped_column(String(64), default=new_id)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = created()


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    actor: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(100))
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = created()


class Integration(Base):
    """Per-tenant third-party connection (calendar, CRM, messaging). Secrets never leave the API."""

    __tablename__ = "integrations"
    __table_args__ = (UniqueConstraint("tenant_id", "kind"),)
    id: Mapped[str] = pk()
    tenant_id: Mapped[str] = tenant_fk()
    kind: Mapped[str] = mapped_column(String(32))  # calcom | google_calendar | twilio | whatsapp | make | hubspot
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    secrets: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = created()

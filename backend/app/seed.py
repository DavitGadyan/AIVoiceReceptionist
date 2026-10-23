"""Demo data: one login per industry and a realistic week of calls for the main demo tenant."""

import random
from datetime import timedelta

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.ids import utcnow
from app.core.security import hash_password
from app.models import Appointment, Call, CallEvent, Contact, PhoneNumber, Task, Tenant, User
from app.schemas.profile import EscalationContact
from app.services import presets, profiles

DEMO_PASSWORD = "demo1234"

TENANTS = [
    ("brightline", "Brightline Plumbing & Heating", "home-services", "+441615550100", "Europe/London", "GBP",
     {"service_area": ["M1", "M2", "M3", "M4", "M5", "M8", "M13", "M14", "M15", "M16", "M20", "M21", "SK4"],
      "service_area_note": "We cover Manchester and south Stockport.", "address": "12 Ancoats Lane, Manchester M4 6DE",
      "transfer_number": "+447700900456", "assistant_name": "Ava"}),
    ("aligned-clinic", "Aligned Chiropractic", "clinic", "+442075550111", "Europe/London", "GBP",
     {"assistant_name": "Mia", "address": "33 Battersea Rise, London SW11"}),
    ("glow-medspa", "Glow Aesthetics", "med-spa", "+13055550122", "America/New_York", "USD", {"assistant_name": "Sophie"}),
    ("cut-and-co", "Cut & Co Salon", "salon", "+14155550133", "America/Los_Angeles", "USD", {"assistant_name": "Jess"}),
    ("harbor-law", "Harbor Injury Law", "legal-intake", "+13125550144", "America/Chicago", "USD", {"assistant_name": "Grace"}),
    ("keystone-homes", "Keystone Estates", "real-estate", "+441135550155", "Europe/London", "GBP", {"assistant_name": "Oliver"}),
    ("canvas-marquees", "Canvas & Co Marquees", "event-hire", "+441225550166", "Europe/London", "GBP", {"assistant_name": "Hannah"}),
]

CONTACTS = [
    ("Sarah Jones", "+447700900111", "customer"), ("Tom Fletcher", "+447700900222", "lead"),
    ("Priya Shah", "+447700900333", "customer"), ("Daniel Okafor", "+447700900444", "lead"),
    ("Emma Walsh", "+447700900555", "customer"), ("Liam Brennan", "+447700900666", "lead"),
    ("Grace Thompson", "+447700900777", "customer"), ("", "+448000123456", "spam"),
]

SCRIPTS = [
    ("BOOKING", "BOOKED", "normal", "Boiler making a banging noise, wants a service this week.",
     [("assistant", "Hi, thanks for calling Brightline Plumbing & Heating. I'm Ava, the AI assistant. How can I help today?"),
      ("user", "Hi, my boiler's been making a banging noise when the heating comes on."),
      ("assistant", "That sounds like it could be kettling — worth getting looked at. Can I take your name?"),
      ("user", "It's Sarah Jones."),
      ("assistant", "Thanks Sarah. What's the postcode for the property?"),
      ("user", "M20 2RN."),
      ("assistant", "Great, that's in our area. I have Thursday at 9:30, 11:00 or 2:00. Which suits?"),
      ("user", "Eleven works."),
      ("assistant", "You're booked for a boiler service on Thursday at 11am. I've texted you a confirmation.")]),
    ("EMERGENCY", "EMERGENCY", "emergency", "Burst pipe under kitchen sink, water spreading. On-call tech alerted.",
     [("assistant", "Hi, thanks for calling Brightline. I'm Ava, the AI assistant. How can I help?"),
      ("user", "There's water everywhere, a pipe's burst under the sink!"),
      ("assistant", "Please turn off your main water stopcock if it's safe to do so and keep away from electrics near the water. I'm alerting our on-call technician right now. What's the address?"),
      ("user", "14 Wilmslow Road, M14 5TQ."),
      ("assistant", "Thank you. Our technician will call you within 10 minutes.")]),
    ("QUOTE", "UNCONVERTED", "normal", "Asked for a price for a new bathroom suite; wants to think about it.",
     [("assistant", "Hi, thanks for calling Brightline. How can I help?"),
      ("user", "How much would a new bathroom suite cost roughly?"),
      ("assistant", "Installs are quoted after a free estimate visit, so I can't give an exact price by phone. Would you like me to book a free estimate?"),
      ("user", "Let me talk to my partner first. I'm Tom."),
      ("assistant", "Of course, Tom. I'll send you a text with our details.")]),
    ("FAQ", "FAQ_RESOLVED", "low", "Asked whether engineers are Gas Safe registered.",
     [("assistant", "Hi, thanks for calling Brightline. How can I help?"),
      ("user", "Are your engineers Gas Safe registered?"),
      ("assistant", "Yes — fully insured, and our engineers hold the relevant certifications. Anything else?"),
      ("user", "No that's all, thanks.")]),
    ("MESSAGE", "CALLBACK_REQUIRED", "high", "Wants to speak to the engineer about last week's job; no one available.",
     [("assistant", "Hi, thanks for calling Brightline. How can I help?"),
      ("user", "Can I speak to the plumber who came out last Tuesday?"),
      ("assistant", "Nobody's free to take the call right now, so I've asked the team to call you back as soon as possible.")]),
    ("SALES", "SALES_CALL", "low", "Unsolicited call about business electricity contract.",
     [("assistant", "Hi, thanks for calling Brightline. How can I help?"),
      ("user", "Hi, I'm calling about your business electricity contract, can I speak to the owner?"),
      ("assistant", "Thanks for calling, but Brightline isn't taking sales calls. Please email instead. Goodbye!")]),
]


async def seed() -> None:
    async with SessionLocal() as session:
        if await session.scalar(select(Tenant).limit(1)):
            return
        main_tenant = None
        for slug, name, industry, number, tz, cur, extra in TENANTS:
            t = Tenant(slug=slug, name=name, industry=industry, plan="pro")
            session.add(t)
            await session.flush()
            email = "demo@receptra.ai" if slug == "brightline" else f"{slug}@receptra.ai"
            session.add(User(tenant_id=t.id, email=email, name="Alex Morgan", password_hash=hash_password(DEMO_PASSWORD)))
            session.add(PhoneNumber(tenant_id=t.id, e164=number, label="Main line", country="GB" if number.startswith("+44") else "US"))
            profile = presets.profile_from_preset(industry, business_name=name, timezone=tz, currency=cur, **extra)
            profile.escalation = [EscalationContact(name="Alex Morgan", role="Owner", phone="+447700900456",
                                                    email=email, receives=["urgent", "callback", "summary"])]
            await profiles.save(session, t.id, profile, actor="seed", note="Demo seed")
            if slug == "brightline":
                main_tenant = t
        await _seed_activity(session, main_tenant)
        await session.commit()


async def _seed_activity(session, tenant: Tenant) -> None:
    rnd = random.Random(7)
    now = utcnow()
    contacts = []
    for name, phone, kind in CONTACTS:
        c = Contact(tenant_id=tenant.id, name=name, phone=phone, kind=kind, tags=["sales"] if kind == "spam" else [],
                    spam_score=0.9 if kind == "spam" else 0.0, blocked=kind == "spam",
                    email=f"{name.split()[0].lower()}@example.com" if name else "")
        session.add(c)
        contacts.append(c)
    await session.flush()
    for i in range(46):
        intent, outcome, urgency, summary, lines = SCRIPTS[i % len(SCRIPTS)] if i % 7 else SCRIPTS[0]
        contact = contacts[-1] if intent == "SALES" else contacts[rnd.randrange(len(contacts) - 1)]
        started = now - timedelta(days=rnd.randint(0, 13), hours=rnd.randint(0, 11), minutes=rnd.randint(0, 59))
        dur = rnd.randint(45, 260)
        call = Call(
            tenant_id=tenant.id, provider="vapi", channel="phone", from_number=contact.phone, to_number="+441615550100",
            contact_id=contact.id, status="ended", outcome=outcome, intent=intent, urgency=urgency,
            summary=summary.replace("Sarah Jones", contact.name or "Caller"),
            transcript=[{"role": r, "text": t} for r, t in lines], duration_seconds=dur, cost_usd=round(dur / 60 * 0.13, 3),
            after_hours=started.hour < 8 or started.hour >= 18, started_at=started, ended_at=started + timedelta(seconds=dur),
            needs_attention=outcome in ("CALLBACK_REQUIRED", "EMERGENCY", "UNCONVERTED") and i < 10, profile_version=1,
            extracted={"name": contact.name, "phone": contact.phone, "postcode": "M20 2RN", "reason": summary},
            recording_url="",
        )
        session.add(call)
        await session.flush()
        if outcome == "BOOKED":
            st = now + timedelta(days=rnd.randint(0, 6), hours=rnd.randint(1, 8))
            st = st.replace(minute=0, second=0, microsecond=0)
            session.add(Appointment(tenant_id=tenant.id, contact_id=contact.id, call_id=call.id, service="Boiler / furnace service",
                                    starts_at=st, ends_at=st + timedelta(hours=1)))
            session.add(CallEvent(tenant_id=tenant.id, call_id=call.id, kind="tool:book_appointment",
                                  data={"args": {"service": "Boiler / furnace service"}, "result": {"success": True}}))
        if call.needs_attention:
            session.add(Task(tenant_id=tenant.id, call_id=call.id, contact_id=contact.id, kind=outcome,
                             title=f"{outcome.replace('_', ' ').title()}: {contact.name or contact.phone}", detail=call.summary,
                             priority="urgent" if outcome == "EMERGENCY" else "high", created_at=started))

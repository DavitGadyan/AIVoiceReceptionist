# Upwork portfolio copy — Receptra

Files to upload from `scripts/demo/out/`: `showreel.mp4` first, then `voice-demo.mp4`, `pdf-config.mp4`,
`activity.mp4`. Use the matching `.jpg` as each item's thumbnail. Upwork's portfolio player is 16:9, which
these are. The profile *introduction video* is a separate field and needs a public YouTube link.

---

## Project title (≤ 70 characters)

AI Voice Receptionist SaaS — answers, books and texts for any business

## Your role

Full-stack developer and product designer. I built the whole thing: FastAPI backend, Next.js frontend, voice
integration, PDF onboarding, dashboard, and the demo videos.

## Project description (short)

Small businesses lose jobs every time a call hits voicemail — the plumber is under a sink, the clinic is with
a patient, the agency has closed. Receptra picks up every call in a natural voice, books the job straight into
the calendar, flags emergencies, hands over to a human when it should, and texts both sides a summary. A new
business is onboarded in about an hour from a form or a price-list PDF, so the same product sells to trades,
clinics, salons, law firms, estate agents and event hire without new development.

## Screen recording comments (2–3 sentences each)

**showreel.mp4 — Product walkthrough (90 s)**
From the landing page to a live call being booked on the dashboard, with no person on the line. You see the
call transcript and every tool the receptionist used, a text sent back to the caller, and a price list PDF
turned into the receptionist's settings with one approval click.

**voice-demo.mp4 — The receptionist handles a booking (34 s)**
This is the same brain, prompt and tools that run on the phone line, driven by text so the demo works with no
API keys. It checks real availability, offers three slots, takes the caller's name and only says "booked" after
the calendar confirms. The outcome, summary and extracted fields land in the dashboard automatically.

**pdf-config.mp4 — Onboarding from a PDF (25 s)**
Drop in the price list a business already has and Receptra proposes services with prices, FAQs and policies.
The owner ticks what's right, applies it as a new settings version, and the next call quotes the new prices.
The document is also searchable on calls, so the receptionist can answer "do you work weekends?" from it.

**activity.mp4 — Activity and triage (30 s)**
Every call in one place: outcome, transcript, recording and the next step. Emergencies and callbacks rise to
the top so the on-call person can resolve them, and the caller can be texted back from the same thread.

## Skills

FastAPI · Python · Next.js · TypeScript · React · Tailwind CSS · Vapi · Twilio · OpenAI API · SaaS ·
Multi-tenant architecture · Webhooks · SQLAlchemy · Playwright · Three.js

---

## Optional: longer description (if the field allows it)

Small businesses lose jobs every time a call goes to voicemail: the plumber is under a sink, the clinic is
between patients, the agency has closed for the day. Receptra is a multi-tenant AI receptionist that answers
every call in a natural voice, books the job against a live calendar, triages emergencies with a safety
script, hands over to a human when it should, and texts both sides a summary.

Each business is onboarded from a form or a PDF, not from code. Upload a price list or policy document and
Receptra proposes services, prices, FAQs and policies for approval, field by field. Industry presets (trades,
clinics, salons, legal intake, estate agents, event hire) pre-load the questions to ask, what counts as urgent
and what the receptionist must never promise. Every call records which configuration version it ran with.

Under the hood: a FastAPI backend with strict tenant isolation, versioned business profiles, 13 receptionist
tools shared by the phone line, web chat and a text simulator, signed webhooks for Make/n8n/Zapier, Cal.com and
internal calendar bookings, Twilio SMS/WhatsApp notifications, follow-up sequences, spam screening and a live
dashboard over server-sent events. The voice layer is a pluggable adapter (Vapi first, Retell/Pipecat stubs)
so the provider can change without touching the business logic. The frontend is Next.js 15 with a
liquid-glass design and a photoreal 3D receptionist hero.

Honest note on the demo: it runs with no API keys, so the voice line is replaced by a text simulator that uses
the same brain, and SMS is shown as "Simulated". With OpenAI, Vapi and Twilio keys in the environment, the
same code answers real phone calls.

## Captions as burned into each video

**showreel.mp4**
1. Answers every call. Books the job. Texts you the summary.
2. One receptionist, pre-configured for your trade.
3. One login per business. Seven demo tenants included.
4. A caller rings in… the receptionist answers on its own.
5. Checks availability, offers three slots, takes the name…
6. Booked, summarised, KPIs updated. No human involved.
7. Every tool call is logged. Full transcript, extracted fields.
8. Text the caller back. SMS is simulated here — no Twilio keys in the demo.
9. Drop a price list PDF. It proposes services, FAQs and policies.
10. You approve each change. Nothing is overwritten silently.
11. The next call already quotes the new prices.

**voice-demo.mp4**
1. Same brain, prompt and tools as the phone line. Vapi + Twilio in production.
2. It checks the live calendar and offers three slots.
3. Only confirms once the booking tool succeeds.
4. Outcome, summary and extracted fields, ready for the dashboard and your CRM.

**pdf-config.mp4**
1. Onboarding a new business: upload the documents you already have.
2. Services with prices, FAQs and policies, proposed field by field.
3. Don't want one? Untick it.
4. Saved as a new settings version. The next call uses it.
5. The document is searchable on calls, too.

**activity.mp4**
1. Every call in one place: outcome, transcript, recording, next step.
2. Emergencies and callbacks rise to the top.
3. Resolve it when the on-call engineer has taken it.
4. Text the caller back from the thread. Simulated here, Twilio in production.

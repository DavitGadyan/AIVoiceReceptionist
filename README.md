# Receptra — AI Voice Receptionist

A generic, multi-tenant AI receptionist built to cover the common brief behind dozens of
"AI voice receptionist" jobs (trades, clinics, med spas, salons, law-firm intake, estate agents,
event hire). One codebase; each business is **configuration, not code**.

- Answers calls 24/7, as overflow or after hours, with an AI and recording disclosure
- Captures leads, triages emergencies with a per-business safety script, checks the service area
- Books, reschedules and cancels appointments (internal calendar or Cal.com, or texts a booking link). It only says "confirmed" once the booking succeeds.
- Warm transfer with a summary, or a callback task when nobody can take the call
- After each call: transcript, 2-sentence summary, extracted fields, outcome, SMS/WhatsApp/email summary, and signed webhooks for Make, n8n or a CRM
- Texts back missed calls and sends 2/5/10-day follow-ups to unconverted leads
- Screens spam and sales calls, with progressive blocking
- Dashboard covering activity, contacts, call flow, knowledge (PDF import), a test-call simulator, numbers, analytics, billing and settings

```
backend/   FastAPI · SQLAlchemy (SQLite dev / Postgres prod) · OpenAI · Vapi adapter (Retell/Pipecat stubs)
frontend/  Next.js 15 · Tailwind v4 "liquid glass" skin · react-three-fiber hero · recharts · Vapi Web SDK
scripts/   hf_assets.py — portrait/marketing image generation + local depth maps, with a hard $5 spend ledger
```

## Look & feel

The UI reproduces the **IVR Web App** reference (dark hero with a floating head, light admin shell with a
left sidebar, call-flow tree, three-column activity view) re-skinned as **liquid glass**: every panel is a
frosted translucent pane over a slow-moving aurora (`frontend/app/globals.css`, `components/ui/Aurora.tsx`).
The hero shows a photoreal AI-generated receptionist rendered as a 3D relief: the portrait is displaced by
its depth map so she turns with the cursor and glows while the browser demo call is speaking
(`components/head3d/Portrait3D.tsx`). If the portrait files are missing the hero falls back to a generated
GLB, then to a procedural avatar.

Regenerating the hero portrait and the landing-page industry photos:

```bash
scripts/.venv/bin/python scripts/hf_assets.py portrait --n 4   # FLUX via HF/fal (needs a token), or use Higgsfield
scripts/.venv/bin/python scripts/hf_assets.py depth 2          # publishes portrait_2 + a local ONNX depth map (free)
scripts/.venv/bin/python scripts/hf_assets.py images           # industry-*.jpg + og; add --only industry-legal,... to retry some
scripts/.venv/bin/python scripts/hf_assets.py status           # spend ledger (cap $5)
```

Industry cards read `frontend/public/images/industry-{home-services,clinic,salon,legal,real-estate,events}.jpg`
and fall back to a tinted glass scene with the industry icon while a photo is missing. Without an HF token the
script uses free ZeroGPU Spaces, which ration anonymous runs — rerun later or put a token in
`~/.cache/huggingface/token` to finish the set.

## Run locally

```bash
cp .env.example .env                       # all keys optional for the demo
cd backend && uv venv && uv pip install -e '.[dev]' && .venv/bin/uvicorn app.main:app --reload
cd frontend && npm install && npm run dev  # http://localhost:3000
```

Demo login: `demo@receptra.ai` / `demo1234` (plumbing). One demo tenant per industry:
`aligned-clinic@`, `glow-medspa@`, `cut-and-co@`, `harbor-law@`, `keystone-homes@`, `canvas-marquees@receptra.ai`.

Without an OpenAI key the receptionist uses a rule-based brain, so the simulator, tests and demo all work offline.

Tests: `cd backend && .venv/bin/pytest` (tenant isolation, PDF import, Vapi webhook lifecycle, and booking, emergency, spam, out-of-area, transfer and running-late scenarios).

## Go live with a real phone number (Vapi)

1. Put `OPENAI_API_KEY`, `VAPI_API_KEY`, `VAPI_PUBLIC_KEY` and `VAPI_WEBHOOK_SECRET` in `.env`.
2. Expose the backend publicly (`cloudflared tunnel --url http://localhost:8000`) and set `PUBLIC_BASE_URL`.
3. In Vapi, buy or import a number (Twilio, Telnyx or Vapi) and set its **Server URL** to `PUBLIC_BASE_URL/voice/vapi/events`, with the same secret. Leave the assistant empty: the backend returns a per-call assistant from the business profile. Alternatively, add the number under **Numbers** with its Vapi id and it is attached automatically.
4. Call the number. The transcript, summary and SMS appear in **Activity** within seconds.

To keep the business's existing number, forward unanswered or busy calls to the AI number
(UK: `**61*<number>#`; US carriers: conditional forwarding `*71`/`*72`, depending on carrier).

## Onboard a new business (about 1 hour)

1. **Sign up** and pick the industry preset (services, intake questions, emergency rules and tone are pre-filled).
2. **Knowledge**: upload the price list or policy PDF and approve the proposed services, FAQs, policies and hours field by field.
3. **Settings**: greeting, voice, hours, escalation contacts, transfer number, booking method, compliance.
4. **Numbers**: attach the phone number. **Call flow**: choose AI-first, overflow or after-hours.
5. **Test call**: run the scenario chips (booking, emergency, price, human, spam, running late).
6. Optionally add a **webhook** for Make or n8n. The payload is signed with HMAC-SHA256 in the `x-receptra-signature` header.

Every save creates a profile version, and each call records the version it ran with, so any version can be restored.

## Running cost per business (estimate)

Blended estimate of about $0.13/min (Vapi platform, Deepgram STT, GPT-4o-mini, ElevenLabs TTS, Twilio minutes),
about $0.008 per SMS and about $1.15/month for the number:

| Voice minutes / month | + 300 SMS | ≈ monthly cost |
|---|---|---|
| 200 | yes | ~$30 |
| 500 | yes | ~$69 |
| 1,000 | yes | ~$134 |

To roughly halve this, move to the self-hosted pipeline (Pipecat/LiveKit + Deepgram + Cartesia,
$0.03–0.05/min). The `VoiceProvider` interface keeps business logic unchanged.

## Architecture

```
Caller → Twilio/Vapi number → Vapi (STT · LLM · TTS, barge-in)
   ├─ assistant-request  → tenant by dialed number → prompt from industry preset + profile
   ├─ tool-calls         → Reception Brain tools (lookup, book, transfer, notify, …)
   └─ end-of-call-report → summary · outcome · SMS/WhatsApp/email · webhooks · follow-ups
Dashboard ← REST + SSE live events
```

Web chat, the simulator and phone calls all run through the same tools (`backend/app/services/tools.py`).

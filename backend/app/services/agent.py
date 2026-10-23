"""Text-turn receptionist used by web chat, the dashboard simulator and regression tests.

With an OpenAI key it runs the real prompt + tools loop (same prompt and tools Vapi gets).
Without one it falls back to a rule-based agent so demos and tests run offline.
"""

import json
import re
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.core.config import get_settings
from app.services import llm, screening
from app.services.prompt_builder import build_system_prompt, render_greeting
from app.services.tools import TOOL_SCHEMAS, ToolContext, run_tool


async def greet(ctx: ToolContext) -> str:
    text = render_greeting(ctx.profile, datetime.now(ZoneInfo(ctx.profile.timezone)))
    ctx.call.transcript = [*ctx.call.transcript, {"role": "assistant", "text": text}]
    await ctx.session.commit()
    return text


async def reply(ctx: ToolContext, user_text: str) -> str:
    ctx.call.transcript = [*ctx.call.transcript, {"role": "user", "text": user_text}]
    if llm.client() is not None:
        text = await _llm_turn(ctx)
    else:
        text = await _rule_turn(ctx, user_text)
    ctx.call.transcript = [*ctx.call.transcript, {"role": "assistant", "text": text}]
    await ctx.session.commit()
    return text


# ---- LLM path ---------------------------------------------------------------------------------


async def _llm_turn(ctx: ToolContext) -> str:
    c = llm.client()
    now = datetime.now(ZoneInfo(ctx.profile.timezone))
    messages: list[dict[str, Any]] = [{"role": "system", "content": build_system_prompt(ctx.profile, now)
                                       + f"\nCaller ID: {ctx.call.from_number or 'unknown'}"}]
    for t in ctx.call.transcript:
        messages.append({"role": "assistant" if t["role"] == "assistant" else "user", "content": t["text"]})
    for _ in range(6):
        resp = await c.chat.completions.create(
            model=get_settings().openai_chat_model, messages=messages, tools=TOOL_SCHEMAS, temperature=0.4,
        )
        msg = resp.choices[0].message
        if not msg.tool_calls:
            return msg.content or "Sorry, could you say that again?"
        messages.append({"role": "assistant", "content": msg.content or "",
                         "tool_calls": [tc.model_dump() for tc in msg.tool_calls]})
        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            result = await run_tool(ctx, tc.function.name, args)
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result, default=str)})
    return "Let me get someone from the team to follow up with you on that."


# ---- offline rule-based path ------------------------------------------------------------------

PHONE = re.compile(r"(\+?\d[\d\s-]{8,}\d)")
NAME = re.compile(r"(?i:my name is|this is|i'm|i am|it's|name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)")
UK_POSTCODE = re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b", re.I)
US_ZIP = re.compile(r"\b(\d{5})\b")
HUMAN = re.compile(r"\b(speak|talk) to (a |an )?(person|human|someone|real|manager|owner|the plumber|reception)|\bagent please\b|\boperator\b", re.I)
LATE = re.compile(r"\b(running late|be late|stuck in traffic|delayed|minutes late)\b", re.I)
CANCEL = re.compile(r"\bcancel\b", re.I)
RESCHED = re.compile(r"\b(reschedule|move my|change my (appointment|booking))\b", re.I)
BOOK = re.compile(r"\b(book|appointment|booking|schedule|come out|visit|see someone|available|availability|slot)\b", re.I)
DAYWORD = re.compile(r"\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week)\b", re.I)


async def _rule_turn(ctx: ToolContext, text: str) -> str:
    p, st = ctx.profile, ctx.state
    lower = text.lower()

    # capture any identity details first, in whatever order the caller gives them
    m = NAME.search(text)
    if m:
        st["name"] = m.group(1)
    m = PHONE.search(text)
    if m:
        st["phone"] = re.sub(r"[\s-]", "", m.group(1))
    m = UK_POSTCODE.search(text) or (US_ZIP.search(text) if p.currency in ("USD", "CAD") else None)
    if m:
        st["postcode"] = m.group(1).upper()
    if st.get("name") or st.get("phone"):
        await run_tool(ctx, "capture_lead", {"name": st.get("name"), "phone": st.get("phone") or ctx.call.from_number,
                                             "reason": st.get("reason") or text[:200]})

    if screening.sales_score(lower) >= 0.5:
        ctx.call.outcome = "SALES_CALL"
        await run_tool(ctx, "end_call", {"reason": "unsolicited sales"})
        return f"Thanks for calling, but {p.business_name} isn't taking sales calls. Please email instead. Goodbye!"

    if any(k in lower for k in p.emergency_keywords):
        if not st.get("emergency"):
            st["emergency"] = True
            await run_tool(ctx, "flag_emergency", {"summary": text[:200], "address": st.get("postcode", "")})
            script = p.emergency_script or "I'm alerting the team right now."
            return f"{script} Can I take your name and the address so they can reach you?"

    if HUMAN.search(text):
        r = await run_tool(ctx, "transfer_to_human", {"summary": f"Caller {st.get('name', '')} asked for a person. {text[:120]}"})
        return "Of course — transferring you now, one moment." if r.get("transferred") else r.get("say", "")

    if LATE.search(text):
        mins = re.search(r"(\d+)\s*min", lower)
        await run_tool(ctx, "notify_staff", {"kind": "RUNNING_LATE",
                                             "message": f"{st.get('name', 'Caller')} running {mins.group(1) + ' minutes ' if mins else ''}late. {text[:120]}"})
        return "Thanks for letting us know — I've told the team you're running late. See you soon."

    if CANCEL.search(text):
        r = await run_tool(ctx, "cancel_appointment", {"phone": st.get("phone") or ctx.call.from_number, "reason": text[:120]})
        if r.get("success"):
            pol = f" Just so you know: {r['policy']}" if r.get("policy") else ""
            return f"Done — I've cancelled your appointment on {r['cancelled']}.{pol} Anything else?"
        return "I couldn't find an upcoming booking under this number. Could you give me the number you booked with?"

    if RESCHED.search(text) or (st.get("mode") == "reschedule"):
        st["mode"] = "reschedule"
        if DAYWORD.search(text):
            r = await run_tool(ctx, "check_availability", {"date": DAYWORD.search(text).group(1)})
            if r.get("slots"):
                slot = r["slots"][0]
                r2 = await run_tool(ctx, "reschedule_appointment", {"phone": st.get("phone") or ctx.call.from_number, "new_start_iso": slot["start_iso"]})
                if r2.get("success"):
                    st["mode"] = None
                    return f"All moved — you're now booked for {r2['when']}."
                return r2.get("error", "I couldn't move that booking.")
        return "Sure — what day would suit you better?"

    if p.service_area and st.get("postcode") and not st.get("area_checked"):
        st["area_checked"] = True
        r = await run_tool(ctx, "check_service_area", {"location": st["postcode"]})
        if not r.get("covered"):
            ctx.call.outcome = "MESSAGE_TAKEN"
            return f"I'm sorry, {st['postcode']} is outside the area we cover. {p.service_area_note}".strip()

    if BOOK.search(text) or st.get("mode") == "book":
        st["mode"] = "book"
        st.setdefault("reason", text[:200])
        if "slots" in st and re.search(r"\b(first|1st|that one|yes|perfect|great|sounds good|ok|okay)\b", lower):
            choice = 1 if re.search(r"\b(second|2nd)\b", lower) else 2 if re.search(r"\b(third|3rd)\b", lower) else 0
            if not st.get("name") or not (st.get("phone") or ctx.call.from_number):
                st["pending_slot"] = st["slots"][min(choice, len(st["slots"]) - 1)]
                return "Great. Can I take your full name, please?"
            return await _book(ctx, st["slots"][min(choice, len(st["slots"]) - 1)])
        if st.get("pending_slot") and st.get("name"):
            return await _book(ctx, st.pop("pending_slot"))
        day = DAYWORD.search(text)
        r = await run_tool(ctx, "check_availability", {"date": day.group(1) if day else "today",
                                                      "after_time": "12:00" if "afternoon" in lower else None})
        if not r.get("slots"):
            return r.get("say") or "I can't see availability right now — I'll have someone call you back."
        st["slots"] = r["slots"]
        options = ", ".join(s["label"] for s in r["slots"])
        prefix = "" if r.get("requested_day_available", True) else "That day's full, but "
        return f"{prefix}I have {options}. Which would suit you?"

    # FAQ / price questions
    best = None
    if re.search(r"\b(price|cost|how much|charge|fee)\b", lower):
        priced = [s for s in p.services if s.price_from is not None]
        s = next((s for s in priced if any(w in lower for w in s.name.lower().split() if len(w) > 3)), None)
        if s:
            best = f"{s.name} is from {p.currency} {s.price_from:,.0f}{(' — ' + s.price_note) if s.price_note else ''}."
    for f in p.faqs if best is None else []:
        q_words = set(re.findall(r"[a-z]{4,}", f.question.lower()))
        if q_words and len(q_words & set(re.findall(r"[a-z]{4,}", lower))) >= max(1, len(q_words) // 3):
            best = f.answer
            break
    if best is None and re.search(r"\b(open|hours|close)\b", lower):
        from app.services.hours import describe_hours

        best = f"Our hours are {describe_hours(p)}."
    if best is None:
        r = await run_tool(ctx, "search_knowledge", {"query": text})
        if r.get("found"):
            best = r["passages"][0][:300]
    if best:
        ctx.call.outcome = ctx.call.outcome or "FAQ_RESOLVED"
        return f"{best} Is there anything else I can help with?"

    if re.search(r"\b(no|nope|that's all|thats all|bye|goodbye|thank you|thanks)\b", lower):
        await run_tool(ctx, "end_call", {"reason": "caller finished"})
        return f"Thanks for calling {p.business_name}. Have a lovely day!"

    if not st.get("name"):
        return "I can help with that. Could I take your name first?"
    if not (st.get("phone") or ctx.call.from_number):
        return f"Thanks {st['name']}. What's the best number to reach you on?"
    await run_tool(ctx, "notify_staff", {"kind": "MESSAGE", "message": text[:300]})
    return "I've passed that on to the team and someone will get back to you shortly. Anything else?"


async def _book(ctx: ToolContext, slot: dict[str, Any]) -> str:
    st = ctx.state
    r = await run_tool(ctx, "book_appointment", {
        "start_iso": slot["start_iso"], "name": st.get("name", ""), "phone": st.get("phone") or ctx.call.from_number,
        "service": st.get("service"), "notes": st.get("reason", ""),
    })
    if r.get("success"):
        st["mode"] = None
        st.pop("slots", None)
        return f"You're booked for {r['when']}. I've texted you a confirmation. Anything else?"
    return r.get("error") or "That slot's just gone — shall I find another?"

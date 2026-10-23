"""Turns industry preset + tenant profile into the voice agent's system prompt."""

from datetime import datetime

from app.schemas.profile import BusinessProfile
from app.services.hours import describe_hours, is_open
from app.services.presets import preset_guidance


def _money(profile: BusinessProfile, v: float | None) -> str:
    if v is None:
        return ""
    sym = {"GBP": "£", "USD": "$", "EUR": "€", "CAD": "$", "AUD": "$", "NZD": "$"}.get(profile.currency, "")
    return f"{sym}{v:,.0f}"


def render_greeting(profile: BusinessProfile, at: datetime) -> str:
    template = profile.greeting if is_open(profile, at) else profile.after_hours_greeting
    text = template.format(business_name=profile.business_name, assistant_name=profile.assistant_name)
    if profile.compliance.record_calls and profile.compliance.recording_notice:
        text = f"{text} {profile.compliance.recording_notice}" if "record" not in text.lower() else text
    return text


def build_system_prompt(profile: BusinessProfile, at: datetime) -> str:
    open_now = is_open(profile, at)
    lines: list[str] = []
    lines.append(
        f"You are {profile.assistant_name}, the AI {profile.assistant_role} for {profile.business_name}"
        f"{' — ' + profile.description if profile.description else ''}."
    )
    lines.append(f"Tone: {profile.tone}. Speak naturally in short sentences (1-2 at a time), like a real person on the phone.")
    lines.append(f"Languages: {', '.join(profile.languages)}. Reply in the caller's language if it is one of these.")
    lines.append(f"Current local time: {at.strftime('%A %d %B %Y %H:%M')} ({profile.timezone}). The business is currently {'OPEN' if open_now else 'CLOSED'}.")
    lines.append(f"Opening hours: {describe_hours(profile)}.")
    if profile.address:
        lines.append(f"Address: {profile.address}.")

    lines.append("\n# How to handle calls")
    lines.append(preset_guidance(profile.industry))
    lines.append(
        "Ask only for information you do not already have; never ask the same question twice. "
        "If the caller changes their mind, update and continue rather than restarting."
    )
    req = [f.label for f in profile.intake_fields if f.required]
    opt = [f.label for f in profile.intake_fields if not f.required]
    lines.append(f"Information to collect: {', '.join(req)}" + (f" (optional: {', '.join(opt)})" if opt else "") + ".")
    lines.append("Read phone numbers back digit by digit to confirm. Call capture_lead as soon as you have the caller's name and number.")

    if profile.services:
        lines.append("\n# Services and prices (only quote these)")
        for s in profile.services:
            price = ""
            if s.price_from is not None and s.price_to is not None:
                price = f"{_money(profile, s.price_from)}-{_money(profile, s.price_to)}"
            elif s.price_from is not None:
                price = "free" if s.price_from == 0 else f"from {_money(profile, s.price_from)}"
            note = f" ({s.price_note})" if s.price_note else ""
            lines.append(f"- {s.name}: {s.duration_minutes} min{', ' + price if price else ''}{note}. {s.description}".rstrip())

    if profile.service_area:
        lines.append(f"\nService area: {', '.join(profile.service_area)}. {profile.service_area_note} Use check_service_area when given a postcode/ZIP.")

    if profile.policies:
        lines.append("\n# Policies (apply exactly as written)")
        lines += [f"- {p.title}: {p.body}" for p in profile.policies]

    if profile.faqs:
        lines.append("\n# Approved answers")
        lines += [f"Q: {f.question}\nA: {f.answer}" for f in profile.faqs]
    lines.append("For anything not covered above, call search_knowledge. If it is still not covered, say you'll check and take a message — never guess.")

    if profile.emergency_keywords:
        lines.append("\n# Emergencies")
        lines.append(f"Treat as urgent if the caller mentions: {', '.join(profile.emergency_keywords)}.")
        if profile.emergency_script:
            lines.append(f"Immediately say: \"{profile.emergency_script}\" then call flag_emergency.")

    lines.append("\n# Booking")
    if profile.booking_enabled:
        if profile.booking_provider == "link" and profile.booking_link:
            lines.append("Offer to text the booking link with send_sms_link. Sending a link is NOT a confirmed booking.")
        else:
            lines.append(
                "Use check_availability, offer at most three options, then book_appointment. "
                "Only say an appointment is confirmed after book_appointment returns success. "
                "Use reschedule_appointment / cancel_appointment for existing bookings."
            )
    else:
        lines.append("Do not book; take details and promise a callback.")

    lines.append("\n# Escalation")
    lines.append(
        "If the caller asks for a person, is upset, has a complaint, or you cannot help after two attempts, "
        "use transfer_to_human with a one-line summary. If the transfer fails, take a callback message."
    )
    if not open_now:
        lines.append("The office is closed, so offer to take a message or book rather than transfer, unless it's an emergency.")

    lines.append("\n# Hard rules")
    rules = [
        "You are an AI assistant; if asked, say so honestly.",
        "Never invent prices, availability, arrival times or policies.",
        "Never collect card numbers over the phone.",
    ]
    for d in profile.compliance.no_advice_domains:
        rules.append(f"Never give {d} advice or opinions; route those questions to a qualified person.")
    rules += [f"Never promise: {x}." for x in profile.never_say]
    lines += [f"- {r}" for r in rules]
    if profile.custom_instructions:
        lines.append(f"\n# Business-specific instructions\n{profile.custom_instructions}")
    lines.append("Before ending, briefly summarise what happens next, then call end_call.")
    return "\n".join(line for line in lines if line is not None)

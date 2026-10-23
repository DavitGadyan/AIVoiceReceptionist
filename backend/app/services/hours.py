from datetime import datetime
from zoneinfo import ZoneInfo

from app.schemas.profile import BusinessProfile

DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def is_open(profile: BusinessProfile, at: datetime) -> bool:
    local = at.astimezone(ZoneInfo(profile.timezone))
    day = DAYS[local.weekday()]
    for h in profile.hours:
        if h.day != day:
            continue
        if h.closed or not h.open or not h.close:
            return False
        return h.open <= local.strftime("%H:%M") < h.close
    return False


def describe_hours(profile: BusinessProfile) -> str:
    parts = []
    for h in profile.hours:
        parts.append(f"{h.day.title()}: closed" if h.closed else f"{h.day.title()}: {h.open}-{h.close}")
    return "; ".join(parts)

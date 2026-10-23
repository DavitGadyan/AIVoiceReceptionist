from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from app.schemas.profile import BusinessProfile

PRESET_DIR = Path(__file__).resolve().parent.parent / "presets"


@lru_cache
def load_presets() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for path in sorted(PRESET_DIR.glob("*.yaml")):
        out[path.stem] = yaml.safe_load(path.read_text())
    return out


def preset_guidance(industry: str) -> str:
    preset = load_presets().get(industry) or load_presets()["generic"]
    return preset.get("guidance", "").strip()


def profile_from_preset(industry: str, **overrides: Any) -> BusinessProfile:
    preset = load_presets().get(industry) or load_presets()["generic"]
    data = {**preset.get("profile", {}), **overrides}
    data.setdefault("industry", industry)
    return BusinessProfile.model_validate(data)

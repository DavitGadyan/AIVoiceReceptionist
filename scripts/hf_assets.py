#!/usr/bin/env python3
"""Generate visual assets via Hugging Face, with a hard spend ledger.

Usage (from repo root):
    scripts/.venv/bin/python scripts/hf_assets.py head --n 5
    scripts/.venv/bin/python scripts/hf_assets.py images [--only og,industry-clinic]
    scripts/.venv/bin/python scripts/hf_assets.py status

Paid calls go through huggingface_hub.InferenceClient (token from
~/.cache/huggingface/token or HF_TOKEN). Every paid call is logged to
scripts/hf_spend.json and refused if it would push the estimated total over
BUDGET_USD. If no token is available (or a provider errors), free public
gradio Spaces are tried and logged at $0 (they consume ZeroGPU quota only).
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
LEDGER = SCRIPTS / "hf_spend.json"
OUT = SCRIPTS / "out"
IMAGES = ROOT / "frontend" / "public" / "images"

BUDGET_USD = 5.0

# Conservative per-image estimates (USD). HF Inference Providers bill at the
# provider's rate; these sit at or above published fal/replicate/together rates.
COST = {
    "black-forest-labs/FLUX.1-dev": 0.03,
    "black-forest-labs/FLUX.1-schnell": 0.005,
    "stabilityai/stable-diffusion-3.5-large": 0.07,
    # fal.ai direct (FAL_KEY env var); FLUX models HF routes to fal anyway
    "fal-ai/flux-pro/v1.1-ultra": 0.06,
    "fal-ai/flux/dev": 0.03,
    "fal-ai/flux/schnell": 0.005,
}
PAID_MODELS = list(COST)

# Free Spaces fallback (ZeroGPU quota, $0): (space id, model label)
FREE_SPACES = [
    ("black-forest-labs/FLUX.1-schnell", "space:FLUX.1-schnell"),
    ("black-forest-labs/FLUX.1-dev", "space:FLUX.1-dev"),
]

STYLE = (
    "photographic, cinematic, dark moody palette with deep violet and electric blue "
    "accents, shallow depth of field, high detail, no text, no logos, no watermark"
)

HEAD_PROMPT = (
    "front view, perfectly symmetric, full head and neck of an iridescent chrome humanoid "
    "robot, mirror-polished liquid metal surface with holographic magenta, violet, blue and "
    "cyan reflections, smooth sculpted face with closed calm eyes, mechanical neck with "
    "cables and vents, studio lighting, centered, isolated on a pure black background, "
    "product render, octane render, 8k, no text"
)

PORTRAIT_PROMPT = (
    "professional studio portrait photograph of a friendly 24 year old Slavic woman receptionist, "
    "natural blonde hair loosely tied back, big bright blue eyes, warm genuine closed-mouth smile, light natural "
    "makeup, wearing a slim black call-center headset with a small boom microphone, navy blazer over a white "
    "blouse, head and shoulders, looking straight at the camera, centered composition, soft beauty dish key "
    "light, subtle violet and cyan rim light, pure black seamless background, shot on 85mm f/1.8, "
    "hyperrealistic natural skin texture with pores, sharp focus on the eyes, editorial, no text"
)

MARKETING = {
    "industry-home-services": "a plumber kneeling under a kitchen sink on a job in a UK home, "
    "his smartphone lighting up and ringing on the counter beside his toolbox, " + STYLE,
    "industry-clinic": "a calm modern medical clinic reception desk at dusk, soft indirect "
    "lighting, plants, empty waiting chairs, a phone on the desk, " + STYLE,
    "industry-salon": "an upscale hair salon interior in the evening, styling chairs and "
    "mirrors with warm bulbs, a stylist working, a phone on the front desk, " + STYLE,
    "industry-legal": "a modern law office at night, wooden desk with legal books and "
    "documents, desk lamp glow, city lights through the window, " + STYLE,
    "industry-real-estate": "a beautiful modern house exterior at blue hour with warm "
    "interior lights, an estate agent holding a phone on the driveway, " + STYLE,
    "industry-events": "a white marquee at a UK countryside wedding at night, fairy lights, "
    "round tables with candles, guests silhouetted, " + STYLE,
    "og": "studio portrait of a friendly young blonde woman receptionist wearing a slim headset, "
    "positioned on the left third of the frame, soft violet rim light, pure black background, large "
    "empty negative space on the right, photographic, no text, no logos",
}


# ---------------------------------------------------------------- ledger ---
def load_ledger() -> list[dict]:
    if LEDGER.exists():
        return json.loads(LEDGER.read_text())
    return []


def total(ledger: list[dict] | None = None) -> float:
    return round(sum(e["est_cost_usd"] for e in (ledger or load_ledger())), 4)


def guard(cost: float) -> None:
    t = total()
    if t + cost > BUDGET_USD:
        raise SystemExit(
            f"REFUSED: estimated total ${t:.3f} + ${cost:.3f} would exceed ${BUDGET_USD:.2f}"
        )


def log(model: str, provider: str, kind: str, cost: float, output: str) -> None:
    ledger = load_ledger()
    ledger.append(
        {
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "model": model,
            "provider": provider,
            "kind": kind,
            "est_cost_usd": cost,
            "output": output,
        }
    )
    LEDGER.write_text(json.dumps(ledger, indent=2))


# ------------------------------------------------------------ generation ---
def have_token() -> bool:
    from huggingface_hub import get_token

    return bool(get_token())


def gen_paid(prompt: str, w: int, h: int, seed: int | None, models: list[str]):
    from huggingface_hub import InferenceClient

    client = InferenceClient()
    last = None
    for model in models:
        cost = COST[model]
        guard(cost)
        try:
            img = client.text_to_image(prompt, model=model, width=w, height=h, seed=seed)
            return img, model, "hf-inference-providers", cost
        except Exception as e:  # provider error -> next model
            last = e
            print(f"  ! {model}: {str(e)[:200]}", file=sys.stderr)
    raise RuntimeError(f"all paid models failed: {last}")


def gen_space(prompt: str, w: int, h: int, seed: int | None):
    from gradio_client import Client

    last = None
    for space, label in FREE_SPACES:
        try:
            c = Client(space, verbose=False)
            res = c.predict(
                prompt=prompt,
                seed=seed or 0,
                randomize_seed=seed is None,
                width=w,
                height=h,
                num_inference_steps=4 if "schnell" in space else 28,
                api_name="/infer",
            )
            path = res[0] if isinstance(res, (list, tuple)) else res
            if isinstance(path, dict):
                path = path.get("path") or path.get("url")
            return Image.open(path).convert("RGB"), label, "hf-space-zerogpu", 0.0
        except Exception as e:
            last = e
            print(f"  ! {space}: {str(e)[:200]}", file=sys.stderr)
    raise RuntimeError(f"all free Spaces failed: {last}")


def gen_fal(prompt: str, w: int, h: int, seed: int | None, model: str, raw: bool = False):
    """Direct fal.ai call. Key comes only from the FAL_KEY environment variable."""
    import os
    import urllib.request

    key = os.environ["FAL_KEY"]
    cost = COST[model]
    guard(cost)
    body: dict = {"prompt": prompt, "num_images": 1, "enable_safety_checker": True, "output_format": "png"}
    if seed is not None:
        body["seed"] = seed
    if "ultra" in model:
        body["aspect_ratio"] = "3:4" if h > w else "16:9" if w > h else "1:1"
        body["raw"] = raw
    else:
        body["image_size"] = {"width": w, "height": h}
    req = urllib.request.Request(
        f"https://fal.run/{model}", data=json.dumps(body).encode(),
        headers={"Authorization": f"Key {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read())
    url = data["images"][0]["url"]
    with urllib.request.urlopen(url, timeout=120) as r:
        img = Image.open(io.BytesIO(r.read())).convert("RGB")
    return img, model, "fal.ai", cost


def generate(prompt, w, h, seed=None, models=None, kind="image", out: Path | None = None):
    import os

    models = models or PAID_MODELS
    img = None
    fal_models = [m for m in models if m.startswith("fal-ai/")]
    if os.environ.get("FAL_KEY") and fal_models:
        img, model, provider, cost = gen_fal(prompt, w, h, seed, fal_models[0], raw=kind == "portrait")
    elif have_token():
        try:
            img, model, provider, cost = gen_paid(prompt, w, h, seed, models)
        except RuntimeError as e:
            print(f"  paid path failed ({e}); trying free Spaces", file=sys.stderr)
    else:
        print("  no HF token found; using free Spaces", file=sys.stderr)
    if img is None:
        img, model, provider, cost = gen_space(prompt, w, h, seed)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    log(model, provider, kind, cost, str(out.relative_to(ROOT)))
    print(f"  -> {out.relative_to(ROOT)}  [{model} via {provider}, ${cost}]")
    return out


def to_jpeg(src: Path, dst: Path, max_w=1600, q=82):
    im = Image.open(src).convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(dst, "JPEG", quality=q, optimize=True, progressive=True)


# -------------------------------------------------------------- commands ---
def cmd_head(a):
    for i in range(a.n):
        seed = a.seed + i
        print(f"head candidate {i + 1}/{a.n} (seed {seed})")
        try:
            generate(HEAD_PROMPT, 1024, 1024, seed, kind="head",
                     models=["black-forest-labs/FLUX.1-dev", "black-forest-labs/FLUX.1-schnell"],
                     out=OUT / f"head_{seed}.png")
        except Exception as e:
            print(f"  FAILED: {e}", file=sys.stderr)
    if a.pick is not None:
        shutil.copy(OUT / f"head_{a.pick}.png", IMAGES / "head.png")


def cmd_pick(a):
    IMAGES.mkdir(parents=True, exist_ok=True)
    shutil.copy(OUT / f"head_{a.seed}.png", IMAGES / "head.png")
    print(f"head_{a.seed}.png -> frontend/public/images/head.png")


def cmd_images(a):
    names = a.only.split(",") if a.only else list(MARKETING)
    for name in names:
        print(name)
        png = OUT / f"{name}.png"
        try:
            generate(MARKETING[name], 1344, 768, a.seed, kind="marketing", out=png,
                     models=["fal-ai/flux/dev", "black-forest-labs/FLUX.1-schnell"])
            IMAGES.mkdir(parents=True, exist_ok=True)
            to_jpeg(png, IMAGES / f"{name}.jpg")
        except Exception as e:
            print(f"  FAILED: {e}", file=sys.stderr)


def cmd_portrait(a):
    for i in range(a.n):
        seed = a.seed + i
        print(f"portrait candidate {i + 1}/{a.n} (seed {seed})")
        try:
            generate(PORTRAIT_PROMPT, 896, 1152, seed, kind="portrait",
                     models=["fal-ai/flux-pro/v1.1-ultra", "black-forest-labs/FLUX.1-dev"],
                     out=OUT / f"portrait_{seed}.png")
        except Exception as e:
            print(f"  FAILED: {e}", file=sys.stderr)


def cmd_depth(a):
    """Publish a portrait and compute its depth map locally, for free.

    Depth Anything V2 (small) via ONNX Runtime on the CPU — no token, no GPU, no PyTorch.
    The web hero displaces the portrait by this map to get real parallax.
    """
    import numpy as np
    import onnxruntime as ort
    from huggingface_hub import hf_hub_download

    src = OUT / f"portrait_{a.seed}.png"
    IMAGES.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert("RGB")
    if im.width > 1280:
        im = im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS)
    im.save(IMAGES / "receptionist.webp", "WEBP", quality=88)

    model = hf_hub_download("onnx-community/depth-anything-v2-small", "onnx/model.onnx")
    sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
    side = 518
    x = np.asarray(im.resize((side, side), Image.BICUBIC), dtype=np.float32) / 255.0
    x = (x - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array([0.229, 0.224, 0.225], dtype=np.float32)
    x = x.transpose(2, 0, 1)[None]
    (pred,) = sess.run(None, {sess.get_inputs()[0].name: x})
    d = pred[0] if pred.ndim == 3 else pred[0, 0]
    d = (d - d.min()) / max(1e-6, d.max() - d.min())  # 1 = nearest
    depth = Image.fromarray((d * 255).astype(np.uint8)).resize(im.size, Image.BICUBIC)
    depth.save(IMAGES / "receptionist-depth.png", optimize=True)
    log("onnx-community/depth-anything-v2-small", "local-onnx", "depth", 0.0, "frontend/public/images/receptionist-depth.png")
    print("-> frontend/public/images/receptionist.webp + receptionist-depth.png")


def cmd_status(_a):
    ledger = load_ledger()
    by = {}
    for e in ledger:
        k = (e["model"], e["provider"])
        by.setdefault(k, [0, 0.0])
        by[k][0] += 1
        by[k][1] += e["est_cost_usd"]
    for (m, p), (n, c) in sorted(by.items()):
        print(f"{n:3d}  ${c:7.3f}  {m}  ({p})")
    print(f"total ${total(ledger):.3f} / ${BUDGET_USD:.2f}  ({len(ledger)} calls)")


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    s = p.add_subparsers(dest="cmd", required=True)
    h = s.add_parser("head", help="generate N head candidates into scripts/out/")
    h.add_argument("--n", type=int, default=4)
    h.add_argument("--seed", type=int, default=101)
    h.add_argument("--pick", type=int, help="seed to copy to frontend/public/images/head.png")
    h.set_defaults(fn=cmd_head)
    k = s.add_parser("pick", help="copy scripts/out/head_<seed>.png to public/images/head.png")
    k.add_argument("seed", type=int)
    k.set_defaults(fn=cmd_pick)
    i = s.add_parser("images", help="generate the marketing image set")
    i.add_argument("--only", help="comma-separated subset, e.g. og,industry-clinic")
    i.add_argument("--seed", type=int, default=7)
    i.set_defaults(fn=cmd_images)
    po = s.add_parser("portrait", help="generate N photoreal receptionist portraits")
    po.add_argument("--n", type=int, default=4)
    po.add_argument("--seed", type=int, default=201)
    po.set_defaults(fn=cmd_portrait)
    d = s.add_parser("depth", help="publish portrait_<seed> and compute its depth map locally")
    d.add_argument("seed", type=int)
    d.set_defaults(fn=cmd_depth)
    st = s.add_parser("status", help="print ledger totals")
    st.set_defaults(fn=cmd_status)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()

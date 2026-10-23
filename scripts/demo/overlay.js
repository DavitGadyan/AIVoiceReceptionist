// Injected into every page before load (page.addInitScript). Draws a cursor that
// follows the real pointer events Playwright dispatches, a click ripple, and a
// glass caption pill controlled from Node via window.__cap(text).
(() => {
  if (window.__receptraOverlay) return;
  window.__receptraOverlay = true;

  const CURSOR_SVG =
    '<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M3 2 L3 26 L9.5 20.5 L13.5 30 L18 28 L14 18.5 L22.5 18.5 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/>' +
    "</svg>";

  function mount() {
    if (document.getElementById("__cur")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__cur { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none;
               filter: drop-shadow(0 2px 4px rgba(0,0,0,.35)); will-change: transform; }
      #__ripple { position: fixed; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px;
               border-radius: 50%; border: 2px solid rgba(91,91,240,.9); background: rgba(91,91,240,.25);
               z-index: 2147483646; pointer-events: none; opacity: 0; transform: scale(.4); }
      #__ripple.go { animation: __rip 420ms cubic-bezier(.23,1,.32,1) forwards; }
      @keyframes __rip { from { opacity: .9; transform: scale(.4); } to { opacity: 0; transform: scale(1.3); } }
      #__cap { position: fixed; left: 50%; bottom: 56px; transform: translateX(-50%) translateY(8px);
               max-width: 1200px; padding: 14px 28px; border-radius: 999px;
               font-family: var(--font-body, "Manrope", system-ui, sans-serif); font-size: 26px; font-weight: 600;
               letter-spacing: -0.01em; line-height: 1.25; text-align: center; color: #fff; white-space: nowrap;
               background: rgba(6,6,9,.72); border: 1px solid rgba(255,255,255,.15);
               -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px);
               box-shadow: 0 18px 50px -20px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.18);
               z-index: 2147483645; pointer-events: none; opacity: 0;
               transition: opacity 350ms cubic-bezier(.23,1,.32,1), transform 350ms cubic-bezier(.23,1,.32,1); }
      #__cap.on { opacity: 1; transform: translateX(-50%) translateY(0); }
      nextjs-portal { display: none !important; }
    `;
    document.head.appendChild(style);

    const cur = document.createElement("div");
    cur.id = "__cur";
    cur.innerHTML = CURSOR_SVG;
    const pos = window.__curPos || { x: 960, y: 540 };
    cur.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    document.body.appendChild(cur);

    const ripple = document.createElement("div");
    ripple.id = "__ripple";
    document.body.appendChild(ripple);

    const cap = document.createElement("div");
    cap.id = "__cap";
    document.body.appendChild(cap);

    document.addEventListener(
      "mousemove",
      (e) => {
        window.__curPos = { x: e.clientX, y: e.clientY };
        cur.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      },
      true,
    );
    document.addEventListener(
      "mousedown",
      (e) => {
        ripple.style.left = e.clientX + "px";
        ripple.style.top = e.clientY + "px";
        ripple.classList.remove("go");
        void ripple.offsetWidth;
        ripple.classList.add("go");
      },
      true,
    );
  }

  window.__cap = (text) => {
    const el = document.getElementById("__cap");
    if (!el) return;
    if (!text) {
      el.classList.remove("on");
      return;
    }
    if (el.classList.contains("on") && el.textContent !== text) {
      el.classList.remove("on");
      setTimeout(() => {
        el.textContent = text;
        el.classList.add("on");
      }, 220);
    } else {
      el.textContent = text;
      el.classList.add("on");
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();

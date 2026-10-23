"use client";

import { useCallback, useRef, useState } from "react";
import { API_URL } from "@/lib/api";

type Status = "idle" | "connecting" | "live" | "unavailable" | "error";

/** Talk to a demo tenant's receptionist in the browser (Vapi Web SDK). Exposes live volume for the head. */
export function useBrowserVoice(slug: string) {
  const [status, setStatus] = useState<Status>("idle");
  const [level, setLevel] = useState(0);
  const [line, setLine] = useState<string>("");
  const vapiRef = useRef<{ stop: () => void } | null>(null);

  const start = useCallback(async () => {
    setStatus("connecting");
    try {
      const res = await fetch(`${API_URL}/voice/web-assistant/${slug}`);
      if (!res.ok) throw new Error("demo unavailable");
      const cfg = await res.json();
      if (!cfg.public_key) {
        setStatus("unavailable");
        return;
      }
      const { default: Vapi } = await import("@vapi-ai/web");
      const vapi = new Vapi(cfg.public_key);
      vapiRef.current = vapi;
      vapi.on("call-start", () => setStatus("live"));
      vapi.on("call-end", () => {
        setStatus("idle");
        setLevel(0);
      });
      vapi.on("volume-level", (v: number) => setLevel(Math.min(1, v * 1.6)));
      vapi.on("message", (m: { type?: string; transcriptType?: string; transcript?: string }) => {
        if (m.type === "transcript" && m.transcriptType === "final" && m.transcript) setLine(m.transcript);
      });
      vapi.on("error", () => setStatus("error"));
      await vapi.start(cfg.assistant);
    } catch {
      setStatus("error");
    }
  }, [slug]);

  const stop = useCallback(() => {
    vapiRef.current?.stop();
    setStatus("idle");
    setLevel(0);
  }, []);

  return { status, level, line, start, stop };
}

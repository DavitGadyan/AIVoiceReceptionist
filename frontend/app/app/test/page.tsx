"use client";

import { ArrowRight, Mic, MicOff, PhoneCall, PhoneOff, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMe } from "@/components/app/Shell";
import { Badge, Button, Card, Empty, Field, IconTile, PageHeader, Spinner, inputCls } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { OUTCOME_LABEL, outcomeTone } from "@/lib/format";
import type { Turn } from "@/lib/types";

const SCENARIOS = [
  "I'd like to book a boiler service tomorrow",
  "There's water everywhere, a pipe burst!",
  "How much is your call-out fee?",
  "Can I speak to a person?",
  "I'm calling about your business electricity contract",
  "I'm running 10 minutes late",
];

type Reply = { reply: string; ended: boolean; outcome: string; transfer: { number: string; summary: string } | null };
type EndResult = { outcome: string; summary: string; extracted: Record<string, unknown> };

export default function TestCallPage() {
  return (
    <div>
      <PageHeader title="Test call" sub="Same brain, prompt and tools as a real phone call" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Simulator />
        <BrowserVoice />
      </div>
    </div>
  );
}

function Simulator() {
  const [from, setFrom] = useState("+447700900123");
  const [callId, setCallId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [transfer, setTransfer] = useState<Reply["transfer"]>(null);
  const [ended, setEnded] = useState<EndResult | null>(null);
  const [endedId, setEndedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLOListElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function start() {
    setBusy(true);
    setError(null);
    setEnded(null);
    setEndedId(null);
    setOutcome("");
    setTransfer(null);
    try {
      const r = await api<{ call_id: string; reply: string }>("/demo/sessions", { method: "POST", json: { from_number: from } });
      setCallId(r.call_id);
      setTurns([{ role: "assistant", text: r.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the call");
    } finally {
      setBusy(false);
    }
  }

  async function finish(id: string) {
    try {
      const r = await api<EndResult>(`/demo/sessions/${id}/end`, { method: "POST" });
      setEnded(r);
      setEndedId(id);
      setOutcome(r.outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't end the call");
    } finally {
      setCallId(null);
    }
  }

  async function send(line: string) {
    const msg = line.trim();
    if (!msg || busy) return;
    let id = callId;
    setBusy(true);
    setError(null);
    try {
      if (!id) {
        const r = await api<{ call_id: string; reply: string }>("/demo/sessions", { method: "POST", json: { from_number: from } });
        id = r.call_id;
        setCallId(id);
        setEnded(null);
        setEndedId(null);
        setTransfer(null);
        setTurns([{ role: "assistant", text: r.reply }]);
      }
      setTurns((t) => [...t, { role: "user", text: msg }]);
      setText("");
      const r = await api<Reply>(`/demo/sessions/${id}/message`, { method: "POST", json: { text: msg } });
      setTurns((t) => [...t, { role: "assistant", text: r.reply }]);
      if (r.outcome) setOutcome(r.outcome);
      if (r.transfer) setTransfer(r.transfer);
      if (r.ended) await finish(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message failed");
    } finally {
      setBusy(false);
    }
  }

  const live = Boolean(callId);

  return (
    <Card className="flex min-h-[620px] flex-col overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-4 sm:p-5">
        <Field label="Caller number" className="min-w-[200px] flex-1">
          <input className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} disabled={live} inputMode="tel" />
        </Field>
        {live ? (
          <Button variant="danger" onClick={() => callId && finish(callId)} disabled={busy}>
            <PhoneOff className="size-4" /> End call
          </Button>
        ) : (
          <Button variant="primary" onClick={start} disabled={busy}>
            {busy ? <Spinner /> : <PhoneCall className="size-4" />} Start call
          </Button>
        )}
        <div className="flex w-full items-center gap-2 text-[13px] text-muted">
          <span className={`size-2 rounded-full ${live ? "bg-success" : "bg-line"}`} />
          {live ? "Call in progress" : ended ? "Call ended" : "Not connected"}
          {outcome && <Badge tone={outcomeTone(outcome)} className="ml-auto">{OUTCOME_LABEL[outcome] ?? outcome}</Badge>}
        </div>
      </div>

      <ol ref={scroller} aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto bg-surface/40 p-4 sm:p-5" style={{ maxHeight: 520 }}>
        {turns.length === 0 ? (
          <li className="m-auto max-w-sm text-center">
            <IconTile className="mx-auto mb-3"><Sparkles className="size-5" /></IconTile>
            <p className="font-semibold">Talk to your receptionist by text</p>
            <p className="mt-1 text-[14px] text-muted">Start a call or tap a scenario below. Every tool call — bookings, alerts, transfers — happens for real against your data.</p>
          </li>
        ) : (
          turns.map((t, i) => (
            <li
              key={i}
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${t.role === "assistant" ? "self-start rounded-bl-md bg-surface" : "self-end rounded-br-md bg-accent text-white"}`}
            >
              {t.text}
            </li>
          ))
        )}
        {busy && turns.length > 0 && (
          <li className="self-start rounded-2xl bg-surface px-4 py-3 text-muted" aria-label="Receptionist is typing"><Spinner /></li>
        )}
      </ol>

      {transfer && (
        <div className="mx-4 mb-3 rounded-2xl bg-peri-soft p-3 text-[14px] sm:mx-5">
          <b>Warm transfer</b> to {transfer.number}. Whisper: “{transfer.summary}”
        </div>
      )}

      {ended && (
        <div className="mx-4 mb-3 rounded-2xl border border-line p-4 sm:mx-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">Call summary</p>
            <Badge tone={outcomeTone(ended.outcome)}>{OUTCOME_LABEL[ended.outcome] ?? ended.outcome}</Badge>
            {endedId && (
              <Link href={`/app/calls?id=${endedId}`} className="ml-auto inline-flex items-center gap-1 text-[14px] font-semibold text-accent hover:underline">
                Open in Activity <ArrowRight className="size-4" />
              </Link>
            )}
          </div>
          <p className="mt-2 text-[14px]">{ended.summary || "No summary."}</p>
          {Object.keys(ended.extracted ?? {}).length > 0 && (
            <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-surface p-3 text-[12px] leading-relaxed">{JSON.stringify(ended.extracted, null, 2)}</pre>
          )}
        </div>
      )}

      {error && <p role="alert" className="mx-4 mb-3 text-[14px] text-danger sm:mx-5">{error}</p>}

      <div className="border-t border-line p-4 sm:p-5">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {SCENARIOS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={busy}
              className="h-9 shrink-0 rounded-full border border-line px-4 text-[13px] font-medium transition-colors hover:bg-surface disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Say something as the caller</span>
            <input className={`${inputCls} h-12 rounded-full bg-surface px-5`} placeholder="Type what the caller says…" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button type="submit" aria-label="Send" disabled={busy || !text.trim()} className="grid size-12 place-items-center rounded-full bg-accent text-white transition-opacity disabled:opacity-40">
            <Send className="size-5" />
          </button>
        </form>
      </div>
    </Card>
  );
}

type WebAssistant = { public_key: string | null; assistant: Record<string, unknown>; business_name: string };
type VapiLike = {
  start: (a: Record<string, unknown>) => Promise<unknown>;
  stop: () => void;
  on: (ev: string, cb: (...args: never[]) => void) => void;
  setMuted?: (m: boolean) => void;
};

function BrowserVoice() {
  const me = useMe();
  const [cfg, setCfg] = useState<WebAssistant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "connecting" | "live">("idle");
  const [volume, setVolume] = useState(0);
  const [muted, setMuted] = useState(false);
  const [lines, setLines] = useState<Turn[]>([]);
  const vapi = useRef<VapiLike | null>(null);

  useEffect(() => {
    if (!me) return;
    api<WebAssistant>(`/voice/web-assistant/${me.tenant.slug}`).then(setCfg).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [me]);

  useEffect(() => () => vapi.current?.stop(), []);

  async function start() {
    if (!cfg?.public_key) return;
    setError(null);
    setLines([]);
    setState("connecting");
    try {
      const { default: Vapi } = await import("@vapi-ai/web");
      const v = new Vapi(cfg.public_key) as unknown as VapiLike;
      vapi.current = v;
      v.on("call-start", () => setState("live"));
      v.on("call-end", () => {
        setState("idle");
        setVolume(0);
      });
      v.on("volume-level", ((level: number) => setVolume(level)) as (...args: never[]) => void);
      v.on("message", ((m: { type?: string; transcriptType?: string; role?: string; transcript?: string }) => {
        if (m.type === "transcript" && m.transcriptType === "final" && m.transcript) {
          setLines((l) => [...l, { role: m.role === "user" ? "user" : "assistant", text: m.transcript as string }]);
        }
      }) as (...args: never[]) => void);
      v.on("error", ((e: unknown) => {
        setError(e instanceof Error ? e.message : "Voice connection error");
        setState("idle");
      }) as (...args: never[]) => void);
      await v.start(cfg.assistant);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start voice");
      setState("idle");
    }
  }

  function stop() {
    vapi.current?.stop();
    setState("idle");
    setVolume(0);
  }

  const disabled = !cfg?.public_key;

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center gap-3">
        <IconTile><Mic className="size-5" /></IconTile>
        <div>
          <h2 className="text-[18px] font-semibold">Talk in browser</h2>
          <p className="text-[13px] text-muted">{cfg?.business_name ?? "Your receptionist"} over WebRTC, voice and all</p>
        </div>
      </div>

      {!cfg && !error ? (
        <div className="grid place-items-center py-12"><Spinner /></div>
      ) : disabled ? (
        <div className="mt-5">
          <Empty title="Voice demo not configured">
            Add <code className="rounded bg-surface px-1">VAPI_PUBLIC_KEY</code> to the backend .env to talk to the receptionist in your browser.
          </Empty>
        </div>
      ) : (
        <>
          <div className="relative mx-auto my-8 grid size-40 place-items-center">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full transition-transform duration-100"
              style={{ background: "var(--grad-peri)", opacity: 0.25 + volume * 0.6, transform: `scale(${0.85 + volume * 0.4})` }}
            />
            <span className="relative grid size-24 place-items-center rounded-full text-white" style={{ background: "var(--grad-peri)" }}>
              {state === "connecting" ? <Spinner /> : <Mic className="size-8" />}
            </span>
          </div>
          <div role="meter" aria-label="Voice level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(volume * 100)} className="mb-5 h-1.5 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-accent transition-[width] duration-100" style={{ width: `${Math.min(100, volume * 100)}%` }} />
          </div>
          <div className="flex gap-2">
            {state === "idle" ? (
              <Button variant="primary" className="flex-1" onClick={start}>
                <PhoneCall className="size-4" /> Start talking
              </Button>
            ) : (
              <>
                <Button variant="danger" className="flex-1" onClick={stop}>
                  <PhoneOff className="size-4" /> Hang up
                </Button>
                <Button
                  variant="soft"
                  aria-pressed={muted}
                  onClick={() => {
                    vapi.current?.setMuted?.(!muted);
                    setMuted((m) => !m);
                  }}
                >
                  {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </Button>
              </>
            )}
          </div>
          <ol aria-live="polite" className="mt-5 flex max-h-72 flex-col gap-2 overflow-y-auto">
            {lines.map((l, i) => (
              <li key={i} className={`max-w-[90%] rounded-2xl px-3.5 py-2 text-[14px] ${l.role === "assistant" ? "self-start bg-surface" : "self-end bg-accent text-white"}`}>
                {l.text}
              </li>
            ))}
          </ol>
        </>
      )}
      {error && <p role="alert" className="mt-4 text-[14px] text-danger">{error}</p>}
    </Card>
  );
}

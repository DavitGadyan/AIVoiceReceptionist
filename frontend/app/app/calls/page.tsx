"use client";

import {
  AlertTriangle, ArrowLeft, Ban, CalendarCheck, CheckCircle2, Clock, Mail, MapPin, MessageSquare, MoreVertical, Pause,
  Phone, PhoneCall, PhoneIncoming, PhoneMissed, Play, Search, Send, ShieldAlert, Tag as TagIcon, UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar, Badge, Button, Card, Empty, IconTile, Segmented, Spinner, Tag, inputCls,
} from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { OUTCOME_LABEL, ago, duration, initials, outcomeTone, phone as fmtPhone } from "@/lib/format";
import type { CallDetail, CallItem, Message, Task } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Filter = "all" | "attention";

export default function CallsPage() {
  return (
    <Suspense fallback={<div className="grid place-items-center py-24"><Spinner /></div>}>
      <Activity />
    </Suspense>
  );
}

function Activity() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("id");
  const urlQ = params.get("q") ?? "";
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState(urlQ);
  const [query, setQuery] = useState(urlQ.trim());
  const [outcome, setOutcome] = useState("");

  // The top bar's global search lands here as ?q=; follow it when it changes.
  useEffect(() => {
    setQ(urlQ);
    setQuery(urlQ.trim());
  }, [urlQ]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const path = useMemo(() => {
    const sp = new URLSearchParams({ limit: "100" });
    if (filter === "attention") sp.set("attention", "true");
    if (query) sp.set("q", query);
    if (outcome) sp.set("outcome", outcome);
    return `/calls?${sp}`;
  }, [filter, query, outcome]);

  const list = useApi<{ total: number; items: CallItem[] }>(path);
  const items = list.data?.items ?? [];

  // Keep the other params (the top bar's ?q=) when selecting a call.
  const hrefFor = (id: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("id", id);
    return `/app/calls?${sp}`;
  };

  // Desktop: auto-select the newest call so the detail column is never empty.
  useEffect(() => {
    if (!selected && items.length && typeof window !== "undefined" && window.innerWidth >= 1024) {
      router.replace(hrefFor(items[0].id), { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, items, router]);

  const select = (id: string) => router.push(hrefFor(id), { scroll: false });

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Column 1: call list */}
      <section
        aria-label="Calls"
        className={`w-full shrink-0 lg:sticky lg:top-6 lg:w-[280px] lg:border-r lg:border-line lg:pr-6 ${selected ? "hidden lg:block" : ""}`}
      >
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-[28px] font-semibold tracking-tight">Activity</h1>
          {list.data && <span className="text-[14px] text-muted">{list.data.total}</span>}
        </div>
        <Segmented<Filter>
          className="mb-3 w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:whitespace-nowrap [&>button]:px-3"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: <><PhoneCall className="size-4" /> All calls</> },
            { value: "attention", label: <><AlertTriangle className="size-4" /> Attention</> },
          ]}
        />
        <div className="mb-4 grid grid-cols-[1fr_auto] gap-2">
          <label className="relative">
            <span className="sr-only">Search calls</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input className={`${inputCls} pl-9`} placeholder="Search name, number, summary" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label>
            <span className="sr-only">Filter by outcome</span>
            <select className={`${inputCls} w-[120px]`} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="">All outcomes</option>
              {Object.entries(OUTCOME_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
        </div>

        {list.loading && !list.data ? (
          <div className="grid place-items-center py-16"><Spinner /></div>
        ) : list.error ? (
          <Empty title="Couldn't load calls">{list.error}</Empty>
        ) : items.length === 0 ? (
          <Empty title="No calls here">{filter === "attention" ? "Nothing needs your attention." : "Calls appear here as soon as your receptionist answers one."}</Empty>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((c) => (
              <li key={c.id}>
                <CallRow call={c} active={c.id === selected} onClick={() => select(c.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Columns 2 + 3 */}
      <div className={`min-w-0 flex-1 ${selected ? "" : "hidden lg:block"}`}>
        {selected ? (
          <CallView id={selected} onChanged={list.reload} />
        ) : (
          <Empty title="Pick a call">Select a call on the left to see its transcript, actions and caller.</Empty>
        )}
      </div>
    </div>
  );
}

function LiveTimer({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const start = new Date(since.endsWith("Z") || since.includes("+") ? since : `${since}Z`).getTime();
  return <span className="text-[13px] font-semibold text-accent">{duration(Math.max(0, (now - start) / 1000))}</span>;
}

function CallRow({ call, active, onClick }: { call: CallItem; active: boolean; onClick: () => void }) {
  const name = call.contact?.name || "";
  return (
    <button
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${active ? "bg-surface" : "hover:bg-surface"}`}
    >
      <Avatar text={initials(name, "#")} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{name || fmtPhone(call.from) || "Unknown caller"}</span>
        <span className="block truncate text-[13px] text-muted">{name ? fmtPhone(call.from) : OUTCOME_LABEL[call.outcome] ?? call.channel}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {call.status === "live" ? (
          <>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-success">
              <PhoneCall className="size-3.5" /> Live call
            </span>
            <LiveTimer since={call.started_at} />
          </>
        ) : (
          <>
            <span className="text-[12px] text-muted">{ago(call.started_at)}</span>
            {call.needs_attention ? (
              <span className="grid size-5 place-items-center rounded-md bg-accent text-[11px] font-bold text-white" aria-label="Needs attention">!</span>
            ) : call.urgency === "emergency" ? (
              <ShieldAlert className="size-4 text-danger" aria-label="Emergency" />
            ) : null}
          </>
        )}
      </span>
    </button>
  );
}

function prettyDate(iso: string) {
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

function timeOf(iso: string) {
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  return d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

/** Turns tool events into short, human lines for the call card. */
function describeEvent(e: CallDetail["events"][number]): { text: string; ok: boolean } | null {
  const tool = e.kind.replace(/^tool:/, "");
  const r = (e.data?.result ?? {}) as Record<string, unknown>;
  const a = (e.data?.args ?? {}) as Record<string, unknown>;
  const ok = r.success !== false;
  switch (tool) {
    case "book_appointment":
      return { text: ok ? `Booked ${a.service ? String(a.service) : "appointment"}${r.when ? ` — ${String(r.when)}` : ""}` : `Booking failed${r.error ? `: ${String(r.error)}` : ""}`, ok };
    case "check_availability":
      return { text: `Checked availability${a.date ? ` for ${String(a.date)}` : ""}`, ok };
    case "reschedule_appointment":
      return { text: ok ? `Rescheduled${r.when ? ` to ${String(r.when)}` : ""}` : "Reschedule failed", ok };
    case "cancel_appointment":
      return { text: ok ? `Cancelled ${r.cancelled ? String(r.cancelled) : "appointment"}` : "No booking to cancel", ok };
    case "transfer_to_human":
      return { text: r.transferred ? `Transferred to ${String(r.destination ?? "staff")}` : "Transfer unavailable — callback created", ok: Boolean(r.transferred) };
    case "flag_emergency":
      return { text: "Emergency flagged — team alerted", ok };
    case "notify_staff":
      return { text: `Staff notified: ${String(a.kind ?? "message").replace(/_/g, " ").toLowerCase()}`, ok };
    case "send_sms_link":
      return { text: ok ? "Text sent to caller" : "Text failed to send", ok };
    case "capture_lead":
      return { text: `Saved details${a.name ? ` for ${String(a.name)}` : ""}`, ok };
    case "check_service_area":
      return { text: r.covered ? `${String(a.location ?? "Area")} is in the service area` : `${String(a.location ?? "Area")} is outside the area`, ok: Boolean(r.covered) };
    case "search_knowledge":
      return { text: r.found ? "Answered from knowledge base" : "Not found in knowledge base", ok: Boolean(r.found) };
    case "lookup_caller":
      return { text: r.known ? "Recognised returning caller" : "New caller", ok };
    case "end_call":
      return null;
    default:
      return { text: tool.replace(/_/g, " "), ok };
  }
}

function CallView({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { data, error, loading, reload } = useApi<CallDetail>(`/calls/${id}`);
  const [view, setView] = useState<"summary" | "transcript">("summary");

  useEffect(() => setView("summary"), [id]);

  if (loading && !data) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (error || !data) return <Empty title="Couldn't load this call">{error}</Empty>;

  const actions = data.events.map(describeEvent).filter(Boolean) as { text: string; ok: boolean }[];
  const refresh = () => {
    void reload();
    onChanged();
  };

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      {/* Column 2: conversation */}
      <section aria-label="Call" className="min-w-0 flex-1">
        <Link href="/app/calls" className="mb-4 inline-flex items-center gap-2 text-[14px] font-semibold text-muted hover:text-ink lg:hidden">
          <ArrowLeft className="size-4" /> All calls
        </Link>
        <p className="mb-3 text-center text-[13px] text-muted">{prettyDate(data.started_at)}</p>
        <div className="mb-3 flex items-center justify-end gap-2 text-[14px]">
          <span className="text-muted">{timeOf(data.started_at)}</span>
          <span className="font-semibold">{data.channel === "phone" ? "Phone line" : data.channel === "web" ? "Website chat" : "Test call"}</span>
          {data.after_hours && <Badge tone="neutral">After hours</Badge>}
        </div>

        <article className="mx-auto max-w-[620px] rounded-[var(--radius-card)] p-4 text-white sm:p-5" style={{ background: "var(--grad-peri)" }}>
          <header className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-white text-accent">
              {data.outcome === "ABANDONED" ? <PhoneMissed className="size-5" /> : <PhoneIncoming className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold">{data.status === "live" ? "Live call" : data.outcome === "ABANDONED" ? "Missed call" : "Finished call"}</p>
              <p className="text-[13px] text-white/70">{duration(data.duration_seconds)}</p>
            </div>
            {data.outcome && (
              <span className="rounded-full bg-white/20 px-3 py-1 text-[12px] font-semibold">{OUTCOME_LABEL[data.outcome] ?? data.outcome}</span>
            )}
          </header>

          <div role="tablist" className="mt-4 grid grid-cols-2 gap-2">
            {(["summary", "transcript"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`h-12 rounded-2xl text-[15px] font-medium transition-colors ${view === v ? "bg-white text-ink" : "bg-white/15 text-white hover:bg-white/25"}`}
              >
                {v === "summary" ? "Summary" : "Transcript"}
              </button>
            ))}
          </div>

          {actions.length > 0 && (
            <>
              <p className="mt-4 text-[13px] text-white/70">Actions taken</p>
              <ul className="mt-2 divide-y divide-white/10 rounded-2xl border border-white/15 bg-white/10">
                {actions.map((a, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/20 text-[12px] font-semibold">{i + 1}</span>
                    <span className="min-w-0 flex-1">{a.text}</span>
                    {a.ok ? <CheckCircle2 className="size-4 shrink-0 text-white/80" /> : <AlertTriangle className="size-4 shrink-0 text-white/80" />}
                  </li>
                ))}
              </ul>
            </>
          )}

          {view === "summary" ? (
            <>
              <p className="mt-4 text-[13px] text-white/70">Summary</p>
              <p className="mt-1 text-[16px] leading-relaxed">{data.summary || "No summary yet."}</p>
            </>
          ) : (
            <>
              <p className="mt-4 text-[13px] text-white/70">Transcript</p>
              {data.transcript.length === 0 ? (
                <p className="mt-1 text-[15px] text-white/80">The caller hung up before anything was said.</p>
              ) : (
                <ol className="mt-2 flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
                  {data.transcript.map((t, i) => (
                    <li key={i} className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${t.role === "assistant" ? "self-start bg-white/15" : "self-end bg-white text-ink"}`}>
                      {t.text}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          <p className="mt-4 text-[13px] text-white/70">Recording</p>
          <Recording url={data.recording_url} seconds={data.duration_seconds} />
        </article>

        <Thread contact={data.contact} />

        {data.history.length > 0 && (
          <div className="mx-auto mt-6 max-w-[620px]">
            <p className="mb-3 text-center text-[13px] text-muted">Earlier calls from this caller</p>
            <ul className="flex flex-col gap-3">
              {data.history.map((h) => (
                <li key={h.id}>
                  <Link href={`/app/calls?id=${h.id}`} scroll={false} className="block">
                    <Card className="flex items-center gap-4 p-4 transition-colors hover:bg-surface">
                      <IconTile className="size-12">
                        {h.outcome === "ABANDONED" ? <PhoneMissed className="size-5" /> : <PhoneIncoming className="size-5" />}
                      </IconTile>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold">{h.outcome === "ABANDONED" ? "Missed call" : "Finished call"}</span>
                        <span className="block truncate text-[13px] text-muted">{h.summary || duration(h.duration_seconds)}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[12px] text-muted">{ago(h.started_at)}</span>
                        {h.outcome && <Badge tone={outcomeTone(h.outcome)}>{OUTCOME_LABEL[h.outcome] ?? h.outcome}</Badge>}
                      </span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Column 3: caller */}
      <ContactPanel call={data} onChanged={refresh} />
    </div>
  );
}

/** Texts sent to this caller (from calls or the composer), shown as outgoing bubbles under the call card. */
function Thread({ contact }: { contact: CallDetail["contact"] }) {
  const thread = useApi<Message[]>(contact ? `/contacts/${contact.id}/messages` : null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const items = thread.data ?? [];
  const disabled = !contact || contact.blocked;

  useEffect(() => {
    setText("");
    setErr(null);
  }, [contact?.id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!contact || !text.trim()) return;
    setSending(true);
    setErr(null);
    try {
      const m = await api<Message>(`/contacts/${contact.id}/messages`, { method: "POST", json: { body: text.trim(), channel: "sms" } });
      thread.setData((prev) => [...(prev ?? []), m]);
      setText("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto mt-4 max-w-[620px]">
      {items.length > 0 && (
        <ol className="flex flex-col gap-2">
          {items.map((m) => (
            <li key={m.id} className="flex flex-col items-end">
              <span className={`max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-[14px] leading-relaxed text-white ${m.status === "failed" ? "bg-danger/80" : "bg-accent"}`}>
                {m.body}
              </span>
              <span className="mt-1 flex items-center gap-2 text-[12px] text-muted">
                {m.channel === "whatsapp" ? "WhatsApp" : "SMS"} · {ago(m.created_at)}
                {m.status === "simulated" && <Badge tone="neutral">Simulated</Badge>}
                {m.status === "failed" && <Badge tone="danger">Failed{m.error ? `: ${m.error}` : ""}</Badge>}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* composer, pinned to the bottom of the conversation column like the template's message bar */}
      <form onSubmit={send} className="sticky bottom-4 mt-4">
        <div className="glass flex items-center gap-2 rounded-full border border-line p-1.5 pl-4">
          <MessageSquare className="size-4 shrink-0 text-muted" aria-hidden />
          <input
            aria-label="Text the caller"
            className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted/70"
            placeholder={!contact ? "No caller to message" : contact.blocked ? "Number is blocked" : `Text ${contact.name || fmtPhone(contact.phone)}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled || sending}
            maxLength={1600}
          />
          <button
            type="submit"
            aria-label="Send text"
            disabled={disabled || sending || !text.trim()}
            className="btn-primary grid size-10 shrink-0 place-items-center rounded-full text-white transition-opacity disabled:opacity-40"
          >
            {sending ? <Spinner /> : <Send className="size-4 -translate-x-px" />}
          </button>
        </div>
        {err && <p role="alert" className="mt-2 px-4 text-[13px] text-danger">{err}</p>}
      </form>
    </div>
  );
}

function Recording({ url, seconds }: { url: string; seconds: number }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [len, setLen] = useState(seconds);

  useEffect(() => {
    setPlaying(false);
    setPos(0);
    setLen(seconds);
  }, [url, seconds]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };

  return (
    <div className="mt-2 flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-ink">
      <button
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? "Pause recording" : "Play recording"}
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-white transition-opacity disabled:opacity-40"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
      </button>
      {url ? (
        <>
          <input
            type="range"
            min={0}
            max={len || 1}
            step={0.1}
            value={pos}
            aria-label="Seek"
            onChange={(e) => {
              const v = Number(e.target.value);
              if (audio.current) audio.current.currentTime = v;
              setPos(v);
            }}
            className="h-1 min-w-0 flex-1 accent-[var(--color-accent)]"
          />
          <span className="w-12 text-right text-[14px] font-semibold tabular-nums">{duration(playing || pos ? pos : len)}</span>
          <audio
            ref={audio}
            src={url}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLen(e.currentTarget.duration)}
          />
        </>
      ) : (
        <span className="flex-1 text-[14px] text-muted">No recording</span>
      )}
    </div>
  );
}

function ContactPanel({ call, onChanged }: { call: CallDetail; onChanged: () => void }) {
  const c = call.contact;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  const all = [call, ...call.history];
  const avg = all.length ? all.reduce((s, x) => s + x.duration_seconds, 0) / all.length : 0;
  const extracted = Object.entries(call.extracted ?? {}).filter(([, v]) => v !== null && v !== "" && typeof v !== "object");

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setMsg(null);
    try {
      setMsg(await fn());
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
      setMenu(false);
    }
  }

  const resolve = () =>
    run("resolve", async () => {
      const tasks = await api<Task[]>("/tasks");
      const mine = tasks.filter((t) => t.call_id === call.id);
      await Promise.all(mine.map((t) => api(`/tasks/${t.id}`, { method: "PATCH", json: { status: "done" } })));
      return mine.length ? `Resolved ${mine.length} task${mine.length > 1 ? "s" : ""}.` : "No open tasks for this call.";
    });

  const block = () =>
    c &&
    run("block", async () => {
      await api(`/contacts/${c.id}`, { method: "PATCH", json: { blocked: !c.blocked } });
      return c.blocked ? "Number unblocked." : "Number blocked — future calls are rejected.";
    });

  const spam = () =>
    c &&
    run("spam", async () => {
      const isSpam = c.kind === "spam";
      await api(`/contacts/${c.id}`, { method: "PATCH", json: { kind: isSpam ? "lead" : "spam" } });
      return isSpam ? "Marked as legitimate." : "Marked as spam.";
    });

  const name = c?.name || "Unknown caller";
  const num = c?.phone || call.from;

  return (
    <aside aria-label="Caller" className="w-full shrink-0 xl:sticky xl:top-6 xl:w-[300px] xl:border-l xl:border-line xl:pl-6">
      <Card className="p-5">
        <Avatar text={initials(c?.name ?? "", "#")} size={64} />
        <h2 className="mt-3 text-[22px] font-semibold tracking-tight">{name}</h2>
        <div className="relative mt-4 flex gap-2">
          {num ? (
            <>
              <a href={`tel:${num}`} aria-label="Call back" title="Call back" className="grid size-11 place-items-center rounded-2xl bg-surface hover:bg-line">
                <Phone className="size-[18px]" />
              </a>
              <a href={`sms:${num}`} aria-label="Send text" title="Send text" className="grid size-11 place-items-center rounded-2xl bg-surface hover:bg-line">
                <MessageSquare className="size-[18px]" />
              </a>
            </>
          ) : null}
          <button
            aria-label="More actions"
            title="More actions"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            className="grid size-11 place-items-center rounded-2xl bg-surface hover:bg-line"
          >
            <MoreVertical className="size-[18px]" />
          </button>
          {menu && c && (
            <div role="menu" className="absolute left-0 top-12 z-10 w-56 rounded-2xl border border-line bg-ground p-1.5 shadow-lg">
              <button role="menuitem" onClick={block} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[14px] hover:bg-surface">
                <Ban className="size-4" /> {c.blocked ? "Unblock number" : "Block number"}
              </button>
              <button role="menuitem" onClick={spam} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[14px] hover:bg-surface">
                <ShieldAlert className="size-4" /> {c.kind === "spam" ? "Not spam" : "Mark as spam"}
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" variant={call.needs_attention ? "primary" : "soft"} onClick={resolve} disabled={busy !== null}>
            {busy === "resolve" ? <Spinner /> : <CheckCircle2 className="size-4" />} Mark resolved
          </Button>
          {c && (
            <Button size="sm" variant={c.blocked ? "danger" : "soft"} onClick={block} disabled={busy !== null}>
              {busy === "block" ? <Spinner /> : <Ban className="size-4" />} {c.blocked ? "Unblock" : "Block number"}
            </Button>
          )}
          {c && (
            <Button size="sm" variant="soft" onClick={spam} disabled={busy !== null}>
              {busy === "spam" ? <Spinner /> : <ShieldAlert className="size-4" />} {c.kind === "spam" ? "Not spam" : "Mark as spam"}
            </Button>
          )}
        </div>
        {msg && <p role="status" className="mt-3 text-[13px] text-muted">{msg}</p>}

        {extracted.length > 0 && (
          <>
            <h3 className="mt-6 border-t border-line pt-5 text-[16px] font-semibold">Extracted details</h3>
            <div className="mt-3 rounded-2xl border border-line p-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
                {extracted.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="capitalize text-muted">{k.replace(/_/g, " ")}</dt>
                    <dd className="break-words font-medium">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        )}

        <h3 className="mt-6 border-t border-line pt-5 text-[16px] font-semibold">Call details</h3>
        <dl className="mt-3 space-y-3 text-[14px]">
          <Row icon={<Phone className="size-4" />} label="Total calls" value={String(all.length)} />
          <Row icon={<Clock className="size-4" />} label="Average call time" value={duration(avg)} />
        </dl>

        <h3 className="mt-6 border-t border-line pt-5 text-[16px] font-semibold">Details</h3>
        <dl className="mt-3 space-y-3 text-[14px]">
          <Row
            icon={<TagIcon className="size-4" />}
            label="Tags"
            value={
              <span className="flex flex-wrap gap-1.5">
                <Tag>{c?.kind ? c.kind[0].toUpperCase() + c.kind.slice(1) : "Lead"}</Tag>
                {c?.tags.map((t) => <Tag key={t}>{t}</Tag>)}
              </span>
            }
          />
          <Row icon={<Phone className="size-4" />} label="Phone number" value={num ? fmtPhone(num) : null} />
          <Row icon={<Mail className="size-4" />} label="Email" value={c?.email || (call.extracted?.email as string) || null} />
          <Row icon={<MapPin className="size-4" />} label="Address" value={c?.address || (call.extracted?.address as string) || (call.extracted?.postcode as string) || null} />
          <Row icon={<CalendarCheck className="size-4" />} label="Outcome" value={call.outcome ? <Badge tone={outcomeTone(call.outcome)} dot>{OUTCOME_LABEL[call.outcome] ?? call.outcome}</Badge> : null} />
          <Row
            icon={<AlertTriangle className="size-4" />}
            label="Urgency"
            value={<Badge tone={call.urgency === "emergency" ? "danger" : call.urgency === "high" ? "warn" : "neutral"}>{call.urgency}</Badge>}
          />
          <Row icon={<UserRound className="size-4" />} label="Status" value={c?.blocked ? <Badge tone="danger">Blocked</Badge> : "Active"} />
        </dl>
      </Card>
    </aside>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[20px_120px_1fr] items-center gap-3">
      <span className="text-muted">{icon}</span>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words font-semibold">{value ?? <span className="font-normal text-muted">Empty</span>}</dd>
    </div>
  );
}

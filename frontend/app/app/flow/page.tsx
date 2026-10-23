"use client";

import { CalendarCheck, ChevronRight, Clock, MessageSquareText, Play, Plug, Settings2, Siren, Square, Workflow } from "lucide-react";
import { m } from "motion/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Badge, Card, PageHeader, Segmented, Spinner, Toggle } from "@/components/ui/primitives";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { phone } from "@/lib/format";
import { fadeRise, group, stagger } from "@/lib/motion";
import type { PhoneNumber, Profile } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Mode = Profile["routing_mode"];
const MODES: { value: Mode; label: string }[] = [
  { value: "AI_FIRST", label: "AI first" },
  { value: "AI_OVERFLOW", label: "Overflow" },
  { value: "AI_AFTER_HOURS", label: "After hours" },
  { value: "HUMAN_FIRST", label: "Human first" },
];

function fill(t: string, p: Profile) {
  return t.replaceAll("{business_name}", p.business_name).replaceAll("{assistant_name}", p.assistant_name);
}

export default function FlowPage() {
  const prof = useApi<{ version: number; profile: Profile }>("/settings/profile");
  const nums = useApi<PhoneNumber[]>("/numbers");
  const [p, setP] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);

  useEffect(() => {
    if (prof.data) setP(prof.data.profile);
  }, [prof.data]);

  useEffect(() => () => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);

  async function update(next: Profile) {
    const prev = p;
    setP(next);
    setSaving(true);
    setErr(null);
    try {
      await api("/settings/profile?note=Edited%20in%20call%20flow", { method: "PUT", json: next });
    } catch (e) {
      setP(prev);
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function speak(id: string, text: string) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking === id) {
      synth.cancel();
      setSpeaking(null);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = p?.voice.language ?? "en-GB";
    u.onend = () => setSpeaking(null);
    setSpeaking(id);
    synth.speak(u);
  }

  if (!p) return prof.error ? <Card className="p-6 text-danger">{prof.error}</Card> : <SkeletonCard lines={8} className="min-h-[480px]" />;

  const main = nums.data?.[0];
  const aiDay = p.routing_mode === "AI_FIRST" || p.routing_mode === "AI_OVERFLOW";
  const aiNight = p.routing_mode !== "HUMAN_FIRST";
  const summaryTo = p.escalation.filter((e) => e.receives.includes("summary") || e.receives.includes("all"));
  const hoursOpen = p.hours.filter((h) => !h.closed);
  const set = (patch: Partial<Profile>) => update({ ...p, ...patch });

  return (
    <div>
      <PageHeader
        title="Call flow"
        sub={saving ? <span className="inline-flex items-center gap-2"><Spinner /> Saving</span> : "Changes save instantly"}
        actions={
          <div className="max-w-full overflow-x-auto [&_button]:whitespace-nowrap">
            <Segmented value={p.routing_mode} onChange={(v) => set({ routing_mode: v })} options={MODES} />
          </div>
        }
      />
      {err && <p role="alert" className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-[14px] text-danger">{err}</p>}

      <Card className="grid grid-cols-[minmax(0,1fr)] overflow-hidden lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* sub-sidebar, as in the template: the number, then the flow sections */}
        <aside className="min-w-0 border-b border-line p-4 lg:border-b-0 lg:border-r">
          <div className="mb-5 flex items-center gap-3 px-1">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-peri-soft text-[12px] font-bold text-accent">{main?.country ?? "—"}</span>
            <div className="min-w-0">
              <p className="truncate text-[12px] text-muted">{main?.label ?? "No number yet"}</p>
              <p className="truncate font-semibold">{main ? phone(main.e164) : <Link href="/app/numbers" className="text-accent">Add a number</Link>}</p>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Flow sections">
            <span className="flex h-10 shrink-0 items-center gap-3 rounded-xl bg-accent px-3 text-[14px] font-medium text-white"><Workflow className="size-4" /> Call distribution</span>
            <Link href="/app/settings" className="flex h-10 shrink-0 items-center gap-3 rounded-xl px-3 text-[14px] font-medium hover:bg-surface"><Settings2 className="size-4" /> Settings</Link>
            <Link href="/app/settings" className="flex h-10 shrink-0 items-center gap-3 rounded-xl px-3 text-[14px] font-medium hover:bg-surface"><Plug className="size-4" /> Integrations</Link>
            <Link href="/app/settings" className="flex h-10 shrink-0 items-center gap-3 rounded-xl px-3 text-[14px] font-medium hover:bg-surface"><Clock className="size-4" /> Business hours</Link>
          </nav>
          <div className="mt-6 hidden rounded-2xl bg-surface p-4 text-[13px] lg:block">
            <p className="font-semibold">Open {hoursOpen.length} days</p>
            <p className="mt-1 text-muted">{hoursOpen.slice(0, 1).map((h) => `${h.open}–${h.close}`).join("")} · {p.timezone}</p>
          </div>
        </aside>

        {/* canvas */}
        <div className="min-w-0 overflow-x-auto bg-ground p-5 md:p-8">
          <div className="mx-auto flex max-w-[880px] flex-col items-center">
            <div className="rounded-full px-8 py-3 text-[15px] font-semibold text-white shadow-[0_10px_30px_-12px_var(--color-peri)]" style={{ background: "var(--grad-peri)" }}>
              When a call comes in
            </div>
            {/* connector: stem + horizontal bar (desktop only) */}
            <div className="h-8 w-px bg-line" />
            <div className="hidden h-px w-1/2 bg-line md:block" />

            <div className="grid w-full gap-8 md:grid-cols-2 md:gap-10">
              <Branch dot="bg-success" title="On business hours">
                <FlowRow label={p.compliance.disclose_ai ? "Greeting with AI disclosure" : "Greeting"} sub={fill(p.greeting, p)} toggle={p.compliance.disclose_ai} onToggle={(v) => set({ compliance: { ...p.compliance, disclose_ai: v } })} onPlay={() => speak("day", fill(p.greeting, p))} playing={speaking === "day"} />
                <FlowRow label={`${p.assistant_name} answers & resolves`} sub={p.routing_mode === "AI_OVERFLOW" ? `After ${p.overflow_ring_seconds}s ringing your team` : aiDay ? "Every call, instantly" : "Off — staff answer during hours"} toggle={aiDay} onToggle={(v) => set({ routing_mode: v ? "AI_FIRST" : "AI_AFTER_HOURS" })} />
                <FlowRow icon={<CalendarCheck className="size-4" />} label="Book appointments" sub={p.booking_enabled ? `${p.booking_provider === "internal" ? "Built-in calendar" : p.booking_provider} · ${p.slot_minutes}-min slots` : "Takes details for a callback instead"} toggle={p.booking_enabled} onToggle={(v) => set({ booking_enabled: v })} />
                <FlowRow label="Record & transcribe" sub={p.compliance.recording_notice} toggle={p.compliance.record_calls} onToggle={(v) => set({ compliance: { ...p.compliance, record_calls: v } })} />
                <p className="pl-2 pt-1 text-[13px] text-muted">If the caller asks for a person</p>
                <FlowRow
                  label={p.transfer_number ? `Warm transfer to ${phone(p.transfer_number)}` : "Take a callback request"}
                  sub={p.transfer_number ? "With a one-line summary whispered first. No answer → callback task." : "Set a transfer number in Settings → Escalation."}
                  link="/app/settings"
                />
              </Branch>

              <Branch dot="bg-danger" title="Off business hours">
                <FlowRow label="After-hours greeting" sub={fill(p.after_hours_greeting, p)} onPlay={() => speak("night", fill(p.after_hours_greeting, p))} playing={speaking === "night"} />
                <FlowRow label="AI takes messages & books" sub={aiNight ? "Answers, books, takes messages" : "Off — callers reach voicemail"} toggle={aiNight} onToggle={(v) => set({ routing_mode: v ? (p.routing_mode === "HUMAN_FIRST" ? "AI_AFTER_HOURS" : p.routing_mode) : "HUMAN_FIRST" })} />
                <FlowRow icon={<Siren className="size-4" />} label="Emergency escalation" sub={p.emergency_keywords.length ? `${p.emergency_keywords.length} trigger words · safety script, then alert on-call` : "No trigger words set"} link="/app/settings" />
                <FlowRow icon={<MessageSquareText className="size-4" />} label="Summary to owner" sub={summaryTo.length ? `To ${summaryTo.map((e) => e.name || e.phone).join(", ")} by ${summaryTo.some((e) => e.whatsapp) ? "WhatsApp" : "SMS"}` : "Nobody set — add a contact"} link="/app/settings" />
                <p className="pl-2 pt-1 text-[13px] text-muted">If the call is missed or dropped</p>
                <FlowRow label="Missed-call text-back & follow-ups" sub={p.followup.enabled ? `Texts straight away, then day ${p.followup.days.join(", ")}` : "Off"} toggle={p.followup.enabled} onToggle={(v) => set({ followup: { ...p.followup, enabled: v } })} />
              </Branch>
            </div>
            <p className="mt-8 text-center text-[13px] text-muted">Hang up after the AI summarises next steps. <Badge tone="accent">v{prof.data?.version}</Badge></p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Branch({ dot, title, children }: { dot: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="hidden h-6 w-px bg-line md:block" />
      <span className="inline-flex items-center gap-2 rounded-full border border-line bg-ground px-4 py-2 text-[13px] font-semibold">
        <span className={`size-2 rounded-full ${dot}`} /> {title}
      </span>
      <div className="h-5 w-px bg-line" />
      {/* rows hang off a left rail, like the template's bracket; they stagger in once on load */}
      <m.div variants={group} initial="initial" animate="animate" transition={stagger(40)} className="w-full space-y-3 border-l-2 border-line pl-4">
        {children}
      </m.div>
    </div>
  );
}

function FlowRow({
  label, sub, toggle, onToggle, onPlay, playing, link, icon,
}: {
  label: string; sub?: string; toggle?: boolean; onToggle?: (v: boolean) => void; onPlay?: () => void; playing?: boolean; link?: string; icon?: ReactNode;
}) {
  return (
    <m.div variants={fadeRise} className="flex items-center gap-3 rounded-2xl border border-line bg-ground px-4 py-3 shadow-[0_1px_0_var(--color-line)]">
      {onToggle !== undefined && toggle !== undefined && <Toggle checked={toggle} onChange={onToggle} label={label} />}
      {onPlay ? (
        <button onClick={onPlay} aria-label={playing ? "Stop preview" : `Preview: ${label}`} className="grid size-8 shrink-0 place-items-center rounded-full text-ink hover:bg-surface">
          {playing ? <Square className="size-3.5 fill-current" /> : <Play className="size-4" />}
        </button>
      ) : icon ? (
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-accent">{icon}</span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] font-medium ${toggle === false ? "text-muted" : ""}`}>{label}</p>
        {sub && <p className="line-clamp-2 text-[12px] text-muted">{sub}</p>}
      </div>
      {link && (
        <Link href={link} aria-label={`Edit ${label}`} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink">
          <ChevronRight className="size-4" />
        </Link>
      )}
    </m.div>
  );
}

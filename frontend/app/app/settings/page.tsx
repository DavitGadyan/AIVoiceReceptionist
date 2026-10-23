"use client";

import {
  BookOpen, Building2, CalendarCheck, Clock, Copy, FileUp, History, Link2, ListChecks, Mic, PhoneForwarded, Plug, ShieldCheck, Siren, Tag, Trash2,
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Field, PageHeader, Spinner, Toggle, inputCls } from "@/components/ui/primitives";
import { SkeletonCard, SkeletonRows } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";
import { DUR, EASE_OUT, SPRING, fadeRise } from "@/lib/motion";
import type { Escalation, IntakeField, Policy, Faq, Preset, Profile, Service } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { Area, ChipsInput, Modal, RepeatList, Section, Text } from "./_parts";

const TABS = [
  { key: "business", label: "Business", icon: Building2 },
  { key: "assistant", label: "Assistant & voice", icon: Mic },
  { key: "hours", label: "Hours", icon: Clock },
  { key: "services", label: "Services & prices", icon: Tag },
  { key: "policies", label: "Policies & FAQs", icon: BookOpen },
  { key: "intake", label: "Intake & emergencies", icon: Siren },
  { key: "escalation", label: "Escalation", icon: PhoneForwarded },
  { key: "booking", label: "Booking & follow-ups", icon: CalendarCheck },
  { key: "compliance", label: "Compliance", icon: ShieldCheck },
  { key: "integrations", label: "Integrations & webhooks", icon: Plug },
  { key: "versions", label: "Versions", icon: History },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const DAY_LABEL: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const TIMEZONES = ["Europe/London", "Europe/Dublin", "Europe/Paris", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "Australia/Sydney", "Pacific/Auckland", "Asia/Dubai"];
const CURRENCIES = ["GBP", "USD", "EUR", "CAD", "AUD", "NZD", "AED"];
const ROUTING: { value: Profile["routing_mode"]; title: string; desc: string }[] = [
  { value: "AI_FIRST", title: "AI first", desc: "The AI answers every call, 24/7." },
  { value: "AI_OVERFLOW", title: "Overflow", desc: "Your team rings first; the AI picks up after N seconds or when busy." },
  { value: "AI_AFTER_HOURS", title: "After hours only", desc: "The AI answers only outside opening hours." },
  { value: "HUMAN_FIRST", title: "Human first", desc: "Forward to staff; AI only for missed/abandoned calls." },
];

type Integration = { id: string; kind: string; config: Record<string, unknown>; has_secrets: boolean; active: boolean };
type Webhook = { id: string; url: string; events: string[]; secret: string; active: boolean };
type Version = { version: number; note: string; created_by: string; created_at: string };

export default function SettingsPage() {
  const { data, error, loading, reload } = useApi<{ version: number; profile: Profile }>("/settings/profile");
  const [tab, setTab] = useState<TabKey>("business");
  const [draft, setDraft] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (data) setDraft(structuredClone(data.profile));
  }, [data]);

  const dirty = useMemo(() => !!data && !!draft && JSON.stringify(data.profile) !== JSON.stringify(draft), [data, draft]);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function save() {
    if (!draft) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const r = await api<{ version: number }>("/settings/profile", { method: "PUT", json: draft });
      toast({ title: `Saved as version ${r.version}`, description: "The next call uses it.", tone: "success" });
      await reload();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !draft) {
    return (
      <div className="pb-24">
        <PageHeader title="Settings" />
        <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <SkeletonRows n={6} avatar={false} />
          <div className="space-y-6">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={3} />
          </div>
        </div>
      </div>
    );
  }
  if (error && !draft) return <Card className="p-6 text-danger">Could not load settings: {error}</Card>;
  if (!draft || !data) return null;

  return (
    <div className="pb-24">
      <PageHeader
        title="Settings"
        sub={<>Live config <Badge tone="accent">v{data.version}</Badge></>}
        actions={<PromptPreviewButton />}
      />

      <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* sub-nav: horizontal scroller on mobile, sticky column on desktop. One accent pill slides between tabs. */}
        <nav aria-label="Settings sections" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:sticky lg:top-6 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-left text-[14px] font-medium transition-colors duration-[var(--dur-fast)] ${active ? "text-white" : "text-ink/80 hover:bg-surface"}`}
              >
                {active && <m.span layoutId="settings-tab" transition={SPRING} className="absolute inset-0 bg-accent" style={{ borderRadius: 12 }} aria-hidden />}
                <span className="relative flex items-center gap-3">
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                  {label}
                </span>
              </button>
            );
          })}
        </nav>

        <m.div key={tab} variants={fadeRise} initial="initial" animate="animate" transition={{ duration: DUR.fast, ease: EASE_OUT }} className="min-w-0 space-y-8">
          {tab === "business" && <BusinessTab draft={draft} set={set} onPreset={reload} />}
          {tab === "assistant" && <AssistantTab draft={draft} set={set} />}
          {tab === "hours" && <HoursTab draft={draft} set={set} />}
          {tab === "services" && <ServicesTab draft={draft} set={set} />}
          {tab === "policies" && <PoliciesTab draft={draft} set={set} />}
          {tab === "intake" && <IntakeTab draft={draft} set={set} />}
          {tab === "escalation" && <EscalationTab draft={draft} set={set} />}
          {tab === "booking" && <BookingTab draft={draft} set={set} />}
          {tab === "compliance" && <ComplianceTab draft={draft} set={set} />}
          {tab === "integrations" && <IntegrationsTab />}
          {tab === "versions" && <VersionsTab current={data.version} onRestore={reload} />}
        </m.div>
      </div>

      <AnimatePresence>
        {(dirty || saveErr) && (
          <m.div
            key="unsaved"
            initial={{ opacity: 0, transform: "translateY(calc(100% + 16px))" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0, transform: "translateY(calc(100% + 16px))" }}
            transition={{ duration: DUR.base, ease: EASE_OUT }}
            className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4"
          >
            <div className="flex w-full max-w-xl flex-wrap items-center justify-between gap-3 rounded-full bg-ink py-2 pl-5 pr-2 text-on-ink shadow-2xl">
              <span className="text-[14px] font-medium">{saveErr ? <span className="text-danger">{saveErr}</span> : "Unsaved changes"}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="text-on-ink hover:bg-white/10" onClick={() => { setDraft(structuredClone(data.profile)); setSaveErr(null); }}>
                  Discard
                </Button>
                <Button size="sm" variant="primary" onClick={save} disabled={saving}>{saving ? <Spinner /> : "Save"}</Button>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type TabProps = { draft: Profile; set: <K extends keyof Profile>(k: K, v: Profile[K]) => void };

function PromptPreviewButton() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  return (
    <>
      <Button size="sm" onClick={async () => { setOpen(true); setPrompt(null); try { setPrompt((await api<{ prompt: string }>("/settings/prompt-preview")).prompt); } catch (e) { setPrompt(`Error: ${e instanceof Error ? e.message : e}`); } }}>
        <ListChecks className="size-4" /> Preview prompt
      </Button>
      <AnimatePresence>
        {open && (
          <Modal key="prompt-preview" title="System prompt the receptionist runs with (saved config)" onClose={() => setOpen(false)}>
            {prompt === null ? <Spinner /> : <pre className="whitespace-pre-wrap rounded-2xl bg-surface p-4 text-[13px] leading-relaxed">{prompt}</pre>}
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}

function BusinessTab({ draft, set, onPreset }: TabProps & { onPreset: () => Promise<void> }) {
  const { data: presets } = useApi<Preset[]>("/presets");
  const [busy, setBusy] = useState<string | null>(null);
  async function apply(key: string, label: string) {
    if (!confirm(`Apply the "${label}" preset? Services, FAQs, policies, intake questions and tone will be replaced. Business name, hours, address, escalation and voice are kept.`)) return;
    setBusy(key);
    try {
      await api("/settings/apply-preset", { method: "POST", json: { industry: key, keep_business_details: true } });
      await onPreset();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to apply preset");
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <Section title="Company type" desc="Each preset carries industry know-how: questions to ask, emergencies to spot, what never to promise. Pick the closest one, then tailor below.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(presets ?? []).map((p) => {
            const active = draft.industry === p.key;
            return (
              <Card key={p.key} className={`flex flex-col p-4 ${active ? "border-accent ring-1 ring-accent" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{p.label}</p>
                  {active && <Badge tone="accent">Current</Badge>}
                </div>
                <p className="mt-1 flex-1 text-[13px] text-muted">{p.summary}</p>
                {!active && (
                  <Button size="sm" className="mt-3 self-start" onClick={() => apply(p.key, p.label)} disabled={busy !== null}>
                    {busy === p.key ? <Spinner /> : "Apply preset"}
                  </Button>
                )}
              </Card>
            );
          })}
          {!presets && <Spinner />}
        </div>
      </Section>
      <Section title="Business details" desc="What the receptionist says about you.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" className="sm:col-span-2"><Text label="Business name" value={draft.business_name} onChange={(v) => set("business_name", v)} /></Field>
          <Field label="Description" hint="One line the AI can use to introduce the business." className="sm:col-span-2"><Area label="Description" value={draft.description} onChange={(v) => set("description", v)} rows={2} /></Field>
          <Field label="Website"><Text label="Website" value={draft.website} onChange={(v) => set("website", v)} placeholder="https://" /></Field>
          <Field label="Address"><Text label="Address" value={draft.address} onChange={(v) => set("address", v)} /></Field>
          <Field label="Timezone">
            <select className={inputCls} value={draft.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {[...new Set([draft.timezone, ...TIMEZONES])].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Currency">
            <select className={inputCls} value={draft.currency} onChange={(e) => set("currency", e.target.value)}>
              {[...new Set([draft.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </Section>
    </>
  );
}

function AssistantTab({ draft, set }: TabProps) {
  const voice = draft.voice;
  const setVoice = (patch: Partial<Profile["voice"]>) => set("voice", { ...voice, ...patch });
  return (
    <>
      <Section title="Role & personality">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assistant name"><Text label="Assistant name" value={draft.assistant_name} onChange={(v) => set("assistant_name", v)} /></Field>
          <Field label="Role" hint="e.g. receptionist, patient coordinator, intake specialist"><Text label="Role" value={draft.assistant_role} onChange={(v) => set("assistant_role", v)} /></Field>
          <Field label="Tone of voice" className="sm:col-span-2"><Text label="Tone" value={draft.tone} onChange={(v) => set("tone", v)} /></Field>
          <Field label="Greeting (open)" hint="Placeholders: {business_name}, {assistant_name}. Keep the AI disclosure for compliance." className="sm:col-span-2">
            <Area label="Greeting" value={draft.greeting} onChange={(v) => set("greeting", v)} />
          </Field>
          <Field label="Greeting (closed)" hint="Used outside opening hours." className="sm:col-span-2">
            <Area label="After-hours greeting" value={draft.after_hours_greeting} onChange={(v) => set("after_hours_greeting", v)} />
          </Field>
          <Field label="Languages" hint="ISO codes, e.g. en, es, fr. The AI replies in the caller's language if listed." className="sm:col-span-2">
            <ChipsInput label="Languages" value={draft.languages} onChange={(v) => set("languages", v)} />
          </Field>
        </div>
      </Section>
      <Section title="Voice">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Provider">
            <select className={inputCls} value={voice.provider} onChange={(e) => setVoice({ provider: e.target.value })}>
              {["11labs", "cartesia", "openai", "deepgram", "azure"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Voice ID"><Text label="Voice ID" value={voice.voice_id} onChange={(v) => setVoice({ voice_id: v })} /></Field>
          <Field label="Language / accent"><Text label="Voice language" value={voice.language} onChange={(v) => setVoice({ language: v })} placeholder="en-GB" /></Field>
          <Field label={`Speed · ${voice.speed.toFixed(2)}×`}>
            <input type="range" min={0.7} max={1.3} step={0.05} value={voice.speed} onChange={(e) => setVoice({ speed: Number(e.target.value) })} className="mt-3 w-full accent-[var(--color-accent)]" aria-label="Speed" />
          </Field>
          <Field label="Background sound">
            <select className={inputCls} value={voice.background_sound} onChange={(e) => setVoice({ background_sound: e.target.value })}>
              {["office", "off"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
        </div>
      </Section>
      <Section title="When the AI answers">
        <div className="grid gap-3 sm:grid-cols-2">
          {ROUTING.map((r) => (
            <button
              key={r.value}
              onClick={() => set("routing_mode", r.value)}
              className={`rounded-2xl border p-4 text-left transition-colors ${draft.routing_mode === r.value ? "border-accent bg-peri-soft" : "border-line hover:bg-surface"}`}
              aria-pressed={draft.routing_mode === r.value}
            >
              <p className="font-semibold">{r.title}</p>
              <p className="mt-1 text-[13px] text-muted">{r.desc}</p>
            </button>
          ))}
        </div>
        {draft.routing_mode === "AI_OVERFLOW" && (
          <Field label="Ring staff for (seconds) before the AI answers" className="mt-4 max-w-xs">
            <Text label="Overflow seconds" type="number" min={5} max={60} value={draft.overflow_ring_seconds} onChange={(v) => set("overflow_ring_seconds", Number(v) || 20)} />
          </Field>
        )}
      </Section>
      <Section title="Extra instructions" desc="Anything specific to this business the presets don't cover.">
        <Area label="Custom instructions" rows={5} value={draft.custom_instructions} onChange={(v) => set("custom_instructions", v)} />
      </Section>
    </>
  );
}

function HoursTab({ draft, set }: TabProps) {
  const update = (i: number, patch: Partial<Profile["hours"][number]>) => set("hours", draft.hours.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  return (
    <Section title="Opening hours" desc={`Times are in ${draft.timezone}. Outside these hours the after-hours greeting and rules apply.`}>
      <Card className="divide-y divide-line">
        {draft.hours.map((h, i) => (
          <div key={h.day} className="flex flex-wrap items-center gap-4 px-4 py-3">
            <span className="w-28 font-medium">{DAY_LABEL[h.day] ?? h.day}</span>
            <span className="flex items-center gap-2 text-[13px] text-muted">
              <Toggle checked={!h.closed} onChange={(open) => update(i, { closed: !open, open: h.open ?? "09:00", close: h.close ?? "17:00" })} label={`${DAY_LABEL[h.day]} open`} />
              {h.closed ? "Closed" : "Open"}
            </span>
            {!h.closed && (
              <span className="flex items-center gap-2">
                <input aria-label={`${h.day} opens`} type="time" className={`${inputCls} w-32`} value={h.open ?? ""} onChange={(e) => update(i, { open: e.target.value })} />
                <span className="text-muted">–</span>
                <input aria-label={`${h.day} closes`} type="time" className={`${inputCls} w-32`} value={h.close ?? ""} onChange={(e) => update(i, { close: e.target.value })} />
              </span>
            )}
          </div>
        ))}
      </Card>
    </Section>
  );
}

function ServicesTab({ draft, set }: TabProps) {
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <>
      <Section title="Services & prices" desc="The AI quotes only these. Leave prices empty to say 'quoted on site'.">
        <RepeatList<Service>
          items={draft.services}
          onChange={(v) => set("services", v)}
          addLabel="Add service"
          empty="No services yet."
          make={() => ({ name: "", description: "", duration_minutes: 60, price_from: null, price_to: null, price_note: "", bookable: true })}
          render={(s, patch) => (
            <div className="grid gap-3 sm:grid-cols-6">
              <Field label="Name" className="sm:col-span-3"><Text label="Service name" value={s.name} onChange={(v) => patch({ name: v })} /></Field>
              <Field label="Minutes"><Text label="Duration" type="number" min={5} value={s.duration_minutes} onChange={(v) => patch({ duration_minutes: Number(v) || 0 })} /></Field>
              <Field label={`From (${draft.currency})`}><Text label="Price from" type="number" min={0} value={s.price_from ?? ""} onChange={(v) => patch({ price_from: num(v) })} /></Field>
              <Field label="To"><Text label="Price to" type="number" min={0} value={s.price_to ?? ""} onChange={(v) => patch({ price_to: num(v) })} /></Field>
              <Field label="Price note" className="sm:col-span-3"><Text label="Price note" value={s.price_note} onChange={(v) => patch({ price_note: v })} placeholder="e.g. call-out fee, labour quoted on site" /></Field>
              <Field label="Description" className="sm:col-span-2"><Text label="Description" value={s.description} onChange={(v) => patch({ description: v })} /></Field>
              <Field label="Bookable"><span className="flex h-11 items-center"><Toggle checked={s.bookable} onChange={(v) => patch({ bookable: v })} label="Bookable" /></span></Field>
            </div>
          )}
        />
      </Section>
      <Section title="Service area" desc="Postcode / ZIP prefixes or towns. Leave empty to accept everywhere.">
        <ChipsInput label="Service area" value={draft.service_area} onChange={(v) => set("service_area", v)} placeholder="M1, M20, SK4…" />
        <Field label="Out-of-area note" className="mt-4"><Text label="Service area note" value={draft.service_area_note} onChange={(v) => set("service_area_note", v)} /></Field>
      </Section>
    </>
  );
}

function PdfCallout() {
  return (
    <Link href="/app/knowledge" className="group flex flex-col gap-4 rounded-[var(--radius-card)] p-5 text-white sm:flex-row sm:items-center" style={{ background: "var(--grad-peri)" }}>
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/20"><FileUp className="size-6" /></span>
      <span className="flex-1">
        <span className="block font-semibold">Import policies, prices and FAQs from a PDF</span>
        <span className="block text-[14px] text-white/80">Upload a price list, policy document or handbook. We extract the details and you approve each change before it goes live.</span>
      </span>
      <span className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink transition-transform group-hover:translate-x-0.5">Upload PDF</span>
    </Link>
  );
}

function PoliciesTab({ draft, set }: TabProps) {
  return (
    <>
      <PdfCallout />
      <Section title="Policies" desc="Applied exactly as written — cancellation, deposits, late arrival, warranties.">
        <RepeatList<Policy>
          items={draft.policies}
          onChange={(v) => set("policies", v)}
          addLabel="Add policy"
          empty="No policies yet."
          make={() => ({ title: "", body: "" })}
          render={(p, patch) => (
            <div className="space-y-3">
              <Field label="Title"><Text label="Policy title" value={p.title} onChange={(v) => patch({ title: v })} /></Field>
              <Field label="Policy"><Area label="Policy body" value={p.body} onChange={(v) => patch({ body: v })} /></Field>
            </div>
          )}
        />
      </Section>
      <Section title="Approved answers (FAQs)">
        <RepeatList<Faq>
          items={draft.faqs}
          onChange={(v) => set("faqs", v)}
          addLabel="Add FAQ"
          empty="No FAQs yet."
          make={() => ({ question: "", answer: "" })}
          render={(f, patch) => (
            <div className="space-y-3">
              <Field label="Question"><Text label="Question" value={f.question} onChange={(v) => patch({ question: v })} /></Field>
              <Field label="Answer"><Area label="Answer" value={f.answer} onChange={(v) => patch({ answer: v })} rows={2} /></Field>
            </div>
          )}
        />
      </Section>
      <Section title="Never promise" desc="Hard limits, e.g. exact repair prices, same-day arrival, outcomes.">
        <ChipsInput label="Never say" value={draft.never_say} onChange={(v) => set("never_say", v)} />
      </Section>
    </>
  );
}

function IntakeTab({ draft, set }: TabProps) {
  return (
    <>
      <Section title="Details to collect" desc="The AI asks only for what it doesn't already know, in natural order.">
        <RepeatList<IntakeField>
          items={draft.intake_fields}
          onChange={(v) => set("intake_fields", v)}
          addLabel="Add field"
          make={() => ({ key: "", label: "", required: true, hint: "" })}
          render={(f, patch) => (
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
              <Field label="Key"><Text label="Field key" value={f.key} onChange={(v) => patch({ key: v.replace(/\s+/g, "_").toLowerCase() })} placeholder="postcode" /></Field>
              <Field label="Question / label"><Text label="Field label" value={f.label} onChange={(v) => patch({ label: v })} /></Field>
              <Field label="Required"><span className="flex h-11 items-center"><Toggle checked={f.required} onChange={(v) => patch({ required: v })} label="Required" /></span></Field>
            </div>
          )}
        />
      </Section>
      <Section title="Emergencies" desc="If a caller mentions any of these, the AI reads the safety script first and alerts the on-call contacts.">
        <Field label="Trigger words"><ChipsInput label="Emergency keywords" value={draft.emergency_keywords} onChange={(v) => set("emergency_keywords", v)} placeholder="burst, gas, flood…" /></Field>
        <Field label="Safety script" className="mt-4"><Area label="Emergency script" value={draft.emergency_script} onChange={(v) => set("emergency_script", v)} rows={4} /></Field>
      </Section>
    </>
  );
}

const RECEIVES = [
  { key: "urgent", label: "Urgent" },
  { key: "callback", label: "Callbacks" },
  { key: "summary", label: "Call summaries" },
];

function EscalationTab({ draft, set }: TabProps) {
  return (
    <>
      <Section title="Live transfer" desc="Where the AI warm-transfers callers who ask for a person (during opening hours). Leave empty to always take a callback.">
        <Field label="Transfer number" className="max-w-sm"><Text label="Transfer number" value={draft.transfer_number} onChange={(v) => set("transfer_number", v)} placeholder="+447700900456" /></Field>
      </Section>
      <Section title="Who gets notified" desc="WhatsApp is used when set, otherwise SMS. Email gets every selected notification too.">
        <RepeatList<Escalation>
          items={draft.escalation}
          onChange={(v) => set("escalation", v)}
          addLabel="Add contact"
          empty="Nobody is notified yet — add the owner."
          make={() => ({ name: "", role: "", phone: "", email: "", whatsapp: "", receives: ["urgent", "callback", "summary"] })}
          render={(e, patch) => (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Name"><Text label="Contact name" value={e.name} onChange={(v) => patch({ name: v })} /></Field>
              <Field label="Role"><Text label="Contact role" value={e.role} onChange={(v) => patch({ role: v })} /></Field>
              <Field label="Mobile (SMS)"><Text label="Phone" value={e.phone} onChange={(v) => patch({ phone: v })} /></Field>
              <Field label="WhatsApp"><Text label="WhatsApp" value={e.whatsapp} onChange={(v) => patch({ whatsapp: v })} /></Field>
              <Field label="Email"><Text label="Email" type="email" value={e.email} onChange={(v) => patch({ email: v })} /></Field>
              <Field label="Receives">
                <div className="flex flex-wrap gap-1.5">
                  {RECEIVES.map((r) => {
                    const on = e.receives.includes(r.key) || e.receives.includes("all");
                    return (
                      <button
                        key={r.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => patch({ receives: on ? e.receives.filter((x) => x !== r.key && x !== "all") : [...e.receives, r.key] })}
                        className={`h-9 rounded-full border px-3 text-[13px] font-semibold ${on ? "border-accent bg-accent text-white" : "border-line hover:bg-surface"}`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          )}
        />
      </Section>
    </>
  );
}

function BookingTab({ draft, set }: TabProps) {
  const fu = draft.followup;
  return (
    <>
      <Section title="Booking" aside={<Toggle checked={draft.booking_enabled} onChange={(v) => set("booking_enabled", v)} label="Booking enabled" />}>
        <div className={`grid gap-4 sm:grid-cols-3 ${draft.booking_enabled ? "" : "pointer-events-none opacity-50"}`}>
          <Field label="Calendar">
            <select className={inputCls} value={draft.booking_provider} onChange={(e) => set("booking_provider", e.target.value)}>
              <option value="internal">Built-in calendar</option>
              <option value="calcom">Cal.com</option>
              <option value="google">Google Calendar</option>
              <option value="link">Text a booking link</option>
            </select>
          </Field>
          <Field label="Slot length (min)"><Text label="Slot minutes" type="number" min={5} value={draft.slot_minutes} onChange={(v) => set("slot_minutes", Number(v) || 30)} /></Field>
          {draft.booking_provider === "link" && (
            <Field label="Booking link" hint="Sent by SMS. Sending a link is not a confirmed booking." className="sm:col-span-3"><Text label="Booking link" value={draft.booking_link} onChange={(v) => set("booking_link", v)} placeholder="https://" /></Field>
          )}
          {draft.booking_provider === "calcom" && <p className="text-[13px] text-muted sm:col-span-3">Connect Cal.com under Integrations & webhooks.</p>}
          {draft.booking_provider === "google" && <p className="text-[13px] text-muted sm:col-span-3">Google Calendar sync is configured by your account manager; until then bookings use the built-in calendar.</p>}
        </div>
      </Section>
      <Section title="Follow-ups" desc="Automatic, polite nudges to enquiries that didn't book. They stop as soon as the lead books, replies STOP or is blocked." aside={<Toggle checked={fu.enabled} onChange={(v) => set("followup", { ...fu, enabled: v })} label="Follow-ups enabled" />}>
        <div className={`grid gap-4 sm:grid-cols-2 ${fu.enabled ? "" : "pointer-events-none opacity-50"}`}>
          <Field label="Days after the call">
            <ChipsInput label="Follow-up days" value={fu.days.map(String)} onChange={(v) => set("followup", { ...fu, days: v.map(Number).filter((n) => n > 0).sort((a, b) => a - b) })} placeholder="2, 5, 10" />
          </Field>
          <Field label="Channel">
            <select className={inputCls} value={fu.channel} onChange={(e) => set("followup", { ...fu, channel: e.target.value })}>
              {["sms", "whatsapp", "email", "same"].map((c) => <option key={c} value={c}>{c === "same" ? "Same as enquiry" : c.toUpperCase()}</option>)}
            </select>
          </Field>
        </div>
      </Section>
    </>
  );
}

function ComplianceTab({ draft, set }: TabProps) {
  const c = draft.compliance;
  const setC = (patch: Partial<Profile["compliance"]>) => set("compliance", { ...c, ...patch });
  return (
    <Section title="Compliance & privacy" desc="Defaults follow UK/EU GDPR and US one-party-consent norms; check local rules for your region.">
      <Card className="divide-y divide-line">
        <label className="flex items-center justify-between gap-4 p-4"><span><b className="block text-[14px]">Say it's an AI</b><span className="text-[13px] text-muted">Required in several regions; recommended everywhere.</span></span><Toggle checked={c.disclose_ai} onChange={(v) => setC({ disclose_ai: v })} label="Disclose AI" /></label>
        <label className="flex items-center justify-between gap-4 p-4"><span><b className="block text-[14px]">Record calls</b><span className="text-[13px] text-muted">Recordings and transcripts appear in Activity.</span></span><Toggle checked={c.record_calls} onChange={(v) => setC({ record_calls: v })} label="Record calls" /></label>
      </Card>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Recording notice" className="sm:col-span-2"><Text label="Recording notice" value={c.recording_notice} onChange={(v) => setC({ recording_notice: v })} /></Field>
        <Field label="Region">
          <select className={inputCls} value={c.region} onChange={(e) => setC({ region: e.target.value })}>
            {["UK", "EU", "US", "CA", "AU", "NZ", "other"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Keep recordings & transcripts (days)"><Text label="Retention days" type="number" min={1} value={c.retention_days} onChange={(v) => setC({ retention_days: Number(v) || 30 })} /></Field>
        <Field label="Never give advice on" hint="e.g. medical, legal, financial" className="sm:col-span-2"><ChipsInput label="No-advice domains" value={c.no_advice_domains} onChange={(v) => setC({ no_advice_domains: v })} /></Field>
      </div>
    </Section>
  );
}

function IntegrationsTab() {
  const ints = useApi<Integration[]>("/integrations");
  const hooks = useApi<Webhook[]>("/webhooks");
  const calcom = ints.data?.find((i) => i.kind === "calcom");
  const [cal, setCal] = useState({ event_type_id: "", api_key: "" });
  const [hookUrl, setHookUrl] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (calcom) setCal((c) => ({ ...c, event_type_id: String(calcom.config.event_type_id ?? "") }));
  }, [calcom]);

  async function saveCal() {
    try {
      await api("/integrations", { method: "PUT", json: { kind: "calcom", config: { event_type_id: Number(cal.event_type_id) || cal.event_type_id }, secrets: cal.api_key ? { api_key: cal.api_key } : {}, active: true } });
      setCal((c) => ({ ...c, api_key: "" }));
      toast({ title: "Cal.com saved", description: "Choose 'Cal.com' under Booking to use it.", tone: "success" });
      await ints.reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed", tone: "danger" });
    }
  }

  async function addHook(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/webhooks", { method: "POST", json: { url: hookUrl, events: ["call.ended"] } });
      setHookUrl("");
      toast({ title: "Webhook added", tone: "success" });
      await hooks.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed", tone: "danger" });
    }
  }

  return (
    <>
      <Section title="Cal.com" desc="Live availability and bookings in the client's own Cal.com." aside={calcom ? <Badge tone="success" dot>Connected</Badge> : <Badge>Not connected</Badge>}>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Event type ID"><Text label="Event type ID" value={cal.event_type_id} onChange={(v) => setCal({ ...cal, event_type_id: v })} /></Field>
          <Field label={calcom?.has_secrets ? "API key (saved — leave blank to keep)" : "API key"}><Text label="Cal.com API key" type="password" value={cal.api_key} onChange={(v) => setCal({ ...cal, api_key: v })} autoComplete="off" /></Field>
          <Button variant="dark" onClick={saveCal} disabled={!cal.event_type_id}>Save</Button>
        </div>
      </Section>
      <Section title="SMS & WhatsApp" desc="Messages go out through the platform's Twilio account (TWILIO_* env on the server). Without credentials they're logged as 'simulated' so you can test safely. WhatsApp uses the Twilio WhatsApp sender.">
        <div className="flex flex-wrap gap-2"><Badge tone="accent">Twilio SMS</Badge><Badge tone="accent">WhatsApp Business (Twilio)</Badge><Badge tone="accent">SMTP email</Badge></div>
      </Section>
      <Section title="Webhooks (Make, n8n, Zapier, CRMs)" desc="We POST a signed JSON payload when every call ends — transcript, 2-sentence summary, extracted details and outcome.">
        <form onSubmit={addHook} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input aria-label="Webhook URL" type="url" required className={inputCls} value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://hook.eu1.make.com/…" />
          <Button variant="dark" className="shrink-0"><Link2 className="size-4" /> Add webhook</Button>
        </form>
        <div className="space-y-2">
          {hooks.data?.length === 0 && <p className="text-[14px] text-muted">No webhooks yet.</p>}
          {hooks.data?.map((w) => (
            <Card key={w.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{w.url}</p>
                <p className="text-[12px] text-muted">Events: {w.events.join(", ")} · Signing secret <code className="rounded bg-surface px-1.5 py-0.5">{w.secret.slice(0, 6)}…</code></p>
              </div>
              <Button size="sm" onClick={() => navigator.clipboard?.writeText(w.secret)}><Copy className="size-4" /> Copy secret</Button>
              <Button size="sm" variant="danger" aria-label="Delete webhook" onClick={async () => { await api(`/webhooks/${w.id}`, { method: "DELETE" }); await hooks.reload(); }}><Trash2 className="size-4" /></Button>
            </Card>
          ))}
        </div>
        <details className="mt-4 rounded-2xl bg-surface p-4">
          <summary className="cursor-pointer text-[14px] font-semibold">Sample payload & signature check</summary>
          <pre className="mt-3 overflow-x-auto text-[12px] leading-relaxed">{`POST <your url>
x-receptra-event: call.ended
x-receptra-signature: hex(HMAC_SHA256(secret, raw_body))

{
  "event": "call.ended",
  "data": {
    "id": "c81f…", "from": "+447700900111", "outcome": "BOOKED",
    "summary": "Sarah's boiler is banging; booked a service Thursday 11am.",
    "extracted": { "name": "Sarah Jones", "postcode": "M20 2RN" },
    "transcript": [{ "role": "assistant", "text": "Hi…" }],
    "recording_url": "https://…", "duration_seconds": 142
  }
}`}</pre>
        </details>
      </Section>
    </>
  );
}

function VersionsTab({ current, onRestore }: { current: number; onRestore: () => Promise<void> }) {
  const { data, loading, reload } = useApi<Version[]>("/settings/versions");
  const [busy, setBusy] = useState<number | null>(null);
  return (
    <Section title="Version history" desc="Every save is a version. Each call records the version it ran with, so you can always see why the AI said what it said.">
      {loading && !data && <Spinner />}
      <Card className="divide-y divide-line">
        {data?.map((v) => (
          <div key={v.version} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Badge tone={v.version === current ? "accent" : "neutral"}>v{v.version}</Badge>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{v.note || "Saved"}</p>
              <p className="text-[12px] text-muted">{ago(v.created_at)}</p>
            </div>
            {v.version !== current && (
              <Button size="sm" disabled={busy !== null} onClick={async () => {
                if (!confirm(`Restore v${v.version}? This saves it as a new version.`)) return;
                setBusy(v.version);
                try { await api(`/settings/versions/${v.version}/restore`, { method: "POST" }); await onRestore(); await reload(); } finally { setBusy(null); }
              }}>
                {busy === v.version ? <Spinner /> : "Restore"}
              </Button>
            )}
          </div>
        ))}
      </Card>
    </Section>
  );
}

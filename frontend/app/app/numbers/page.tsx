"use client";

import { Grid2x2, Info, List, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Empty, Field, PageHeader, Segmented, Spinner, inputCls } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { phone } from "@/lib/format";
import type { PhoneNumber } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const BLANK = { e164: "", label: "Main line", country: "GB", provider: "vapi", provider_ref: "", forwarding_mode: "dedicated" };
const MODE_LABEL: Record<string, string> = { dedicated: "Dedicated AI number", forward_unanswered: "Forwarded when unanswered" };

export default function NumbersPage() {
  const { data, error, loading, reload } = useApi<PhoneNumber[]>("/numbers");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <PageHeader
        title="Numbers"
        sub={data ? `${data.length}` : undefined}
        actions={
          <>
            <Segmented value={view} onChange={setView} options={[{ value: "list", label: <><List className="size-4" /> List</> }, { value: "grid", label: <><Grid2x2 className="size-4" /> Grid</> }]} />
            <Button variant="dark" onClick={() => setAdding((a) => !a)}>{adding ? <X className="size-4" /> : <Plus className="size-4" />} {adding ? "Close" : "Add number"}</Button>
          </>
        }
      />

      {adding && <AddForm onDone={async () => { setAdding(false); await reload(); }} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {loading && !data && <Spinner />}
          {error && <Card className="p-4 text-danger">{error}</Card>}
          {data?.length === 0 && <Empty title="No numbers yet">Add the number callers will ring — a new dedicated number, or your existing one forwarded when you can't answer.</Empty>}
          <div className={view === "grid" ? "grid gap-4 sm:grid-cols-2" : "space-y-3"}>
            {data?.map((n) => (
              <Card key={n.id} className={`p-5 ${view === "list" ? "flex flex-wrap items-center gap-4" : ""}`}>
                <div className={`flex items-start gap-3 ${view === "list" ? "min-w-0 flex-1" : ""}`}>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-peri-soft text-[13px] font-bold text-accent">{n.country}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-muted">{n.label}</p>
                    <p className="truncate text-[20px] font-semibold tracking-tight">{phone(n.e164)}</p>
                  </div>
                  {view === "grid" && <DeleteBtn n={n} onDone={reload} />}
                </div>
                <p className={`text-[13px] text-muted ${view === "grid" ? "mt-3" : ""}`}>{MODE_LABEL[n.forwarding_mode] ?? n.forwarding_mode}</p>
                <div className={`flex items-center justify-between gap-3 ${view === "grid" ? "mt-4 border-t border-line pt-4" : ""}`}>
                  <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[13px] font-medium">
                    {n.provider === "vapi" ? "Vapi" : n.provider === "retell" ? "Retell" : "Self-hosted"}
                    {n.provider_ref ? <span className="text-muted">· linked</span> : <span className="text-warn">· not linked</span>}
                  </span>
                  <span className="flex items-center gap-2 text-[13px]">
                    <span aria-hidden className={`relative h-6 w-11 rounded-full ${n.active ? "bg-accent" : "bg-line"}`}>
                      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow ${n.active ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                    </span>
                    {n.active ? "Live" : "Off"}
                  </span>
                  {view === "list" && <DeleteBtn n={n} onDone={reload} />}
                </div>
              </Card>
            ))}
          </div>
        </div>
        <ForwardingHelp />
      </div>
    </div>
  );
}

function DeleteBtn({ n, onDone }: { n: PhoneNumber; onDone: () => Promise<void> }) {
  return (
    <button
      aria-label={`Remove ${n.e164}`}
      className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface hover:text-danger"
      onClick={async () => {
        if (!confirm(`Remove ${n.e164}? Calls to it will no longer reach this receptionist.`)) return;
        await api(`/numbers/${n.id}`, { method: "DELETE" });
        await onDone();
      }}
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function AddForm({ onDone }: { onDone: () => Promise<void> }) {
  const [f, setF] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const set = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ attach: { attached: boolean; reason?: string } }>("/numbers", { method: "POST", json: { ...f, e164: f.e164.replace(/[\s()-]/g, "") } });
      if (f.provider_ref && !r.attach.attached) setNote(`Saved, but not linked to the provider: ${r.attach.reason ?? "check the provider ID"}`);
      await onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6 p-5">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Phone number (E.164)"><input className={inputCls} value={f.e164} onChange={set("e164")} placeholder="+441615550100" required pattern="\+?[0-9\s()-]{8,}" /></Field>
        <Field label="Label"><input className={inputCls} value={f.label} onChange={set("label")} /></Field>
        <Field label="Country code"><input className={inputCls} value={f.country} onChange={set("country")} maxLength={2} /></Field>
        <Field label="Voice platform">
          <select className={inputCls} value={f.provider} onChange={set("provider")}>
            <option value="vapi">Vapi</option>
            <option value="retell">Retell (beta)</option>
            <option value="pipecat">Self-hosted pipeline (beta)</option>
          </select>
        </Field>
        <Field label="Provider phone-number ID" hint="From the Vapi dashboard; we point it at this receptionist."><input className={inputCls} value={f.provider_ref} onChange={set("provider_ref")} /></Field>
        <Field label="How calls arrive">
          <select className={inputCls} value={f.forwarding_mode} onChange={set("forwarding_mode")}>
            <option value="dedicated">Dedicated AI number</option>
            <option value="forward_unanswered">Existing number, forwarded when unanswered</option>
          </select>
        </Field>
        {err && <p role="alert" className="text-[14px] text-danger sm:col-span-2 lg:col-span-3">{err}</p>}
        {note && <p role="status" className="text-[14px] text-warn sm:col-span-2 lg:col-span-3">{note}</p>}
        <div className="sm:col-span-2 lg:col-span-3"><Button variant="primary" disabled={busy}>{busy ? <Spinner /> : "Save number"}</Button></div>
      </form>
    </Card>
  );
}

function ForwardingHelp() {
  return (
    <Card className="h-fit p-5">
      <p className="flex items-center gap-2 font-semibold"><Info className="size-4 text-accent" /> Keep your existing number</p>
      <p className="mt-2 text-[14px] text-muted">Callers keep dialling the number they know. Turn on conditional forwarding to the AI number so it only answers when you don't.</p>
      <div className="mt-4 space-y-3 text-[14px]">
        <div className="rounded-2xl bg-surface p-3">
          <div className="mb-1 flex items-center gap-2"><Badge tone="accent">UK mobile</Badge></div>
          <p>Forward when unanswered: <code className="font-semibold">**61*AI-number**20#</code> (20s ring)</p>
          <p className="mt-1">When busy: <code className="font-semibold">**67*AI-number#</code></p>
          <p className="mt-1 text-muted">Cancel with <code>##61#</code> / <code>##67#</code>.</p>
        </div>
        <div className="rounded-2xl bg-surface p-3">
          <div className="mb-1 flex items-center gap-2"><Badge tone="accent">US / Canada</Badge></div>
          <p>Most carriers (AT&T, T-Mobile): <code className="font-semibold">*004*AI-number#</code> for no-answer/busy.</p>
          <p className="mt-1">Verizon: <code className="font-semibold">*71</code> + AI number; cancel with <code>*73</code>. Older lines may use <code>*72</code> (all calls).</p>
        </div>
        <p className="text-[13px] text-muted">Landlines and business phone systems (RingCentral, 3CX, Teams) set this in their admin portal under call forwarding / no-answer rules.</p>
      </div>
    </Card>
  );
}

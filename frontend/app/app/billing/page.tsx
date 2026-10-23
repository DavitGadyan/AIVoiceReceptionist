"use client";

import { Award, Calculator, Download, MessageSquare, Phone, PhoneForwarded, Receipt, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useMe } from "@/components/app/Shell";
import { Button, Card, IconTile, PageHeader, Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { CallItem, Usage } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="p-6">
      <IconTile>{icon}</IconTile>
      <p className="mt-6 text-[13px] text-muted">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-[28px] font-semibold capitalize tracking-tight">{value}</p>
    </Card>
  );
}

function UsageCard({ icon, label, value, cost }: { icon: ReactNode; label: string; value: string; cost: string }) {
  return (
    <Card className="flex flex-col justify-between p-6">
      <IconTile>{icon}</IconTile>
      <div className="mt-8">
        <p className="text-[13px] text-muted">{label}</p>
        <div className="mt-1 flex items-end justify-between gap-2">
          <p className="font-[family-name:var(--font-display)] text-[26px] font-semibold">{value}</p>
          <p className="text-[14px] font-semibold">{cost}</p>
        </div>
      </div>
    </Card>
  );
}

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function BillingPage() {
  const me = useMe();
  const { data: u, loading, error } = useApi<Usage>("/billing/usage?days=30");
  const [exporting, setExporting] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [calcMin, setCalcMin] = useState(500);
  const [calcSms, setCalcSms] = useState(300);

  async function exportCsv() {
    setExporting(true);
    try {
      const r = await api<{ items: CallItem[] }>("/calls?limit=200");
      const head = ["id", "started_at", "from", "name", "intent", "outcome", "duration_seconds", "summary"];
      const rows = r.items.map((c) => [c.id, c.started_at, c.from, c.contact?.name ?? "", c.intent, c.outcome, c.duration_seconds, c.summary]);
      const csv = [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "receptra-calls.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const perMin = u?.rates.per_minute ?? 0.13;
  const perSms = u?.rates.per_sms ?? 0.0083;

  return (
    <div>
      <PageHeader
        title="Billing"
        actions={
          <>
            <Button variant="soft" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Spinner /> : <Download className="size-4" />} Download report
            </Button>
            <Button variant="soft" onClick={() => setShowCalc((s) => !s)} aria-expanded={showCalc}>
              <Calculator className="size-4" /> Cost calculation
            </Button>
          </>
        }
      />
      {error && <p role="alert" className="mb-4 text-[14px] text-danger">{error}</p>}

      {showCalc && (
        <Card className="mb-4 grid gap-4 p-6 sm:grid-cols-3 sm:items-end">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold">Voice minutes / month</span>
            <input type="number" min={0} value={calcMin} onChange={(e) => setCalcMin(Number(e.target.value))} className="w-full rounded-xl border border-line bg-ground px-3.5 py-2.5 text-[14px] outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold">Text messages / month</span>
            <input type="number" min={0} value={calcSms} onChange={(e) => setCalcSms(Number(e.target.value))} className="w-full rounded-xl border border-line bg-ground px-3.5 py-2.5 text-[14px] outline-none focus:border-accent" />
          </label>
          <div>
            <p className="text-[13px] text-muted">Estimated running cost</p>
            <p className="font-[family-name:var(--font-display)] text-[28px] font-semibold">{usd(calcMin * perMin + calcSms * perSms + 1.15)}</p>
          </div>
        </Card>
      )}

      {loading && !u ? (
        <div className="grid place-items-center py-24 text-muted"><Spinner /></div>
      ) : !u ? null : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Stat icon={<Receipt className="size-6" />} label="Estimated cost (30 days)" value={usd(u.estimated_cost_usd)} />
            <Stat icon={<Award className="size-6" />} label="Plan tier" value={me?.tenant.plan ?? "—"} />
            <Stat icon={<Wallet className="size-6" />} label="Provider-reported cost" value={usd(u.provider_reported_cost_usd)} />
          </div>

          <h2 className="mb-4 mt-8 text-[24px] font-semibold tracking-tight">Usage tracking</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col justify-between rounded-[var(--radius-card)] p-6 text-white" style={{ background: "var(--grad-peri)" }}>
              <span className="grid size-14 place-items-center rounded-2xl bg-white/20"><Wallet className="size-6" /></span>
              <div className="mt-8">
                <p className="text-[13px] text-white/80">This month so far</p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-[28px] font-semibold">{usd(u.estimated_cost_usd)}</p>
                <button className="mt-4 h-11 w-full rounded-full bg-white text-[14px] font-semibold text-ink transition-opacity hover:opacity-90 active:translate-y-px">Upgrade</button>
              </div>
            </div>
            <UsageCard icon={<Phone className="size-6" />} label="Voice minutes" value={u.minutes.toLocaleString()} cost={usd(u.minutes * perMin)} />
            <UsageCard icon={<MessageSquare className="size-6" />} label="Messages" value={u.messages.toLocaleString()} cost={usd(u.messages * perSms)} />
            <UsageCard icon={<PhoneForwarded className="size-6" />} label="Call transfers" value={u.transfers.toLocaleString()} cost={`${u.calls} calls`} />
          </div>

          <Card className="mt-4 p-6">
            <p className="text-[20px] font-semibold">Projected monthly cost</p>
            <p className="mt-1 text-[14px] text-muted">Per business, assuming 300 text messages and one phone number.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-[14px]">
                <thead className="text-muted">
                  <tr className="border-b border-line">
                    <th className="py-3 font-medium">Voice minutes / month</th>
                    <th className="py-3 font-medium">Approx. calls</th>
                    <th className="py-3 text-right font-medium">Running cost</th>
                  </tr>
                </thead>
                <tbody>
                  {u.projection.map((p) => (
                    <tr key={p.minutes} className="border-b border-line last:border-0">
                      <td className="py-4 font-semibold">{p.minutes.toLocaleString()}</td>
                      <td className="py-4">~{Math.round(p.minutes / 2.5).toLocaleString()}</td>
                      <td className="py-4 text-right font-semibold">{usd(p.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[13px] text-muted">
              Rates: {usd(perMin)}/min blended (voice platform, speech-to-text, LLM, text-to-speech, telephony) and {usd(perSms)}/SMS. Actual cost comes from the voice provider&apos;s per-call report and shows as provider-reported cost.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

"use client";

import { CalendarCheck, CheckCircle2, Moon, Phone, Radio, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar, BarChart, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useMe } from "@/components/app/Shell";
import { Avatar, Badge, Button, Card, Empty, IconTile, PageHeader, Segmented, Spinner } from "@/components/ui/primitives";
import { API_URL, api, getToken } from "@/lib/api";
import { ago, initials, OUTCOME_LABEL, outcomeTone, phone } from "@/lib/format";
import { tokens } from "@/lib/tokens";
import type { Analytics, CallItem, Task } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Range = "all" | "month" | "week" | "day";
const DAYS: Record<Range, number> = { all: 3650, month: 30, week: 7, day: 1 };
const C = tokens.color;

function MiniBars({ values }: { values: number[] }) {
  const data = values.slice(-4).map((v, i) => ({ i, v }));
  const max = Math.max(...data.map((d) => d.v), 1);
  return (
    <div className="h-14 w-24" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap={6}>
          <YAxis hide domain={[0, max]} />
          <Bar dataKey="v" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={d.i} fill={i === data.length - 1 ? C.accent : `${C.accent}22`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="h-14 w-24" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Kpi({ icon, label, value, chart, chip }: { icon: ReactNode; label: string; value: string; chart: ReactNode; chip?: ReactNode }) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <IconTile>{icon}</IconTile>
        {chart}
      </div>
      <p className="mt-6 text-[14px] text-muted">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-tight">{value}</p>
        {chip}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const me = useMe();
  const [range, setRange] = useState<Range>("month");
  const analytics = useApi<Analytics>(`/analytics/summary?days=${DAYS[range]}`);
  const tasks = useApi<Task[]>("/tasks");
  const calls = useApi<{ total: number; items: CallItem[] }>("/calls?limit=6");
  const [live, setLive] = useState<string[]>([]);
  const [active, setActive] = useState<number | null>(null);

  const { reload: reloadA } = analytics;
  const { reload: reloadT } = tasks;
  const { reload: reloadC } = calls;

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const es = new EventSource(`${API_URL}/calls/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse((ev as MessageEvent).data) as { event: string; data: { id?: string } };
        if (msg.event === "call.started" && msg.data.id) setLive((l) => [...new Set([...l, msg.data.id!])]);
        if (msg.event === "call.ended") {
          setLive((l) => l.filter((x) => x !== msg.data.id));
          void reloadA();
          void reloadC();
          void reloadT();
        }
        if (msg.event === "task.created") void reloadT();
      } catch {
        /* ignore malformed */
      }
    });
    return () => es.close();
  }, [reloadA, reloadC, reloadT]);

  const a = analytics.data;
  const series = useMemo(() => (a?.by_day ?? []).slice(-14).map((d) => ({ ...d, label: d.date.slice(5) })), [a]);
  const daily = series.map((d) => d.calls);
  const outcomes = useMemo(
    () => Object.entries(a?.by_outcome ?? {}).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => ({ name: OUTCOME_LABEL[k] ?? k, value: v })),
    [a],
  );
  const pieColors = [C.accent, tokens.color.accent2, C.peri, C.success, C.muted];

  async function done(id: string) {
    tasks.setData((ts) => (ts ?? []).filter((t) => t.id !== id));
    try {
      await api(`/tasks/${id}`, { method: "PATCH", json: { status: "done" } });
    } catch {
      void tasks.reload();
    }
  }

  function downloadReport() {
    if (!a) return;
    const rows = [["date", "calls"], ...a.by_day.map((d) => [d.date, String(d.calls)])];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `receptra-calls-${range}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        sub={
          live.length ? (
            <Badge tone="success" dot>
              <Radio className="size-3.5" /> {live.length} live call{live.length > 1 ? "s" : ""}
            </Badge>
          ) : me ? (
            me.tenant.name
          ) : undefined
        }
        actions={
          <>
            <Segmented<Range>
              value={range}
              onChange={setRange}
              options={[
                { value: "all", label: "All time" },
                { value: "month", label: "Monthly" },
                { value: "week", label: "Weekly" },
                { value: "day", label: "Daily" },
              ]}
            />
            <Button variant="soft" onClick={downloadReport} disabled={!a}>Download report</Button>
          </>
        }
      />

      {analytics.error && <p role="alert" className="mb-4 text-[14px] text-danger">{analytics.error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Phone className="size-6" />} label="Total calls" value={a ? a.total_calls.toLocaleString() : "—"} chart={<MiniBars values={daily} />} />
        <Kpi
          icon={<CalendarCheck className="size-6" />}
          label="Booked"
          value={a ? a.booked.toLocaleString() : "—"}
          chart={<MiniBars values={daily.map((v) => Math.round(v * 0.4))} />}
          chip={a ? <Badge tone="success">{Math.round(a.conversion_rate * 100)}% conv.</Badge> : null}
        />
        <Kpi
          icon={<Moon className="size-6" />}
          label="After-hours handled"
          value={a ? a.after_hours.toLocaleString() : "—"}
          chart={<Spark values={daily} color={C.accent2} />}
          chip={a && a.total_calls ? <Badge tone="warn">{Math.round((a.after_hours / a.total_calls) * 100)}%</Badge> : null}
        />
        <Kpi
          icon={<Sparkles className="size-6" />}
          label="Resolved by AI"
          value={a ? `${Math.round(a.autonomous_rate * 100)}%` : "—"}
          chart={<Spark values={daily.slice().reverse()} color={C.success} />}
          chip={a ? <Badge tone="accent">{a.open_tasks} open</Badge> : null}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="p-6 xl:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[14px] text-muted">Calls handled</p>
              <p className="font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-tight">{a ? a.total_calls.toLocaleString() : "—"}</p>
            </div>
            {a && <Badge tone="success">{a.minutes} min</Badge>}
          </div>
          <div className="mt-4 h-[300px]">
            {analytics.loading && !a ? (
              <div className="grid h-full place-items-center text-muted"><Spinner /></div>
            ) : series.length === 0 ? (
              <Empty title="No calls yet">Calls will chart here once your number is live.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} onMouseMove={(s) => setActive(typeof s.activeTooltipIndex === "number" ? s.activeTooltipIndex : null)} onMouseLeave={() => setActive(null)}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: C.muted, fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: C.muted, fontSize: 12 }} width={32} allowDecimals={false} />
                  <Tooltip cursor={false} contentStyle={{ borderRadius: 12, border: `1px solid ${C.line}` }} />
                  <Bar dataKey="calls" radius={[10, 10, 10, 10]} barSize={28}>
                    {series.map((d, i) => (
                      <Cell key={d.date} fill={i === (active ?? series.length - 1) ? C.accent : `${C.accent}22`} />
                    ))}
                  </Bar>
                  <Line type="monotone" dataKey="calls" stroke={C.accent} strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-[20px] font-semibold">Outcomes</p>
          <div className="mt-2 h-[200px]">
            {outcomes.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={outcomes} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3} stroke="none">
                    {outcomes.map((o, i) => <Cell key={o.name} fill={pieColors[i % pieColors.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${C.line}` }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-[14px] text-muted">No data</div>
            )}
          </div>
          <ul className="mt-2 space-y-2">
            {outcomes.map((o, i) => (
              <li key={o.name} className="flex items-center justify-between text-[14px]">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: pieColors[i % pieColors.length] }} />
                  {o.name}
                </span>
                <span className="font-semibold">{o.value}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[20px] font-semibold">Needs attention</p>
            <Badge tone={tasks.data?.length ? "warn" : "success"}>{tasks.data?.length ?? 0}</Badge>
          </div>
          {tasks.loading && !tasks.data ? (
            <div className="grid place-items-center py-10 text-muted"><Spinner /></div>
          ) : !tasks.data?.length ? (
            <Empty title="All clear">Nothing needs a human right now.</Empty>
          ) : (
            <ul className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {tasks.data.slice(0, 8).map((t) => (
                <li key={t.id} className="rounded-2xl border border-line p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Badge tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warn" : "neutral"}>{t.kind.replace(/_/g, " ").toLowerCase()}</Badge>
                      <p className="mt-2 truncate text-[15px] font-semibold">{t.title}</p>
                      {t.detail && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{t.detail}</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
                    <span>{ago(t.created_at)}</span>
                    <div className="flex gap-2">
                      {t.call_id && <Link href={`/app/calls?id=${t.call_id}`} className="font-semibold text-accent hover:underline">Open</Link>}
                      <button onClick={() => done(t.id)} className="inline-flex items-center gap-1 font-semibold text-ink hover:text-success">
                        <CheckCircle2 className="size-4" /> Mark done
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[20px] font-semibold">Recent calls</p>
            <Link href="/app/calls" className="text-[15px] font-semibold text-accent hover:underline">See all</Link>
          </div>
          {calls.loading && !calls.data ? (
            <div className="grid place-items-center py-10 text-muted"><Spinner /></div>
          ) : !calls.data?.items.length ? (
            <Empty title="No calls yet">Place a test call from the Test call page.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {calls.data.items.map((c) => {
                const name = c.contact?.name || "Unknown caller";
                return (
                  <li key={c.id}>
                    <Link href={`/app/calls?id=${c.id}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl py-3.5 transition-colors hover:bg-surface sm:grid-cols-[auto_1.3fr_1fr_1fr_auto] sm:px-2">
                      <Avatar text={initials(c.contact?.name || "", "?")} />
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold">{name}</p>
                        <p className="truncate text-[13px] text-muted">{phone(c.from)}</p>
                      </div>
                      <p className="hidden truncate text-[14px] font-medium sm:block">{(c.intent || "—").replace(/_/g, " ").toLowerCase()}</p>
                      <p className="hidden text-[14px] text-muted sm:block">{live.includes(c.id) ? "Live now" : ago(c.started_at)}</p>
                      <span className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-[13px] font-semibold">
                        <span className={`size-2 rounded-full ${{ success: "bg-success", warn: "bg-warn", danger: "bg-danger", accent: "bg-accent", neutral: "bg-muted" }[outcomeTone(c.outcome)]}`} />
                        {OUTCOME_LABEL[c.outcome] ?? (c.status === "live" ? "Live" : c.outcome || "—")}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

"use client";

import { Clock, Percent, PhoneMissed, ShieldOff, Timer } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Card, Empty, IconTile, PageHeader, Segmented } from "@/components/ui/primitives";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { duration, OUTCOME_LABEL } from "@/lib/format";
import { tokens } from "@/lib/tokens";
import type { Analytics } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const C = tokens.color;
type Range = "7" | "30" | "90";
const pct = (n: number) => `${Math.round(n)}%`;
const whole = (n: number) => String(Math.round(n));

function Tile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <IconTile className="size-12">{icon}</IconTile>
      <div className="min-w-0">
        <p className="truncate text-[13px] text-muted">{label}</p>
        <p className="font-[family-name:var(--font-display)] text-[24px] font-semibold tracking-tight">{value}</p>
      </div>
    </Card>
  );
}

function Ranked({ title, rows, labels }: { title: string; rows: Record<string, number>; labels?: Record<string, string> }) {
  const list = Object.entries(rows).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...list.map(([, v]) => v), 1);
  return (
    <Card className="p-6">
      <p className="mb-4 text-[20px] font-semibold">{title}</p>
      {list.length === 0 ? (
        <Empty title="No data yet" />
      ) : (
        <ul className="space-y-3">
          {list.map(([k, v]) => (
            <li key={k}>
              <div className="mb-1 flex justify-between text-[14px]">
                <span className="font-medium">{labels?.[k] ?? k.replace(/_/g, " ").toLowerCase()}</span>
                <span className="font-semibold">{v}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                {/* grows from the left via transform, so it never triggers layout */}
                <div
                  className="h-full w-full origin-left rounded-full bg-accent"
                  style={{ transform: `scaleX(${v / max})`, transition: "transform var(--dur-slow) var(--ease-out)" }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>("30");
  const { data: a, loading, error } = useApi<Analytics>(`/analytics/summary?days=${range}`);
  const hours = useMemo(() => (a?.by_hour ?? []).map((v, h) => ({ h: `${String(h).padStart(2, "0")}`, v })), [a]);
  const peak = hours.reduce((best, x) => (x.v > best.v ? x : best), { h: "", v: -1 });
  const reduced = !!useReducedMotion();

  return (
    <div>
      <PageHeader
        title="Analytics"
        sub="Why people call, and what happened"
        actions={
          <Segmented<Range>
            value={range}
            onChange={setRange}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        }
      />
      {error && <p role="alert" className="mb-4 text-[14px] text-danger">{error}</p>}
      {loading && !a ? (
        <div aria-busy="true">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="glass flex items-center gap-4 rounded-[var(--radius-card)] border border-line p-5">
                <Skeleton className="size-12 rounded-2xl" />
                <div className="flex-1"><Skeleton className="h-3 w-2/3" /><Skeleton className="mt-2 h-5 w-1/3" /></div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <SkeletonCard lines={6} className="min-h-[360px] xl:col-span-2" />
            <SkeletonCard lines={6} className="min-h-[360px]" />
          </div>
        </div>
      ) : !a ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Tile icon={<Percent className="size-5" />} label="Booking conversion" value={<AnimatedNumber value={a.conversion_rate * 100} format={pct} />} />
            <Tile icon={<Timer className="size-5" />} label="Avg call length" value={<AnimatedNumber value={a.avg_duration_seconds} format={duration} />} />
            <Tile icon={<Clock className="size-5" />} label="Minutes handled" value={<AnimatedNumber value={a.minutes} />} />
            <Tile icon={<ShieldOff className="size-5" />} label="Spam screened" value={<AnimatedNumber value={a.spam_blocked} format={whole} />} />
            <Tile icon={<PhoneMissed className="size-5" />} label="Missed → texted back" value={<AnimatedNumber value={a.missed_recovered} format={whole} />} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card className="p-6 xl:col-span-2">
              <p className="text-[14px] text-muted">Calls per day</p>
              <p className="font-[family-name:var(--font-display)] text-[30px] font-semibold"><AnimatedNumber value={a.total_calls} format={whole} /></p>
              <div className="mt-4 h-[280px]">
                {a.by_day.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={a.by_day.map((d) => ({ ...d, label: d.date.slice(5) }))}>
                      <defs>
                        <linearGradient id="callsFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.accent} stopOpacity={0.25} />
                          <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: C.muted, fontSize: 12 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: C.muted, fontSize: 12 }} width={32} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${C.line}` }} />
                      <Area type="monotone" dataKey="calls" stroke={C.accent} strokeWidth={2.5} fill="url(#callsFill)" animationDuration={600} animationEasing="ease-out" isAnimationActive={!reduced} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty title="No calls in this period" />
                )}
              </div>
            </Card>
            <Card className="p-6">
              <p className="text-[14px] text-muted">Busiest hour</p>
              <p className="font-[family-name:var(--font-display)] text-[30px] font-semibold">{peak.v > 0 ? `${peak.h}:00` : "—"}</p>
              <div className="mt-4 h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hours}>
                    <XAxis dataKey="h" tickLine={false} axisLine={false} interval={3} tick={{ fill: C.muted, fontSize: 11 }} />
                    <YAxis hide allowDecimals={false} />
                    <Tooltip cursor={false} contentStyle={{ borderRadius: 12, border: `1px solid ${C.line}` }} />
                    <Bar dataKey="v" name="calls" radius={[6, 6, 6, 6]} animationDuration={600} animationEasing="ease-out" isAnimationActive={!reduced}>
                      {hours.map((x) => (
                        <Cell key={x.h} fill={x.h === peak.h ? C.accent : `${C.accent}33`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Ranked title="Outcomes" rows={a.by_outcome} labels={OUTCOME_LABEL} />
            <Ranked title="Why people call" rows={a.by_intent} />
          </div>
        </>
      )}
    </div>
  );
}

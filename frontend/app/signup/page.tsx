"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Aurora } from "@/components/ui/Aurora";
import { Logo } from "@/components/ui/Logo";
import { Button, Spinner } from "@/components/ui/primitives";
import { api, setToken } from "@/lib/api";
import type { Preset } from "@/lib/types";

const darkInput =
  "w-full rounded-xl border border-white/12 bg-white/[0.07] px-4 py-3 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-accent focus:bg-white/10";

export default function SignupPage() {
  const router = useRouter();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [form, setForm] = useState({ business_name: "", industry: "home-services", email: "", password: "", name: "", phone_number: "", timezone: "Europe/London", currency: "GBP" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Preset[]>("/presets").then(setPresets).catch(() => setPresets([]));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string }>("/auth/signup", { method: "POST", json: { ...form, phone_number: form.phone_number || null } });
      setToken(r.token);
      router.push("/app/settings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main data-theme="dark" className="relative isolate min-h-dvh bg-night px-4 py-10 text-white">
      <Aurora />
      <div className="glass mx-auto w-full max-w-[760px] rounded-[var(--radius-frame)] border border-white/10 p-8 md:p-10">
        <Link href="/" className="mb-10 inline-block">
          <Logo dark />
        </Link>
        <h1 className="text-[34px] font-semibold tracking-tight">Set up a receptionist</h1>
        <p className="mt-2 text-[15px] text-white/60">Pick the closest industry — it pre-fills services, intake questions, emergency rules and tone. You can change everything after, or upload a PDF.</p>
        <form onSubmit={submit} className="mt-8 space-y-6">
          <fieldset>
            <legend className="mb-3 text-[13px] font-semibold text-white/70">Industry</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {presets.map((p) => (
                <label key={p.key} className={`cursor-pointer rounded-2xl border p-4 transition-colors ${form.industry === p.key ? "border-accent bg-accent/20" : "border-white/10 bg-white/[0.06] hover:border-white/25"}`}>
                  <input type="radio" name="industry" value={p.key} checked={form.industry === p.key} onChange={set("industry")} className="sr-only" />
                  <span className="block text-[15px] font-semibold">{p.label}</span>
                  <span className="mt-1 block text-[13px] text-white/55">{p.summary}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[13px] font-semibold text-white/70">Business name</span>
              <input className={darkInput} value={form.business_name} onChange={set("business_name")} required placeholder="Brightline Plumbing" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-white/70">Your name</span>
              <input className={darkInput} value={form.name} onChange={set("name")} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-white/70">Phone number for the AI (optional)</span>
              <input className={darkInput} value={form.phone_number} onChange={set("phone_number")} placeholder="+44 161 555 0100" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-white/70">Email</span>
              <input className={darkInput} type="email" value={form.email} onChange={set("email")} required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-white/70">Password</span>
              <input className={darkInput} type="password" minLength={8} value={form.password} onChange={set("password")} required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-white/70">Timezone</span>
              <select className={darkInput} value={form.timezone} onChange={set("timezone")}>
                {["Europe/London", "Europe/Dublin", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "Australia/Sydney", "Pacific/Auckland", "Asia/Dubai"].map((t) => (
                  <option key={t} value={t} className="text-ink">{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-white/70">Currency</span>
              <select className={darkInput} value={form.currency} onChange={set("currency")}>
                {["GBP", "USD", "EUR", "CAD", "AUD", "NZD", "AED"].map((c) => <option key={c} className="text-ink">{c}</option>)}
              </select>
            </label>
          </div>
          {error && <p role="alert" className="text-[14px] text-red-400">{error}</p>}
          <Button variant="primary" size="lg" disabled={busy}>{busy ? <Spinner /> : "Create receptionist"}</Button>
        </form>
      </div>
    </main>
  );
}

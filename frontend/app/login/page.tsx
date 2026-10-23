"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aurora } from "@/components/ui/Aurora";
import { Logo } from "@/components/ui/Logo";
import { Button, Spinner } from "@/components/ui/primitives";
import { api, setToken } from "@/lib/api";

const darkInput =
  "w-full rounded-xl border border-white/12 bg-white/[0.07] px-4 py-3 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-accent focus:bg-white/10";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@receptra.ai");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string }>("/auth/login", { method: "POST", json: { email, password } });
      setToken(r.token);
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main data-theme="dark" className="relative isolate grid min-h-dvh place-items-center bg-night px-4 py-10 text-white">
      <Aurora />
      <div className="glass w-full max-w-[460px] rounded-[var(--radius-frame)] border border-white/10 p-8 md:p-10">
        <Link href="/" className="mb-10 inline-block">
          <Logo dark />
        </Link>
        <h1 className="text-[34px] font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-[15px] text-white/60">Sign in to see every call your receptionist handled.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-white/70">Email</span>
            <input className={darkInput} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-white/70">Password</span>
            <input className={darkInput} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p role="alert" className="text-[14px] text-red-400">{error}</p>}
          <Button variant="primary" size="lg" className="w-full" disabled={busy}>
            {busy ? <Spinner /> : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-[13px] text-white/60">
          Demo: <b className="text-white">demo@receptra.ai</b> / <b className="text-white">demo1234</b> (plumbing). Other industries:
          <span className="text-white"> aligned-clinic@, glow-medspa@, cut-and-co@, harbor-law@, keystone-homes@, canvas-marquees@receptra.ai</span>.
        </p>
        <p className="mt-6 text-[14px] text-white/60">
          New business? <Link href="/signup" className="font-semibold text-white underline-offset-4 hover:underline">Set up a receptionist</Link>
        </p>
      </div>
    </main>
  );
}

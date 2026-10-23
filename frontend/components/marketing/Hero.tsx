"use client";

import { Globe, Mic, MessageCircle, Phone, Square } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { WaveRings } from "@/components/head3d/WaveRings";
import { useBrowserVoice } from "./useBrowserVoice";

const HeadScene = dynamic(() => import("@/components/head3d/HeadScene").then((m) => m.HeadScene), {
  ssr: false,
  loading: () => null,
});

/** Template screen 1: headline over a centred chrome head, dotted rings, icon tiles in the bottom corners. */
export function Hero() {
  const voice = useBrowserVoice("brightline");
  const live = voice.status === "live" || voice.status === "connecting";

  return (
    <section className="relative isolate flex h-screen min-h-[680px] flex-col overflow-hidden text-white">
      <WaveRings level={voice.level} />

      <header className="relative z-20 flex items-center justify-between px-5 py-5 md:px-10 md:py-7">
        <Logo dark />
        <nav className="flex items-center gap-2 text-[14px] font-semibold">
          <Link href="/login" className="glass hidden h-10 items-center rounded-full px-4 text-white/85 hover:text-white sm:inline-flex">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary inline-flex h-10 items-center rounded-full px-5 text-white transition-transform hover:-translate-y-px">
            Get started
          </Link>
        </nav>
      </header>

      <h1
        className="relative z-10 mx-auto mt-2 max-w-[14ch] px-4 text-center font-medium tracking-[-0.045em] md:mt-4"
        style={{ fontSize: "min(var(--size-display), 13svh)", lineHeight: "var(--leading-display)" }}
      >
        AI Receptionist that{" "}
        <em className="bg-[image:var(--grad-chrome)] bg-clip-text pr-[0.06em] font-medium text-transparent">never</em> misses
      </h1>

      {/* The head overlaps the second headline line, as in the reference. */}
      <div className="relative z-0 mx-auto -mt-[7svh] min-h-0 w-full max-w-[900px] flex-1 [mask-image:linear-gradient(to_bottom,black_62%,transparent_100%)]">
        <HeadScene level={voice.level} />
      </div>

      <p className="relative z-10 mx-auto max-w-[52ch] px-6 text-center text-[14px] text-white/60 md:text-[16px]">
        Answers every call in a warm, natural voice, books the job, triages emergencies and texts you the summary — set up for any
        business from a form or a PDF.
      </p>

      {/* Bottom corner tiles */}
      <div className="relative z-10 flex flex-col gap-4 px-5 pb-5 pt-4 sm:flex-row sm:items-end sm:justify-between md:px-10 md:pb-8">
        <div className="flex items-center gap-3" aria-label="Channels">
          <Tile label="Phone calls" active>
            <Phone className="size-5" />
          </Tile>
          <Tile label="SMS & WhatsApp">
            <MessageCircle className="size-5" />
          </Tile>
          <Tile label="Website chat">
            <Globe className="size-5" />
          </Tile>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          {voice.status === "unavailable" && (
            <p className="max-w-[260px] text-right text-[12px] text-white/50">
              Browser voice needs a Vapi public key. <Link href="/login" className="underline">Try the text simulator</Link> instead.
            </p>
          )}
          {voice.status === "error" && <p className="text-[12px] text-red-300">Couldn&apos;t start the call — check mic permission.</p>}
          {voice.line && live && <p className="max-w-[300px] truncate text-right text-[13px] text-white/70">“{voice.line}”</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={live ? voice.stop : voice.start}
              className={`inline-flex h-14 flex-1 items-center justify-center gap-2.5 rounded-2xl px-5 text-[14px] font-semibold transition-colors sm:flex-none ${live ? "bg-white text-night" : "glass text-white hover:bg-white/10"}`}
            >
              {live ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}
              {voice.status === "connecting" ? "Connecting…" : live ? "End demo call" : "Talk to it"}
            </button>
            <Link
              href="/login"
              aria-label="Open the dashboard demo"
              className="glass grid size-14 place-items-center rounded-2xl transition-colors hover:bg-white/10"
            >
              <span className="text-[13px] font-bold">Demo</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Tile({ children, label, active, diamond }: { children: React.ReactNode; label: string; active?: boolean; diamond?: boolean }) {
  return (
    <span
      title={label}
      aria-label={label}
      className={`grid size-14 place-items-center rounded-2xl ${diamond ? "rotate-45" : ""} ${active ? "btn-primary text-white" : "glass text-white/85"}`}
    >
      <span className={diamond ? "-rotate-45" : ""}>{children}</span>
    </span>
  );
}

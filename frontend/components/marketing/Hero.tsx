"use client";

import { Globe, Mic, MessageCircle, Phone, Square } from "lucide-react";
import { m } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { memo, useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { WaveRings } from "@/components/head3d/WaveRings";
import { DUR, EASE_OUT, fadeRise, group, popIn, stagger } from "@/lib/motion";
import { useBrowserVoice } from "./useBrowserVoice";

const HeadScene = dynamic(() => import("@/components/head3d/HeadScene").then((mod) => mod.HeadScene), {
  ssr: false,
  loading: () => null,
});

const word = {
  initial: { opacity: 0, transform: "translateY(0.5em)" },
  animate: { opacity: 1, transform: "translateY(0em)" },
};

/**
 * Template screen 1: headline over a centred head, dotted rings, icon tiles in the bottom corners.
 * Entrance order: nav → headline words → head (once its textures are in) → copy → tiles.
 */
export function Hero() {
  const voice = useBrowserVoice("brightline");
  const live = voice.status === "live" || voice.status === "connecting";
  const [headReady, setHeadReady] = useState(false);
  const onHeadReady = useCallback(() => setHeadReady(true), []);
  // Safety net: never leave the hero empty if the ready signal is lost (blocked WebGL).
  // Normal loads reveal earlier via onReady; the canvas is transparent until the portrait draws.
  useEffect(() => {
    const t = window.setTimeout(() => setHeadReady(true), 8000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <section className="relative isolate flex h-screen min-h-[680px] flex-col overflow-hidden text-white">
      <m.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: DUR.slow, delay: 0.2, ease: EASE_OUT }}>
        <WaveRings level={voice.level} />
      </m.div>

      <m.header
        className="relative z-20 flex items-center justify-between px-5 py-5 md:px-10 md:py-7"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DUR.base, ease: EASE_OUT }}
      >
        <Logo dark />
        <nav className="flex items-center gap-2 text-[14px] font-semibold">
          <Link href="/login" className="glass press hidden h-10 items-center rounded-full px-4 text-white/85 hover:text-white sm:inline-flex">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary press inline-flex h-10 items-center rounded-full px-5 text-white">
            Get started
          </Link>
        </nav>
      </m.header>

      <Headline />

      {/* The head overlaps the second headline line, as in the reference. It fades in once its textures resolve. */}
      <m.div
        className="relative z-0 mx-auto -mt-[7svh] min-h-0 w-full max-w-[900px] flex-1 [mask-image:linear-gradient(to_bottom,black_62%,transparent_100%)]"
        variants={{ hidden: { opacity: 0, transform: "scale(0.96)" }, shown: { opacity: 1, transform: "scale(1)" } }}
        initial="hidden"
        animate={headReady ? "shown" : "hidden"}
        transition={{ duration: DUR.slow, ease: EASE_OUT }}
      >
        <HeadScene level={voice.level} onReady={onHeadReady} />
      </m.div>

      <m.p
        className="relative z-10 mx-auto max-w-[52ch] px-6 text-center text-[14px] text-white/60 md:text-[16px]"
        variants={fadeRise}
        initial="initial"
        animate="animate"
        transition={{ duration: DUR.slow, delay: 0.25, ease: EASE_OUT }}
      >
        Answers every call in a warm, natural voice, books the job, triages emergencies and texts you the summary — set up for any
        business from a form or a PDF.
      </m.p>

      {/* Bottom corner tiles */}
      <div className="relative z-10 flex flex-col gap-4 px-5 pb-5 pt-4 sm:flex-row sm:items-end sm:justify-between md:px-10 md:pb-8">
        <Channels />

        <div className="flex flex-col gap-2 sm:items-end">
          {voice.status === "unavailable" && (
            <p className="max-w-[260px] text-right text-[12px] text-white/50">
              Browser voice needs a Vapi public key. <Link href="/login" className="underline">Try the text simulator</Link> instead.
            </p>
          )}
          {voice.status === "error" && <p className="text-[12px] text-red-300">Couldn&apos;t start the call — check mic permission.</p>}
          {voice.line && live && <p className="max-w-[300px] truncate text-right text-[13px] text-white/70">“{voice.line}”</p>}
          <m.div className="flex items-center gap-3" variants={group} initial="initial" animate="animate" transition={stagger(50, 300)}>
            <m.button
              variants={popIn}
              transition={{ duration: DUR.base, ease: EASE_OUT }}
              onClick={live ? voice.stop : voice.start}
              className={`press inline-flex h-14 flex-1 items-center justify-center gap-2.5 rounded-2xl px-5 text-[14px] font-semibold sm:flex-none ${live ? "bg-white text-night" : "glass text-white hover:bg-white/10"}`}
            >
              {live ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}
              {voice.status === "connecting" ? "Connecting…" : live ? "End demo call" : "Talk to it"}
            </m.button>
            <m.span variants={popIn} transition={{ duration: DUR.base, ease: EASE_OUT }} className="inline-flex">
              <Link href="/login" aria-label="Open the dashboard demo" className="glass press grid size-14 place-items-center rounded-2xl hover:bg-white/10">
                <span className="text-[13px] font-bold">Demo</span>
              </Link>
            </m.span>
          </m.div>
        </div>
      </div>
    </section>
  );
}

/** Headline words rise in one after another. Memoised so voice-level re-renders don't touch it. */
const Headline = memo(function Headline() {
  const words: React.ReactNode[] = [
    "AI",
    "Receptionist",
    "that",
    <em key="never" className="bg-[image:var(--grad-chrome)] bg-clip-text pr-[0.06em] font-medium text-transparent">
      never
    </em>,
    "misses",
  ];
  return (
    <m.h1
      className="relative z-10 mx-auto mt-2 max-w-[14ch] px-4 text-center font-medium tracking-[-0.045em] md:mt-4"
      style={{ fontSize: "min(var(--size-display), 13svh)", lineHeight: "var(--leading-display)" }}
      variants={group}
      initial="initial"
      animate="animate"
      transition={{ staggerChildren: 0.05, delayChildren: 0.1 }}
    >
      {words.map((w, i) => (
        <span key={i}>
          <m.span className="inline-block" variants={word} transition={{ duration: DUR.slow, ease: EASE_OUT }}>
            {w}
          </m.span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </m.h1>
  );
});

/** Left-hand channel tiles pop in with a short stagger. Memoised for the same reason as the headline. */
const Channels = memo(function Channels() {
  return (
    <m.div className="flex items-center gap-3" aria-label="Channels" variants={group} initial="initial" animate="animate" transition={stagger(50, 300)}>
      <Tile label="Phone calls" active>
        <Phone className="size-5" />
      </Tile>
      <Tile label="SMS & WhatsApp">
        <MessageCircle className="size-5" />
      </Tile>
      <Tile label="Website chat">
        <Globe className="size-5" />
      </Tile>
    </m.div>
  );
});

function Tile({ children, label, active }: { children: React.ReactNode; label: string; active?: boolean }) {
  return (
    <m.span
      title={label}
      aria-label={label}
      variants={popIn}
      transition={{ duration: DUR.base, ease: EASE_OUT }}
      className={`grid size-14 place-items-center rounded-2xl ${active ? "btn-primary text-white" : "glass text-white/85"}`}
    >
      {children}
    </m.span>
  );
}

"use client";

import { CheckCircle2, FileText, Search, Trash2, UploadCloud } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Badge, Button, Card, Empty, PageHeader, Segmented, Spinner, TypingDots, inputCls } from "@/components/ui/primitives";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { API_URL, api, getToken } from "@/lib/api";
import { ago } from "@/lib/format";
import { DUR, EASE_OUT, fadeRise, group, stagger } from "@/lib/motion";
import type { KnowledgeDoc } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Phase = "idle" | "uploading" | "reading";

/** Same request as `api()` would send, but XHR exposes upload progress. */
function uploadWithProgress(file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/knowledge/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${getToken() ?? ""}`);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(ev.loaded / ev.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = xhr.statusText || "Upload failed";
      try {
        const data = JSON.parse(xhr.responseText);
        if (typeof data.detail === "string") msg = data.detail;
      } catch {
        /* not json */
      }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(body);
  });
}

const KEY_LABEL: Record<string, string> = {
  business_name: "Business name", description: "Description", address: "Address", website: "Website", hours: "Opening hours",
  services: "Services & prices", faqs: "FAQs", policies: "Policies", service_area: "Service area",
  emergency_keywords: "Emergency keywords", never_say: "Never promise",
};

export default function KnowledgePage() {
  const docs = useApi<KnowledgeDoc[]>("/knowledge");
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = phase !== "idle";

  async function upload(file: File) {
    setPhase("uploading");
    setPct(0);
    setUploadErr(null);
    try {
      await uploadWithProgress(file, (p) => {
        setPct(p);
        if (p >= 1) setPhase("reading"); // bytes are up; the server is now extracting text
      });
      setPhase("reading");
      await docs.reload();
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPhase("idle");
      setPct(0);
    }
  }

  return (
    <div>
      <PageHeader title="Knowledge" sub="Policies, price lists and FAQs from your documents" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a PDF or text file"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void upload(f);
            }}
            className={`grid cursor-pointer place-items-center rounded-[var(--radius-card)] border-2 border-dashed px-6 py-12 text-center transition-colors ${drag ? "border-accent bg-peri-soft" : "border-line hover:border-accent/50 hover:bg-surface"}`}
          >
            <input ref={inputRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
            <span className="mb-4 grid size-16 place-items-center rounded-2xl text-white" style={{ background: "var(--grad-peri)" }}>
              <UploadCloud className="size-7" />
            </span>
            <p className="inline-flex items-center gap-2 text-[17px] font-semibold" aria-live="polite">
              {phase === "uploading" ? `Uploading ${Math.round(pct * 100)}%` : phase === "reading" ? <>Reading your document <TypingDots className="text-accent" /></> : "Drop a PDF here, or click to upload"}
            </p>
            {/* progress: fills while bytes go up, stays full while the server extracts text */}
            <div className={`mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface transition-opacity duration-[var(--dur-fast)] ${uploading ? "opacity-100" : "opacity-0"}`} aria-hidden={!uploading}>
              <div
                className="h-full w-full origin-left rounded-full bg-accent"
                style={{ transform: `scaleX(${phase === "reading" ? 1 : phase === "uploading" ? pct : 0})`, transition: "transform 180ms linear" }}
              />
            </div>
            <p className="mt-2 max-w-md text-[14px] text-muted">Price lists, policy documents, staff handbooks. We pull out services, prices, policies, hours and FAQs for you to approve — and the AI can search the full text on calls.</p>
            {uploadErr && <p role="alert" className="mt-3 text-[14px] font-medium text-danger">{uploadErr}</p>}
          </div>

          {docs.loading && !docs.data && <SkeletonCard lines={3} />}
          {docs.error && <Card className="p-4 text-danger">{docs.error}</Card>}
          {docs.data?.length === 0 && <Empty title="No documents yet">Upload your first PDF to fill in policies and prices automatically.</Empty>}
          <AnimatePresence initial={false}>
            {docs.data?.map((d) => (
              <m.div key={d.id} variants={fadeRise} initial="initial" animate="animate" exit="exit" transition={{ duration: DUR.base, ease: EASE_OUT }}>
                <DocCard doc={d} onChange={docs.reload} />
              </m.div>
            ))}
          </AnimatePresence>
        </div>

        <RetrievalTester />
      </div>
    </div>
  );
}

function DocCard({ doc, onChange }: { doc: KnowledgeDoc; onChange: () => Promise<void> }) {
  const keys = Object.keys(doc.proposed_changes ?? {});
  const [accept, setAccept] = useState<string[]>(keys);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function apply() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ version: number }>(`/knowledge/${doc.id}/apply`, { method: "POST", json: { accept, mode } });
      setDone(r.version);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${doc.filename}? Its text is removed from the AI's knowledge. Settings already applied stay.`)) return;
    await api(`/knowledge/${doc.id}`, { method: "DELETE" });
    await onChange();
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <span className="grid size-12 place-items-center rounded-2xl bg-peri-soft text-accent"><FileText className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{doc.filename}</p>
          <p className="text-[13px] text-muted">{doc.pages} page{doc.pages === 1 ? "" : "s"} · {doc.chars.toLocaleString()} characters · {ago(doc.created_at)}</p>
        </div>
        <Badge tone="success" dot>Searchable on calls</Badge>
        <Button size="sm" variant="danger" aria-label={`Delete ${doc.filename}`} onClick={remove}><Trash2 className="size-4" /></Button>
      </div>

      {keys.length > 0 && done === null && (
        <div className="border-t border-line bg-surface/60 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Review extracted settings</p>
              <p className="text-[13px] text-muted">Tick what's right. Nothing changes until you apply.</p>
            </div>
            <Segmented value={mode} onChange={setMode} options={[{ value: "merge", label: "Merge with existing" }, { value: "replace", label: "Replace" }]} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {keys.map((k) => {
              const on = accept.includes(k);
              return (
                <label key={k} className={`block cursor-pointer rounded-2xl border bg-ground p-4 transition-colors ${on ? "border-accent" : "border-line opacity-70"}`}>
                  <span className="mb-2 flex items-center gap-2">
                    <input type="checkbox" checked={on} onChange={() => setAccept((a) => (on ? a.filter((x) => x !== k) : [...a, k]))} className="size-4 accent-[var(--color-accent)]" />
                    <span className="font-semibold">{KEY_LABEL[k] ?? k}</span>
                  </span>
                  <ProposedValue k={k} value={(doc.proposed_changes as Record<string, unknown>)[k]} />
                </label>
              );
            })}
          </div>
          {err && <p role="alert" className="mt-3 text-[14px] text-danger">{err}</p>}
          <div className="mt-4 flex justify-end">
            <Button variant="primary" onClick={apply} disabled={busy || accept.length === 0}>{busy ? <Spinner /> : `Apply ${accept.length} selected`}</Button>
          </div>
        </div>
      )}
      <AnimatePresence initial={false}>
        {done !== null && (
          <m.div
            key="applied"
            variants={fadeRise}
            initial="initial"
            animate="animate"
            transition={{ duration: DUR.base, ease: EASE_OUT }}
            className="flex flex-wrap items-center gap-3 border-t border-line bg-success/10 p-5 text-success"
          >
            <CheckCircle2 className="size-5" />
            <span className="flex-1 text-[14px] font-medium">Applied — settings saved as version {done}. The next call uses them.</span>
            <Link href="/app/settings" className="text-[14px] font-semibold text-ink underline-offset-4 hover:underline">Review in Settings</Link>
          </m.div>
        )}
      </AnimatePresence>
      {keys.length === 0 && (
        <p className="border-t border-line px-5 py-4 text-[13px] text-muted">No structured settings found — the full text is still searchable by the AI during calls.</p>
      )}
    </Card>
  );
}

function ProposedValue({ k, value }: { k: string; value: unknown }) {
  if (!Array.isArray(value)) return <p className="text-[14px]">{String(value)}</p>;
  const rows = value as Record<string, unknown>[];
  const line = (r: Record<string, unknown>) => {
    if (k === "services") {
      const price = r.price_from != null ? ` · from ${r.price_from}${r.price_to != null ? `–${r.price_to}` : ""}` : "";
      return <><b>{String(r.name)}</b><span className="text-muted">{price}{r.price_note ? ` (${r.price_note})` : ""}</span></>;
    }
    if (k === "faqs") return <><b>{String(r.question)}</b><br /><span className="text-muted">{String(r.answer)}</span></>;
    if (k === "policies") return <><b>{String(r.title)}</b><br /><span className="text-muted">{String(r.body)}</span></>;
    if (k === "hours") return <>{String(r.day)}: {r.closed ? "closed" : `${r.open}–${r.close}`}</>;
    return <>{typeof r === "string" ? r : JSON.stringify(r)}</>;
  };
  return (
    <ul className="max-h-56 space-y-1.5 overflow-auto text-[13px] leading-snug">
      {rows.slice(0, 30).map((r, i) => <li key={i}>{line(r)}</li>)}
      {rows.length > 30 && <li className="text-muted">+ {rows.length - 30} more</li>}
    </ul>
  );
}

function RetrievalTester() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="h-fit p-5 xl:sticky xl:top-6">
      <p className="font-semibold">Test what the AI finds</p>
      <p className="mt-1 text-[13px] text-muted">Ask the way a caller would. These passages are what the receptionist reads when it calls search_knowledge.</p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!q.trim()) return;
          setBusy(true);
          try {
            setResults((await api<{ results: string[] }>(`/knowledge/search?q=${encodeURIComponent(q)}`)).results);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input aria-label="Search question" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Do you work weekends?" />
        <Button variant="dark" aria-label="Search" className="shrink-0">{busy ? <Spinner /> : <Search className="size-4" />}</Button>
      </form>
      <m.div key={results ? results.join("|").slice(0, 64) : "none"} variants={group} initial="initial" animate="animate" transition={stagger(40)} className="mt-4 space-y-2">
        {results?.length === 0 && <m.p variants={fadeRise} className="text-[14px] text-muted">Nothing relevant — the AI would offer to take a message.</m.p>}
        {results?.map((r, i) => <m.p key={i} variants={fadeRise} className="whitespace-pre-wrap rounded-2xl bg-surface p-3 text-[13px] leading-relaxed">{r}</m.p>)}
      </m.div>
    </Card>
  );
}

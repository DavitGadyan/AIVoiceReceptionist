"use client";

import { Ban, Filter, LayoutGrid, List, MessageSquare, MoreVertical, Phone, Plus, Search, ShieldCheck, Upload, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar, Badge, Button, Card, Empty, Field, PageHeader, Segmented, Spinner, Tag, inputCls,
} from "@/components/ui/primitives";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { initials, phone as fmtPhone } from "@/lib/format";
import { DUR, EASE_OUT, fadeRise, group, popIn, stagger } from "@/lib/motion";
import type { Contact } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type View = "list" | "grid";
const KINDS = ["lead", "customer", "staff", "vendor", "spam"];
const PAGE = 12;

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** True on the first render that has data, false on every render after — rows stagger in once. */
function useFirstLoad(ready: boolean) {
  const first = useRef(true);
  const animate = first.current && ready;
  useEffect(() => {
    if (ready) first.current = false;
  }, [ready]);
  return animate;
}

export default function ContactsPage() {
  return (
    <Suspense fallback={<div className="pt-24"><SkeletonRows n={6} /></div>}>
      <Contacts />
    </Suspense>
  );
}

function Contacts() {
  const urlQ = useSearchParams().get("q") ?? "";
  const [view, setView] = useState<View>("list");
  const [q, setQ] = useState(urlQ);
  const [query, setQuery] = useState(urlQ.trim());
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);

  // The top bar's global search lands here as ?q=; follow it when it changes.
  useEffect(() => {
    setQ(urlQ);
    setQuery(urlQ.trim());
  }, [urlQ]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [query, kind]);

  const path = useMemo(() => {
    const sp = new URLSearchParams({ limit: "500" });
    if (query) sp.set("q", query);
    if (kind) sp.set("kind", kind);
    return `/contacts?${sp}`;
  }, [query, kind]);

  const { data, error, loading, setData } = useApi<Contact[]>(path);
  const contacts = data ?? [];
  const pages = Math.max(1, Math.ceil(contacts.length / PAGE));
  const shown = contacts.slice(page * PAGE, page * PAGE + PAGE);
  const animateRows = useFirstLoad(!!data);
  const toast = useToast();

  async function toggleBlock(c: Contact) {
    const updated = await api<Contact>(`/contacts/${c.id}`, { method: "PATCH", json: { blocked: !c.blocked } });
    setData((prev) => prev?.map((x) => (x.id === c.id ? { ...x, ...updated } : x)) ?? prev);
  }

  return (
    <div>
      <PageHeader
        title="Contacts"
        sub={data ? String(contacts.length) : undefined}
        actions={
          <>
            <label className="relative">
              <span className="sr-only">Search contacts</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input className={`${inputCls} w-[240px] bg-surface pl-9`} placeholder="Search numbers or names" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <Button variant="soft" disabled title="Coming soon">
              <Upload className="size-4" /> Import CSV
            </Button>
            <Button variant="dark" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
              <Plus className="size-4" /> Create contact
            </Button>
          </>
        }
      />

      <AnimatePresence initial={false}>
        {creating && (
          <m.div key="create" variants={fadeRise} initial="initial" animate="animate" exit="exit" transition={{ duration: DUR.base, ease: EASE_OUT }}>
            <CreateForm
              onClose={() => setCreating(false)}
              onCreated={(c) => {
                setData((prev) => [c, ...(prev ?? [])]);
                setPage(0);
                setCreating(false);
                toast({ title: "Contact created", description: c.name || fmtPhone(c.phone), tone: "success" });
              }}
            />
          </m.div>
        )}
      </AnimatePresence>

      <Card className="p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-muted">Everyone who has called, booked or been flagged by your receptionist.</p>
          <div className="flex max-w-full items-center gap-2 overflow-x-auto whitespace-nowrap">
            <Segmented<View>
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: <><List className="size-4" /> List</> },
                { value: "grid", label: <><LayoutGrid className="size-4" /> Grid</> },
              ]}
            />
            <label className="relative shrink-0">
              <span className="sr-only">Filter by type</span>
              <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <select className={`${inputCls} h-12 w-[150px] rounded-full pl-9`} value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">All types</option>
                {KINDS.map((k) => <option key={k} value={k}>{cap(k)}</option>)}
              </select>
            </label>
          </div>
        </div>

        {loading && !data ? (
          <SkeletonRows n={6} />
        ) : error ? (
          <Empty title="Couldn't load contacts">{error}</Empty>
        ) : contacts.length === 0 ? (
          <Empty title="No contacts yet">{query || kind ? "Nothing matches that search." : "Contacts are created automatically from calls."}</Empty>
        ) : view === "list" ? (
          <m.ul key="list" variants={group} initial={animateRows ? "initial" : false} animate="animate" transition={stagger(30)} className="divide-y divide-line">
            {shown.map((c) => <ContactRow key={c.id} c={c} onBlock={() => toggleBlock(c)} />)}
          </m.ul>
        ) : (
          <m.ul key="grid" variants={group} initial={animateRows ? "initial" : false} animate="animate" transition={stagger(30)} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((c) => <ContactCard key={c.id} c={c} onBlock={() => toggleBlock(c)} />)}
          </m.ul>
        )}

        {contacts.length > PAGE && (
          <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
            <span>Show result: {PAGE}</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  aria-current={i === page ? "page" : undefined}
                  className={`grid size-8 place-items-center rounded-lg font-semibold ${i === page ? "bg-surface text-ink" : "hover:bg-surface"}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <span>{page * PAGE + 1}-{Math.min(contacts.length, (page + 1) * PAGE)} of {contacts.length}</span>
          </nav>
        )}
      </Card>
    </div>
  );
}

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Contact) => void }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", kind: "lead" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      onCreated(await api<Contact>("/contacts", { method: "POST", json: form }));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Couldn't create contact");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6 p-4 sm:p-6">
      <form onSubmit={submit}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold">New contact</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Full name">
            <input className={inputCls} value={form.name} onChange={set("name")} placeholder="Sarah Jones" autoFocus />
          </Field>
          <Field label="Phone number">
            <input className={inputCls} value={form.phone} onChange={set("phone")} placeholder="+44 7700 900 123" required inputMode="tel" />
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" value={form.email} onChange={set("email")} placeholder="sarah@example.com" />
          </Field>
          <Field label="Type">
            <select className={inputCls} value={form.kind} onChange={set("kind")}>
              {KINDS.map((k) => <option key={k} value={k}>{cap(k)}</option>)}
            </select>
          </Field>
        </div>
        {err && <p role="alert" className="mt-3 text-[13px] text-danger">{err}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="dark" disabled={busy || !form.phone.trim()}>{busy ? <Spinner /> : <Plus className="size-4" />} Save contact</Button>
          <Button type="button" variant="soft" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function Actions({ c, onBlock }: { c: Contact; onBlock: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const tile = "grid size-11 place-items-center rounded-2xl bg-surface hover:bg-line";
  return (
    <div className="relative flex shrink-0 gap-2">
      <a href={`tel:${c.phone}`} aria-label={`Call ${c.name || c.phone}`} className={tile}>
        <Phone className="size-[18px]" />
      </a>
      <a href={`sms:${c.phone}`} aria-label={`Text ${c.name || c.phone}`} className={tile}>
        <MessageSquare className="size-[18px]" />
      </a>
      <button aria-label="More" title="More" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={tile}>
        <MoreVertical className="size-[18px]" />
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            key="menu"
            role="menu"
            variants={popIn}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: DUR.fast, ease: EASE_OUT }}
            className="absolute right-0 top-12 z-10 w-48 origin-top-right rounded-2xl border border-line bg-ground p-1.5 shadow-lg"
          >
            <button
              role="menuitem"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onBlock();
                } finally {
                  setBusy(false);
                  setOpen(false);
                }
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[14px] hover:bg-surface"
            >
              {c.blocked ? <ShieldCheck className="size-4" /> : <Ban className="size-4" />} {c.blocked ? "Unblock" : "Block number"}
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Tags({ c }: { c: Contact }) {
  return (
    <span className="flex flex-wrap gap-2">
      <Tag>{cap(c.kind)}</Tag>
      {c.tags.filter((t) => t !== c.kind).map((t) => <Tag key={t}>{cap(t)}</Tag>)}
      {c.blocked && <Badge tone="danger">Blocked</Badge>}
    </span>
  );
}

/** Mobile: identity, then email + tags wrapping, then the action tiles. From md: the template's single-line columns. */
function ContactRow({ c, onBlock }: { c: Contact; onBlock: () => Promise<void> }) {
  return (
    <m.li variants={fadeRise} className="flex flex-col gap-3 py-4 md:grid md:grid-cols-[minmax(220px,1.2fr)_minmax(160px,1fr)_minmax(180px,1.2fr)_70px_auto] md:items-center md:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar text={initials(c.name, "#")} size={44} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{c.name || "Unknown caller"}</p>
          <p className="truncate text-[13px]">{fmtPhone(c.phone)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:contents">
        <p className={`min-w-0 truncate text-[14px] ${c.email ? "font-medium" : "text-muted"}`}>{c.email || "Empty"}</p>
        <Tags c={c} />
        <p className="text-[13px] text-muted">{c.calls ?? 0} call{c.calls === 1 ? "" : "s"}</p>
      </div>
      <Actions c={c} onBlock={onBlock} />
    </m.li>
  );
}

function ContactCard({ c, onBlock }: { c: Contact; onBlock: () => Promise<void> }) {
  return (
    <m.li variants={fadeRise}>
      <Card className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <Avatar text={initials(c.name, "#")} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{c.name || "Unknown caller"}</p>
            <p className="truncate text-[13px]">{fmtPhone(c.phone)}</p>
          </div>
        </div>
        <p className={`truncate text-[14px] ${c.email ? "" : "text-muted"}`}>{c.email || "Empty"}</p>
        <Tags c={c} />
        <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
          <span className="text-[13px] text-muted">{c.calls ?? 0} call{c.calls === 1 ? "" : "s"}</span>
          <Actions c={c} onBlock={onBlock} />
        </div>
      </Card>
    </m.li>
  );
}

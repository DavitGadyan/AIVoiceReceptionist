/**
 * Loading placeholders that keep the page's shape while data arrives. Opacity-only
 * pulse (`animate-pulse`), disabled under reduced motion via `motion-safe:`.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block rounded-lg bg-line/60 motion-safe:animate-pulse ${className}`} />;
}

/** Avatar + two lines per row, like the call/contact lists. */
export function SkeletonRows({ n = 5, avatar = true }: { n?: number; avatar?: boolean }) {
  return (
    <ul aria-hidden aria-busy="true" className="flex flex-col gap-1">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-xl px-3 py-3">
          {avatar && <Skeleton className="size-10 shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-[46%]" />
            <Skeleton className="mt-2 h-3 w-[68%]" />
          </div>
          <Skeleton className="h-3 w-10" />
        </li>
      ))}
    </ul>
  );
}

/** A glass card with a title line and a few body lines. */
export function SkeletonCard({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden aria-busy="true" className={`glass rounded-[var(--radius-card)] border border-line p-6 ${className}`}>
      <Skeleton className="h-4 w-[38%]" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`mt-3 h-3 ${i % 2 ? "w-[72%]" : "w-[88%]"}`} />
      ))}
    </div>
  );
}

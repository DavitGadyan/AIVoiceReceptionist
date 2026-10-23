/**
 * The liquid backdrop every glass pane sits on. Render once per page.
 * The SVG filter is what makes the blob edges ripple; `.aurora` (globals.css) does the rest.
 */
export function Aurora() {
  return (
    <>
      <svg className="absolute size-0" aria-hidden>
        <filter id="liquid-distort" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.006" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="90" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="aurora" aria-hidden />
    </>
  );
}

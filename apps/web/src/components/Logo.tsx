// Surani flame mark — a stylised teal flame built from three curved strokes, echoing the brand logo.
export function SuraniFlame({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {/* outer flame */}
      <path
        d="M40 4c2 12-6 18-12 24S17 43 22 54c-14-6-18-24-8-36C19 12 33 10 40 4Z"
        fill="#0f7d86"
      />
      {/* middle flame */}
      <path
        d="M45 16c4 10 1 19-6 25s-9 8-6 17c-9-6-11-19-4-28 4-5 12-8 16-14Z"
        fill="#0d9488"
      />
      {/* inner highlight */}
      <path
        d="M49 30c3 7 1 14-4 18s-5 6-3 12c-6-5-6-14-2-20 2-4 7-6 9-10Z"
        fill="#2dd4bf"
      />
    </svg>
  );
}

// Full lockup: flame + wordmark + tagline. Used on the login screen.
export function SuraniLockup({ dark = false }: { dark?: boolean }) {
  const ink = dark ? '#ffffff' : '#0f4c53';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <SuraniFlame size={54} />
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '0.18em', color: ink }}>SURANI</div>
      <div style={{ fontSize: 11, fontStyle: 'italic', letterSpacing: '0.02em', color: dark ? 'rgba(255,255,255,.7)' : '#5b7076' }}>
        A Legacy Driven by Value
      </div>
    </div>
  );
}

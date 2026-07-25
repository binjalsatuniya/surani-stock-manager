// Real Surani & Sons brand logo (from the company visiting card).
// mark = flame only (sidebar / compact); lockup = flame + wordmark + tagline (login).
import markUrl from '../assets/surani-mark.png';
import lockupUrl from '../assets/surani-logo.png';

// Flame mark — used in the sidebar header and any compact spot.
export function SuraniFlame({ size = 34 }: { size?: number }) {
  return <img src={markUrl} width={size} height={size} alt="Surani" style={{ objectFit: 'contain', display: 'block' }} />;
}

// Full lockup: flame + wordmark + tagline. Used on the login screen.
export function SuraniLockup({ dark = false }: { dark?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <img
        src={lockupUrl}
        alt="Surani & Sons — A Legacy Driven by Value"
        style={{ width: 200, maxWidth: '70vw', height: 'auto', display: 'block', filter: dark ? 'brightness(0) invert(1)' : 'none' }}
      />
    </div>
  );
}

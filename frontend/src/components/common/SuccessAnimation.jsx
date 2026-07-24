import { useEffect } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

const SUCCESS_LOTTIE_SRC = 'https://lottie.host/68f9bf28-15da-4eaf-822e-730262432a76/VPxLHc22aT.lottie';
const AUTO_DISMISS_MS = 2200;

// Brief, non-blocking celebration shown when a code submission is Accepted.
// Auto-dismisses on its own — the caller doesn't need a close button, just
// render it conditionally and let it call onDone when finished.
export default function SuccessAnimation({ onDone }) {
  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100002,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div style={{ width: 260, height: 260 }}>
        <DotLottieReact src={SUCCESS_LOTTIE_SRC} loop autoplay />
      </div>
    </div>
  );
}

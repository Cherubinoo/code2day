import { useEffect, useRef } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

const SUCCESS_LOTTIE_SRC = 'https://lottie.host/68f9bf28-15da-4eaf-822e-730262432a76/VPxLHc22aT.lottie';
// How many full loops of the animation to show before dismissing.
const MAX_LOOPS = 4;
// Hard ceiling — auto-dismiss even if the Lottie never loaded / never
// fires events (same defensive pattern as LoadingScreen).
const HARD_TIMEOUT_MS = 5000;

// Brief, non-blocking celebration shown when a code submission is Accepted.
// Plays exactly MAX_LOOPS passes of the Lottie, then calls onDone.
// Auto-dismisses via a hard timeout as a safety net.
export default function SuccessAnimation({ onDone }) {
  const loopCountRef = useRef(0);
  const doneRef = useRef(false);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  }

  // Hard fallback — guarantees the overlay goes away.
  useEffect(() => {
    const timer = setTimeout(finish, HARD_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRefCallback(dotLottie) {
    if (!dotLottie) return;

    // Each time a single pass completes, bump the counter.
    // After MAX_LOOPS passes, stop the animation and dismiss.
    dotLottie.addEventListener('complete', () => {
      loopCountRef.current += 1;
      if (loopCountRef.current >= MAX_LOOPS) {
        dotLottie.stop();
        finish();
      }
    });

    // If the file fails to load, dismiss immediately.
    dotLottie.addEventListener('loadError', () => {
      finish();
    });
  }

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
        <DotLottieReact
          src={SUCCESS_LOTTIE_SRC}
          loop
          autoplay
          dotLottieRefCallback={handleRefCallback}
        />
      </div>
    </div>
  );
}


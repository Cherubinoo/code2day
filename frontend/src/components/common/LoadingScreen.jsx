import { useEffect, useRef, useState } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import './LoadingScreen.css';

const LOTTIE_SRC = 'https://lottie.host/f84f23fb-81a4-495e-ac37-a353fcda552a/E7uvy0Qebl.lottie';
const HOLD_MS = 550;
const EXIT_MS = 350;
// Maximum time to wait for the Lottie animation to load and complete its
// pass before force-dismissing the loading screen.  Prevents a permanent
// stuck state when the Lottie CDN is unreachable / blocked in production.
const MAX_WAIT_MS = 4000;

// Shown once, on the app's very first load — not replayed on ordinary page
// navigation afterward (see App.jsx, which only mounts this until the first
// real view is ready). Loops the animation continuously while `ready` is
// false; once `ready` flips true, lets whichever pass is already in flight
// finish naturally instead of cutting it off mid-loop, then crossfades from
// the animation's final frame (the point converging at center) into the
// CODE-2DAY wordmark, holds briefly, and fades the whole screen out.
export default function LoadingScreen({ ready, onFinished }) {
  const dotLottieRef = useRef(null);
  const readyRef = useRef(ready);
  const finishedRef = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const [exiting, setExiting] = useState(false);

  /** Shared exit sequence — safe to call multiple times, only the first
   *  invocation takes effect (guarded by `finishedRef`). */
  function triggerExit() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setRevealed(true);
    setTimeout(() => {
      setExiting(true);
      setTimeout(() => onFinished?.(), EXIT_MS);
    }, HOLD_MS);
  }

  // Fallback: if the normal Lottie flow hasn't dismissed us within
  // MAX_WAIT_MS, force-exit so the user isn't stuck forever.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!finishedRef.current) {
        console.warn('[LoadingScreen] Lottie animation timed out – force-dismissing.');
        triggerExit();
      }
    }, MAX_WAIT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    readyRef.current = ready;
    if (ready) dotLottieRef.current?.setLoop(false);
  }, [ready]);

  function handleRefCallback(dotLottie) {
    dotLottieRef.current = dotLottie;
    if (!dotLottie) return;
    // `ready` may already be true by the time the player instance exists.
    if (readyRef.current) dotLottie.setLoop(false);

    // Fires once looping has been turned off and the current pass finishes —
    // never while still looping — so this is exactly "the pass in flight
    // when loading completed reached its natural end."
    dotLottie.addEventListener('complete', () => {
      triggerExit();
    });

    // If the Lottie file fails to load at all (CDN down, CORS, network
    // error, etc.), fall back immediately so we don't block the UI.
    dotLottie.addEventListener('loadError', () => {
      console.warn('[LoadingScreen] Lottie failed to load – force-dismissing.');
      triggerExit();
    });
  }

  return (
    <div className={`loading-screen${exiting ? ' is-exiting' : ''}`}>
      <div className={`loading-screen-lottie${revealed ? ' is-hidden' : ''}`}>
        <DotLottieReact src={LOTTIE_SRC} loop autoplay dotLottieRefCallback={handleRefCallback} />
      </div>
      <div className={`loading-screen-wordmark${revealed ? ' is-visible' : ''}`}>CODE-2DAY</div>
    </div>
  );
}

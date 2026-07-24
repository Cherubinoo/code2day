import { useEffect, useRef } from 'react';
import './ClickBurstEffect.css';

// One global click-feedback burst for every button in the app, mounted once
// at the root (see App.jsx) instead of wired into each button individually —
// a single delegated document listener scales to every page/view for free,
// unlike attaching a handler per button.
//
// Kept deliberately cheap so it can't introduce jank anywhere it fires:
// - transform/opacity-only CSS animation (GPU-compositable, no layout or
//   filter recalculation — no blur/contrast "goo" merge like the reference
//   nav component uses, which is expensive precisely because it forces the
//   browser to recomposite a filter across a region on every frame).
// - one delegated listener, not one per button.
// - real DOM nodes (not React state) so a burst never triggers a re-render.
// - a hard cap on concurrent bursts so rapid/spammy clicking (double-clicks,
//   checking many checkboxes quickly) can't pile up DOM nodes.
// - skipped entirely under prefers-reduced-motion.

const PARTICLE_COUNT = 8;
const MAX_CONCURRENT_BURSTS = 6;
const ANIMATION_MS = 500;
const COLORS = ['#c49743', '#61734c', '#9daa8b', '#39482a'];
const CLICKABLE_SELECTOR = 'button, [role="button"], .primary-button, .secondary-button, .ghost-button, .nav-link, .switch-pill';

export default function ClickBurstEffect() {
  const activeBurstsRef = useRef(0);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }

    function spawnBurst(x, y) {
      activeBurstsRef.current += 1;

      const container = document.createElement('div');
      container.className = 'click-burst';
      container.style.left = `${x}px`;
      container.style.top = `${y}px`;

      const frag = document.createDocumentFragment();
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const angle = ((360 / PARTICLE_COUNT) * i + (Math.random() * 20 - 10)) * (Math.PI / 180);
        const distance = 26 + Math.random() * 18;
        const particle = document.createElement('span');
        particle.className = 'click-burst-particle';
        particle.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
        particle.style.background = COLORS[i % COLORS.length];
        frag.appendChild(particle);
      }
      container.appendChild(frag);
      document.body.appendChild(container);

      setTimeout(() => {
        container.remove();
        activeBurstsRef.current -= 1;
      }, ANIMATION_MS + 80);
    }

    function onClick(e) {
      if (activeBurstsRef.current >= MAX_CONCURRENT_BURSTS) return;
      const target = e.target.closest(CLICKABLE_SELECTOR);
      if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
      spawnBurst(e.clientX, e.clientY);
    }

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}

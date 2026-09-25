/**
 * animations.js — Animaciones controladas por JS
 * - Parallax sutil de las fotos al mover el ratón (solo desktop)
 */

/**
 * Las fotos se mueven ligeramente al mover el ratón,
 * como si las empujaras suavemente sobre la mesa.
 */
export function initMouseParallax() {
  const isDesktop = window.matchMedia('(min-width: 769px)').matches;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!isDesktop || prefersReduced) return;

  const fotos = document.querySelectorAll('.foto');
  if (!fotos.length) return;

  let ticking = false;

  document.addEventListener(
    'mousemove',
    (e) => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const centerX = window.innerWidth / 2;
          const centerY = window.innerHeight / 2;
          const dx = (e.clientX - centerX) / centerX; // -1 to 1
          const dy = (e.clientY - centerY) / centerY;

          fotos.forEach((foto, i) => {
            const depth = (i % 3 + 1) * 0.6; // different depth per photo
            const moveX = dx * depth * 6;
            const moveY = dy * depth * 4;
            foto.style.translate = `${moveX}px ${moveY}px`;
          });

          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true }
  );
}

/**
 * Toque sutil en móvil: las fotos reaccionan al gyroscope
 * (solo si DeviceOrientationEvent está disponible).
 */
export function initGyroParallax() {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!isMobile || prefersReduced) return;
  if (!('DeviceOrientationEvent' in window)) return;

  const fotos = document.querySelectorAll('.foto');
  if (!fotos.length) return;

  let ticking = false;

  window.addEventListener(
    'deviceorientation',
    (e) => {
      if (!ticking && e.gamma !== null && e.beta !== null) {
        window.requestAnimationFrame(() => {
          const dx = (e.gamma || 0) / 45; // -1 to 1 approx
          const dy = ((e.beta || 0) - 45) / 45;

          fotos.forEach((foto, i) => {
            const depth = (i % 3 + 1) * 0.4;
            const moveX = dx * depth * 4;
            const moveY = dy * depth * 3;
            foto.style.translate = `${moveX}px ${moveY}px`;
          });

          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true }
  );
}

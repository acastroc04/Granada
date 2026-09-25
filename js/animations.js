/**
 * animations.js — Animaciones controladas por JS
 * - IntersectionObserver para scroll reveals
 * - Parallax ligero en desktop
 */

/**
 * Activa las animaciones de los recortes solo cuando son visibles.
 * Pausa la animación CSS hasta que el elemento entre en viewport.
 */
export function initScrollAnimations() {
  if (!('IntersectionObserver' in window)) return;

  const recortes = document.querySelectorAll('.recorte');
  if (!recortes.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.animationPlayState = 'running';
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15,
      rootMargin: '0px 0px -40px 0px',
    }
  );

  recortes.forEach((el) => {
    el.style.animationPlayState = 'paused';
    observer.observe(el);
  });
}

/**
 * Reveal genérico: añade la clase .is-visible a elementos .reveal
 * cuando entran en el viewport (para futuras secciones).
 */
export function initRevealOnScroll() {
  if (!('IntersectionObserver' in window)) return;

  const revealEls = document.querySelectorAll('.reveal');
  if (!revealEls.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -60px 0px',
    }
  );

  revealEls.forEach((el) => observer.observe(el));
}

/**
 * Parallax sutil en desktop para los recortes.
 * Se desactiva en móvil y con prefers-reduced-motion.
 */
export function initParallax() {
  const isDesktop = window.matchMedia('(min-width: 768px)').matches;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!isDesktop || prefersReduced) return;

  const recortes = document.querySelectorAll('.recorte');
  if (!recortes.length) return;

  let ticking = false;

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          recortes.forEach((el, i) => {
            const speed = i % 2 === 0 ? 0.02 : -0.015;
            el.style.setProperty('--parallax-y', `${scrollY * speed}px`);
          });
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true }
  );
}

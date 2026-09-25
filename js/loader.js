/**
 * loader.js — Pantalla de carga vintage
 * Oculta el loader tras cargar todos los recursos.
 */

export function initLoader() {
  const loader = document.getElementById('loader');
  if (!loader) return;

  let isHidden = false;

  const hide = () => {
    if (isHidden) return;
    isHidden = true;
    loader.classList.add('is-hidden');

    // transitionend may not fire when animations are disabled or interrupted.
    const removeLoader = () => {
      loader.style.display = 'none';
    };

    loader.addEventListener('transitionend', () => {
      removeLoader();
    }, { once: true });

    setTimeout(removeLoader, 1000);
  };

  // Never leave the interface blocked if an external asset stalls.
  setTimeout(hide, 5000);

  // Si la página ya cargó (back/forward cache), ocultar de inmediato
  if (document.readyState === 'complete') {
    setTimeout(hide, 400);
  } else {
    window.addEventListener('load', () => setTimeout(hide, 800));
  }
}

/**
 * loader.js — Pantalla de carga vintage
 * Oculta el loader tras cargar todos los recursos.
 */

export function initLoader() {
  const loader = document.getElementById('loader');
  if (!loader) return;

  const hide = () => {
    loader.classList.add('is-hidden');
    loader.addEventListener('transitionend', () => {
      loader.style.display = 'none';
    }, { once: true });
  };

  // Si la página ya cargó (back/forward cache), ocultar de inmediato
  if (document.readyState === 'complete') {
    setTimeout(hide, 400);
  } else {
    window.addEventListener('load', () => setTimeout(hide, 800));
  }
}

/**
 * main.js — Entry point
 * Inicializa todos los módulos de la aplicación.
 */

import { initLoader } from './loader.js';
import { initScrollAnimations, initRevealOnScroll, initParallax } from './animations.js';

// Inicializar todo al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  initLoader();
  initScrollAnimations();
  initRevealOnScroll();
  initParallax();
});

/**
 * main.js — Entry point
 * Inicializa todos los módulos de la aplicación.
 */

import { initLoader } from './loader.js';
import { initMouseParallax, initGyroParallax } from './animations.js';

document.addEventListener('DOMContentLoaded', () => {
  initLoader();
  initMouseParallax();
  initGyroParallax();
});

/**
 * main.js — Entry point
 * Inicializa todos los módulos de la aplicación.
 */

import { initLoader } from './loader.js';
import { initMouseParallax, initGyroParallax } from './animations.js';
import { initExperience } from './experience.js';

document.addEventListener('DOMContentLoaded', () => {
  initLoader();
  initMouseParallax();
  initGyroParallax();
  initExperience();
});

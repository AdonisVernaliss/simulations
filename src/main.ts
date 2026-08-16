import './styles.css';

import { OrbitalLab } from './simulations/orbital-lab/orbital-lab';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Application root is missing');
}

try {
  new OrbitalLab(app).start();
} catch (error) {
  const message = error instanceof Error ? error.message : 'The simulation could not start.';
  app.innerHTML = `
    <section class="fallback" role="alert">
      <p class="eyebrow">Orbital Mechanics Lab</p>
      <h1>Rendering is unavailable</h1>
      <p>${message}</p>
    </section>
  `;
}


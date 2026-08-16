import './styles.css';

import { LaboratoryCatalog, ResearchWorkspace } from './catalog';
import { getLab } from './labs';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Application root is missing');
}

const start = async (): Promise<void> => {
  const requestedLab = new URLSearchParams(window.location.search).get('lab');

  if (requestedLab === 'catalog') {
    document.body.dataset.lab = 'catalog';
    new LaboratoryCatalog(app).start();
    return;
  }

  const lab = getLab(requestedLab ?? 'orbital');
  if (lab === undefined) {
    document.body.dataset.lab = 'catalog';
    new LaboratoryCatalog(app).start();
    return;
  }

  document.body.dataset.lab = lab.id;

  if (lab.id === 'orbital') {
    const { OrbitalLab } = await import('./simulations/orbital-lab/orbital-lab');
    document.title = 'Cosmic Sandbox';
    new OrbitalLab(app).start();
    return;
  }

  if (lab.id === 'atomic') {
    const { AtomicLab } = await import('./simulations/atomic-lab/atomic-lab');
    document.title = 'Atomic Orbitals Lab';
    new AtomicLab(app).start();
    return;
  }

  if (lab.id === 'particle') {
    const { ParticleLab } = await import('./simulations/particle-lab/particle-lab');
    document.title = 'Particle Track Lab';
    new ParticleLab(app).start();
    return;
  }

  if (lab.id === 'black-hole') {
    const { BlackHoleLab } = await import('./simulations/black-hole-lab/black-hole-lab');
    document.title = 'Black Hole Optics Lab';
    new BlackHoleLab(app).start();
    return;
  }

  if (lab.id === 'quasar') {
    const { QuasarLab } = await import('./simulations/quasar-lab/quasar-lab');
    document.title = 'Quasar Engine Lab';
    new QuasarLab(app).start();
    return;
  }

  new ResearchWorkspace(app, lab).start();
};

try {
  await start();
} catch (error) {
  const message = error instanceof Error ? error.message : 'The simulation could not start.';
  app.innerHTML = `
    <section class="fallback" role="alert">
      <p class="eyebrow">Simulation Laboratory</p>
      <h1>Rendering is unavailable</h1>
      <p>${message}</p>
    </section>
  `;
}

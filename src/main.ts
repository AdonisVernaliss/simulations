import './styles.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Application root is missing');
}

app.innerHTML = `
  <section class="boot-screen" aria-live="polite">
    <p class="eyebrow">Orbital Mechanics Lab</p>
    <h1>Preparing the simulation</h1>
  </section>
`;


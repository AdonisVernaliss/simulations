import './catalog.css';

import { getLabUrl, labs, type LabDefinition } from './labs';

const createLabCard = (lab: LabDefinition): HTMLElement => {
  const article = document.createElement('article');
  article.className = 'catalog-card';
  article.dataset.status = lab.status;

  const statusLabel = lab.status === 'available' ? 'Open laboratory' : 'Model in research';
  article.innerHTML = `
    <div class="catalog-card-orbit" aria-hidden="true"><span></span></div>
    <p class="catalog-field">${lab.field}</p>
    <h2>${lab.name}</h2>
    <p>${lab.summary}</p>
    <p class="catalog-model">
      ${lab.model}
      <span>${lab.experimentCount > 0 ? `${lab.experimentCount} guided experiments` : 'Direct controls'}</span>
    </p>
    <a href="${getLabUrl(lab.id)}" ${lab.status === 'research' ? 'aria-describedby="research-note"' : ''}>
      ${statusLabel}<span aria-hidden="true">↗</span>
    </a>
  `;

  return article;
};

export class LaboratoryCatalog {
  constructor(private readonly root: HTMLElement) {}

  start(): void {
    document.title = 'Scientific Simulation Laboratories';
    this.root.innerHTML = `
      <main class="catalog-shell">
        <header class="catalog-header">
          <a class="catalog-brand" href="?lab=catalog" aria-label="Simulation laboratories">
            <span class="catalog-brand-mark" aria-hidden="true"><span></span></span>
            <span>Simulation Laboratories</span>
          </a>
          <a class="catalog-open" href="${getLabUrl('orbital')}">Open current lab</a>
        </header>

        <section class="catalog-hero">
          <p class="catalog-kicker">Interactive scientific models</p>
          <h1>Explore the laws.<br />Inspect the assumptions.</h1>
          <p>
            Independent browser laboratories for classical, quantum, particle, and relativistic
            physics. Every released model documents its equations, units, sources, numerical
            method, and limits.
          </p>
        </section>

        <section class="catalog-grid" data-lab-grid aria-label="Simulation laboratories"></section>
        <p class="catalog-note" id="research-note">
          Research entries expose their intended scope but are not presented as working physical
          simulations until their equations and validation checks are implemented.
        </p>
      </main>
    `;

    this.root.querySelector('[data-lab-grid]')?.append(...labs.map(createLabCard));
  }
}

export class ResearchWorkspace {
  constructor(
    private readonly root: HTMLElement,
    private readonly lab: LabDefinition,
  ) {}

  start(): void {
    document.title = `${this.lab.name} · Research workspace`;
    this.root.innerHTML = `
      <main class="research-shell">
        <header class="catalog-header">
          <a class="catalog-brand" href="?lab=catalog">
            <span class="catalog-brand-mark" aria-hidden="true"><span></span></span>
            <span>Simulation Laboratories</span>
          </a>
          <a class="catalog-open" href="?lab=catalog">All laboratories</a>
        </header>
        <section class="research-card">
          <p class="catalog-kicker">${this.lab.field}</p>
          <h1>${this.lab.name}</h1>
          <p>${this.lab.summary}</p>
          <dl>
            <div><dt>Scientific baseline</dt><dd>${this.lab.model}</dd></div>
            <div><dt>Status</dt><dd>Equations and validation cases are being specified</dd></div>
          </dl>
          <p class="research-warning">
            This workspace intentionally contains no decorative substitute for the physical model.
            It will be marked available only after numerical validation and source review.
          </p>
        </section>
      </main>
    `;
  }
}

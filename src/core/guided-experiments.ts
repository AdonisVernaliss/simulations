import './guided-experiments.css';

export interface GuidedExperiment<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly title: string;
  readonly question: string;
  readonly observation: string;
}

export class GuidedExperiments<Id extends string> {
  private readonly element: HTMLElement;
  private readonly trigger: HTMLButtonElement;
  private readonly currentTitle: HTMLElement;
  private readonly lessonTitle: HTMLElement;
  private readonly question: HTMLElement;
  private readonly observation: HTMLElement;
  private readonly buttons: readonly HTMLButtonElement[];

  constructor(
    mount: HTMLElement,
    private readonly definitions: readonly GuidedExperiment<Id>[],
    private readonly onSelect: (id: Id) => void,
  ) {
    if (definitions.length === 0) {
      throw new Error('At least one guided experiment is required.');
    }
    mount.insertAdjacentHTML('beforeend', this.createMarkup());
    const element = mount.querySelector<HTMLElement>('[data-guided-experiments]');
    const trigger = mount.querySelector<HTMLButtonElement>('[data-experiment-trigger]');
    const currentTitle = mount.querySelector<HTMLElement>('[data-current-experiment]');
    const lessonTitle = mount.querySelector<HTMLElement>('[data-experiment-lesson-title]');
    const question = mount.querySelector<HTMLElement>('[data-experiment-question]');
    const observation = mount.querySelector<HTMLElement>('[data-experiment-watch]');
    if (
      element === null ||
      trigger === null ||
      currentTitle === null ||
      lessonTitle === null ||
      question === null ||
      observation === null
    ) {
      throw new Error('Guided experiment interface could not be created.');
    }
    this.element = element;
    this.trigger = trigger;
    this.currentTitle = currentTitle;
    this.lessonTitle = lessonTitle;
    this.question = question;
    this.observation = observation;
    this.buttons = [...element.querySelectorAll<HTMLButtonElement>('[data-guided-experiment]')];
    this.bindControls();
    this.activate(definitions[0]!.id, false);
  }

  activate(id: Id, invoke = true): void {
    const definition = this.definitions.find((candidate) => candidate.id === id);
    if (definition === undefined) {
      throw new Error(`Unknown guided experiment: ${id}`);
    }
    this.currentTitle.textContent = definition.label;
    this.lessonTitle.textContent = definition.title;
    this.question.textContent = definition.question;
    this.observation.textContent = definition.observation;
    this.buttons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.guidedExperiment === id));
    });
    if (invoke) {
      this.onSelect(id);
    }
  }

  setFreeMode(): void {
    this.currentTitle.textContent = 'Free experiment';
    this.lessonTitle.textContent = 'Build your own comparison';
    this.question.textContent = 'What changes when you alter only one control?';
    this.observation.textContent =
      'Use Reset or choose a guided experiment to return to a known initial condition.';
    this.buttons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
  }

  open(): void {
    this.setOpen(true);
  }

  close(): void {
    this.setOpen(false);
  }

  private bindControls(): void {
    this.trigger.addEventListener('click', () => {
      this.setOpen(this.element.dataset.open !== 'true');
    });
    this.element
      .querySelector<HTMLButtonElement>('[data-experiment-close]')
      ?.addEventListener('click', () => this.close());
    this.buttons.forEach((button) => {
      button.addEventListener('click', () => {
        this.activate(button.dataset.guidedExperiment as Id);
        this.close();
      });
    });
  }

  private setOpen(open: boolean): void {
    this.element.dataset.open = String(open);
    this.trigger.setAttribute('aria-expanded', String(open));
  }

  private createMarkup(): string {
    return `
      <aside class="guided-experiments" data-guided-experiments data-open="false">
        <button
          class="experiment-trigger"
          type="button"
          data-experiment-trigger
          aria-expanded="false"
        >
          <span>Experiments</span>
          <strong data-current-experiment>Choose a starting point</strong>
          <i aria-hidden="true">⌄</i>
        </button>
        <section class="experiment-sheet" aria-label="Guided experiments">
          <header>
            <div>
              <span>Guided experiments</span>
              <strong>Change one thing. Watch one result.</strong>
            </div>
            <button type="button" data-experiment-close aria-label="Close experiments">×</button>
          </header>
          <div class="experiment-options">
            ${this.definitions
              .map(
                (definition) => `
                  <button
                    type="button"
                    data-guided-experiment="${definition.id}"
                    aria-pressed="false"
                  >
                    <span>${definition.label}</span>
                    <strong>${definition.title}</strong>
                  </button>
                `,
              )
              .join('')}
          </div>
          <div class="experiment-lesson">
            <strong data-experiment-lesson-title>—</strong>
            <dl>
              <div><dt>Question</dt><dd data-experiment-question>—</dd></div>
              <div><dt>Watch for</dt><dd data-experiment-watch>—</dd></div>
            </dl>
          </div>
        </section>
      </aside>
    `;
  }
}

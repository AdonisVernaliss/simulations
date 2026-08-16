# Simulations

Interactive scientific simulations designed for real-time use in modern browsers. The project focuses on explicit physical assumptions, responsive controls, and predictable performance across desktop and mobile devices.

## Orbital Mechanics Lab

The first simulation models gravitational systems with:

- solar system, binary star, and figure-eight presets;
- configurable mass, position, velocity, radius, and color for new bodies;
- orbital trails and optional velocity vectors;
- live energy, momentum, frame rate, and simulation-time diagnostics;
- pause, reset, time-scale, camera, and rendering-quality controls;
- perfectly inelastic collision merging;
- automatic quality reduction when the frame budget is exceeded.

## Physical model

The simulation uses normalized units with a gravitational constant of `G = 1`. Motion is integrated with a fixed-step velocity Verlet method. A small Plummer-style softening term limits numerical instability when two point masses approach the same position.

Preset positions and velocities are barycentric, so their initial center of mass and total linear momentum are effectively zero. Display radii are intentionally enlarged for readability and are also used as collision boundaries. Collision merging conserves total mass and linear momentum; kinetic energy is not conserved during a merge.

The Solar System preset uses JPL-derived mass ratios and orbital scales, but deliberately uses circular, coplanar initial orbits. The model is educational rather than a source of astronomical ephemerides.

See [Scientific basis](docs/scientific-basis.md) for the equations, source provenance, automated validation, limitations, and the acceptance policy for future biological models.

## Performance design

- Physics runs in a dedicated Web Worker.
- Frame data uses a recycled transferable buffer.
- Bodies render through a single instanced draw path.
- Trails use fixed-size circular GPU buffers.
- Procedural stars avoid image downloads.
- Device pixel ratio and star density follow the selected quality level.
- Catch-up physics work is bounded after delayed frames.
- Rendering stops advancing the model while the document is hidden.

## Development

Requirements:

- Node.js 22 or newer;
- npm 10 or newer;
- a browser with WebGL2 and Web Worker support.

From the project directory, install exact locked dependencies:

```sh
npm ci
```

Start the development server:

```sh
npm run dev
```

Open the local address printed by Vite, normally `http://127.0.0.1:5173`. Stop the server with `Ctrl+C`.

To verify and preview a production build:

```sh
npm run check
npm run preview
```

The preview command serves the generated `dist/` directory and prints its local address. Run `npm run build` instead of `npm run check` when tests and type checking have already completed.

Available checks:

```sh
npm run typecheck
npm run test:run
npm run build
npm run check
```

`npm run check` runs the same type, test, and production-build checks used in CI.

## Project structure

```text
src/
├── core/                         Fixed-step runtime utilities
└── simulations/orbital-lab/
    ├── model/                    Physics engine and presets
    ├── renderer/                 WebGL scene and reusable buffers
    ├── orbital-lab.ts            Interface controller
    ├── simulation.worker.ts      Worker-side simulation loop
    └── worker-protocol.ts        Typed worker messages
tests/                            Numerical and runtime tests
docs/                             Scientific model cards and sources
```

## License

No license is currently granted for reuse or redistribution.

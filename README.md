# Simulations

Interactive scientific simulations designed for real-time use in modern browsers. The project focuses on explicit physical assumptions, responsive controls, and predictable performance across desktop and mobile devices.

## Laboratories

The application uses stable query-based laboratory addresses that work on static hosting without server-side route rewrites:

- `?lab=catalog` — laboratory catalog;
- `?lab=orbital` — Cosmic Sandbox;
- `?lab=atomic` — Atomic Orbitals Lab;
- `?lab=particle` — Particle Track Lab;
- `?lab=black-hole` — Black Hole Optics Lab;
- `?lab=quasar` — Quasar Engine Lab.

Opening the root address without a query loads Cosmic Sandbox.

Laboratories with guided experiments expose them from a non-blocking control that loads validated
initial conditions and explains what to change, what to observe, and which relation causes the
result. Black Hole Optics uses direct controls only. Manual control switches to free-experiment
mode without changing the underlying physical model. See
[Laboratory and experiment design](docs/experiment-design.md).

## Cosmic Sandbox

The first simulation models gravitational systems with:

- twelve systems covering the Solar System, stellar and compact binaries, a figure eight, black-hole encounters, tidal stretching and mergers, naked and accreting black holes, an active nucleus, a pulsar system, and planetary accretion;
- black holes, active nuclei, neutron stars, pulsars, ordinary stars, terrestrial worlds, rocky bodies, gas giants, and ice giants in one N-body scene;
- configurable object type, mass, position, velocity, physical radius, visual radius, and color;
- orbital trails and optional velocity vectors;
- direct object selection, a live object inspector, and camera tracking;
- NASA/JPL planet maps, procedural photospheres and planetary materials, atmosphere, rings, and adjustable geometry detail;
- constant-time Schwarzschild beam tracing, camera-dependent direct and secondary disk images, a `2.598 rₛ` observable shadow, and an optional Newtonian potential overlay;
- live energy, momentum, frame rate, and physical elapsed-time diagnostics;
- physical time warp from real time through `10⁷×`, plus pause, reset, camera, and rendering-quality controls;
- energy- and geometry-dependent accretion, hit-and-run, disruption-threshold detection, capture, and black-hole merger outcomes;
- automatic quality reduction when the frame budget is exceeded.

### Interaction

- Drag the scene to orbit the camera and scroll or pinch to zoom.
- Click a body in the scene to inspect it.
- Choose a named body from the lower object strip to select and follow it.
- Use **System** to return to the full-system view.
- Press `Space` to pause or resume and `Escape` to close the object inspector.
- Use **Vectors** to display velocity direction and relative magnitude.

## Physical model

The simulation uses normalized units with a gravitational constant of `G = 1`. The astronomical presets map one integration-time unit to `sqrt(AU³/GM☉)`, so the time-warp selector advances physical seconds rather than multiplying an arbitrary animation speed. Motion uses velocity Verlet with bounded fixed steps at visible time warps and smaller direct steps near real time. A small Plummer-style softening term limits numerical instability when two point masses approach the same position.

Preset positions and velocities are barycentric, so their initial center of mass and total linear momentum are effectively zero. Physical radii control collision and capture; independent visual radii keep distant objects readable. Ordinary accretion conserves total mass and linear momentum; kinetic energy is not conserved during a merge. A bounded massless tracer cloud marks unresolved ejecta, while credible fragment dynamics still require a hydrodynamic material solver.

The Solar System preset uses JPL-derived mass ratios and orbital scales, but deliberately uses circular, coplanar initial orbits. The model is educational rather than a source of astronomical ephemerides.

See [Scientific basis](docs/scientific-basis.md) for equations, validation, and limitations, and [Event model sources](docs/event-models.md) for the open SPH/numerical-relativity upgrade paths and their runtime boundary.

## Atomic Orbitals Lab

The second simulation models selected stationary states of the non-relativistic hydrogen atom with:

- analytically normalized `1s`, `2s`, `2p`, `3p`, and `3d` wavefunctions;
- probability clouds sampled from `|ψ|²`, never classical electron paths;
- phase-sign colors, radial scale guides, quantum numbers, nodes, and model energy;
- deterministic sampling and selectable point density;
- orbit, zoom, rotation, and mobile-adaptive controls.
- guided comparisons of probability, ground-state symmetry, radial nodes, and angular nodes.

See the [Atomic orbitals model card](docs/atomic-orbitals.md) for equations, constants, sampling details, sources, validation, and limitations.

## Particle Track Lab

The particle laboratory integrates ideal relativistic tracks in a uniform magnetic field. Charge sign sets curvature direction, while evaluated rest mass, kinetic energy, and magnetic-field strength set momentum and radius. Muon and charged-pion tracks also show vacuum survival probability from their mean lifetimes.

Five guided experiments cover track reading, charge-sign reversal, high momentum, and pion survival.

See the [Particle track model card](docs/particle-tracks.md) for equations, current Particle Data Group sources, validation, and omitted detector physics.

## Black Hole Optics Lab

The black-hole laboratory integrates null geodesics of Schwarzschild spacetime. It exposes the event horizon, photon sphere, critical impact parameter, capture boundary, weak-field limit, and conversion from normalized geometry to physical scale.

Impact parameter, mass, ray bundle, and photon playback are exposed directly without a guided-experiment panel. Stellar motion and reduced-order merger scenarios remain in Cosmic Sandbox rather than being imitated with the light-ray model; hydrodynamic tidal disruption is still outside the implemented scope.

See the [Black hole optics model card](docs/black-hole-optics.md) for the geodesic equation, exact reference scales, sources, validation, and the distinction between a coordinate diagram and an observed shadow.

## Quasar Engine Lab

The quasar laboratory computes a steady zero-torque thin-disk baseline: Eddington luminosity, accretion rate, radial dissipation, effective temperature, and the local Wien peak. The false-colour disk is explicitly separated from relativistic transfer, plasma, corona, jet, and GRMHD models.

The disk has a lightweight live orbital-flow overlay and four guided mass/accretion experiments. Absolute temperature changes the false colour, Eddington ratio changes brightness, and the displayed orbital rate retains the physical `period ∝ M` scaling. The black hole and disk are selectable; a direct link opens the same active nucleus as a massive object in Cosmic Sandbox, where additional bodies can be added.

See the [Quasar thin-disk model card](docs/thin-disk.md) for equations, assumptions, sources, validation, and the regimes where the approximation fails.

## Performance design

- Physics runs in a dedicated Web Worker.
- Frame data uses a recycled transferable buffer.
- Small and medium systems use exact pairwise Float64 gravity; a pooled Barnes–Hut octree is available only beyond the calibrated crossover, with the active solver shown in the HUD.
- Collision contact remains exact while a sweep-and-prune broad phase removes distant pairs from detailed checks.
- Display-only energy diagnostics are sampled at the interface refresh rate rather than at the physics-frame rate.
- Bounded per-body meshes support distinct surfaces, compact-object emission, selection, and quality-dependent geometry.
- Trails use fixed-size circular GPU buffers.
- NASA Deep Star Maps 2020 is stored in three local resolutions and loaded for the selected quality level.
- Device pixel ratio, sky resolution, disk structure, and impact-tracer count follow the selected quality level.
- Schwarzschild deflection and disk intersections use two fixed lookup textures, so shader work remains bounded per covered pixel.
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
├── core/                         Shared runtime utilities
├── catalog.ts                    Laboratory index and research workspaces
└── simulations/
    ├── atomic-lab/               Hydrogen model, sampler, renderer, and interface
    ├── black-hole-lab/           Schwarzschild ray model and optics interface
    ├── particle-lab/             Relativistic track model and detector view
    ├── quasar-lab/               Thin-disk model and temperature view
    └── orbital-lab/
        ├── model/                Physics engine and presets
        ├── renderer/             WebGL scene and reusable buffers
        ├── orbital-lab.ts        Interface controller
        ├── simulation.worker.ts  Worker-side simulation loop
        └── worker-protocol.ts    Typed worker messages
tests/                            Numerical and runtime tests
docs/                             Scientific model cards and sources
```

## License

No license is currently granted for reuse or redistribution.

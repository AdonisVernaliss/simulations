# Laboratory and experiment design

## User model

The project uses four layers:

```text
Catalog → Laboratory → Guided experiment → Free experiment
```

A laboratory owns one scientific domain and its validated model code. Guided experiments load known initial conditions into that model; they are not separate decorative pages. Free experiment mode exposes the same controls without claiming that every arbitrary setting represents a real system.

Every guided experiment answers three questions:

1. What should the user change or compare?
2. Which measured output should they watch?
3. Which equation explains the result?

This provides an understandable first action for a new user while retaining a sandbox for independent exploration. The pattern follows the useful separation seen in Universe Sandbox between included simulations and editable object properties, combined with the selected-object information and navigation emphasis of SpaceEngine.

## Current experiment sets

### Cosmic Sandbox

- planetary periods in an idealized solar system;
- a black-hole flyby through a planetary system;
- a star–black-hole binary with circumbinary worlds;
- a scaled black-hole merger with radiated-mass estimate;
- a radio-loud active nucleus inside the shared gravitational scene;
- a pulsar with a rotating lighthouse-beam overlay and orbiting companions;
- a Newtonian double-neutron-star baseline;
- a black-hole tidal encounter with a live self-gravity stress indicator;
- motion around the barycentre of an equal-mass binary;
- the periodic three-body figure-eight solution;

### Atomic Orbitals

- interpreting a probability cloud rather than a classical orbit;
- the spherical, node-free `1s` ground state;
- the radial node of `2s`;
- the angular nodes of `3d z²`.

### Particle Tracks

- inferring momentum from curvature;
- comparing electron and positron bend directions;
- the high-momentum, large-radius limit;
- charged-pion survival and decay length.

### Black Hole Optics

This laboratory deliberately uses direct controls rather than a guided panel. Impact parameter
continuously crosses weak deflection, near-critical motion, and capture, while mass changes the
physical scale of the same normalized Schwarzschild geometry.

### Quasar Engine

- a reference luminous thin disk;
- the hotter disk of a lower-mass black hole;
- the cooler disk of a very massive black hole;
- approach to the Eddington boundary.

## Black-hole interaction boundaries

“Black hole interaction” is not one physical model. It must be separated into modes with different equations:

- light interaction uses exact planar null geodesics in Black Hole Optics and a precomputed Schwarzschild beam-transfer parameterization in Cosmic Sandbox;
- massive-particle and stellar motion is available as a Newtonian far-field baseline, not as timelike geodesics;
- tidal disruption requires stellar self-gravity and hydrodynamics;
- accretion requires disk or plasma dynamics plus radiation, with the current thin-disk laboratory serving only as an analytic baseline;
- binary-black-hole waveforms require numerical-relativity or validated surrogate data; the sandbox implements only contact, retained momentum, and a bounded radiated-mass estimate.

The interface does not reuse the light-ray integrator to fake a stellar orbit or add an artistic jet to the thin-disk equations. The collision model detects the catastrophic-energy boundary but deliberately omits invented massive fragments: bounded massless tracers communicate unresolved flow without entering the dynamics. The tidal scene exposes a leading-order stress ratio, a trace-free volume-preserving affine response, and bounded pre-contact and capture streams without claiming stellar-fluid evolution. Any future hydrodynamic or numerical-relativity mode requires its own model card and tests.

## Performance rules

- Initial conditions are data; shared physics and rendering code are reused.
- Canvas laboratories redraw expensive static layers only after input or resize.
- Animation overlays use bounded point counts and stop affecting the physical calculation.
- WebGL assets remain procedural and quality-adaptive.
- Ordinary scenes bypass compact-object post-processing, and hidden overlays skip their GPU updates.
- Display-only diagnostics run at their visible refresh rate without reducing physics steps.
- Exact direct gravity is retained below the measured crossover; approximate tree gravity is never selected merely because a device reports a low frame rate.
- Collision broad-phase pruning may remove only geometrically impossible pairs, so device adaptation cannot change contact outcomes.
- Hidden documents do not advance expensive simulations.
- New experiments add no network request and no dependency by default.

## Interface references

- [Universe Sandbox](https://www.universesandbox.com/), official feature overview: included physical simulations, editable properties, time control, collisions, and system creation.
- [Universe Sandbox in the Classroom](https://www.universesandbox.com/education/), official description of hypothesis-driven experimentation through editable properties.
- [SpaceEngine user manual](https://spaceengine.org/manual/user-manual-0980/), official description of selection, object information, camera binding, navigation, and persistent HUD data.
- [Universe Sandbox SPH fluid-simulation devlog](https://universesandbox.com/blog/2019/12/sph-devlog-1/), official engineering explanation of why planetary impacts require a continuous-material method for credible stretching, fragmentation, and formation.

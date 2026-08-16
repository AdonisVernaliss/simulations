# Scientific basis

This document separates the physical model from its visual presentation and states where the simulation should not be treated as a prediction.

## Scope

Cosmic Sandbox is a deterministic Newtonian N-body simulation in three spatial dimensions, augmented by bounded collision-outcome and leading-order tidal models. Schwarzschild null geodesics provide a separate optical transfer model around visible non-rotating black holes. The included presets demonstrate orbital mechanics, conservation laws, close encounters, collision regimes, and compact-object interactions. They are not ephemerides, hydrodynamic simulations, or numerical-relativity calculations.

There is currently no biological model in the project. No claim of biological validity is made.

## Equations of motion

For body `i`, acceleration is computed by direct summation over every other body:

```text
             m_j (r_j - r_i)
a_i = G Σ -------------------------
          (|r_j-r_i|² + ε²)^(3/2)
```

The simulation uses normalized units with `G = 1`. Here `m_j` is the normalized mass, `r_i` and `r_j` are position vectors, and `ε = 0.0001` is the softening length.

The force calculation is pairwise and symmetric. Each interaction applies equal and opposite momentum changes, subject only to floating-point rounding.

### Adaptive force evaluation

The default solver is adaptive but deliberately keeps every current interactive scene on the exact direct kernel:

- direct summation uses Float64 typed arrays and one symmetric evaluation for each unique pair;
- the current interactive limit is 128 bodies, far below the measured tree crossover;
- the automatic Barnes–Hut path begins only above 2,048 bodies;
- either path can be forced in tests through the simulation options.

For larger datasets, Barnes–Hut rebuilds a three-dimensional octree on every force evaluation. Leaves retain up to four bodies; sufficiently distant nodes are represented by their total mass and center of mass. The opening criterion uses `θ = 0.5`, giving expected `O(N log N)` rather than direct `O(N²)` work. Its arrays are pooled and reused so fixed steps do not create a new object graph for garbage collection. A uniform acceleration correction removes residual center-of-mass acceleration introduced by the asymmetric approximation.

Barnes–Hut is not mathematically identical to direct summation. A deterministic 320-body reference test requires RMS acceleration error below `0.3%`, finite output for degenerate positions with softening, and a total mass-weighted acceleration below `10⁻¹⁰`. This bound validates the tested distribution, not every possible adversarial arrangement. Tight few-body encounters stay direct under the automatic policy.

Collision detection uses a separate exact policy. Up to 48 bodies it performs an allocation-free ordered scan. Larger sets use sweep-and-prune on physical-radius intervals along one axis, reject separated `y` and `z` intervals, and finally apply the exact three-dimensional sphere-overlap test. It returns the same first indexed collision as the former all-pairs scan; only impossible distant candidates are skipped.

### Softening

The `ε` term is Plummer-style gravitational softening. It prevents the point-mass force from diverging at zero separation and improves numerical stability during close approaches. It also changes the force law at distances comparable to `ε`, so close-encounter trajectories are not exact Newtonian point-mass solutions.

## Time integration

Each preset advances through a velocity Verlet integrator:

```text
r(t + Δt) = r(t) + v(t)Δt + ½a(t)Δt²
v(t + Δt) = v(t) + ½[a(t) + a(t + Δt)]Δt
```

Velocity Verlet is a second-order, time-reversible symplectic method. At accelerated rates the model uses each preset's fixed step; the runtime bounds catch-up work after a delayed browser frame. When real-time or a low warp requests less than one fixed step in a frame, that smaller positive interval is integrated directly so the physical clock and sidereal rotation do not wait hours for the accumulator to fill.

For presets expressed in astronomical units and solar masses, `G = 1` gives the natural time unit

```text
t_unit = sqrt(AU³ / GM☉) = 5 022 642.891... s.
```

The selector specifies physical seconds per real second: `1×` is real time, and the accelerated choices extend through `10⁷×`. The displayed elapsed time converts integrated model time back to seconds, days, or years. Planetary sidereal rotation rates in the Solar System preset use the same physical conversion; retrograde signs are retained. Synthetic impact presets remain similarity-scaled demonstrations and must not be read as ephemerides.

## Presets

### Idealized solar system

- Planet-to-Sun mass ratios are derived from JPL DE440 `GM` values.
- Orbital scales use JPL J2000 semi-major axes.
- Initial planet speeds use the circular approximation `v = sqrt(1 / r)`.
- The Sun is offset so the initial center of mass and total linear momentum are effectively zero.

This preset is intentionally simplified:

- all bodies begin on one line;
- all orbits are circular and coplanar;
- eccentricity, inclination, axial rotation, satellites, relativity, radiation pressure, and non-gravitational forces are omitted;
- Mercury through Neptune are included;
- physical collision radii use the same distance scale as the orbits;
- independent visual radii enlarge bodies so they remain selectable at system scale.

For positions of real planets at a date, JPL Horizons or an integrated ephemeris is required.

### Binary stars

Two equal masses start at `x = ±1` with tangential speeds `|v| = 0.5`. With `G = 1`, their separation is `2`, their shared orbital radius is `1`, and the ideal period is `4π` simulation-time units.

### Figure eight

Three equal masses use the standard Chenciner–Montgomery figure-eight initial conditions. The bodies have zero total momentum and follow the same periodic curve with a phase offset when integrated with sufficient precision.

### Black-hole systems

Black holes participate in the same pairwise N-body force summation as stars and planets. The flyby and black-hole-plus-star presets therefore exchange energy and momentum with every massive body rather than moving along scripted paths. Their far-field orbital motion is Newtonian. Strong-field corrections to massive-particle motion, spin, frame dragging, gravitational-wave backreaction, and relativistic precession are not integrated.

Within each compact-object preset, the supplied black-hole physical radius is a scaled Schwarzschild radius. The presets keep the ratio `r_s / M = 0.02`, corresponding to a normalized speed of light `c = 10` through `r_s = 2GM/c²`. Crossing the combined physical radii triggers capture. The larger visual shadow and disk do not alter force or capture calculations.

The black-hole merger preset estimates radiated mass with

```text
M_rad / M_total = 0.05 × 4η
η = m₁m₂ / (m₁ + m₂)²
```

This is a bounded non-spinning merger estimate, not a waveform or a replacement for numerical relativity. The retained remnant conserves the pre-merger linear momentum; recoil kicks and spin-dependent radiation are omitted.

### Accreting black holes, active nuclei, neutron stars, and pulsars

The compact-object renderer has three explicit states: a naked black hole with no local emitter, an accreting black hole with a thin disk, and an active nucleus with the same disk plus qualitative bipolar jets. The accreting and active-nucleus presets place these objects in the same N-body state as their nearby stars and planets. Gravity comes only from the listed masses. Disk emission and jets neither add mass nor exert a force. The detailed Quasar Engine laboratory separately evaluates the zero-torque thin-disk temperature model.

Neutron stars and pulsars are ordinary massive N-body participants with deliberately enlarged render radii and compact physical radii. The pulsar's 1.337-second spin is converted into the model time unit. Its two cones are an idealized magnetic-axis lighthouse pattern, following the rotating-neutron-star interpretation of pulsations; they are not a radio-emission or plasma-magnetosphere calculation. The double-neutron-star preset is Newtonian and omits gravitational-wave inspiral, tidal deformation, and merger physics.

### Tidal stellar encounter

The tidal-encounter preset compares the leading Newtonian acceleration difference across a body, `Δa ≈ 2GM_BH R / d³`, with its surface self-gravity, `g ≈ Gm/R²`. Their ratio is

```text
T = 2 M_BH R³ / (m d³).
```

The renderer begins a volume-preserving elongation toward the black hole as `T` grows; around `T ≈ 1`, the leading tidal gradient rivals the body's self-gravity. This is a physically scaled indicator and an educational spaghettification cue, not a deformable-fluid solution. The N-body solver still advances one center of mass for the star and does not calculate pressure, stellar structure, mass stripping, fallback, or an accretion stream. Close Kerr orbits require a relativistic tidal tensor rather than this Newtonian estimate.

## Collisions

Contact is determined only by physical radii. Visual enlargement never changes the collision cross-section. Each ordinary impact is classified from its relative velocity, impact geometry, mutual escape velocity, and center-of-mass specific impact energy

```text
Q_R = ½ μ v_impact² / M_total
μ = m₁m₂ / M_total
```

The gravity-regime catastrophic threshold is approximated as `1.9` times the uniform-sphere binding energy per unit mass. This follows the fluid-planet material parameter and universal-law structure of Leinhardt and Stewart, but does not implement their full composition-, angle-, and mass-ratio-dependent prescription.

The real-time model distinguishes five outcomes:

- low-energy accretion: a volume-equivalent remnant conserves mass and linear momentum;
- hit-and-run: a fast grazing contact applies a momentum-conserving normal impulse and separates both bodies;
- catastrophic-disruption threshold: both resolved bodies receive a separating impulse, but no massive debris bodies are invented without a hydrodynamic solver;
- horizon capture: the captured mass and momentum join the black hole;
- black-hole merger: the retained mass excludes the stated gravitational-radiation estimate.

For ordinary accretion:

- total mass is conserved;
- linear momentum is conserved;
- the new position is the center of mass;
- volume-equivalent radius is computed from `r³ = r₁³ + r₂³`;
- kinetic energy is not conserved.

For two equal-density, equal-radius worlds this gives twice the mass and `∛2 ≈ 1.26` times the radius. The animated molten material marks a qualitative hot post-impact state; it does not claim a calculated temperature or cooling curve.

Ordinary impacts also trigger one bounded GPU tracer cloud. Its centre and impact-plane orientation come from the collision state. The stored characteristic ejecta speed is `0.5 v_impact`, following the central tendency reported for escaping debris in the cited giant-impact database; the renderer uses its ratio to mutual escape speed to set a capped visual expansion. Tracers have no mass and do not feed back into gravity. Their real-time lifetime, colours, particle count, and individual paths are illustrative. Cratering, material strength, phase changes, atmosphere loss, chemistry, fragment-size distribution, reaccretion, and thermal evolution are not calculated. A credible disruptive impact needs a fluid method such as SPH rather than a few rigid spheres.

## Schwarzschild optical transfer

Each visible black hole carries a camera-facing, bounded beam-tracing surface. The implementation adapts Eric Bruneton's BSD-licensed constant-time Schwarzschild parameterization: two precomputed floating-point tables return null-ray deflection and disk-crossing radius instead of iterating a geodesic many times per pixel. Manual bilinear lookup keeps the result available on WebGL devices without float-linear filtering. Low, balanced, and high modes vary disk-noise detail and render resolution, not the underlying lookup dimensions.

All radii in the optical shader are measured in Schwarzschild radii `r_s`. It distinguishes:

- event horizon: `r = r_s`;
- unstable circular photon orbit: `r = 1.5 r_s`;
- critical impact parameter and apparent shadow radius for a distant static observer: `b_c = 3√3/2 r_s ≈ 2.598 r_s`;
- Schwarzschild innermost stable circular orbit: `r = 3 r_s`.

Escaping rays sample the Gaia EDR3 equirectangular all-sky colour map. Captured rays terminate in the shadow. A razor-thin disk from `3 r_s` to `12 r_s` can intersect a ray twice, which produces camera-dependent direct and secondary images of its front and rear faces above and below the shadow. Disk brightness includes a zero-torque radial temperature profile, approximate colour mapping, orbital time delay, relativistic frequency shift, and a bounded `g³` intensity factor. Procedural density filaments keep the idealized disk from appearing as a static image.

The previous whole-screen thin-lens pass was removed because it distorted the already beam-traced image a second time and made a large unphysical ripple. The bounded transfer surface currently lenses the Gaia sky and its own disk, not trails or nearby 3D bodies. The model is Schwarzschild: it assumes a static non-rotating hole and static observer. It does not implement Kerr frame dragging, a moving-observer tetrad, full spectral radiative transfer, polarization, disk thickness, self-shadowing, coronae, magnetohydrodynamics, or GRMHD jets. The event horizon is not drawn as a surface; the visible dark region is the larger optical shadow. The separate Black Hole Optics laboratory remains the equation-level ray reference.

## Visual model and detail levels

Earth, Venus, Mars, and Jupiter use credited NASA/JPL observational maps. The background is a three-resolution equirectangular map of Gaia EDR3 source colour and density from ESA/Gaia/DPAC. Stars, generic rocky bodies, Saturn, ice giants, atmospheres, disks, jets, and collision tracers use procedural visual materials. These materials communicate object class but are not time-resolved observations. The sky is non-interacting visual context and is not a member of the active N-body state.

Low, balanced, and high detail levels change sphere and ring tessellation, texture anisotropy, sky-map resolution, disk density detail, collision-tracer count, render pixel ratio, and exposure. Automatic mode reduces those costs when sustained frame time exceeds the budget. The optional field overlay evaluates normalized Newtonian potential contours for the most massive visible bodies; it does not feed back into the force calculation, which always includes every body.

## Automated validation

The test suite checks:

- closure of an equal-mass circular binary after one analytic period;
- relative energy drift below `10⁻⁶` over repeated binary orbits;
- conservation of total linear momentum;
- exact direct-force symmetry and bounded Barnes–Hut force error;
- zero center-of-mass acceleration after tree-force correction;
- equivalence of sweep-and-prune and ordered all-pairs collision detection;
- conservation of mass and momentum during collision merging;
- classification of accretion, hit-and-run, disruption, capture, and black-hole merger regimes;
- inverse-cube scaling of the tidal-stress indicator;
- physical separation between collision radius and visual radius;
- decoding and dimension validation for both Schwarzschild beam lookup tables;
- finite state values for every preset;
- near-zero initial center of mass and total momentum for every preset;
- deterministic fixed-step accumulation with bounded catch-up work.

These checks validate the implementation against the stated model. They do not validate the model for high-precision navigation or long-term Solar System prediction.

## Biological-model policy

Before a future biological simulation is accepted, its model card must identify:

1. the biological question and scale, such as molecular, cellular, population, or ecological;
2. state variables, equations, units, parameters, and initial conditions;
3. peer-reviewed or institutional sources for each non-derived parameter;
4. calibration data and validation data kept separate where applicable;
5. stochastic assumptions, uncertainty, sensitivity, and identifiability limits;
6. the domain in which the model has empirical support;
7. known mechanisms deliberately omitted from the model;
8. numerical approximations introduced for real-time rendering;
9. dataset and implementation licenses.

Open publication does not automatically permit copying code or datasets. Equations and factual parameters may be implemented from primary literature; source code, data, images, and meshes are reused only when their licenses permit it, with required attribution retained.

## Primary references

- NASA JPL Solar System Dynamics, [Astrodynamic Parameters](https://ssd.jpl.nasa.gov/astro_par.html): astronomical units, `G`, solar `GM`, and DE440 planetary-system `GM` values.
- NASA JPL Solar System Dynamics, [Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html): J2000 Keplerian elements and stated accuracy limits.
- NASA JPL Solar System Dynamics, [Planetary Physical Parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html): planetary masses, radii, and orbital periods.
- A. Chenciner and R. Montgomery, [A remarkable periodic solution of the three-body problem in the case of equal masses](https://arxiv.org/abs/math/0011268), *Annals of Mathematics* 152 (2000), 881–901.
- W. C. Swope et al., [A computer simulation method for the calculation of equilibrium constants for the formation of physical clusters of molecules](https://doi.org/10.1063/1.442716), *The Journal of Chemical Physics* 76 (1982), 637–649.
- W. Dehnen, [Towards optimal softening in three-dimensional N-body codes](https://arxiv.org/abs/astro-ph/0011568), *Monthly Notices of the Royal Astronomical Society* 324 (2001), 273–291.
- J. Barnes and P. Hut, [A hierarchical O(N log N) force-calculation algorithm](https://doi.org/10.1038/324446a0), *Nature* 324 (1986), 446–449.
- Z. M. Leinhardt and S. T. Stewart, [Collisions Between Gravity-Dominated Bodies: I. Outcome Regimes and Scaling Laws](https://arxiv.org/abs/1106.6084), *The Astrophysical Journal* 745 (2012), 79.
- M. Ishii, M. Shibata, and Y. Mino, [Black hole tidal problem in the Fermi normal coordinates](https://arxiv.org/abs/gr-qc/0501084), *Physical Review D* 71 (2005), 044017.
- M. Kesden, [Tidal disruption rate of stars by spinning supermassive black holes](https://arxiv.org/abs/1109.6329), *Physical Review D* 85 (2012), 024037.
- V. Perlick and O. Y. Tsupko, [Calculating black hole shadows: Review of analytical studies](https://arxiv.org/abs/2105.07101), *Physics Reports* 947 (2022), 1–39.
- E. Bruneton, [Real-time High-Quality Rendering of Non-Rotating Black Holes](https://arxiv.org/abs/2010.08735) (2020), and the [BSD-licensed reference implementation](https://github.com/ebruneton/black_hole_shader); Schwarzschild deflection and disk-intersection lookup parameterization.
- O. James, E. von Tunzelmann, P. Franklin, and K. S. Thorne, [Gravitational lensing by spinning black holes in astrophysics, and in the movie Interstellar](https://arxiv.org/abs/1502.03808), *Classical and Quantum Gravity* 32 (2015), 065001; DNGR image anatomy and Kerr ray-bundle rendering used as the visual reference, not as the sandbox numerical method.
- ESA/Gaia/DPAC, [The colour of the sky from Gaia's Early Data Release 3](https://www.esa.int/ESA_Multimedia/Images/2020/12/The_colour_of_the_sky_from_Gaia_s_Early_Data_Release_32); equirectangular source-density and colour context, CC BY-SA 3.0 IGO.
- USGS, [A new database of giant impacts over a wide range of masses and material strength](https://www.usgs.gov/publications/a-new-database-giant-impacts-over-a-wide-range-masses-and-material-strength-a-first) (2024); characteristic escaping-debris speed used only to scale the massless tracer cloud.
- USGS, [Two planets undergoing a hit-and-run impact](https://www.usgs.gov/media/videos/two-planets-undergoing-a-hit-and-run-impact); public-domain SPLATCH/SPH visualization used as a qualitative impact-geometry reference.
- T. Gold, [Rotating Neutron Stars as the Origin of the Pulsating Radio Sources](https://doi.org/10.1038/218731a0), *Nature* 218 (1968), 731–732; rotating-neutron-star lighthouse interpretation used for the schematic pulsar overlay.
- Observational texture credits and source files are listed in [Visual asset provenance](visual-assets.md).

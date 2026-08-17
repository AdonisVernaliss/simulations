# Event model sources

Reviewed 2026-08-17. This inventory separates the bounded interactive model from research solvers that cannot be run at full resolution inside a browser frame budget.

## Runtime boundary

The sandbox resolves centres of mass, gravity, contact, momentum exchange, retained mass, and a small set of outcome thresholds. GPU event particles are massless visual encodings. They never become hidden gravitating fragments and never feed energy or momentum back into the solver.

An offline hydrodynamic or numerical-relativity result may be added only with its input parameters, units, code version, licence, convergence information, and a documented interpolation domain. Outside that domain the interface must fall back to the current reduced-order model rather than extrapolate silently.

## Event matrix

| Event | Interactive model | Open authoritative path | Integration decision |
| --- | --- | --- | --- |
| Planetary impact | Leinhardt–Stewart gravity-regime variables classify merge, hit-and-run, and disruption. Escaping tracers use the USGS database result `v_ejecta ≈ 0.5 v_impact`. | [OpenSPH](https://github.com/pavelsevecek/OpenSPH) is MIT-licensed and includes SPH/N-body impact presets, Tillotson material response, strength, damage, and reaccumulation tools. The [USGS giant-impact database](https://www.usgs.gov/publications/a-new-database-giant-impacts-over-a-wide-range-masses-and-material-strength-a-first) spans differentiated bodies from small embryos to super-Earths. | Keep the analytic classifier live. Use OpenSPH or published USGS runs offline to build a bounded, versioned outcome atlas before displaying resolved debris, vapor fractions, or remnant shapes. |
| Stellar merger | N-body mass and momentum produce an expanded remnant; a rotating equatorial shock flow marks the unresolved luminous-red-nova phase. | [StarSmasher](https://github.com/jalombar/starsmasher) is GPL-3.0 SPH software for stellar collisions. Its particles carry mass, velocity, density, pressure, internal energy, and temperature. | Do not transplant its cluster/GPU solver into WebGL. A future offline pipeline can export normalized density, temperature, and velocity volumes with the GPL and paper citations retained. |
| Tidal disruption | The live stress indicator uses `T = 2 M_BH R³ / (m d³)`. A trace-free `2:−1:−1` principal-axis response preserves ellipsoid volume; paired pre-contact and capture tracers mark inward and outward streams. | The [2021 TDE review](https://arxiv.org/abs/2005.12528) describes affine and hydrodynamic model families. [Phantom](https://phantomsph.github.io/) is GPLv3 astrophysical SPH/MHD software with black-hole accretion and tidal-disruption setups. [NASA's published supercomputer TDE sequence](https://svs.gsfc.nasa.gov/14000) is the qualitative morphology reference. | Keep both tracer layers explicitly massless and label the single-ellipsoid response as reduced order. Use a parameterized Phantom result set only after stellar profile, penetration factor, mass ratio, relativistic potential, fallback, and self-intersection assumptions are recorded. |
| Horizon capture | Crossing the scaled physical capture radius transfers resolved mass and momentum to the black hole. A short fading stream communicates the approach direction; it is not matter evolved through the horizon. | Timelike geodesics can be computed in a fixed metric; extended fluid capture requires relativistic hydrodynamics. [Einstein Toolkit](https://www.einsteintoolkit.org/) is the open community platform for general-relativistic astrophysics. | Preserve the inexpensive contact rule for sandbox play. A future strong-field mode needs a separate metric, coordinate convention, integrator, and validation suite. |
| Compact merger | Black-hole pairs use a bounded symmetric-mass-ratio radiation estimate and draw no vacuum fireball. Neutron-star pairs show matter only as an explicitly reduced-order proxy. | [Einstein Toolkit](https://www.einsteintoolkit.org/) supports black-hole, neutron-star, and mixed-binary numerical relativity. The public [SXS waveform catalogue](https://data.black-holes.org/waveforms/index.html) supplies multi-resolution merger waveforms and requests citation of each simulation's primary paper. | Use compact surrogate coefficients or cited SXS waveforms for interactive strain and remnant properties. Full spacetime and magnetized ejecta evolution remains offline HPC work. |

## Current visual mappings

- Planetary ejecta starts in the measured impact plane, mixes tangential and normal components, and cools from melt/vapor colours toward dust. A newly merged core carries a finite-age silicate-vapor shell and a flattened, differentially rotating debris population. Both layers remain massless and are capped by the selected quality level.
- Stellar outflow begins as an equatorial spiral around the volume-equivalent remnant. The photosphere is expanded only in render space; its physical collision radius remains separate.
- Pre-contact tidal streams use the live black-hole-to-victim radial axis; the event stream also uses projected relative velocity. Opposite radial signs distinguish material directed inward from material leaving the encounter.
- Black-hole binaries in vacuum have no luminous particle effect. Their reported lost mass represents gravitational radiation, not ejecta.

These mappings are designed to make the event class legible. They are not snapshots copied from a single simulation and must not be interpreted as predictions of fragment count, luminosity, spectrum, nucleosynthesis, or waveform.

## Acceptance tests for imported results

Before an offline result set can replace a reduced-order visual, it must demonstrate:

1. conservation errors for mass, linear momentum, and angular momentum;
2. resolution convergence or an explicit uncertainty band;
3. a parameter-domain check for masses, radii, composition, velocity, angle, spin, and equation of state;
4. deterministic interpolation with no unbounded browser allocations;
5. a low-detail representation that preserves the same bulk morphology;
6. source, code-version, licence, and paper metadata kept with the generated assets.

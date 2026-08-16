# Scientific basis

This document separates the physical model from its visual presentation and states where the simulation should not be treated as a prediction.

## Scope

Orbital Mechanics Lab is a deterministic Newtonian point-mass simulation in three spatial dimensions. The included presets are designed to demonstrate orbital mechanics, conservation laws, and sensitivity to initial conditions. They are not ephemerides and do not reproduce the Solar System at a specific date.

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

### Softening

The `ε` term is Plummer-style gravitational softening. It prevents the point-mass force from diverging at zero separation and improves numerical stability during close approaches. It also changes the force law at distances comparable to `ε`, so close-encounter trajectories are not exact Newtonian point-mass solutions.

## Time integration

Each preset advances through a fixed-step velocity Verlet integrator:

```text
r(t + Δt) = r(t) + v(t)Δt + ½a(t)Δt²
v(t + Δt) = v(t) + ½[a(t) + a(t + Δt)]Δt
```

Velocity Verlet is a second-order, time-reversible symplectic method. Fixed steps avoid frame-rate-dependent physics. The runtime limits catch-up steps after a delayed browser frame, preferring responsiveness over silently processing an unbounded backlog.

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
- only Mercury through Saturn are included;
- displayed radii are enlarged and are not on the orbital distance scale.

For positions of real planets at a date, JPL Horizons or an integrated ephemeris is required.

### Binary stars

Two equal masses start at `x = ±1` with tangential speeds `|v| = 0.5`. With `G = 1`, their separation is `2`, their shared orbital radius is `1`, and the ideal period is `4π` simulation-time units.

### Figure eight

Three equal masses use the standard Chenciner–Montgomery figure-eight initial conditions. The bodies have zero total momentum and follow the same periodic curve with a phase offset when integrated with sufficient precision.

## Collisions

Bodies merge when their displayed spheres overlap. The merge is perfectly inelastic:

- total mass is conserved;
- linear momentum is conserved;
- the new position is the center of mass;
- volume-equivalent radius is computed from `r³ = r₁³ + r₂³`;
- kinetic energy is not conserved.

Because display radii are enlarged, collision time and collision cross-section are illustrative rather than astronomical.

## Automated validation

The test suite checks:

- closure of an equal-mass circular binary after one analytic period;
- relative energy drift below `10⁻⁶` over repeated binary orbits;
- conservation of total linear momentum;
- conservation of mass and momentum during collision merging;
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


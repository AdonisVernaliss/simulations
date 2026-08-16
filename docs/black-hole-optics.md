# Black hole optics model card

## Scope

Black Hole Optics Lab integrates light rays in the equatorial plane of an isolated, non-rotating, uncharged black hole. The spacetime is exactly Schwarzschild within general relativity; the visualization is a vacuum geometric-optics model.

All displayed trajectories use the Schwarzschild radius `rₛ = 2GM/c²` as the length unit. Changing mass converts this normalized geometry into physical distances but does not alter its dimensionless shape.

## Null geodesic equation

For `u = rₛ/r` and azimuth `φ`, equatorial Schwarzschild null geodesics obey

```text
d²u/dφ² + u = (3/2)u².
```

The implementation integrates this equation with a fourth-order Runge-Kutta method. It does not apply a Newtonian force to a photon.

Three exact reference scales are shown:

```text
event horizon:       r = rₛ
photon sphere:       r = 3GM/c² = 1.5rₛ
critical impact:     b = 3sqrt(3)GM/c² = (3sqrt(3)/2)rₛ
```

Inward rays below the critical asymptotic impact parameter are captured; rays above it can escape. Near the boundary, a ray can accumulate a large deflection around the unstable photon sphere.

## Physical scale

The mass control uses the IAU 2015 nominal solar mass parameter

```text
(GM)☉ = 1.327 124 4 × 10²⁰ m³ s⁻²
```

so one nominal solar mass corresponds to `rₛ ≈ 2.953250 km`. The nominal parameter is exact by definition; it avoids introducing an unnecessary uncertainty from separately multiplying `G` by a solar mass estimate.

## Validation

Automated checks verify:

- the exact photon-sphere and critical-impact ratios;
- the physical Schwarzschild radius for one nominal solar mass;
- capture below and escape above the critical impact parameter;
- reflection symmetry across the equatorial axis;
- approach to the weak-field deflection `α ≈ 2rₛ/b = 4GM/(bc²)`.

## Limitations

The model excludes black-hole spin, charge, plasma dispersion, an accretion flow, radiative transfer, finite source size, cosmological distances, observer inclination, polarization, time delay, and wave optics. It traces a two-dimensional ray family from a finite launch distance, so the reported numerical deflection is an educational estimate rather than a precision astronomical observable.

The black disk marks the event horizon in the chosen coordinate diagram. It is not a synthetic telescope image and must not be interpreted as the apparent shadow of an emitting black hole.

## Primary references

- V. Perlick and O. Yu. Tsupko, [Calculating black hole shadows: Review of analytical studies](https://arxiv.org/abs/2105.07101), *Physics Reports* 947 (2022), 1–39; derivations of null-ray, photon-sphere, critical-impact, and shadow relations.
- S. A. Teukolsky, [The Kerr Metric](https://arxiv.org/abs/1410.2130), *Classical and Quantum Gravity* 32 (2015), 124006; Schwarzschild limit, horizons, photon motion, and the rotating extension deliberately omitted here.
- International Astronomical Union, [Resolution B3 on recommended nominal conversion constants](https://www.iau.org/static/resolutions/IAU2015_English.pdf), 2015; exact nominal solar mass parameter used for physical scaling.

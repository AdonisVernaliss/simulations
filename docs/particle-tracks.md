# Particle track model card

## Scope

Particle Track Lab models the ideal transverse motion of one relativistic charged particle in a spatially uniform, static magnetic field. It is a kinematics and detector-geometry baseline, not a collision-event generator or a complete detector simulation.

The implemented particle choices are electron, positron, negative muon, positive charged pion, proton, and antiproton. Their rest masses and, where applicable, mean lifetimes are evaluated particle data rather than artistic parameters.

## Relativistic kinematics

The interface specifies kinetic energy `K` in GeV. With `c = 1` in the energy-momentum calculation,

```text
E = K + m
p = sqrt(E² − m²)
β = p/E
γ = E/m
```

where mass is represented by its rest-energy equivalent in GeV. The renderer converts the transverse curvature into SI detector units through

```text
p⊥ [GeV/c] = 0.299 792 458 |q/e| B [T] R [m]
```

The sign of `qB` determines the bend direction. When `B = 0`, the track becomes a straight line.

## Decay survival

For unstable particles, the mean decay length in vacuum is

```text
L = βγcτ = (p/m)cτ
```

and survival after path length `s` is

```text
P(survive beyond s) = exp(−s/L).
```

Track opacity represents this survival probability. The visualization does not choose a random decay point or generate decay products. Stable particles are treated as having infinite decay length on the displayed scale.

## Validation

Automated checks verify:

- the relativistic energy-momentum identity;
- the magnetic-curvature conversion;
- opposite bending for equal-mass opposite charges;
- `e⁻¹` survival at one mean decay length;
- the straight-line limit at zero magnetic field.

## Limitations

The model omits energy loss, multiple Coulomb scattering, bremsstrahlung, hadronic interactions, synchrotron radiation, material boundaries, finite detector resolution, measurement noise, longitudinal pitch, electric fields, spin, and quantum dynamics. Detector rings are scale references only; they are not made from matter and cannot produce hits.

Only single-particle propagation is implemented. Conservation laws for multi-particle collisions and decays require a separate event model before they can be visualized honestly.

## Primary references

- Particle Data Group, [Review of Particle Physics 2026](https://pdg.lbl.gov/2026/), evaluated particle properties and current review index as of 16 August 2026.
- Particle Data Group, [Particle Detectors at Accelerators](https://pdg.lbl.gov/2026/reviews/rpp2026-rev-particle-detectors-accel.pdf), Section 35.13 for charged-particle curvature in a uniform magnetic field.
- Particle Data Group, [Physical Constants](https://pdg.lbl.gov/2026/reviews/rpp2026-rev-phys-constants.pdf), including the speed of light and evaluated electron and proton masses.
- Particle Data Group, [Muon listing](https://pdg.lbl.gov/2026/listings/rpp2026-list-muon.pdf), evaluated muon mass and mean life used by this release.
- Particle Data Group, [Meson summary table](https://pdg.lbl.gov/2026/tables/rpp2026-sum-mesons.pdf), evaluated charged-pion mass and mean life used by this release.

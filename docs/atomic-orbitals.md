# Atomic orbitals model card

## Scope

Atomic Orbitals Lab visualizes stationary bound states of a one-electron atom in a Coulomb potential. The current release implements selected real, magnetic-quantum-number `m = 0` eigenstates of the non-relativistic Schrödinger equation for an infinitely massive point nucleus with charge `+e`.

The visualization is a probability-density model. It does not depict an electron following an orbit or reveal a hidden trajectory.

## Equation

The time-independent model solves

```text
[−ℏ²/(2mₑ) ∇² − e²/(4πε₀r)] ψₙₗₘ = Eₙ ψₙₗₘ
```

in atomic length units, where `a₀ = 5.291 772 105 44 × 10⁻¹¹ m`. For the fixed-nucleus Coulomb model,

```text
Eₙ = −Eₕ/(2n²)
```

with the Hartree energy `Eₕ = 27.211 386 245 981 eV`.

The implemented real wavefunctions are analytically normalized over three-dimensional space. Their displayed point density samples `|ψ|²`; blue and orange encode the positive and negative sign of the real wavefunction. The sign is phase information, not positive or negative probability.

## Implemented states

- `1s`: no nodes;
- `2s`: one radial node at `r = 2a₀`;
- `2p z`: one angular node in the `xy` plane;
- `3p z`: one radial and one angular node;
- `3d z²`: two conical angular nodes.

The renderer uses deterministic Metropolis sampling. It discards a burn-in period, thins the chain, and clips the very low-density tail at a state-specific display boundary. Consequently, the cloud is an efficient visual sample of the density inside the displayed domain, not an independent experimental dataset.

## Validation

Automated checks verify:

- the CODATA Bohr radius used by the model;
- the `1/n²` energy relation;
- the analytic radial and angular node locations;
- non-negative finite probability density;
- numerical normalization of every implemented wavefunction over three-dimensional space;
- deterministic probability sampling;
- the analytic `1s` expectation value `⟨r⟩ = 1.5a₀` within sampling tolerance;
- enforcement of the documented display boundary.

## Limitations

The model omits finite proton mass, fine and hyperfine structure, spin, external fields, relativistic corrections, quantum-electrodynamic corrections, nuclear size, time-dependent superpositions, measurement back-action, and electron correlation. It therefore must not be used as a precision spectrum calculator.

The nucleus marker is enlarged and not drawn on the electron-density length scale. Slow rotation changes the camera presentation only; a stationary state does not physically rotate.

For measured or precision-calculated hydrogen levels, use the NIST hydrogen databases rather than the model energy shown here.

## Primary references

- NIST, [Fundamental Physical Constants](https://physics.nist.gov/cuu/Constants/index.html), 2022 CODATA recommended values, database version 9.0. These remain the latest published CODATA adjustment as of 16 August 2026.
- E. Tiesinga et al., [CODATA recommended values of the fundamental physical constants: 2022](https://physics.nist.gov/cuu/pdf/JPCRD2022CODATA.pdf), *Journal of Physical and Chemical Reference Data* 54, 033105 (2025).
- NIST, [Atomic Spectroscopy: An Introduction](https://physics.nist.gov/Pubs/AtSpec/AtSpec.PDF), including hydrogenic state notation and Coulomb energy-level structure.
- NIST, [Atomic Data for Hydrogen](https://physics.nist.gov/PhysRefData/Handbook/Tables/hydrogentable1.htm), evaluated hydrogen ground-state and ionization data.
- NIST Atomic Spectra Database, [Energy Levels of Neutral Hydrogen](https://www.physics.nist.gov/PhysRefData/Handbook/Tables/hydrogentable5_a.htm), evaluated level structure and fine-structure splitting.

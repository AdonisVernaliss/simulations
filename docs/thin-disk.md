# Quasar thin-disk model card

## Scope

Quasar Engine Lab is an analytic baseline for a steady, geometrically thin, optically thick accretion disk around a non-spinning black hole. It calculates radial energy flux and effective temperature. It does not claim to simulate an entire quasar.

The inner edge is fixed at the Schwarzschild innermost stable circular orbit, `rᵢₙ = 6r_g`, where `r_g = GM/c²`. The disk has zero torque at this boundary. The equations used for dissipation are Newtonian; selecting the relativistic ISCO does not make the flux profile a relativistic Novikov-Thorne solution.

## Accretion and luminosity

The luminosity control is an Eddington ratio `λ = L/L_Edd`, with

```text
L_Edd = 4πGMmₚc/σ_T.
```

This form assumes fully ionized hydrogen and opacity dominated by electron scattering. The release defines a Newtonian zero-torque efficiency consistent with its chosen inner radius:

```text
η = GM/(2rᵢₙc²) = 1/12
Ṁ = λL_Edd/(ηc²).
```

Efficiency is a declared model parameter, not a fitted observation. A fully relativistic, zero-spin Novikov-Thorne disk has a different efficiency, approximately `0.057`.

## Radial flux and temperature

The emitted flux from each face of the steady disk is

```text
F(r) = [3GMṀ/(8πr³)] [1 − sqrt(rᵢₙ/r)]
T_eff(r) = [F(r)/σ]^(1/4).
```

Flux is zero at the zero-torque inner edge and reaches its maximum at `r = (49/36)rᵢₙ`. At fixed Eddington ratio and fixed dimensionless radius, the peak temperature scales as `M⁻¹/⁴`.

The displayed local peak wavelength is Wien's displacement value `λ_max = b/T_max` for the hottest annulus. It is not the peak of the integrated, inclination-dependent quasar spectrum.

## Visualization

Colour is a false-colour encoding of calculated effective temperature. It is not a prediction of visible RGB appearance. To keep the hot inner disk legible on small screens, rendered radius is proportional to `sqrt(r)` and the displayed profile ends at `140r_g`; physical values are still evaluated at their labelled radii.

The renderer is event-driven and uses Canvas 2D. It redraws only after a resize or parameter change, avoiding a permanent animation loop.

## Validation

Automated checks verify:

- zero flux at the inner boundary;
- the analytic flux maximum at `(49/36)rᵢₙ`;
- `M⁻¹/⁴` temperature scaling at fixed Eddington ratio;
- consistency of `L = ηṀc² = λL_Edd`.

## Limitations

The model omits general-relativistic transfer, Doppler beaming, gravitational redshift, light bending, black-hole spin, returning radiation, spectral hardening, disk atmosphere, self-gravity, winds, advection, time variability, magnetic fields, magnetohydrodynamic turbulence, a hot corona, broad emission lines, dust, and jets.

The thin-disk and local-blackbody assumptions become unreliable in important real systems, particularly near the Eddington limit and in radiatively inefficient low-accretion states. Observed quasar disk sizes can also differ from basic thin-disk predictions. The model should therefore support derivations and comparisons, not precision fitting of an observed quasar.

## Primary references

- N. I. Shakura and R. A. Sunyaev, [Black holes in binary systems. Observational appearance](https://ui.adsabs.harvard.edu/abs/1973A%26A....24..337S/abstract), *Astronomy and Astrophysics* 24 (1973), 337–355; foundational steady thin-disk model.
- M. A. Abramowicz and P. C. Fragile, [Foundations of Black Hole Accretion Disk Theory](https://pmc.ncbi.nlm.nih.gov/articles/PMC5256006/), *Living Reviews in Relativity* 16 (2013), 1; thin, relativistic, slim, and radiatively inefficient disk regimes.
- International Astronomical Union, [Resolution B3 on recommended nominal conversion constants](https://www.iau.org/static/resolutions/IAU2015_English.pdf), 2015; nominal solar mass parameter.
- C. W. Morgan et al., [The Quasar Accretion Disk Size–Black Hole Mass Relation](https://arxiv.org/abs/1002.4160), *The Astrophysical Journal* 712 (2010), 1129–1136; observational comparison with thin-disk size and temperature scaling.

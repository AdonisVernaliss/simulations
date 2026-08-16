import type { BodyDefinition } from './types';

export interface SimulationPreset {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly bodies: readonly BodyDefinition[];
  readonly fixedStep: number;
  readonly timeScale: number;
  readonly cameraDistance: number;
  readonly trailSpan: number;
}

const body = (definition: BodyDefinition): BodyDefinition => definition;

export const presets = [
  {
    id: 'solar-system',
    name: 'Idealized solar system',
    summary: 'JPL-derived mass ratios and orbital scales in a circular, coplanar model.',
    fixedStep: 0.0025,
    timeScale: 0.42,
    cameraDistance: 18,
    trailSpan: 24,
    bodies: [
      body({
        id: 'sun',
        name: 'Sun',
        mass: 1,
        radius: 0.28,
        color: '#ffd685',
        position: [-0.007699403501298644, 0, 0],
        velocity: [0, -0.000517572696914696, 0],
      }),
      body({
        id: 'mercury',
        name: 'Mercury',
        mass: 1.66012082546e-7,
        radius: 0.045,
        color: '#b9aca0',
        position: [0.38709927, 0, 0],
        velocity: [0, 1.6072699454, 0],
      }),
      body({
        id: 'venus',
        name: 'Venus',
        mass: 2.4478382878e-6,
        radius: 0.07,
        color: '#e7b675',
        position: [0.72333566, 0, 0],
        velocity: [0, 1.17579081149, 0],
      }),
      body({
        id: 'earth',
        name: 'Earth',
        mass: 3.00348961546e-6,
        radius: 0.075,
        color: '#6ca9ff',
        position: [1.00000261, 0, 0],
        velocity: [0, 0.999998695003, 0],
      }),
      body({
        id: 'mars',
        name: 'Mars',
        mass: 3.22715608293e-7,
        radius: 0.057,
        color: '#df7557',
        position: [1.52371034, 0, 0],
        velocity: [0, 0.810118952798, 0],
      }),
      body({
        id: 'jupiter',
        name: 'Jupiter',
        mass: 9.54791909941e-4,
        radius: 0.15,
        color: '#deb488',
        position: [5.202887, 0, 0],
        velocity: [0, 0.438407326353, 0],
      }),
      body({
        id: 'saturn',
        name: 'Saturn',
        mass: 2.85885670025e-4,
        radius: 0.13,
        color: '#e8d09b',
        position: [9.53667594, 0, 0],
        velocity: [0, 0.323818373694, 0],
      }),
    ],
  },
  {
    id: 'binary-stars',
    name: 'Binary stars',
    summary: 'Two equal stars orbit their shared center of mass.',
    fixedStep: 0.0025,
    timeScale: 0.7,
    cameraDistance: 5.5,
    trailSpan: 12,
    bodies: [
      body({
        id: 'amber-star',
        name: 'Amber star',
        mass: 1,
        radius: 0.16,
        color: '#ffc66d',
        position: [-1, 0, 0],
        velocity: [0, -0.5, 0],
      }),
      body({
        id: 'blue-star',
        name: 'Blue star',
        mass: 1,
        radius: 0.16,
        color: '#82b8ff',
        position: [1, 0, 0],
        velocity: [0, 0.5, 0],
      }),
    ],
  },
  {
    id: 'figure-eight',
    name: 'Figure eight',
    summary: 'Three identical bodies trace a stable choreographic orbit.',
    fixedStep: 0.0015,
    timeScale: 0.55,
    cameraDistance: 4.8,
    trailSpan: 10,
    bodies: [
      body({
        id: 'body-a',
        name: 'Body A',
        mass: 1,
        radius: 0.1,
        color: '#ff8f70',
        position: [-0.97000436, 0.24308753, 0],
        velocity: [0.466203685, 0.43236573, 0],
      }),
      body({
        id: 'body-b',
        name: 'Body B',
        mass: 1,
        radius: 0.1,
        color: '#79d9ff',
        position: [0.97000436, -0.24308753, 0],
        velocity: [0.466203685, 0.43236573, 0],
      }),
      body({
        id: 'body-c',
        name: 'Body C',
        mass: 1,
        radius: 0.1,
        color: '#bc96ff',
        position: [0, 0, 0],
        velocity: [-0.93240737, -0.86473146, 0],
      }),
    ],
  },
] as const satisfies readonly SimulationPreset[];

export type PresetId = (typeof presets)[number]['id'];

export const getPreset = (id: string): SimulationPreset =>
  presets.find((preset) => preset.id === id) ?? presets[0];

// Simulation Configuration & Environmental Constants
export const CONFIG = {
    N: 5,
    R: 1.0,
    D: 2.02,
    L: 10.0,
    PIVOT_Y: 12.0,
    SPREAD: 2.5,
    GRAVITY: 9.81,
    MASS: 1.0,
    DAMPING_REAL: 0.9999,
    PHYSICS_SUBSTEPS: 60,
    WAVE_SPEED: 40.0
};

// Application State Enums
export const MODES = { REALISTIC: 1, ENERGY: 2, FORCES: 3, DEBUG: 4, SPLIT: 5 };
export const LAYERS = { COMMON: 0, REAL: 1, ENERGY: 2, FORCES: 3, DEBUG: 4 };
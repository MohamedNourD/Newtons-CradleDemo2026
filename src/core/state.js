import { MODES } from './config.js';

// Reactive Global Application State
export const STATE = {
    mode: MODES.REALISTIC,
    paused: false,
    stepRequested: false,
    timeScale: 1.0,
    selectedId: 0,
    isDragging: false,
    baselineEnergy: 0,
    sysKE: 0,
    sysPE: 0,
    sysTotal: 0,
    energyError: 0,
    optVel: true,
    optMom: true,
    optForce: true,
    optBars: true,
    optNet: true,
    graphMode: 'system',
    isAnomalousMode: false,
    activeAnomalyCase: 1
};

import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { STATE } from '../core/state.js';

export class PhysicsEngine {
    constructor(audioEngine) {
        this.audio = audioEngine;
        this.balls = [];
        this.collisionEvents = [];

        for (let i = 0; i < CONFIG.N; i++) {
            const pivotX = (i - (CONFIG.N - 1) / 2) * CONFIG.D;
            this.balls.push({
                id: i,
                pivotX,
                theta: 0,
                omega: 0,
                pos: new THREE.Vector3(pivotX, CONFIG.PIVOT_Y - CONFIG.L, 0),
                ke: 0,
                pe: 0
            });
        }
    }

    calculateEnergy() {
        let cumulativeKE = 0;
        let cumulativePE = 0;

        this.balls.forEach(ball => {
            const linearVelocity = ball.omega * CONFIG.L;
            ball.ke = 0.5 * CONFIG.MASS * linearVelocity * linearVelocity;
            ball.pe = CONFIG.MASS * CONFIG.GRAVITY * (CONFIG.L - CONFIG.L * Math.cos(ball.theta));

            cumulativeKE += ball.ke;
            cumulativePE += ball.pe;
        });

        STATE.sysKE = cumulativeKE;
        STATE.sysPE = cumulativePE;
        STATE.sysTotal = cumulativeKE + cumulativePE;

        if (STATE.baselineEnergy > 0) {
            STATE.energyError = ((STATE.sysTotal - STATE.baselineEnergy) / STATE.baselineEnergy) * 100;
        } else {
            STATE.energyError = 0;
        }
    }

    normalizeEnergy() {
        if (!STATE.optConserve || STATE.isDragging || STATE.baselineEnergy === 0) return;

        const targetKE = STATE.baselineEnergy - STATE.sysPE;
        if (targetKE <= 0 || STATE.sysKE <= 0) return;

        const correctionRatio = Math.sqrt(targetKE / STATE.sysKE);
        if (Math.abs(1.0 - correctionRatio) < 0.1) {
            this.balls.forEach(ball => {
                if (Math.abs(ball.omega) > 0.01) ball.omega *= correctionRatio;
            });
        }
        this.calculateEnergy();
    }

    step(dt) {
        if (STATE.paused && !STATE.stepRequested) return;

        const subDeltaTime = (dt * STATE.timeScale) / CONFIG.PHYSICS_SUBSTEPS;
        this.collisionEvents = []; 
        let frameImpulseDetected = false;

        // Substepping integration loop
        for (let step = 0; step < CONFIG.PHYSICS_SUBSTEPS; step++) {
            this.balls.forEach((ball) => {
                if (ball.id === STATE.selectedId && STATE.isDragging) {
                    ball.omega = 0;
                } else {
                    const angularAcceleration = -(CONFIG.GRAVITY / CONFIG.L) * Math.sin(ball.theta);
                    ball.omega += angularAcceleration * subDeltaTime;

                    if (!STATE.optConserve) ball.omega *= CONFIG.DAMPING_REAL;
                    ball.theta += ball.omega * subDeltaTime;
                }
                ball.pos.set(
                    ball.pivotX + CONFIG.L * Math.sin(ball.theta),
                    CONFIG.PIVOT_Y - CONFIG.L * Math.cos(ball.theta),
                    0
                );
            });

            // Boundary Constraint Resolver passes
            for (let pass = 0; pass < 3; pass++) {
                for (let i = 0; i < CONFIG.N - 1; i++) {
                    const b1 = this.balls[i];
                    const b2 = this.balls[i + 1];
                    const dx = b2.pos.x - b1.pos.x;
                    const dy = b2.pos.y - b1.pos.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 2 * CONFIG.R) {
                        // 1. Positional Correction Constraint (Resolve Overlap)
                        const overlapTheta = (2 * CONFIG.R - distance) / CONFIG.L;

                        if (i === STATE.selectedId && STATE.isDragging) {
                            b2.theta += overlapTheta;
                        } else if (i + 1 === STATE.selectedId && STATE.isDragging) {
                            b1.theta -= overlapTheta;
                        } else {
                            b1.theta -= overlapTheta / 2;
                            b2.theta += overlapTheta / 2;
                        }

                        b1.pos.set(b1.pivotX + CONFIG.L * Math.sin(b1.theta), CONFIG.PIVOT_Y - CONFIG.L * Math.cos(b1.theta), 0);
                        b2.pos.set(b2.pivotX + CONFIG.L * Math.sin(b2.theta), CONFIG.PIVOT_Y - CONFIG.L * Math.cos(b2.theta), 0);

                        // 2. True Velocity Impulse Solver
                        const normalX = dx / distance;
                        const normalY = dy / distance;

                        let v1x = CONFIG.L * b1.omega * Math.cos(b1.theta);
                        let v1y = CONFIG.L * b1.omega * Math.sin(b1.theta);
                        let v2x = CONFIG.L * b2.omega * Math.cos(b2.theta);
                        let v2y = CONFIG.L * b2.omega * Math.sin(b2.theta);

                        const relativeVelocityNormal = (v2x - v1x) * normalX + (v2y - v1y) * normalY;

                        if (relativeVelocityNormal < 0) {
                            const restitution = 1.0; 
                            const j = -(1 + restitution) * relativeVelocityNormal / (1/CONFIG.MASS + 1/CONFIG.MASS);

                            if (Math.abs(j) > 0.15) {
                                if (this.audio) {
                                    this.audio.playCollision({
                                        impulse: j,
                                        pos: b1.pos.clone().lerp(b2.pos, 0.5),
                                        dir: b1.omega > 0 ? 1 : -1
                                    });
                                }

                                if (!frameImpulseDetected) {
                                    frameImpulseDetected = true;
                                    this.collisionEvents.push({
                                        b1Id: i,
                                        b2Id: i + 1,
                                        pos: b1.pos.clone().lerp(b2.pos, 0.5),
                                        normal: new THREE.Vector3(normalX, normalY, 0),
                                        impulse: j,
                                        v1_in: Math.sqrt(v1x * v1x + v1y * v1y) * Math.sign(b1.omega),
                                        v2_in: Math.sqrt(v2x * v2x + v2y * v2y) * Math.sign(b2.omega),
                                        dir: b1.omega > 0 ? 1 : -1
                                    });
                                }
                            }

                            // Apply Velocity correction
                            v1x -= (j / CONFIG.MASS) * normalX;
                            v1y -= (j / CONFIG.MASS) * normalY;
                            v2x += (j / CONFIG.MASS) * normalX;
                            v2y += (j / CONFIG.MASS) * normalY;

                            b1.omega = (v1x * Math.cos(b1.theta) + v1y * Math.sin(b1.theta)) / CONFIG.L;
                            b2.omega = (v2x * Math.cos(b2.theta) + v2y * Math.sin(b2.theta)) / CONFIG.L;
                        }
                    }
                }
            }
        }

        this.calculateEnergy();
        this.normalizeEnergy();
        STATE.stepRequested = false;
    }
}
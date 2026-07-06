import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { STATE } from '../core/state.js';

export class AnomalousPhysicsEngine {
    constructor(audioEngine, anomalyCase = 1) {
        this.audio = audioEngine;
        this.anomalyCase = anomalyCase; 
        this.balls = [];
        this.collisionEvents = [];
        this.initCase();
    }

    initCase() {
        this.balls = [];
        this.collisionEvents = [];

        // خطوة تمهيدية لحساب الكتل والأنصاف أقطار ونقاط التعليق التراكمية ديناميكياً
        let masses = [];
        let radii = [];
        let lengths = [];
        let gravityLocals = [];
        let magneticCharges = [];
        let restitutions = [];
        let thetas = [];

        for (let i = 0; i < CONFIG.N; i++) {
            masses.push(CONFIG.MASS);
            radii.push(CONFIG.R);
            lengths.push(CONFIG.L);
            gravityLocals.push(CONFIG.GRAVITY);
            magneticCharges.push(0.0);
            restitutions.push(1.0);
            thetas.push(0);

            if (this.anomalyCase === 1) {
                masses[i] = CONFIG.MASS * (1.0 + i * 0.75); 
                // حساب نصف القطر الفيزيائي الدقيق بناءً على تغير الكتلة (الحفاظ على الكثافة متساوية)
                radii[i] = CONFIG.R * Math.cbrt(masses[i] / CONFIG.MASS);
                if (i === 0) thetas[i] = -Math.PI / 4;
            } else if (this.anomalyCase === 2) {
                lengths[i] = CONFIG.L - (i * 0.5); 
                thetas[i] = -Math.PI / 6; 
            } else if (this.anomalyCase === 3) {
                if (i === 0) thetas[i] = -Math.PI / 3;
                if (i === CONFIG.N - 1) thetas[i] = Math.PI / 4;
            } else if (this.anomalyCase === 4) {
                restitutions[i] = Math.max(0.0, 0.95 - (i * 0.22)); 
                if (i === 0) thetas[i] = -Math.PI / 4;
            } else if (this.anomalyCase === 5) {
                magneticCharges[i] = 8.0; 
                if (i === 0) thetas[i] = -Math.PI / 4;
            } else if (this.anomalyCase === 6) {
                // تدرج الجاذبية يحتاج مسافات افتراضية لحساب الموضع المبدئي
                const tempPivotX = (i - (CONFIG.N - 1) / 2) * CONFIG.D;
                gravityLocals[i] = CONFIG.GRAVITY * (1.0 + (tempPivotX / 8.0));
                thetas[i] = -Math.PI / 5; 
            } else if (this.anomalyCase === 7) {
                if (i === 0) thetas[i] = -Math.PI / 4;
            }
        }

        // حساب نقاط التعليق الاحترافية (Pivots) لضمان عدم التداخل عند السكون مطلقاً
        let totalWidth = 0;
        if (this.anomalyCase === 1) {
            // في حالة الأوزان المختلفة، المسافة بين أي نقطتي تعليق متجاورتين يجب أن تساوي مجموع نصف قطري الكرتين تماماً
            for (let i = 0; i < CONFIG.N - 1; i++) {
                totalWidth += (radii[i] + radii[i+1]);
            }
        } else {
            totalWidth = (CONFIG.N - 1) * CONFIG.D;
        }

        let startX = -totalWidth / 2;
        let currentPivotX = startX;

        for (let i = 0; i < CONFIG.N; i++) {
            let pivotX = currentPivotX;
            // تحديث الإحداثي التالي بناءً على نصف قطر الكرة الحالية والتالية
            if (this.anomalyCase === 1 && i < CONFIG.N - 1) {
                currentPivotX += (radii[i] + radii[i+1]);
            } else {
                currentPivotX += CONFIG.D;
            }

            let initPos = new THREE.Vector3(pivotX, CONFIG.PIVOT_Y - lengths[i], 0);
            let initVel = new THREE.Vector3(0, 0, 0);

            if (this.anomalyCase === 7 && i === 0) {
                initPos.set(
                    pivotX + lengths[i] * Math.sin(thetas[i]),
                    CONFIG.PIVOT_Y - lengths[i] * Math.cos(thetas[i]),
                    1.8 
                );
                initPos.sub(new THREE.Vector3(pivotX, CONFIG.PIVOT_Y, 0)).normalize().multiplyScalar(lengths[i]).add(new THREE.Vector3(pivotX, CONFIG.PIVOT_Y, 0));
                initVel.set(0, 0, 3.2); 
            } else {
                initPos.set(
                    pivotX + lengths[i] * Math.sin(thetas[i]),
                    CONFIG.PIVOT_Y - lengths[i] * Math.cos(thetas[i]),
                    0
                );
            }

            this.balls.push({
                id: i,
                pivotX,
                theta: thetas[i],
                mass: masses[i],
                radius: radii[i], // حقن نصف القطر المخصص ديناميكياً لتصحيح معادلة التصادم
                length: lengths[i],
                restitution: restitutions[i],
                magneticCharge: magneticCharges[i],
                gravityLocal: gravityLocals[i],
                pos: initPos.clone(),
                vel: initVel.clone(),
                force: new THREE.Vector3(0, 0, 0),
                ke: 0,
                pe: 0
            });
        }
        
        this.calculateEnergy();
        STATE.baselineEnergy = STATE.sysTotal;
    }

    calculateEnergy() {
        let cumulativeKE = 0;
        let cumulativePE = 0;

        this.balls.forEach(ball => {
            ball.ke = 0.5 * ball.mass * ball.vel.lengthSq();
            const initialY = CONFIG.PIVOT_Y - ball.length;
            ball.pe = ball.mass * ball.gravityLocal * (ball.pos.y - initialY);

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

    step(dt) {
        if (STATE.paused && !STATE.stepRequested) return;

        const subDeltaTime = (dt * STATE.timeScale) / CONFIG.PHYSICS_SUBSTEPS;
        this.collisionEvents = []; 
        let frameImpulseDetected = false;

        for (let step = 0; step < CONFIG.PHYSICS_SUBSTEPS; step++) {
            
            this.balls.forEach(ball => {
                ball.force.set(0, -ball.gravityLocal * ball.mass, 0);
            });

            if (this.anomalyCase === 5) {
                for (let i = 0; i < CONFIG.N; i++) {
                    for (let j = 0; j < CONFIG.N; j++) {
                        if (i === j) continue;
                        const b1 = this.balls[i];
                        const b2 = this.balls[j];
                        const toB1 = new THREE.Vector3().subVectors(b1.pos, b2.pos);
                        const dist = toB1.length();
                        
                        if (dist > 0.05) {
                            const forceMag = (b1.magneticCharge * b2.magneticCharge) / (dist * dist);
                            b1.force.addScaledVector(toB1.normalize(), forceMag);
                        }
                    }
                }
            }

            this.balls.forEach((ball) => {
                if (ball.id === STATE.selectedId && STATE.isDragging) {
                    ball.vel.set(0, 0, 0);
                } else {
                    ball.vel.addScaledVector(ball.force, subDeltaTime / ball.mass);
                    if (!STATE.optConserve) ball.vel.multiplyScalar(CONFIG.DAMPING_REAL);
                    ball.pos.addScaledVector(ball.vel, subDeltaTime);

                    const pivot = new THREE.Vector3(ball.pivotX, CONFIG.PIVOT_Y, 0);
                    const toBall = new THREE.Vector3().subVectors(ball.pos, pivot);
                    toBall.normalize();
                    
                    ball.pos.copy(pivot).addScaledVector(toBall, ball.length);

                    const radialVel = ball.vel.dot(toBall);
                    ball.vel.addScaledVector(toBall, -radialVel);
                }

                ball.theta = Math.atan2(ball.pos.x - ball.pivotX, CONFIG.PIVOT_Y - ball.pos.y);
            });

            // حل التصادمات الميكانيكية بالاعتماد الكامل على أنصاف الأقطار الديناميكية المشتقة
            for (let pass = 0; pass < 4; pass++) { 
                for (let i = 0; i < CONFIG.N - 1; i++) {
                    const b1 = this.balls[i];
                    const b2 = this.balls[i + 1];
                    
                    const toNext = new THREE.Vector3().subVectors(b2.pos, b1.pos);
                    const distance = toNext.length();
                    // تعديل جوهري: المسافة الدنيا الآمنة هي مجموع نصفي قطري الكرتين المعنيتين بالتصادم
                    const minDist = b1.radius + b2.radius;

                    if (distance < minDist) {
                        const normal = toNext.normalize();
                        const overlap = minDist - distance;

                        const totalM = b1.mass + b2.mass;
                        if (!(i === STATE.selectedId && STATE.isDragging)) {
                            b1.pos.addScaledVector(normal, -overlap * (b2.mass / totalM));
                        }
                        if (!(i + 1 === STATE.selectedId && STATE.isDragging)) {
                            b2.pos.addScaledVector(normal, overlap * (b1.mass / totalM));
                        }

                        const relativeVelocity = new THREE.Vector3().subVectors(b2.vel, b1.vel);
                        const velAlongNormal = relativeVelocity.dot(normal);

                        if (velAlongNormal < 0) {
                            const currentRestitution = Math.min(b1.restitution, b2.restitution);
                            const j = -(1 + currentRestitution) * velAlongNormal / (1 / b1.mass + 1 / b2.mass);

                            if (Math.abs(j) > 0.15) {
                                if (this.audio) {
                                    this.audio.playCollision({
                                        impulse: j,
                                        pos: b1.pos.clone().lerp(b2.pos, 0.5),
                                        dir: b1.vel.x > 0 ? 1 : -1
                                    });
                                }

                                if (!frameImpulseDetected) {
                                    frameImpulseDetected = true;
                                    this.collisionEvents.push({
                                        b1Id: i,
                                        b2Id: i + 1,
                                        pos: b1.pos.clone().lerp(b2.pos, 0.5),
                                        normal: normal.clone(),
                                        impulse: j,
                                        v1_in: b1.vel.dot(normal),
                                        v2_in: b2.vel.dot(normal),
                                        dir: b1.vel.x > 0 ? 1 : -1
                                    });
                                }
                            }

                            b1.vel.addScaledVector(normal, -(j / b1.mass));
                            b2.vel.addScaledVector(normal, (j / b2.mass));
                        }
                    }
                }
            }
        }

        this.calculateEnergy();

        if (STATE.optConserve && !STATE.isDragging && STATE.baselineEnergy > 0 && this.anomalyCase !== 4) {
            const targetKE = STATE.baselineEnergy - STATE.sysPE;
            if (targetKE > 0 && STATE.sysKE > 0) {
                const correctionRatio = Math.sqrt(targetKE / STATE.sysKE);
                if (Math.abs(1.0 - correctionRatio) < 0.1) {
                    this.balls.forEach(ball => {
                        ball.vel.multiplyScalar(correctionRatio);
                    });
                }
            }
        }
        STATE.stepRequested = false;
    }
}
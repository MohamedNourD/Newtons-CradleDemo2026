import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { STATE } from '../core/state.js';

export class AnomalousPhysicsEngine {
    constructor(audioEngine, anomalyCase = 1) {
        this.audio = audioEngine;
        this.anomalyCase = anomalyCase; // 1: أوزان مختلفة، 2: أطوال خيوط مختلفة، 3: حركة شاذة (سعات غير خطية)
        this.balls = [];
        this.collisionEvents = [];
        this.initCase();
    }

    initCase() {
        this.balls = [];
        this.collisionEvents = [];

        for (let i = 0; i < CONFIG.N; i++) {
            const pivotX = (i - (CONFIG.N - 1) / 2) * CONFIG.D;
            
            // تخصيص الافتراضيات لكل حالة شاذة
            let mass = CONFIG.MASS;
            let length = CONFIG.L;
            let theta = 0;

            if (this.anomalyCase === 1) {
                // الحالة 1: كرات مختلفة الوزن (تدرج تصاعدي في الكتلة)
                mass = CONFIG.MASS * (1.0 + i * 0.75); 
                if (i === 0) theta = -Math.PI / 4; // إزاحة الكرة الأولى
            } else if (this.anomalyCase === 2) {
                // الحالة 2: أطوال خيوط مختلفة (بندول ويف / موجي جليلي)
                // اختلاف الأطوال يغير التردد الطبيعي: T = 2*pi*sqrt(L/g)
                length = CONFIG.L - (i * 0.8); 
                // نزيحهم معاً لنرى تباعد الأطوار الموجي التشعبي لاحقاً
                theta = -Math.PI / 6; 
            } else if (this.anomalyCase === 3) {
                // الحالة 3: حركة وزوايا شاذة (سعات ضخمة غير خطية تصطدم في أوقات غير متزامنة)
                mass = CONFIG.MASS;
                length = CONFIG.L;
                if (i === 0) theta = -Math.PI / 3;  // سعة قصوى يسار
                if (i === CONFIG.N - 1) theta = Math.PI / 4; // سعة يمين متداخلة لخلخلة التزامن
            }

            this.balls.push({
                id: i,
                pivotX,
                theta,
                omega: 0,
                mass,
                length,
                pos: new THREE.Vector3(pivotX, CONFIG.PIVOT_Y - length, 0),
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
            const linearVelocity = ball.omega * ball.length;
            ball.ke = 0.5 * ball.mass * linearVelocity * linearVelocity;
            ball.pe = ball.mass * CONFIG.GRAVITY * (ball.length - ball.length * Math.cos(ball.theta));

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
            // 1. التكامل العددي المعزول لكل كرة
            this.balls.forEach((ball) => {
                if (ball.id === STATE.selectedId && STATE.isDragging) {
                    ball.omega = 0;
                } else {
                    // العجلة الزاوية تعتمد على الطول الفعلي للكرة alpha = -(g/L)*sin(theta)
                    const angularAcceleration = -(CONFIG.GRAVITY / ball.length) * Math.sin(ball.theta);
                    ball.omega += angularAcceleration * subDeltaTime;

                    if (!STATE.optConserve) ball.omega *= CONFIG.DAMPING_REAL;
                    ball.theta += ball.omega * subDeltaTime;
                }
                ball.pos.set(
                    ball.pivotX + ball.length * Math.sin(ball.theta),
                    CONFIG.PIVOT_Y - ball.length * Math.cos(ball.theta),
                    0
                );
            });

            // 2. حل التصادمات المرنة لحساب الكتل المختلفة والأطوال المختلفة (Impulse Resolver)
            for (let pass = 0; pass < 4; pass++) { 
                for (let i = 0; i < CONFIG.N - 1; i++) {
                    const b1 = this.balls[i];
                    const b2 = this.balls[i + 1];
                    const dx = b2.pos.x - b1.pos.x;
                    const dy = b2.pos.y - b1.pos.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const minDist = CONFIG.R * 2;

                    if (distance < minDist) {
                        // حل التداخل الميكانيكي الفوري
                        const overlapTheta1 = ((minDist - distance) / b1.length);
                        const overlapTheta2 = ((minDist - distance) / b2.length);

                        if (i === STATE.selectedId && STATE.isDragging) {
                            b2.theta += overlapTheta2;
                        } else if (i + 1 === STATE.selectedId && STATE.isDragging) {
                            b1.theta -= overlapTheta1;
                        } else {
                            // التوزيع بناء على نسبة الكتل لصحته ميكانيكياً
                            const totalM = b1.mass + b2.mass;
                            b1.theta -= overlapTheta1 * (b2.mass / totalM);
                            b2.theta += overlapTheta2 * (b1.mass / totalM);
                        }

                        b1.pos.set(b1.pivotX + b1.length * Math.sin(b1.theta), CONFIG.PIVOT_Y - b1.length * Math.cos(b1.theta), 0);
                        b2.pos.set(b2.pivotX + b2.length * Math.sin(b2.theta), CONFIG.PIVOT_Y - b2.length * Math.cos(b2.theta), 0);

                        // حساب متجهات السرعة الخطية والتصادم المرن غير متساوي الكتل
                        const normalX = dx / distance;
                        const normalY = dy / distance;

                        let v1x = b1.length * b1.omega * Math.cos(b1.theta);
                        let v1y = b1.length * b1.omega * Math.sin(b1.theta);
                        let v2x = b2.length * b2.omega * Math.cos(b2.theta);
                        let v2y = b2.length * b2.omega * Math.sin(b2.theta);

                        const relativeVelocityNormal = (v2x - v1x) * normalX + (v2y - v1y) * normalY;

                        if (relativeVelocityNormal < 0) {
                            const restitution = 1.0; 
                            // معادلة النبض لكتل مختلفة: j = -(1+e)*Vrel / (1/m1 + 1/m2)
                            const j = -(1 + restitution) * relativeVelocityNormal / (1 / b1.mass + 1 / b2.mass);

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

                            // تعديل السرعات بناءً على نبض التصادم والكتلة الفردية لكل كرة
                            v1x -= (j / b1.mass) * normalX;
                            v1y -= (j / b1.mass) * normalY;
                            v2x += (j / b2.mass) * normalX;
                            v2y += (j / b2.mass) * normalY;

                            b1.omega = (v1x * Math.cos(b1.theta) + v1y * Math.sin(b1.theta)) / b1.length;
                            b2.omega = (v2x * Math.cos(b2.theta) + v2y * Math.sin(b2.theta)) / b2.length;
                        }
                    }
                }
            }
        }

        this.calculateEnergy();
        if (STATE.optConserve && !STATE.isDragging && STATE.baselineEnergy > 0) {
            // تثبيت خوارزمي متناسب مع الكتل الكلية للنظام الشاذ
            const targetKE = STATE.baselineEnergy - STATE.sysPE;
            if (targetKE > 0 && STATE.sysKE > 0) {
                const correctionRatio = Math.sqrt(targetKE / STATE.sysKE);
                if (Math.abs(1.0 - correctionRatio) < 0.1) {
                    this.balls.forEach(ball => {
                        if (Math.abs(ball.omega) > 0.01) ball.omega *= correctionRatio;
                    });
                }
            }
        }
        STATE.stepRequested = false;
    }
}
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

        for (let i = 0; i < CONFIG.N; i++) {
            const pivotX = (i - (CONFIG.N - 1) / 2) * CONFIG.D;
            
            let mass = CONFIG.MASS;
            let length = CONFIG.L;
            let theta = 0;
            let restitution = 1.0; 
            let magneticCharge = 0.0; 
            let gravityLocal = CONFIG.GRAVITY;

            // كينماتيكا فضائية متجهية نقية ثلاثية الأبعاد
            let initPos = new THREE.Vector3(pivotX, CONFIG.PIVOT_Y - length, 0);
            let initVel = new THREE.Vector3(0, 0, 0);

            // تحسين معايير الحالات الفيزيائية (1-7) لتعطي أوضح وأدق استجابة ميكانيكية
            if (this.anomalyCase === 1) {
                // الحالة 1: تدرج كتل حقيقي (الكرة الأخيرة أثقل بـ 4 أضعاف لتوضيح ارتداد الزخم العكسي)
                mass = CONFIG.MASS * (1.0 + i * 0.75); 
                if (i === 0) theta = -Math.PI / 4;
            } else if (this.anomalyCase === 2) {
                // الحالة 2: بندول ويف الموجي (حساب الأطوال بدقة لإنتاج موجة توافقية متزامنة ومتداخلة بصرياً)
                length = CONFIG.L - (i * 0.5); 
                theta = -Math.PI / 6; 
            } else if (this.anomalyCase === 3) {
                // الحالة 3: حركة فوضوية متداخلة السعات بزوايا متقابلة
                if (i === 0) theta = -Math.PI / 3;
                if (i === CONFIG.N - 1) theta = Math.PI / 4;
            } else if (this.anomalyCase === 4) {
                // الحالة 4: تصادم لدن مشتت للطاقة الحرارية (امتصاص النبض الميكانيكي)
                restitution = Math.max(0.0, 0.95 - (i * 0.22)); 
                if (i === 0) theta = -Math.PI / 4;
            } else if (this.anomalyCase === 5) {
                // الحالة 5: الحقل المغناطيسي المتنافر (قوة تنافر ناعمة ومتزنة تمنع التلامس)
                magneticCharge = 8.0; 
                if (i === 0) theta = -Math.PI / 4;
            } else if (this.anomalyCase === 6) {
                // الحالة 6: تدرج الجاذبية الموضعي اللامركزي g(x)
                gravityLocal = CONFIG.GRAVITY * (1.0 + (pivotX / 8.0));
                theta = -Math.PI / 5; 
            } else if (this.anomalyCase === 7) {
                // الحالة 7: البندول الكروي الحقيقي ذو المدار الإهليلجي المستقر الفضائي
                if (i === 0) {
                    theta = -Math.PI / 4; 
                    initPos.set(
                        pivotX + length * Math.sin(theta),
                        CONFIG.PIVOT_Y - length * Math.cos(theta),
                        1.8 
                    );
                    // قيد الطول الصارم للخيط هندسياً
                    const currentLength = Math.sqrt(Math.pow(initPos.x - pivotX, 2) + Math.pow(initPos.y - CONFIG.PIVOT_Y, 2) + Math.pow(initPos.z, 2));
                    initPos.sub(new THREE.Vector3(pivotX, CONFIG.PIVOT_Y, 0)).normalize().multiplyScalar(length).add(new THREE.Vector3(pivotX, CONFIG.PIVOT_Y, 0));
                    // سرعة مدارية مماثلة متعامدة لإنشاء مسار ثلاثي الأبعاد هندسي دقيق
                    initVel.set(0, 0, 3.2); 
                }
            }

            if (this.anomalyCase !== 7) {
                initPos.set(
                    pivotX + length * Math.sin(theta),
                    CONFIG.PIVOT_Y - length * Math.cos(theta),
                    0
                );
            }

            this.balls.push({
                id: i,
                pivotX,
                theta,
                mass,
                length,
                restitution,
                magneticCharge,
                gravityLocal,
                pos: initPos.clone(),
                vel: initVel.clone(),
                force: new THREE.Vector3(0, 0, 0), // مجمع القوى اللحظي
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
            
            // 1. تصفير وحساب القوى الخارجية والبينية (قوى الجاذبية والتنافر المغناطيسي)
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
                            // قانون كولوم المغناطيسي ثنائي القطب النقي: F = (q1 * q2) / r^2
                            const forceMag = (b1.magneticCharge * b2.magneticCharge) / (dist * dist);
                            b1.force.addScaledVector(toB1.normalize(), forceMag);
                        }
                    }
                }
            }

            // 2. التكامل الحركي المتجهي وتطبيق القيود الصلبة للبندول الكروي (Semi-implicit Verlet integration)
            this.balls.forEach((ball) => {
                if (ball.id === STATE.selectedId && STATE.isDragging) {
                    ball.vel.set(0, 0, 0);
                } else {
                    // تحديث السرعة المبدئية بواسطة القوى المؤثرة: v = v + (F/m)*dt
                    ball.vel.addScaledVector(ball.force, subDeltaTime / ball.mass);

                    if (!STATE.optConserve) ball.vel.multiplyScalar(CONFIG.DAMPING_REAL);

                    // تحديث الموقع الفضائي المبدئي: x = x + v*dt
                    ball.pos.addScaledVector(ball.vel, subDeltaTime);

                    // تطبيق قيد طول الخيط الصارم هندسياً من مركز التعليق (Pivot)
                    const pivot = new THREE.Vector3(ball.pivotX, CONFIG.PIVOT_Y, 0);
                    const toBall = new THREE.Vector3().subVectors(ball.pos, pivot);
                    toBall.normalize();
                    
                    ball.pos.copy(pivot).addScaledVector(toBall, ball.length);

                    // تصحيح السرعة المتجهية: القضاء على السرعة القطرية (Radial Velocity) الناتجة عن تمدد القيد
                    // لتبقى حركة الكرة دائماً مماسية مائة بالمائة لسطح الكرة القيدية الفضائية
                    const radialVel = ball.vel.dot(toBall);
                    ball.vel.addScaledVector(toBall, -radialVel);
                }

                // تحديث الزاوية لإبقاء الرسوميات ثنائية الأبعاد متزامنة مع قراءة الطاقة والـ DOM
                ball.theta = Math.atan2(ball.pos.x - ball.pivotX, CONFIG.PIVOT_Y - ball.pos.y);
            });

            // 3. حل التصادمات الميكانيكية الفضائية المرنة واللدنة (3D Impulse Solver Passes)
            for (let pass = 0; pass < 4; pass++) { 
                for (let i = 0; i < CONFIG.N - 1; i++) {
                    const b1 = this.balls[i];
                    const b2 = this.balls[i + 1];
                    
                    const toNext = new THREE.Vector3().subVectors(b2.pos, b1.pos);
                    const distance = toNext.length();
                    const minDist = CONFIG.R * 2;

                    if (distance < minDist) {
                        const normal = toNext.normalize();
                        const overlap = minDist - distance;

                        // دفع هندسي فوري لتصحيح التداخل والازدحام المادي للكرات بناءً على القصور الذاتي للكتلة
                        const totalM = b1.mass + b2.mass;
                        if (!(i === STATE.selectedId && STATE.isDragging)) {
                            b1.pos.addScaledVector(normal, -overlap * (b2.mass / totalM));
                        }
                        if (!(i + 1 === STATE.selectedId && STATE.isDragging)) {
                            b2.pos.addScaledVector(normal, overlap * (b1.mass / totalM));
                        }

                        // حساب مصفوفة نبض الارتداد على طول خط المركز التصادمي الناظم (Normal Line)
                        const relativeVelocity = new THREE.Vector3().subVectors(b2.vel, b1.vel);
                        const velAlongNormal = relativeVelocity.dot(normal);

                        // التصادم يتم برمجياً فقط إذا كانت الكرات تتقارب متجهياً
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

                            // حقن النبضات المتجهية في المحاور الثلاثة لتعديل اندفاع الكرات فجائياً
                            b1.vel.addScaledVector(normal, -(j / b1.mass));
                            b2.vel.addScaledVector(normal, (j / b2.mass));
                        }
                    }
                }
            }
        }

        this.calculateEnergy();

        // خوارزمية تصحيح وحفظ طاقة جملة الحالات الشاذة الميكانيكية (ما عدا حالة التخميد اللدن 4)
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
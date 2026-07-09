import * as THREE from 'three';
import { CONFIG, LAYERS } from '../core/config.js';
import { STATE } from '../core/state.js';

export class Visualizer {
    constructor(engine, physics) {
        this.scene = engine.scene;
        this.physics = physics;

        this.materials = {
            base: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }),
            real: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.05, clearcoat: 1.0 }),
            energy: new THREE.MeshPhongMaterial({ color: 0x0000ff, shininess: 100 }),
            force: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, transparent: true }),
            ke: new THREE.MeshBasicMaterial({ color: 0xff3366 }),
            pe: new THREE.MeshBasicMaterial({ color: 0x3399ff })
        };

        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 128;
        glowCanvas.height = 128;
        const ctx = glowCanvas.getContext('2d');
        const radialGradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);

        radialGradient.addColorStop(0, 'rgba(255, 200, 0, 1)');
        radialGradient.addColorStop(0.3, 'rgba(255, 100, 0, 0.6)');
        radialGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');

        ctx.fillStyle = radialGradient;
        ctx.fillRect(0, 0, 128, 128);

        this.materials.glow = new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(glowCanvas),
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.entities = [];
        this.networkLinks = [];
        this.textPool = [];
        this.travelingWaves = [];

        this.buildEnvironment();
        this.buildEntities();
    }

    buildEnvironment() {
        const environmentGroup = new THREE.Group();
        this.scene.add(environmentGroup);

        const rigBase = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 8), this.materials.base);
        rigBase.position.y = -1;
        rigBase.receiveShadow = true;
        environmentGroup.add(rigBase);

        const pillarGeometry = new THREE.CylinderGeometry(0.2, 0.2, CONFIG.PIVOT_Y + 1.5);
        const coordinates = [[-7, -CONFIG.SPREAD], [7, -CONFIG.SPREAD], [-7, CONFIG.SPREAD], [7, CONFIG.SPREAD]];

        coordinates.forEach(pos => {
            const pillar = new THREE.Mesh(pillarGeometry, this.materials.base);
            pillar.position.set(pos[0], CONFIG.PIVOT_Y / 2 - 0.25, pos[1]);
            pillar.castShadow = pillar.receiveShadow = true;
            environmentGroup.add(pillar);
        });

        const supportBarGeometry = new THREE.CylinderGeometry(0.2, 0.2, 14.5).rotateZ(Math.PI / 2);
        const frontBar = new THREE.Mesh(supportBarGeometry, this.materials.base);
        frontBar.position.set(0, CONFIG.PIVOT_Y, -CONFIG.SPREAD);

        const backBar = new THREE.Mesh(supportBarGeometry, this.materials.base);
        backBar.position.set(0, CONFIG.PIVOT_Y, CONFIG.SPREAD);

        environmentGroup.add(frontBar, backBar);
    }

    buildEntities() {
        const sphereGeometry = new THREE.SphereGeometry(CONFIG.R, 64, 64);
        const barGeometry = new THREE.BoxGeometry(0.4, 1, 0.4);
        barGeometry.translate(0, 0.5, 0);

        this.physics.balls.forEach((ball, i) => {
            let entity = {
                meshReal: new THREE.Mesh(sphereGeometry, this.materials.real),
                meshEnergy: new THREE.Mesh(sphereGeometry, this.materials.energy.clone()),
                meshForce: new THREE.Mesh(sphereGeometry, this.materials.force.clone()),
                interact: new THREE.Mesh(sphereGeometry, new THREE.MeshBasicMaterial({ visible: false })),
                keBar: new THREE.Mesh(barGeometry, this.materials.ke),
                peBar: new THREE.Mesh(barGeometry, this.materials.pe),
                arrVel: new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0x00e676, 0.4, 0.2),
                arrMom: new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xb055ff, 0.5, 0.25),
                arrGrav: new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 1, 0xffbb00, 0.4, 0.2),
                arrTens: new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, 0x00ccff, 0.4, 0.2),
                glow: new THREE.Sprite(this.materials.glow.clone()),
                selRing: new THREE.Mesh(new THREE.RingGeometry(CONFIG.R * 1.1, CONFIG.R * 1.2, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })),
                strings: []
            };

            entity.meshReal.castShadow = entity.meshReal.receiveShadow = true;
            entity.meshReal.layers.set(LAYERS.REAL);
            entity.meshEnergy.layers.set(LAYERS.ENERGY);
            entity.meshForce.layers.set(LAYERS.FORCES);

            entity.keBar.layers.set(LAYERS.ENERGY);
            entity.peBar.layers.set(LAYERS.ENERGY);

            entity.arrVel.layers.set(LAYERS.FORCES);
            entity.arrGrav.layers.set(LAYERS.FORCES);
            entity.arrTens.layers.set(LAYERS.FORCES);
            entity.arrMom.layers.set(LAYERS.FORCES);
            entity.arrMom.layers.enable(LAYERS.DEBUG);

            entity.glow.layers.set(LAYERS.FORCES);
            entity.glow.layers.enable(LAYERS.ENERGY);
            entity.glow.scale.set(4, 4, 1);
            entity.selRing.layers.enableAll();

            [entity.arrVel, entity.arrMom, entity.arrGrav, entity.arrTens].forEach(arrow => {
                arrow.line.material.depthTest = false;
                arrow.cone.material.depthTest = false;
            });

            const createStringLine = (hexColor) => {
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
                return new THREE.Line(geometry, new THREE.LineBasicMaterial({
                    color: hexColor,
                    transparent: true,
                    opacity: hexColor === 0x888888 ? 0.5 : 1
                }));
            };

            const stringReal1 = createStringLine(0x888888); stringReal1.layers.set(LAYERS.REAL);
            const stringReal2 = createStringLine(0x888888); stringReal2.layers.set(LAYERS.REAL);
            const stringSim1 = createStringLine(0x555555); stringSim1.layers.set(LAYERS.ENERGY); stringSim1.layers.enable(LAYERS.FORCES); stringSim1.layers.enable(LAYERS.DEBUG);
            const stringSim2 = createStringLine(0x555555); stringSim2.layers.set(LAYERS.ENERGY); stringSim2.layers.enable(LAYERS.FORCES); stringSim2.layers.enable(LAYERS.DEBUG);
            entity.strings = [[stringReal1, stringSim1], [stringReal2, stringSim2]];

            this.scene.add(
                entity.meshReal, entity.meshEnergy, entity.meshForce, entity.interact,
                entity.keBar, entity.peBar, entity.arrVel, entity.arrMom, entity.arrGrav,
                entity.arrTens, entity.glow, entity.selRing, stringReal1, stringReal2, stringSim1, stringSim2
            );
            this.entities.push(entity);

            if (i > 0) {
                const linkGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8).rotateX(Math.PI / 2);
                const networkLinkMesh = new THREE.Mesh(linkGeometry, new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.15 }));
                networkLinkMesh.layers.set(LAYERS.FORCES);
                networkLinkMesh.layers.enable(LAYERS.ENERGY);
                networkLinkMesh.layers.enable(LAYERS.DEBUG);

                this.scene.add(networkLinkMesh);
                this.networkLinks.push({ mesh: networkLinkMesh, intensity: 0 });
            }
        });
    }

    createMultiLineLabel(lines, colorStr) {
        const dynamicCanvas = document.createElement('canvas');
        dynamicCanvas.width = 300;
        dynamicCanvas.height = 140;
        const ctx = dynamicCanvas.getContext('2d');

        ctx.fillStyle = 'rgba(10,10,15,0.85)';
        ctx.roundRect(0, 0, 300, 140, 12);
        ctx.fill();
        ctx.strokeStyle = colorStr;
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, 300, 140);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        lines.forEach((line, i) => {
            ctx.font = i === 0 ? 'bold 24px monospace' : '18px monospace';
            ctx.fillStyle = i === 0 ? '#fff' : '#ccc';
            ctx.fillText(line, 150, 30 + i * 30);
        });

        const texture = new THREE.CanvasTexture(dynamicCanvas);
        const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
        const spriteLabel = new THREE.Sprite(material);

        spriteLabel.scale.set(4.5, 2.1, 1);
        spriteLabel.layers.set(LAYERS.DEBUG);
        this.scene.add(spriteLabel);
        return spriteLabel;
    }

    spawnDebugInfo(event) {
        const textLines = [
            `J = ${event.impulse.toFixed(2)} N·s`,
            `v_in: ${event.v1_in.toFixed(2)} m/s`,
            `Δp: ${(event.impulse).toFixed(2)} kg·m/s`
        ];

        const labelNode = this.createMultiLineLabel(textLines, "#ff00ff");
        labelNode.position.copy(event.pos);
        labelNode.position.y += 2.0;
        labelNode.position.z += 1.5;

        const contactPointMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false }));
        contactPointMesh.position.copy(event.pos);
        contactPointMesh.layers.set(LAYERS.DEBUG);
        this.scene.add(contactPointMesh);

        this.textPool.push({ label: labelNode, cp: contactPointMesh, life: 1.5 });

        this.travelingWaves.push({
            xPos: event.pos.x,
            dir: event.dir,
            energy: event.impulse
        });
    }
update(dt) {
    this.physics.collisionEvents.forEach(event => {
        this.spawnDebugInfo(event);
        if (window.uiManager) window.uiManager.triggerEducationalOverlay(event);
    });

    this.physics.balls.forEach((ball, i) => {
        const entity = this.entities[i];
        const px = ball.pos.x, py = ball.pos.y, pz = ball.pos.z;
        
        // ✨ تحديد الكتلة والطول بشكل آمن لتفادي قيم undefined في البيئة القياسية
        const currentMass = ball.mass !== undefined ? ball.mass : CONFIG.MASS;
        const currentLength = ball.length !== undefined ? ball.length : CONFIG.L;

        const velocity = ball.omega * currentLength; // تعديل الطول الديناميكي الآمن
        const absoluteVelocity = Math.abs(velocity);

        // تعديل ديناميكي لحجم كرات الأوزان المختلفة ميكانيكياً وبصرياً
        if (ball.mass && ball.mass !== CONFIG.MASS) {
            const scaleFactor = Math.cbrt(ball.mass / CONFIG.MASS);
            entity.meshReal.scale.setScalar(scaleFactor);
            entity.meshEnergy.scale.setScalar(scaleFactor);
            entity.meshForce.scale.setScalar(scaleFactor);
            entity.interact.scale.setScalar(scaleFactor);
        } else {
            entity.meshReal.scale.setScalar(1);
            entity.meshEnergy.scale.setScalar(1);
            entity.meshForce.scale.setScalar(1);
            entity.interact.scale.setScalar(1);
        }

        entity.interact.position.set(px, py, pz);
        entity.meshReal.position.set(px, py, pz);
        entity.meshEnergy.position.set(px, py, pz);
        entity.meshForce.position.set(px, py, pz);

        entity.strings.forEach((stringGroup, side) => {
            const offsetZ = side === 0 ? -CONFIG.SPREAD : CONFIG.SPREAD;
            stringGroup.forEach(line => {
                const positions = line.geometry.attributes.position.array;
                positions[0] = ball.pivotX; positions[1] = CONFIG.PIVOT_Y; positions[2] = offsetZ;
                positions[3] = px; positions[4] = py; positions[5] = pz;
                line.geometry.attributes.position.needsUpdate = true;
            });
        });

        // الاعتماد على نصف القطر الفعلي لـ الحالات العادية والشاذة
        const currentR = CONFIG.R * (entity.meshReal.scale.x);
        entity.selRing.position.set(px, py, pz + currentR * 1.1);
        entity.selRing.visible = (i === STATE.selectedId);

        const maximumCalculatedPE = currentMass * CONFIG.GRAVITY * (currentLength - currentLength * Math.cos(Math.PI / 4));
        entity.meshEnergy.material.color.lerpColors(new THREE.Color(0x2244ff), new THREE.Color(0xff2222), Math.min(1, ball.ke / (maximumCalculatedPE || 1)));

        if (STATE.optBars) {
            const scalarFactor = 0.1;
            entity.peBar.position.set(px, py + currentR + 0.2, pz);
            entity.peBar.scale.y = Math.max(0.01, ball.pe * scalarFactor);
            entity.keBar.position.set(px, py + currentR + 0.2 + (ball.pe * scalarFactor), pz);
            entity.keBar.scale.y = Math.max(0.01, ball.ke * scalarFactor);
            entity.peBar.visible = entity.keBar.visible = true;
        } else {
            entity.peBar.visible = entity.keBar.visible = false;
        }

        const headingDirection = Math.sign(ball.omega) || 1;
        const forwardVector = new THREE.Vector3(Math.cos(ball.theta) * headingDirection, Math.sin(ball.theta) * headingDirection, 0);

        if (STATE.optVel) {
            entity.arrVel.setDirection(forwardVector);
            entity.arrVel.setLength(Math.max(0.01, absoluteVelocity * 0.4), absoluteVelocity > 0.1 ? 0.3 : 0, absoluteVelocity > 0.1 ? 0.2 : 0);
            entity.arrVel.position.set(px, py, pz);
            entity.arrVel.visible = true;
        } else {
            entity.arrVel.visible = false;
        }

        if (STATE.optMom) {
            // ✨ تعديل: حساب الزخم باستخدام الكتلة المضمونة المحدثة
            const momentumMagnitude = currentMass * absoluteVelocity;
            entity.arrMom.setDirection(forwardVector);
            entity.arrMom.setLength(Math.max(0.01, momentumMagnitude * 0.5), momentumMagnitude > 0.1 ? 0.4 : 0, momentumMagnitude > 0.1 ? 0.25 : 0);
            entity.arrMom.position.set(px, py - 0.2, pz + 0.2);
            entity.arrMom.visible = true;
        } else {
            entity.arrMom.visible = false;
        }

        if (STATE.optForce) {
            // ✨ تعديل: حساب متجه الجاذبية الأرضية بشكل آمن
            entity.arrGrav.setDirection(new THREE.Vector3(0, -1, 0));
            entity.arrGrav.setLength(currentMass * CONFIG.GRAVITY * 0.15, 0.3, 0.2);
            entity.arrGrav.position.set(px, py, pz);

            // ✨ تعديل: حساب قوة الشد الحركي للخيط بشكل آمن ومقاوم للـ NaN
            const tensionMagnitude = currentMass * CONFIG.GRAVITY * Math.cos(ball.theta) + currentMass * absoluteVelocity * absoluteVelocity / currentLength;
            const distPivotX = ball.pivotX - px;
            const distPivotY = CONFIG.PIVOT_Y - py;
            const vectorHypot = Math.sqrt(distPivotX * distPivotX + distPivotY * distPivotY);

            entity.arrTens.setDirection(new THREE.Vector3(distPivotX / vectorHypot, distPivotY / vectorHypot, 0));
            entity.arrTens.setLength(tensionMagnitude * 0.15, 0.3, 0.2);
            entity.arrTens.position.set(px, py, pz);
            entity.arrGrav.visible = entity.arrTens.visible = true;
        } else {
            entity.arrGrav.visible = entity.arrTens.visible = false;
        }

        entity.meshForce.material.opacity = 0.2 + 0.8 * Math.min(1, absoluteVelocity / 1.5);
        entity.glow.visible = false;
    });

    // المزامنة الإضافية للموجات والشبكة
    this.networkLinks.forEach(link => link.intensity = 0);

    for (let i = this.travelingWaves.length - 1; i >= 0; i--) {
        let wave = this.travelingWaves[i];
        wave.xPos += wave.dir * CONFIG.WAVE_SPEED * dt;

        if (wave.xPos > this.physics.balls[CONFIG.N - 1].pivotX + CONFIG.D || wave.xPos < this.physics.balls[0].pivotX - CONFIG.D) {
            this.travelingWaves.splice(i, 1);
            continue;
        }

        this.physics.balls.forEach((ball, idx) => {
            const distanceDelta = Math.abs(ball.pos.x - wave.xPos);
            if (distanceDelta < CONFIG.R * 1.5 && STATE.optNet) {
                const targetEntity = this.entities[idx];
                targetEntity.glow.position.copy(ball.pos);
                targetEntity.glow.material.opacity = (1.0 - (distanceDelta / (CONFIG.R * 1.5))) * Math.min(1, wave.energy);
                targetEntity.glow.visible = true;
            }
        });

        this.networkLinks.forEach((link, idx) => {
            const b1 = this.physics.balls[idx];
            const b2 = this.physics.balls[idx + 1];
            const midpointX = (b1.pos.x + b2.pos.x) / 2;
            const distanceDelta = Math.abs(midpointX - wave.xPos);

            if (distanceDelta < CONFIG.D) {
                link.intensity = Math.max(link.intensity, 1.0 - (distanceDelta / CONFIG.D));
            }
        });
    }

    this.networkLinks.forEach((link, i) => {
        const b1 = this.physics.balls[i];
        const b2 = this.physics.balls[i + 1];
        const currentDistance = b1.pos.distanceTo(b2.pos);

        link.mesh.position.copy(b1.pos).lerp(b2.pos, 0.5);
        link.mesh.lookAt(b2.pos);

        if (STATE.optNet) {
            link.mesh.scale.set(1 + link.intensity * 3, 1 + link.intensity * 3, currentDistance);
            link.mesh.material.opacity = 0.1 + link.intensity * 0.8;
            link.mesh.visible = true;
        } else {
            link.mesh.visible = false;
        }
    });

    for (let i = this.textPool.length - 1; i >= 0; i--) {
        let item = this.textPool[i];
        item.life -= dt;
        item.label.position.y += dt * 0.5;
        item.label.material.opacity = item.life;
        item.cp.material.opacity = item.life;

        if (item.life <= 0) {
            this.scene.remove(item.label, item.cp);
            item.label.material.map.dispose();
            item.label.material.dispose();
            item.cp.material.dispose();
            item.cp.geometry.dispose();
            this.textPool.splice(i, 1);
        }
    }
}
}
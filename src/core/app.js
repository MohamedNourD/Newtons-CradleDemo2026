import * as THREE from 'three';
import { CONFIG } from './config.js';
import { STATE } from './state.js';
import { AudioEngine } from '../audio/audioEngine.js';
import { PhysicsEngine } from '../physics/physicsEngine.js';
import { AnomalousPhysicsEngine } from '../physics/anomalousPhysicsEngine.js'; // الاستيراد الجديد
import { RenderEngine } from '../render/renderEngine.js';
import { Visualizer } from '../render/visualizer.js';
import { UIManager } from '../ui/uiManager.js';

class App {
    constructor() {
        this.audio = new AudioEngine();
        window.audioEngine = this.audio;

        this.renderer = new RenderEngine();
        
        // التحديد الأولي للمحرك
        this.physics = new PhysicsEngine(this.audio);
        this.visuals = new Visualizer(this.renderer, this.physics);
        
        window.uiManager = this.ui = new UIManager(this.physics);
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

        this.bindInput();
        this.bindAnomalyUI(); // ربط الأزرار الجديدة لوجهتي النظر
        this.applyPreset(1);

        this.lastTime = performance.now();
        this.executeLoop();
    }

    switchLab(toAnomalous, caseId = 1) {
        STATE.isAnomalousMode = toAnomalous;
        STATE.activeAnomalyCase = caseId;

        // 1. تنظيف المشهد القديم تماماً للكرات والخيوط لعدم تداخل البيانات
        this.visuals.entities.forEach(entity => {
            this.renderer.scene.remove(
                entity.meshReal, entity.meshEnergy, entity.meshForce, entity.interact,
                entity.keBar, entity.peBar, entity.arrVel, entity.arrMom, entity.arrGrav,
                entity.arrTens, entity.glow, entity.selRing
            );
            entity.strings.forEach(side => side.forEach(line => this.renderer.scene.remove(line)));
        });
        this.visuals.networkLinks.forEach(link => this.renderer.scene.remove(link.mesh));

        // 2. إعادة إطلاق وحقن المحرك المناسب للمنطق الفيزيائي المعزول
        if (STATE.isAnomalousMode) {
            this.physics = new AnomalousPhysicsEngine(this.audio, caseId);
        } else {
            this.physics = new PhysicsEngine(this.audio);
        }

        // 3. إعادة إحياء وبناء العناصر داخل المصير البصري وتحديث مراجع واجهة المستخدم
        this.visuals.physics = this.physics;
        this.visuals.entities = [];
        this.visuals.networkLinks = [];
        this.visuals.buildEntities();

        this.ui.physics = this.physics;
        this.ui.history = [];
        STATE.selectedId = 0;

        if (!STATE.isAnomalousMode) {
            this.applyPreset(caseId); 
        }
    }
bindAnomalyUI() {
        const btnStandardLab = document.getElementById('btn-std-lab');
        const btnAnomalyLab = document.getElementById('btn-anom-lab');
        const anomalySelectorGroup = document.getElementById('anomaly-cases-group');

        // فحص آمن: إذا لم تكن الأزرار موجودة في الواجهة بعد، تخطى الربط حتى لا ينهار التطبيق
        if (!btnStandardLab || !btnAnomalyLab || !anomalySelectorGroup) {
            console.warn("عناصر تحكم الحالات الشاذة غير موجودة في ملف HTML الحالي.");
            return; 
        }

        btnStandardLab.onclick = () => {
            btnStandardLab.classList.add('active');
            btnAnomalyLab.classList.remove('active');
            anomalySelectorGroup.style.display = 'none';
            this.switchLab(false, 1);
        };

        btnAnomalyLab.onclick = () => {
            btnAnomalyLab.classList.add('active');
            btnStandardLab.classList.remove('active');
            anomalySelectorGroup.style.display = 'flex';
            this.switchLab(true, 1);
        };

        const btnMass = document.getElementById('btn-case-mass');
        const btnLengths = document.getElementById('btn-case-lengths');
        const btnMotion = document.getElementById('btn-case-motion');

        if (btnMass) btnMass.onclick = (e) => { this.setActiveCaseBtn(e.target); this.switchLab(true, 1); };
        if (btnLengths) btnLengths.onclick = (e) => { this.setActiveCaseBtn(e.target); this.switchLab(true, 2); };
        if (btnMotion) btnMotion.onclick = (e) => { this.setActiveCaseBtn(e.target); this.switchLab(true, 3); };
    }

    setActiveCaseBtn(activeBtn) {
        document.querySelectorAll('.anomaly-btn').forEach(b => b.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    applyPreset(count) {
        if (STATE.isAnomalousMode) return; // الحالات الشاذة تحكم إحداثياتها من المحرك الخاص بها
        this.physics.balls.forEach(ball => {
            ball.theta = 0;
            ball.omega = 0;
        });

        for (let i = 0; i < count; i++) {
            this.physics.balls[i].theta = -Math.PI / 4;
        }

        this.ui.history = [];
        this.physics.calculateEnergy();
        STATE.baselineEnergy = STATE.sysTotal;
    }

    bindInput() {
        const updateRaycastIntersections = (event) => {
            let clientX = event.clientX;
            let clientY = event.clientY;

            if (event.touches && event.touches.length > 0) {
                clientX = event.touches[0].clientX;
                clientY = event.touches[0].clientY;
            }

            this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.renderer.camera);

            return this.raycaster.intersectObjects(this.visuals.entities.map(entity => entity.interact));
        };

        this.renderer.renderer.domElement.addEventListener('pointerdown', event => {
            if (window.audioEngine) window.audioEngine.resume();

            const intersectedHits = updateRaycastIntersections(event);

            if (intersectedHits.length > 0) {
                STATE.selectedId = this.visuals.entities.findIndex(entity => entity.interact === intersectedHits[0].object);
                STATE.isDragging = true;
                this.renderer.controls.enabled = false;
                this.ui.hideHint();

                const elements = document.querySelectorAll('.data-item');
                elements.forEach(el => el.classList.add('highlight'));
                setTimeout(() => elements.forEach(el => el.classList.remove('highlight')), 300);
            }
        });

        this.renderer.renderer.domElement.addEventListener('pointermove', event => {
            if (!STATE.isDragging) return;
            updateRaycastIntersections(event);

            const intersectionPlaneVector = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(this.dragPlane, intersectionPlaneVector);

            if (intersectionPlaneVector) {
                const targetBall = this.physics.balls[STATE.selectedId];
                let mappedAngle = Math.atan2(intersectionPlaneVector.x - targetBall.pivotX, CONFIG.PIVOT_Y - intersectionPlaneVector.y);

                targetBall.theta = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, mappedAngle));
                targetBall.omega = 0;
                this.physics.calculateEnergy();
            }
        });

        window.addEventListener('pointerup', () => {
            if (STATE.isDragging) {
                this.physics.calculateEnergy();
                STATE.baselineEnergy = STATE.sysTotal;
            }
            STATE.isDragging = false;
            this.renderer.controls.enabled = true;
        });

        document.getElementById('btn-reset').onclick = () => { if (window.audioEngine) window.audioEngine.resume(); if(STATE.isAnomalousMode){ this.physics.initCase(); }else{ this.applyPreset(0); } };
        document.getElementById('btn-demo1').onclick = () => { if (window.audioEngine) window.audioEngine.resume(); this.applyPreset(1); };
        document.getElementById('btn-demo2').onclick = () => { if (window.audioEngine) window.audioEngine.resume(); this.applyPreset(2); };
        document.getElementById('btn-demo3').onclick = () => { if (window.audioEngine) window.audioEngine.resume(); this.applyPreset(3); };
    }

    executeLoop() {
        requestAnimationFrame(() => this.executeLoop());

        const currentTimestamp = performance.now();
        const deltaTime = Math.min((currentTimestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = currentTimestamp;

        this.physics.step(1.0 / 60.0);
        this.visuals.update(deltaTime * STATE.timeScale);
        this.ui.updateDOM(currentTimestamp);

        this.renderer.controls.update();
        this.renderer.render();
    }
}

const app = new App();
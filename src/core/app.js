import * as THREE from 'three';
import { CONFIG } from './config.js';
import { STATE } from './state.js';
import { AudioEngine } from '../audio/audioEngine.js';
import { PhysicsEngine } from '../physics/physicsEngine.js';
import { AnomalousPhysicsEngine } from '../physics/anomalousPhysicsEngine.js';
import { RenderEngine } from '../render/renderEngine.js';
import { Visualizer } from '../render/visualizer.js';
import { UIManager } from '../ui/uiManager.js';

class App {
    constructor() {
        this.audio = new AudioEngine();
        window.audioEngine = this.audio;

        this.renderer = new RenderEngine();
        this.physics = new PhysicsEngine(this.audio);
        this.visuals = new Visualizer(this.renderer, this.physics);
        
        window.uiManager = this.ui = new UIManager(this.physics);
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
this.bindInput();
        this.bindAnomalyUI(); 
        this.applyPreset(1);

        // إيقاظ محرك الصوت فورا عند أول تحريك للماوس أو لمس للشاشة لضمان التقاط أول تصادم
        const awakenAudio = () => {
            if (this.audio) this.audio.resume();
            window.removeEventListener('pointermove', awakenAudio);
            window.removeEventListener('touchstart', awakenAudio);
        };
        window.addEventListener('pointermove', awakenAudio);
        window.addEventListener('touchstart', awakenAudio);

        this.lastTime = performance.now();
        this.executeLoop();
    } // نهاية الـ constructor

    switchLab(toAnomalous, caseId = 1) {
        STATE.isAnomalousMode = toAnomalous;
        STATE.activeAnomalyCase = caseId;

        this.visuals.entities.forEach(entity => {
            this.renderer.scene.remove(
                entity.meshReal, entity.meshEnergy, entity.meshForce, entity.interact,
                entity.keBar, entity.peBar, entity.arrVel, entity.arrMom, entity.arrGrav,
                entity.arrTens, entity.glow, entity.selRing
            );
            entity.strings.forEach(side => side.forEach(line => this.renderer.scene.remove(line)));
        });
        this.visuals.networkLinks.forEach(link => this.renderer.scene.remove(link.mesh));

        if (STATE.isAnomalousMode) {
            this.physics = new AnomalousPhysicsEngine(this.audio, caseId);
        } else {
            this.physics = new PhysicsEngine(this.audio);
        }

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

        if (!btnStandardLab || !btnAnomalyLab || !anomalySelectorGroup) return; 

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

        const cases = [
            { id: 'btn-case-mass', num: 1 },
            { id: 'btn-case-lengths', num: 2 },
            { id: 'btn-case-motion', num: 3 },
            { id: 'btn-case-damping', num: 4 },
            { id: 'btn-case-magnetic', num: 5 },
            { id: 'btn-case-gravity', num: 6 },
            { id: 'btn-case-3d', num: 7 } // الحالة السابعة الجديدة ثلاثية الأبعاد
        ];

        cases.forEach(c => {
            const btn = document.getElementById(c.id);
            if (btn) {
                btn.onclick = (e) => {
                    this.setActiveCaseBtn(e.target);
                    this.switchLab(true, c.num);
                };
            }
        });
    }

    setActiveCaseBtn(activeBtn) {
        document.querySelectorAll('.anomaly-btn').forEach(b => b.classList.remove('active'));
        activeBtn.classList.add('active');
    }

applyPreset(count) {
        if (STATE.isAnomalousMode) return; 
        
        this.physics.balls.forEach(ball => {
            ball.theta = 0;
            ball.omega = 0;
        });

        for (let i = 0; i < count; i++) {
            this.physics.balls[i].theta = -Math.PI / 4;
        }

        this.ui.history = [];
        
        // الحل: تأخير حساب الطاقة المرجعية فريم واحد حتى تستقر زوايا وإحداثيات الكرات تماماً في المتصفح
        requestAnimationFrame(() => {
            this.physics.calculateEnergy();
            STATE.baselineEnergy = STATE.sysTotal;
        });
    }

    bindInput() {
        const updateRaycastIntersections = (event) => {
            let clientX = event.clientX, clientY = event.clientY;
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
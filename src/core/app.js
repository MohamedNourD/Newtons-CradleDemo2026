import * as THREE from 'three';
import { CONFIG } from './config.js';
import { STATE } from './state.js';
import { AudioEngine } from '../audio/audioEngine.js';
import { PhysicsEngine } from '../physics/physicsEngine.js';
import { RenderEngine } from '../render/renderEngine.js';
import { Visualizer } from '../render/visualizer.js';
import { UIManager } from '../ui/uiManager.js';
class App {
    constructor() {
        // 1. تهيئة محرك الصوت التوليدي أولاً
        this.audio = new AudioEngine();
        window.audioEngine = this.audio;

        // 2. ربط محرك الصوت بمحرك الفيزياء مباشرة
        this.physics = new PhysicsEngine(this.audio);
        this.renderer = new RenderEngine();
        this.visuals = new Visualizer(this.renderer, this.physics);
        
        window.uiManager = this.ui = new UIManager(this.physics);
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

        this.bindInput();
        this.applyPreset(1);

        this.lastTime = performance.now();
        this.executeLoop();
    }

    applyPreset(count) {
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
            if (window.audioEngine) window.audioEngine.resume(); // Awaken AudioContext on interaction

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

        document.getElementById('btn-reset').onclick = () => { if (window.audioEngine) window.audioEngine.resume(); this.applyPreset(0); };
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

// الإطلاق التلقائي للمنظومة
const app = new App();  
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MODES, LAYERS } from '../core/config.js';
import { STATE } from '../core/state.js';

export class RenderEngine {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x09090b);

        this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 10, 38);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: "high-performance"
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.container.appendChild(this.renderer.domElement);

        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();
        this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));

        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
        directionalLight.position.set(10, 20, 15);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.bias = -0.0005;
        this.scene.add(directionalLight);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 + 0.05;
        this.controls.minDistance = 15;
        this.controls.maxDistance = 60;

        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

   render() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (STATE.mode === MODES.SPLIT) {
        // ... كود الشاشة المقسومة يظل كما هو دون تغيير ...
    } else {
        this.renderer.setViewport(0, 0, width, height);
        this.renderer.setScissorTest(false);
        
        // إعادة ضبط طبقات الكاميرا
        this.camera.layers.set(LAYERS.COMMON);

        // تفعيل الطبقات بناءً على النمط الحالي
        if (STATE.mode === MODES.REALISTIC) this.camera.layers.enable(LAYERS.REAL);
        if (STATE.mode === MODES.ENERGY) this.camera.layers.enable(LAYERS.ENERGY);
        if (STATE.mode === MODES.FORCES) this.camera.layers.enable(LAYERS.FORCES);
        if (STATE.mode === MODES.DEBUG) {
            this.camera.layers.enable(LAYERS.ENERGY);
            this.camera.layers.enable(LAYERS.FORCES);
            this.camera.layers.enable(LAYERS.DEBUG);
        }

        // ✨ الحل: تفعيل الطبقات تحليلياً إذا كانت الخيارات مفعلة من لوحة التحكم
        if (STATE.optVel || STATE.optMom || STATE.optForce) {
            this.camera.layers.enable(LAYERS.FORCES);
        }
        if (STATE.optBars) {
            this.camera.layers.enable(LAYERS.ENERGY);
        }

        this.renderer.render(this.scene, this.camera);
    }
}
}
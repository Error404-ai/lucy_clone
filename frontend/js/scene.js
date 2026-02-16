// Scene Manager - FIXED with proper mobile camera FOV

class SceneManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.canvas = null;
        this.controls = null;
        this.projectionScale = 1;
        this.isInitialized = false;
    }

    init() {
        try {
            console.log("🎬 Initializing AR Scene...");

            this.canvas = document.getElementById("main-canvas");

            // Scene setup
            this.scene = new THREE.Scene();
            this.scene.background = null; // Transparent for video background

            // Camera setup
            const width = this.canvas.clientWidth || window.innerWidth;
            const height = this.canvas.clientHeight || window.innerHeight;
            const aspect = width / height;

            // ✅ CRITICAL FIX: Proper FOV for mobile devices
            const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
            const CAMERA_FOV = isMobile ? 75 : 60;  // Wider FOV prevents extreme zoom
            
            console.log(`📱 Device: ${isMobile ? 'Mobile' : 'Desktop'}`);
            console.log(`📷 Camera FOV: ${CAMERA_FOV}°`);

            // Perspective camera
            this.camera = new THREE.PerspectiveCamera(
                CAMERA_FOV,
                aspect,
                0.1,
                1000
            );

            // Camera at origin, looking down -Z axis
            this.camera.position.set(0, 0, 0);
            this.camera.lookAt(0, 0, -1);

            // Calculate projection scale for coordinate conversion
            this.projectionScale = 2 * Math.tan((CAMERA_FOV * Math.PI / 180) / 2);

            // WebGL Renderer
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                alpha: true,
                antialias: true,
                preserveDrawingBuffer: true,
                powerPreference: "high-performance"
            });

            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.setClearColor(0x000000, 0); // Transparent
            this.renderer.sortObjects = true;
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping = THREE.NoToneMapping;

            // ✅ CRITICAL: Enable depth testing globally
            this.renderer.autoClear = true;  // Changed from false
            this.renderer.autoClearDepth = true;
            this.renderer.autoClearStencil = true;

            // Lighting setup
            this.setupLights();

            // Resize handling
            window.addEventListener("resize", () => this.onResize());

            this.isInitialized = true;
            console.log("✅ Scene initialized");
            console.log(`   Canvas: ${width}x${height}`);
            console.log(`   Aspect: ${aspect.toFixed(2)}`);
            console.log(`   FOV: ${CAMERA_FOV}°`);

        } catch (err) {
            console.error("❌ Scene init failed:", err);
            throw err;
        }
    }

    setupLights() {
        console.log('💡 Setting up scene lighting...');
        
        // ✅ BRIGHTER ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 1.2);
        this.scene.add(ambient);

        // ✅ STRONGER key light from front
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(0, 3, 5);
        this.scene.add(keyLight);
        
        // ✅ Fill light from left
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
        fillLight.position.set(-4, 2, 3);
        this.scene.add(fillLight);
        
        // ✅ Rim light from behind
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
        rimLight.position.set(0, 2, -2);
        this.scene.add(rimLight);

        // Hemisphere light
        const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.5);
        hemi.position.set(0, 20, 0);
        this.scene.add(hemi);

        console.log("✅ Enhanced lighting configured (5 light sources)");
    }

    add(object) {
        if (!this.scene) return;
        this.scene.add(object);
    }

    remove(object) {
        if (!this.scene) return;
        this.scene.remove(object);
    }

    getScene() {
        return this.scene;
    }

    getCamera() {
        return this.camera;
    }

    getRenderer() {
        return this.renderer;
    }

    getProjectionScale() {
        return this.projectionScale;
    }

    updateCamera(videoWidth, videoHeight) {
        if (!this.camera || !this.renderer) return;

        this.renderer.setSize(videoWidth, videoHeight, false);
        this.camera.aspect = videoWidth / videoHeight;
        this.camera.updateProjectionMatrix();

        console.log(`📸 Camera synced: ${videoWidth}x${videoHeight}`);
    }

    onResize() {
        if (!this.camera || !this.renderer) return;

        const w = this.canvas.clientWidth || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        
        console.log(`📐 Resized: ${w}x${h}, aspect: ${(w/h).toFixed(2)}`);
    }

    render() {
        if (!this.isInitialized) return;
        
        // ✅ CRITICAL: Clear depth buffer before rendering
        this.renderer.clear(true, true, true);
        this.renderer.render(this.scene, this.camera);
    }

    capture() {
        this.render();
        return this.canvas.toDataURL("image/png");
    }

    clear() {
        while (this.scene.children.length > 0) {
            const obj = this.scene.children[0];
            this.scene.remove(obj);
        }
        this.setupLights(); // Re-add lights after clearing
    }

    dispose() {
        this.clear();
        if (this.renderer) this.renderer.dispose();
        if (this.controls) this.controls.dispose();
        this.isInitialized = false;
    }
}

const sceneManager = new SceneManager();
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

            // Scene
            this.scene = new THREE.Scene();
            this.scene.background = null;

            // ✅ FIXED: Proper camera setup for full upper body
            const width = this.canvas.clientWidth || window.innerWidth;
            const height = this.canvas.clientHeight || window.innerHeight;
            const aspect = width / height;

            // Wider FOV to show full upper body (not just face)
            const CAMERA_FOV = 75;

            this.camera = new THREE.PerspectiveCamera(
                CAMERA_FOV,
                aspect,
                0.1,
                100
            );

            // Camera at origin (standard Three.js convention)
            this.camera.position.set(0, 0, 0);
            this.camera.lookAt(0, 0, -1);

            // Projection scale for converting normalized coords to world space
            this.projectionScale = 2 * Math.tan((CAMERA_FOV * Math.PI / 180) / 2);

            // Renderer
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                alpha: true,
                antialias: true,
                preserveDrawingBuffer: true,
                powerPreference: "high-performance"
            });

            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.sortObjects = true;
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping = THREE.NoToneMapping;

            // Lighting
            this.setupLights();

            // Resize handling
            window.addEventListener("resize", () => this.onResize());

            this.isInitialized = true;
            console.log("✅ Scene initialized");

        } catch (err) {
            console.error("❌ Scene init failed:", err);
            throw err;
        }
    }

    setupLights() {
        // Bright ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambient);

        // Directional light from above-front
        const dir = new THREE.DirectionalLight(0xffffff, 0.5);
        dir.position.set(0, 2, 1);
        this.scene.add(dir);

        // Hemisphere light for natural fill
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
        hemi.position.set(0, 20, 0);
        this.scene.add(hemi);
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
    }

    render() {
        if (!this.isInitialized) return;
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
    }

    dispose() {
        this.clear();
        if (this.renderer) this.renderer.dispose();
        if (this.controls) this.controls.dispose();
        this.isInitialized = false;
    }
}

const sceneManager = new SceneManager();
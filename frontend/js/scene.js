class SceneManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.canvas = null;
        this.projectionScale = 1;
    }

    init() {
        this.canvas = document.getElementById("main-canvas");

        if (!this.canvas) {
            console.error("Canvas not found: main-canvas");
            return;
        }

        // Scene
        this.scene = new THREE.Scene();

        const w = this.canvas.clientWidth || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        const aspect = w / h;

        // Real webcam perspective
        const FOV = 60;
        this.camera = new THREE.PerspectiveCamera(FOV, aspect, 0.01, 100);
        this.camera.position.set(0, 0, 0);
        this.camera.lookAt(0, 0, -1);

        // Projection scale for mapper
        this.projectionScale = 2 * Math.tan((FOV * Math.PI / 180) / 2);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: true
        });

        this.renderer.setSize(w, h);
        this.renderer.setClearColor(0x000000, 0);

        this.addLights();

        // Debug helper (optional — remove later)
        // this.scene.add(new THREE.AxesHelper(1));

        console.log("✅ Scene ready");
    }

    addLights() {
        if (!this.scene) return;

        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);

        const directional = new THREE.DirectionalLight(0xffffff, 0.6);
        directional.position.set(2, 3, 2);
        this.scene.add(directional);
    }

    // ⭐ IMPORTANT FIX — this was missing
    add(object) {
        if (!this.scene) {
            console.error("Scene not initialized");
            return;
        }
        this.scene.add(object);
    }

    updateCamera(videoW, videoH) {
        if (!this.renderer || !this.camera) return;

        this.renderer.setSize(videoW, videoH, false);
        this.camera.aspect = videoW / videoH;
        this.camera.updateProjectionMatrix();
    }

    render() {
        if (!this.renderer || !this.scene || !this.camera) return;
        this.renderer.render(this.scene, this.camera);
    }

    getProjectionScale() {
        return this.projectionScale;
    }
}

// Global instance
const sceneManager = new SceneManager();

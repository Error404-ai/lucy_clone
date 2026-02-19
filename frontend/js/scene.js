// scene.js — MOBILE + DESKTOP SAFE
// Key fix: camera aspect ratio uses DISPLAY dimensions, not video dimensions.
// On portrait mobile, a 1280x720 video in a 390x700 canvas gives wrong FOV
// if you use the video's aspect. The background video plane handles its own
// aspect-correct letterboxing separately (see renderer.js _createVideoPlane).

class SceneManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.canvas = null;
        this.isInitialized = false;
    }

    init() {
        try {
            console.log('🎬 Initializing AR Scene...');

            this.canvas = document.getElementById('main-canvas');

            // Scene setup
            this.scene = new THREE.Scene();
            this.scene.background = null; // Transparent — video is a background plane

            // ── Camera setup ────────────────────────────────────────────────
            // Use DISPLAY dimensions for aspect, not video resolution.
            // Video aspect is handled by the background plane in renderer.js.
            const displayW = window.innerWidth;
            const displayH = window.innerHeight; // updated later by renderer

            const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);

            // Wider FOV on mobile portrait because the canvas is tall/narrow
            // and the jacket needs to fit comfortably in frame.
            // Desktop keeps 75° which is standard for this kind of AR view.
            const isPortrait = displayH > displayW;
            const CAMERA_FOV = (isMobile && isPortrait) ? 90 : 75;

            console.log(`📱 ${isMobile ? 'Mobile' : 'Desktop'} | Portrait: ${isPortrait} | FOV: ${CAMERA_FOV}°`);

            this.camera = new THREE.PerspectiveCamera(
                CAMERA_FOV,
                displayW / displayH,
                0.1,
                1000
            );

            // Camera at origin, looking down -Z
            this.camera.position.set(0, 0, 0);
            this.camera.lookAt(0, 0, -1);

            // ── Renderer ────────────────────────────────────────────────────
            this.renderer = new THREE.WebGLRenderer({
                canvas:               this.canvas,
                alpha:                true,
                antialias:            true,
                preserveDrawingBuffer: true,   // needed for captureFrame()
                powerPreference:      'high-performance'
            });

            this.renderer.setSize(displayW, displayH);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setClearColor(0x000000, 0); // fully transparent
            this.renderer.sortObjects = true;
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping = THREE.NoToneMapping;
            this.renderer.autoClear = false; // we call renderer.clear() manually

            this.setupLights();

            window.addEventListener('resize', () => this.onResize());

            this.isInitialized = true;
            console.log(`✅ Scene ready | ${displayW}x${displayH} | aspect ${(displayW/displayH).toFixed(2)}`);

        } catch (err) {
            console.error('❌ Scene init failed:', err);
            throw err;
        }
    }

    setupLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambient);

        const dir = new THREE.DirectionalLight(0xffffff, 0.5);
        dir.position.set(0, 2, 1);
        this.scene.add(dir);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
        hemi.position.set(0, 20, 0);
        this.scene.add(hemi);

        console.log('💡 Lights configured');
    }

    // ─── Called from app.js after camera init ──────────────────────────────
    // IMPORTANT: we use DISPLAY size for camera aspect, ignoring video resolution.
    // The video background plane handles its own letterboxing in renderer.js.
    updateCamera(videoWidth, videoHeight) {
        if (!this.camera || !this.renderer) return;

        // Store video dimensions for the renderer's video plane calculations
        this._videoW = videoWidth;
        this._videoH = videoHeight;

        // Use display size for the rendering viewport and camera aspect
        const displayW = window.innerWidth;
        const displayH = window.innerHeight;

        this.renderer.setSize(displayW, displayH);
        this.camera.aspect = displayW / displayH;
        this.camera.updateProjectionMatrix();

        console.log(`📸 Camera: display=${displayW}x${displayH} | video=${videoWidth}x${videoHeight}`);
    }

    onResize() {
        if (!this.camera || !this.renderer) return;

        const w = window.innerWidth;
        const h = window.innerHeight;

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);

        console.log(`📐 Resize: ${w}x${h} | aspect ${(w/h).toFixed(2)}`);
    }

    // ─── Scene helpers ──────────────────────────────────────────────────────
    add(object)    { if (this.scene) this.scene.add(object); }
    remove(object) { if (this.scene) this.scene.remove(object); }
    getScene()     { return this.scene; }
    getCamera()    { return this.camera; }
    getRenderer()  { return this.renderer; }

    render() {
        if (!this.isInitialized) return;
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
    }

    capture() {
        this.render();
        return this.canvas.toDataURL('image/png');
    }

    clear() {
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }
        this.setupLights();
    }

    dispose() {
        this.clear();
        if (this.renderer) this.renderer.dispose();
        this.isInitialized = false;
    }
}

const sceneManager = new SceneManager();
// scene.js — FIXED: camera aspect uses canvas height, not full window height
// Root cause of aspect=3.39 bug: updateCamera was called with window.innerHeight
// but the canvas is shorter (window.innerHeight - topBar - fabricPanel).
// Fix: compute canvas height the same way renderer.js does, using CSS vars.

class SceneManager {
    constructor() {
        this.scene    = null;
        this.camera   = null;
        this.renderer = null;
        this.canvas   = null;
        this.isInitialized = false;
    }

    // ── Read CSS layout vars (same logic as renderer.js) ─────────────────────
    _getCanvasHeight() {
        const style    = getComputedStyle(document.documentElement);
        const parseVar = (name, fallback) => {
            const px = parseFloat(style.getPropertyValue(name).trim());
            return isNaN(px) ? fallback : px;
        };
        const barH    = parseVar('--bar-h',      60);
        const panelH  = parseVar('--panel-h',    200);
        const safeTop = parseVar('--safe-top',   0);
        const safeBot = parseVar('--safe-bottom', 0);
        return Math.max(window.innerHeight - barH - panelH - safeTop - safeBot, 100);
    }

    init() {
        try {
            console.log('🎬 Initializing AR Scene...');

            this.canvas = document.getElementById('main-canvas');

            // Scene
            this.scene            = new THREE.Scene();
            this.scene.background = null; // transparent — video is a background plane

            // ── Camera ───────────────────────────────────────────────────────
            // Use CANVAS dimensions for aspect, not full window height.
            const displayW  = window.innerWidth;
            const canvasH   = this._getCanvasHeight();   // ← FIXED
            const isMobile  = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
            const isPortrait = canvasH > displayW;
            const CAMERA_FOV = (isMobile && isPortrait) ? 90 : 75;

            console.log(`📱 ${isMobile ? 'Mobile' : 'Desktop'} | Portrait: ${isPortrait} | FOV: ${CAMERA_FOV}°`);

            this.camera = new THREE.PerspectiveCamera(
                CAMERA_FOV,
                displayW / canvasH,   // ← FIXED: canvas aspect, not full window aspect
                0.1,
                1000
            );
            this.camera.position.set(0, 0, 0);
            this.camera.lookAt(0, 0, -1);

            // ── Renderer ─────────────────────────────────────────────────────
            this.renderer = new THREE.WebGLRenderer({
                canvas:                this.canvas,
                alpha:                 true,
                antialias:             true,
                preserveDrawingBuffer: true,
                powerPreference:       'high-performance'
            });

            this.renderer.setSize(displayW, canvasH);   // ← FIXED
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.sortObjects    = true;
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping   = THREE.NoToneMapping;
            this.renderer.autoClear     = false;

            this.setupLights();

            window.addEventListener('resize', () => this.onResize());

            this.isInitialized = true;
            console.log(`✅ Scene ready | ${displayW}x${canvasH} | aspect ${(displayW/canvasH).toFixed(2)}`);

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

    // ── Called from app.js after camera init ─────────────────────────────────
    // Stores video dimensions for renderer's video-plane calculations,
    // then syncs camera aspect to the CANVAS (not the full window).
    updateCamera(videoWidth, videoHeight) {
        if (!this.camera || !this.renderer) return;

        this._videoW = videoWidth;
        this._videoH = videoHeight;

        const displayW = window.innerWidth;
        const canvasH  = this._getCanvasHeight();   // ← FIXED: same as init()

        this.renderer.setSize(displayW, canvasH);
        this.camera.aspect = displayW / canvasH;
        this.camera.updateProjectionMatrix();

        console.log(`📸 Camera updated: canvas=${displayW}x${canvasH} aspect=${this.camera.aspect.toFixed(2)} | video=${videoWidth}x${videoHeight}`);
    }

    onResize() {
        if (!this.camera || !this.renderer) return;

        const w = window.innerWidth;
        const h = this._getCanvasHeight();   // ← FIXED

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);

        console.log(`📐 Resize: ${w}x${h} | aspect ${(w/h).toFixed(2)}`);
    }

    add(object)      { if (this.scene) this.scene.add(object); }
    remove(object)   { if (this.scene) this.scene.remove(object); }
    getScene()       { return this.scene; }
    getCamera()      { return this.camera; }
    getRenderer()    { return this.renderer; }

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
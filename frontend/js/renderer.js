class CompositeRenderer {
    constructor() {
        this.canvas = document.getElementById('main-canvas');
        this.videoTexture = null;
        this.videoPlane = null;
        this.isRunning = false;
        this.animationId = null;

        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.lastRenderTime = performance.now();
        this.fps = 0;
        this.fpsHistory = [];
        this.fpsHistorySize = 10;
    }

    /* ================= INIT ================= */

    init(width, height) {
        try {
            console.log('🎬 Initializing AR Renderer...');

            this.width = width;
            this.height = height;

            const scale = CONFIG.PERFORMANCE.RENDER_SCALE;
            const displayWidth = this.canvas.clientWidth || window.innerWidth;
            const displayHeight = this.canvas.clientHeight || window.innerHeight;

            this.canvas.width = displayWidth * scale;
            this.canvas.height = displayHeight * scale;

            this.setupVideoBackground();

            window.addEventListener(
                'resize',
                Utils.debounce(() => this.onResize(), 250)
            );

            console.log('✅ Renderer initialized');

        } catch (error) {
            console.error('❌ Renderer init failed:', error);
            throw error;
        }
    }

    /* ================= VIDEO BACKGROUND ================= */

    setupVideoBackground() {
        const video = cameraManager.video;
        if (!video) {
            console.warn('⚠️ Video element not found');
            return;
        }

        const waitForVideo = () => {
            if (video.readyState >= 2) {
                this.createVideoTexture(video);
            } else {
                setTimeout(waitForVideo, 100);
            }
        };

        waitForVideo();
    }

    /**
     * ⭐ CRITICAL FIX
     * Attach video to camera (NOT world)
     * This makes video a background, not an object blocking 3D
     */
    createVideoTexture(video) {
        console.log('🎥 Creating AR video background...');

        this.videoTexture = new THREE.VideoTexture(video);
        this.videoTexture.minFilter = THREE.LinearFilter;
        this.videoTexture.magFilter = THREE.LinearFilter;
        this.videoTexture.format = THREE.RGBAFormat;
        this.videoTexture.colorSpace = THREE.SRGBColorSpace;

        const camera = sceneManager.getCamera();

        // Fullscreen quad (screen-space)
        const geometry = new THREE.PlaneGeometry(2, 2);

        const material = new THREE.MeshBasicMaterial({
            map: this.videoTexture,
            depthWrite: false,
            depthTest: false,
            toneMapped: false
        });

        this.videoPlane = new THREE.Mesh(geometry, material);

        // Attach to camera instead of scene
        this.videoPlane.position.set(0, 0, -1);
        this.videoPlane.renderOrder = -9999;

        camera.add(this.videoPlane);

        // ensure camera is root scene object
        sceneManager.getScene().add(camera);

        console.log('✅ AR background attached to camera');
    }

    /* ================= SCREEN → WORLD ================= */

    getWorldPositionFromScreen(nx, ny, depth = CONFIG.SKELETON.DEPTH_OFFSET) {

    const camera = sceneManager.getCamera();

    const ndc = new THREE.Vector3(
        (nx - 0.5) * 2,
        -(ny - 0.5) * 2,
        0.5
    );

    ndc.unproject(camera);

    const dir = ndc.sub(camera.position).normalize();

    return camera.position.clone().add(dir.multiplyScalar(depth));
}

    /* ================= RENDER LOOP ================= */

    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.lastRenderTime = performance.now();
        this.render();
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    render() {
        if (!this.isRunning) return;

        this.animationId = requestAnimationFrame(() => this.render());

        try {
            const now = performance.now();
            const delta = now - this.lastRenderTime;
            const targetDelta = 1000 / CONFIG.PERFORMANCE.TARGET_FPS;

            if (delta < targetDelta - 1) return;
            this.lastRenderTime = now;

            // update webcam frame
            if (this.videoTexture && cameraManager.video?.readyState >= 2) {
                this.videoTexture.needsUpdate = true;
            }

            sceneManager.render();
            this.updateFPS();

        } catch (error) {
            console.error('❌ Render error:', error);
        }
    }

    /* ================= CAPTURE ================= */

    captureFrame() {
        if (!this.canvas) return null;

        try {
            if (this.videoTexture && cameraManager.video?.readyState >= 2) {
                this.videoTexture.needsUpdate = true;
            }

            sceneManager.render();
            return this.canvas.toDataURL('image/png', 0.95);

        } catch (error) {
            console.error('Error capturing frame:', error);
            return null;
        }
    }

    /* ================= FPS ================= */

    updateFPS() {
        this.frameCount++;
        const now = performance.now();
        const elapsed = now - this.lastFpsUpdate;

        if (elapsed >= 1000) {
            const instantFps = Math.round((this.frameCount * 1000) / elapsed);

            this.fpsHistory.push(instantFps);
            if (this.fpsHistory.length > this.fpsHistorySize) {
                this.fpsHistory.shift();
            }

            this.fps = Math.round(
                this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
            );

            Utils.updateFPS(this.fps);

            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }

    /* ================= RESIZE ================= */

    onResize() {
        const displayWidth = this.canvas.clientWidth || window.innerWidth;
        const displayHeight = this.canvas.clientHeight || window.innerHeight;
        const scale = CONFIG.PERFORMANCE.RENDER_SCALE;

        this.canvas.width = displayWidth * scale;
        this.canvas.height = displayHeight * scale;

        const renderer = sceneManager.getRenderer();
        if (renderer) renderer.setSize(displayWidth, displayHeight);

        const camera = sceneManager.getCamera();
        if (camera) {
            camera.aspect = displayWidth / displayHeight;
            camera.updateProjectionMatrix();
        }
    }

    getFPS() {
        return this.fps;
    }

    /* ================= CLEANUP ================= */

    dispose() {
        this.stop();

        if (this.videoTexture) this.videoTexture.dispose();

        if (this.videoPlane) {
            this.videoPlane.geometry.dispose();
            this.videoPlane.material.dispose();
        }
    }
}

const compositeRenderer = new CompositeRenderer();

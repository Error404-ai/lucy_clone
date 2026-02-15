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

    init(width, height) {
        try {
            console.log('🎬 Initializing Renderer...');

            this.width = width;
            this.height = height;

            const scale = CONFIG.PERFORMANCE.RENDER_SCALE;
            const displayWidth = this.canvas.clientWidth || window.innerWidth;
            const displayHeight = this.canvas.clientHeight || window.innerHeight;

            this.canvas.width = displayWidth * scale;
            this.canvas.height = displayHeight * scale;

            this.setupVideoBackground();

            window.addEventListener('resize', Utils.debounce(() => this.onResize(), 250));

            console.log('✅ Renderer initialized');

        } catch (error) {
            console.error('❌ Renderer init failed:', error);
            throw error;
        }
    }

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

    createVideoTexture(video) {
        console.log('🎥 Creating video texture...');

        this.videoTexture = new THREE.VideoTexture(video);
        this.videoTexture.minFilter = THREE.LinearFilter;
        this.videoTexture.magFilter = THREE.LinearFilter;

        // ⭐ FIXED (prevents red/black screen on some GPUs)
        this.videoTexture.format = THREE.RGBAFormat;
        this.videoTexture.colorSpace = THREE.SRGBColorSpace;

        const camera = sceneManager.getCamera();

        const distance = Math.abs(camera.position.z - (-10));
        const vFOV = THREE.MathUtils.degToRad(camera.fov);
        const planeHeight = 2 * Math.tan(vFOV / 2) * distance;
        const planeWidth = planeHeight * camera.aspect;

        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

        const material = new THREE.MeshBasicMaterial({
            map: this.videoTexture,
            side: THREE.FrontSide,
            depthWrite: false,
            depthTest: false,
            toneMapped: false
        });

        this.videoPlane = new THREE.Mesh(geometry, material);
        this.videoPlane.position.set(0, 0, -10);
        this.videoPlane.renderOrder = -1000;
        this.videoPlane.visible = true;

        sceneManager.add(this.videoPlane);

        console.log('✅ Video background ready');
    }

    // ⭐⭐⭐ CORE FUNCTION — SCREEN → WORLD CONVERSION ⭐⭐⭐
    getWorldPositionFromScreen(nx, ny, depth = 2.2) {

    const camera = sceneManager.getCamera();

    // convert to NDC (-1 to +1)
    const x = (nx - 0.5) * 2;
    const y = -(ny - 0.5) * 2;

    const vector = new THREE.Vector3(x, y, 0.5);
    vector.unproject(camera);

    const dir = vector.sub(camera.position).normalize();

    const distance = depth;
    return camera.position.clone().add(dir.multiplyScalar(distance));
}

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

            // ⭐ FIXED video refresh check
            if (this.videoTexture && cameraManager.video?.readyState >= 2) {
                this.videoTexture.needsUpdate = true;
            }

            sceneManager.render();
            this.updateFPS();

        } catch (error) {
            console.error('❌ Render error:', error);
        }
    }

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

    dispose() {
        this.stop();

        if (this.videoTexture) this.videoTexture.dispose();

        if (this.videoPlane) {
            this.videoPlane.geometry.dispose();
            this.videoPlane.material.dispose();
            sceneManager.remove(this.videoPlane);
        }
    }
}

const compositeRenderer = new CompositeRenderer();
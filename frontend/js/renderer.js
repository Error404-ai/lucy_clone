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
     * ✅ CRITICAL FIX: Video as full-screen background quad
     */
    createVideoTexture(video) {
        console.log('🎥 Creating video background...');

        this.videoTexture = new THREE.VideoTexture(video);
        this.videoTexture.minFilter = THREE.LinearFilter;
        this.videoTexture.magFilter = THREE.LinearFilter;
        this.videoTexture.format = THREE.RGBAFormat;
        this.videoTexture.colorSpace = THREE.SRGBColorSpace;

        // Full-screen quad geometry (covers entire viewport)
        const geometry = new THREE.PlaneGeometry(2, 2);

        const material = new THREE.MeshBasicMaterial({
            map: this.videoTexture,
            depthWrite: false,
            depthTest: false,
            toneMapped: false,
            side: THREE.DoubleSide
        });

        this.videoPlane = new THREE.Mesh(geometry, material);

        // Position video plane behind everything
        this.videoPlane.position.set(0, 0, -5);
        this.videoPlane.renderOrder = -1000;

        // Add to scene (not camera)
        sceneManager.getScene().add(this.videoPlane);

        console.log('✅ Video background created');
    }

    /**
     * ✅ FIXED: Convert normalized screen coords to 3D world position
     */
    getWorldPositionFromScreen(nx, ny, depth = 2.5) {
        const camera = sceneManager.getCamera();
        const projectionScale = sceneManager.getProjectionScale();

        // Convert normalized (0-1) to NDC (-1 to 1)
        const ndcX = (nx - 0.5) * 2;
        const ndcY = -(ny - 0.5) * 2;  // Flip Y

        // Convert to world space
        const worldX = ndcX * depth * projectionScale * camera.aspect;
        const worldY = ndcY * depth * projectionScale;
        const worldZ = -depth;

        return new THREE.Vector3(worldX, worldY, worldZ);
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

            // Update video texture
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
        }
    }
}

const compositeRenderer = new CompositeRenderer();
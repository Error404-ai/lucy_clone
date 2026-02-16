// Composite Renderer - FIXED with proper fullscreen video background

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

            // Make canvas fullscreen
            this.canvas.style.position = 'fixed';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
            this.canvas.style.width = '100vw';
            this.canvas.style.height = '100vh';

            const scale = CONFIG.PERFORMANCE.RENDER_SCALE;
            const displayWidth = this.canvas.clientWidth || window.innerWidth;
            const displayHeight = this.canvas.clientHeight || window.innerHeight;

            this.canvas.width = displayWidth * scale;
            this.canvas.height = displayHeight * scale;

            // Setup video background
            this.setupVideoBackground();

            // Resize handler
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

        // Wait for video to be ready
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
     * ✅ CRITICAL FIX: Fullscreen video background using proper camera-space plane
     */
    createVideoTexture(video) {
        console.log('🎥 Creating video background...');

        // Create video texture
        this.videoTexture = new THREE.VideoTexture(video);
        this.videoTexture.minFilter = THREE.LinearFilter;
        this.videoTexture.magFilter = THREE.LinearFilter;
        this.videoTexture.format = THREE.RGBAFormat;
        this.videoTexture.colorSpace = THREE.SRGBColorSpace;

        const camera = sceneManager.getCamera();
        const scene = sceneManager.getScene();

        // Calculate the plane size needed to fill the camera's view at a given distance
        const distance = 10; // Distance from camera
        const vFOV = camera.fov * Math.PI / 180; // Convert to radians
        const planeHeight = 2 * Math.tan(vFOV / 2) * distance;
        const planeWidth = planeHeight * camera.aspect;

        console.log(`📐 Video plane: ${planeWidth.toFixed(2)} x ${planeHeight.toFixed(2)} at distance ${distance}`);

        // Create geometry that fills the entire view
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

        const material = new THREE.MeshBasicMaterial({
            map: this.videoTexture,
            depthWrite: false,
            depthTest: false,
            toneMapped: false,
            side: THREE.FrontSide
        });

        this.videoPlane = new THREE.Mesh(geometry, material);

        // Position the plane in front of the camera
        this.videoPlane.position.set(0, 0, -distance);
        this.videoPlane.renderOrder = -1000; // Render first (background)

        // Add to scene
        scene.add(this.videoPlane);

        console.log('✅ Video background created and added to scene');
    }

    /**
     * Update video plane size when window resizes
     */
    updateVideoPlaneSize() {
        if (!this.videoPlane) return;

        const camera = sceneManager.getCamera();
        const distance = 10;
        const vFOV = camera.fov * Math.PI / 180;
        const planeHeight = 2 * Math.tan(vFOV / 2) * distance;
        const planeWidth = planeHeight * camera.aspect;

        // Update geometry
        this.videoPlane.geometry.dispose();
        this.videoPlane.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

        console.log(`📐 Video plane resized: ${planeWidth.toFixed(2)} x ${planeHeight.toFixed(2)}`);
    }

    /**
     * Convert normalized screen coords (0-1) to 3D world position
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
        
        console.log('✅ Render loop started');
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        console.log('⏸️ Render loop stopped');
    }

    render() {
        if (!this.isRunning) return;

        this.animationId = requestAnimationFrame(() => this.render());

        try {
            const now = performance.now();
            const delta = now - this.lastRenderTime;
            const targetDelta = 1000 / CONFIG.PERFORMANCE.TARGET_FPS;

            // Frame rate limiting
            if (delta < targetDelta - 1) return;
            this.lastRenderTime = now;

            // Update video texture every frame
            if (this.videoTexture && cameraManager.video?.readyState >= 2) {
                this.videoTexture.needsUpdate = true;
            }

            // Render the scene
            sceneManager.render();
            
            // Update FPS counter
            this.updateFPS();

        } catch (error) {
            console.error('❌ Render error:', error);
        }
    }

    captureFrame() {
        if (!this.canvas) return null;

        try {
            // Force video texture update
            if (this.videoTexture && cameraManager.video?.readyState >= 2) {
                this.videoTexture.needsUpdate = true;
            }

            // Render one frame
            sceneManager.render();
            
            // Capture canvas
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
        if (renderer) {
            renderer.setSize(displayWidth, displayHeight);
        }

        const camera = sceneManager.getCamera();
        if (camera) {
            camera.aspect = displayWidth / displayHeight;
            camera.updateProjectionMatrix();
        }

        // Update video plane to match new aspect ratio
        this.updateVideoPlaneSize();
        
        console.log(`📐 Resized: ${displayWidth}x${displayHeight}`);
    }

    getFPS() {
        return this.fps;
    }

    dispose() {
        this.stop();

        if (this.videoTexture) {
            this.videoTexture.dispose();
        }

        if (this.videoPlane) {
            this.videoPlane.geometry.dispose();
            this.videoPlane.material.dispose();
            sceneManager.getScene().remove(this.videoPlane);
        }
    }
}

const compositeRenderer = new CompositeRenderer();
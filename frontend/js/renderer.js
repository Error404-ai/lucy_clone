// Composite Renderer - CRITICAL FIX - Proper video + jacket layering

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
            
            console.log(`Canvas: ${this.canvas.width}x${this.canvas.height} (scale: ${scale})`);
            
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
        
        // ✅ Create video texture
        this.videoTexture = new THREE.VideoTexture(video);
        this.videoTexture.minFilter = THREE.LinearFilter;
        this.videoTexture.magFilter = THREE.LinearFilter;
        this.videoTexture.format = THREE.RGBFormat;
        this.videoTexture.colorSpace = THREE.SRGBColorSpace;

        // ✅ CRITICAL: Calculate proper plane size to fill viewport
        const camera = sceneManager.getCamera();
        const distance = Math.abs(camera.position.z - (-10)); // Distance to background plane
        const vFOV = THREE.MathUtils.degToRad(camera.fov);
        const planeHeight = 2 * Math.tan(vFOV / 2) * distance;
        const planeWidth = planeHeight * camera.aspect;
        
        console.log(`📐 Video plane: ${planeWidth.toFixed(2)} x ${planeHeight.toFixed(2)} at z=-10`);
        
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        
        // ✅ CRITICAL: Use MeshBasicMaterial (unlit, no lighting effects)
        const material = new THREE.MeshBasicMaterial({
            map: this.videoTexture,
            side: THREE.FrontSide,
            depthWrite: false, // ✅ Don't write to depth buffer
            depthTest: false,  // ✅ Always render behind everything
            toneMapped: false
        });

        this.videoPlane = new THREE.Mesh(geometry, material);
        
        // ✅ CRITICAL: Position FAR behind jacket
        this.videoPlane.position.set(0, 0, -10);
        
        // ✅ CRITICAL: Render order - video FIRST (lowest number)
        this.videoPlane.renderOrder = -1000;
        
        // ✅ Make visible
        this.videoPlane.visible = true;
        
        // ✅ Add to scene FIRST (before jacket)
        sceneManager.add(this.videoPlane);
        
        console.log('✅ Video background created and added to scene');
        console.log('   Position:', this.videoPlane.position.toArray());
        console.log('   Render order:', this.videoPlane.renderOrder);
        console.log('   Visible:', this.videoPlane.visible);
    }

    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.lastRenderTime = performance.now();
        console.log('▶️ Starting render loop...');
        this.render();
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('⏹️ Render loop stopped');
    }

    render() {
        if (!this.isRunning) return;

        this.animationId = requestAnimationFrame(() => this.render());

        try {
            // FPS limiting
            const now = performance.now();
            const delta = now - this.lastRenderTime;
            const targetDelta = 1000 / CONFIG.PERFORMANCE.TARGET_FPS;

            if (delta < targetDelta - 1) {
                return;
            }

            this.lastRenderTime = now;

            // ✅ Update video texture EVERY frame
            if (this.videoTexture && cameraManager.isReady()) {
                this.videoTexture.needsUpdate = true;
            }

            // ✅ Render scene (video plane + jacket)
            sceneManager.render();

            // Update FPS
            this.updateFPS();

        } catch (error) {
            console.error('❌ Render error:', error);
        }
    }

    captureFrame() {
        if (!this.canvas) return null;
        
        try {
            if (this.videoTexture && cameraManager.isReady()) {
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
        if (renderer) {
            renderer.setSize(displayWidth, displayHeight);
        }
        
        const camera = sceneManager.getCamera();
        if (camera) {
            camera.aspect = displayWidth / displayHeight;
            camera.updateProjectionMatrix();
            
            // ✅ Resize video plane to match new aspect ratio
            if (this.videoPlane) {
                const distance = Math.abs(camera.position.z - (-10));
                const vFOV = THREE.MathUtils.degToRad(camera.fov);
                const planeHeight = 2 * Math.tan(vFOV / 2) * distance;
                const planeWidth = planeHeight * camera.aspect;
                
                this.videoPlane.scale.set(
                    planeWidth / this.videoPlane.geometry.parameters.width,
                    planeHeight / this.videoPlane.geometry.parameters.height,
                    1
                );
            }
        }
    }

    getFPS() {
        return this.fps;
    }

    dispose() {
        this.stop();
        
        if (this.videoTexture) {
            this.videoTexture.dispose();
            this.videoTexture = null;
        }
        
        if (this.videoPlane) {
            this.videoPlane.geometry.dispose();
            this.videoPlane.material.dispose();
            sceneManager.remove(this.videoPlane);
            this.videoPlane = null;
        }
        
        console.log('Renderer disposed');
    }
}

const compositeRenderer = new CompositeRenderer();
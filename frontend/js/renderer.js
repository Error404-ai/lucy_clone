// Composite Renderer - FIXED TRANSPARENCY + LIGHTING
// Combines camera feed with 3D jacket overlay

class CompositeRenderer {
    constructor() {
        this.canvas = document.getElementById('main-canvas');
        this.ctx = null;
        this.videoTexture = null;
        this.videoPlane = null;
        this.isRunning = false;
        this.animationId = null;
        
        // Performance tracking
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.lastRenderTime = performance.now();
        this.fps = 0;
        
        // FPS smoothing
        this.fpsHistory = [];
        this.fpsHistorySize = 10;
    }

    /**
     * Initialize the composite renderer
     */
    init(width, height) {
        try {
            console.log('Initializing CompositeRenderer (Fixed)...');
            
            // Store dimensions
            this.width = width;
            this.height = height;
            
            // Setup canvas with performance optimization
            const scale = CONFIG.PERFORMANCE.RENDER_SCALE || 0.8;
            const displayWidth = this.canvas.clientWidth || window.innerWidth;
            const displayHeight = this.canvas.clientHeight || window.innerHeight;
            this.canvas.width = displayWidth * scale;
            this.canvas.height = displayHeight * scale;
            
            console.log(`Canvas resolution: ${this.canvas.width}x${this.canvas.height} (scale: ${scale})`);
            
            // Setup video background
            this.setupVideoBackground();
            
            // Handle window resize (debounced)
            let resizeTimeout;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => this.onResize(), 250);
            });
            
            console.log('✅ CompositeRenderer initialized');
            
        } catch (error) {
            console.error('CompositeRenderer initialization failed:', error);
            throw error;
        }
    }

    /**
     * Setup video background in Three.js scene
     */
    setupVideoBackground() {
        const video = cameraManager.video;
        
        if (!video) {
            console.warn('Camera video not available for background');
            return;
        }

        // Wait for video to be actually ready
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
     * Create video texture once video is ready
     */
    createVideoTexture(video) {
        console.log('Creating video texture...');
        console.log('Video dimensions:', video.videoWidth, 'x', video.videoHeight);
        console.log('Video ready state:', video.readyState);

        // Create video texture with proper color handling
        this.videoTexture = new THREE.VideoTexture(video);
        this.videoTexture.minFilter = THREE.LinearFilter;
        this.videoTexture.magFilter = THREE.LinearFilter;
        this.videoTexture.format = THREE.RGBFormat;
        this.videoTexture.colorSpace = THREE.SRGBColorSpace; // ✅ Fix color space
        this.videoTexture.needsUpdate = true;

        // Create plane geometry to fit the screen
        const aspect = this.width / this.height;
        const planeWidth = 20;
        const planeHeight = planeWidth / aspect;
        
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        
        // ✅ FIX: Unlit material to prevent lighting from washing out video
        const material = new THREE.MeshBasicMaterial({
            map: this.videoTexture,
            side: THREE.FrontSide,
            depthWrite: true,  // ✅ Enable depth write
            depthTest: true,   // ✅ Enable depth test
            toneMapped: false  // ✅ Disable tone mapping for accurate colors
        });

        this.videoPlane = new THREE.Mesh(geometry, material);
        this.videoPlane.position.z = -10; // Behind everything
        this.videoPlane.renderOrder = -1000; // ✅ Render first
        this.videoPlane.visible = false; // ✅ Hide - using HTML video element instead
        
        // Add to scene
        sceneManager.add(this.videoPlane);
        
        console.log('✓ Video background ready (hidden - using split layout)');
    }

    /**
     * Start the render loop
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.lastRenderTime = performance.now();
        console.log('Starting render loop...');
        this.render();
    }

    /**
     * Stop the render loop
     */
    stop() {
        this.isRunning = false;
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        console.log('Render loop stopped');
    }

    /**
     * Main render loop with FPS limiting
     */
    render() {
        if (!this.isRunning) return;

        // Request next frame immediately to prevent lag
        this.animationId = requestAnimationFrame(() => this.render());

        try {
            // FPS limiter - only render at target FPS
            const now = performance.now();
            const delta = now - this.lastRenderTime;
            const targetDelta = 1000 / CONFIG.PERFORMANCE.TARGET_FPS;

            if (delta < targetDelta - 1) {
                // Skip this frame
                return;
            }

            this.lastRenderTime = now;

            // Update video texture (CRITICAL for showing camera feed)
            if (this.videoTexture && cameraManager.isReady()) {
                this.videoTexture.needsUpdate = true;
            }

            // Render Three.js scene (camera feed + 3D jacket)
            sceneManager.render();

            // Update FPS counter
            this.updateFPS();

            // Adaptive quality (reduce resolution if FPS drops)
            if (CONFIG.PERFORMANCE.ADAPTIVE_QUALITY) {
                this.adaptiveQuality();
            }

        } catch (error) {
            console.error('Render error:', error);
        }
    }

    /**
     * Adaptive quality - reduce resolution if FPS is too low
     */
    adaptiveQuality() {
        const avgFps = this.getAverageFPS();
        
        if (avgFps < CONFIG.PERFORMANCE.LOW_PERFORMANCE_THRESHOLD && 
            CONFIG.PERFORMANCE.RENDER_SCALE > 0.5) {
            
            // Reduce quality
            console.warn(`Low FPS (${avgFps}), reducing render quality`);
            CONFIG.PERFORMANCE.RENDER_SCALE = Math.max(0.5, CONFIG.PERFORMANCE.RENDER_SCALE - 0.1);
            this.onResize(); // Apply new scale
        }
    }

    /**
     * Capture current frame as base64
     */
    captureFrame() {
        if (!this.canvas) return null;
        
        try {
            // Ensure latest render
            if (this.videoTexture && cameraManager.isReady()) {
                this.videoTexture.needsUpdate = true;
            }
            sceneManager.render();
            
            // Capture canvas
            return this.canvas.toDataURL('image/png', 0.95);
            
        } catch (error) {
            console.error('Error capturing frame:', error);
            return null;
        }
    }

    /**
     * Update FPS counter with smoothing
     */
    updateFPS() {
        this.frameCount++;
        const now = performance.now();
        const elapsed = now - this.lastFpsUpdate;
        
        if (elapsed >= 1000) {
            const instantFps = Math.round((this.frameCount * 1000) / elapsed);
            
            // Add to history for smoothing
            this.fpsHistory.push(instantFps);
            if (this.fpsHistory.length > this.fpsHistorySize) {
                this.fpsHistory.shift();
            }
            
            // Calculate average FPS
            this.fps = Math.round(
                this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
            );
            
            Utils.updateFPS(this.fps);
            
            this.frameCount = 0;
            this.lastFpsUpdate = now;
            
            // Log performance metrics periodically
            if (CONFIG.DEBUG.LOG_PERFORMANCE && this.fps < CONFIG.PERFORMANCE.LOW_PERFORMANCE_THRESHOLD) {
                console.warn(`Performance warning: ${this.fps} FPS`);
            }
        }
    }

    /**
     * Get average FPS from history
     */
    getAverageFPS() {
        if (this.fpsHistory.length === 0) return 30;
        return this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
    }

    /**
     * Handle window resize with optimization
     */
    onResize() {
        const displayWidth = this.canvas.clientWidth || window.innerWidth;
        const displayHeight = this.canvas.clientHeight || window.innerHeight;
        const scale = CONFIG.PERFORMANCE.RENDER_SCALE || 0.8;
        
        // Update canvas size
        this.canvas.width = displayWidth * scale;
        this.canvas.height = displayHeight * scale;
        
        // Update Three.js renderer
        const renderer = sceneManager.getRenderer();
        if (renderer) {
            renderer.setSize(displayWidth, displayHeight);
        }
        
        // Update camera aspect ratio
        const camera = sceneManager.getCamera();
        if (camera) {
            camera.aspect = displayWidth / displayHeight;
            camera.updateProjectionMatrix();
        }
        
        // Update video plane size
        if (this.videoPlane && this.width && this.height) {
            const aspect = this.width / this.height;
            const planeWidth = 20;
            const planeHeight = planeWidth / aspect;
            
            this.videoPlane.geometry.dispose();
            this.videoPlane.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        }
        
        console.log(`Window resized: ${displayWidth}x${displayHeight} (render: ${this.canvas.width}x${this.canvas.height})`);
    }

    /**
     * Get current FPS
     */
    getFPS() {
        return this.fps;
    }

    /**
     * Toggle video background visibility
     */
    toggleVideoBackground(visible) {
        if (this.videoPlane) {
            this.videoPlane.visible = visible;
        }
    }

    /**
     * Set video background opacity
     */
    setVideoOpacity(opacity) {
        if (this.videoPlane && this.videoPlane.material) {
            this.videoPlane.material.opacity = opacity;
            this.videoPlane.material.transparent = opacity < 1.0;
        }
    }

    /**
     * Take high-quality screenshot
     */
    async takeScreenshot(format = 'image/png', quality = 1.0) {
        // Temporarily increase render quality
        const originalScale = CONFIG.PERFORMANCE.RENDER_SCALE;
        CONFIG.PERFORMANCE.RENDER_SCALE = 1.0;
        
        // Resize and render
        this.onResize();
        sceneManager.render();
        
        // Capture
        const screenshot = this.canvas.toDataURL(format, quality);
        
        // Restore original quality
        CONFIG.PERFORMANCE.RENDER_SCALE = originalScale;
        this.onResize();
        
        return screenshot;
    }

    /**
     * Get render statistics
     */
    getStats() {
        return {
            fps: this.fps,
            avgFps: this.getAverageFPS(),
            isRunning: this.isRunning,
            canvasSize: {
                width: this.canvas.width,
                height: this.canvas.height,
                displayWidth: this.canvas.clientWidth,
                displayHeight: this.canvas.clientHeight
            },
            renderScale: CONFIG.PERFORMANCE.RENDER_SCALE,
            videoTextureActive: this.videoTexture !== null,
            videoReady: cameraManager.isReady()
        };
    }

    /**
     * Dispose resources
     */
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
        
        console.log('CompositeRenderer disposed');
    }
}

// Create global instance
const compositeRenderer = new CompositeRenderer();

// Debug: Log stats periodically
if (CONFIG.DEBUG.LOG_PERFORMANCE) {
    setInterval(() => {
        const stats = compositeRenderer.getStats();
        if (stats.fps < 20) {
            console.warn('Low FPS detected:', stats);
        } else if (CONFIG.DEBUG.VERBOSE) {
            console.log('Renderer Stats:', stats);
        }
    }, 5000);
}
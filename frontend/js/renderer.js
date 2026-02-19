// renderer.js — MOBILE + DESKTOP SAFE
// Key change: reads --bar-h and --panel-h CSS vars so renderer sizing
// is always in sync with the CSS layout, on every screen size.
// No hardcoded pixel values for layout math.

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

    // ─── Read computed layout values from CSS custom properties ──────────────
    // This is the key to keeping JS and CSS in sync on every screen size.
    // Changing --bar-h or --panel-h in CSS automatically updates renderer sizing.
    _getLayoutMeasurements() {
        const style = getComputedStyle(document.documentElement);

        const parseVar = (name, fallback) => {
            const raw = style.getPropertyValue(name).trim();
            const px  = parseFloat(raw);
            return isNaN(px) ? fallback : px;
        };

        return {
            barH:    parseVar('--bar-h',    60),
            panelH:  parseVar('--panel-h',  200),
            safeTop: parseVar('--safe-top', 0),
            safeBot: parseVar('--safe-bottom', 0),
        };
    }

    // ─── Get the true available canvas area ──────────────────────────────────
    // Uses dvh when available (matches CSS), falls back to vh.
    // This avoids a gap between the canvas and the fabric panel on mobile
    // caused by browser chrome (URL bar) changing the visible viewport.
    _getCanvasDisplaySize() {
        const { barH, panelH, safeTop, safeBot } = this._getLayoutMeasurements();

        const vhPx = window.innerHeight; // always the CSS viewport height
        const usedH = barH + panelH + safeTop + safeBot;
        const canvasH = Math.max(vhPx - usedH, 100); // never collapse to 0

        return {
            width:  window.innerWidth,
            height: canvasH,
        };
    }

    init(width, height) {
        try {
            console.log('🎬 Initializing Renderer...');

            // Use actual display dimensions, not the video dimensions passed in,
            // for canvas layout. Video dimensions are only for texture/aspect.
            this._videoW = width;
            this._videoH = height;

            // Size the canvas to fill the correct viewport area
            this._applyCanvasSize();

            this.setupVideoBackground();

            window.addEventListener('resize', Utils.debounce(() => this.onResize(), 250));

            // On mobile, the browser fires visualViewport resize when the
            // URL bar appears/disappears. Handle it so canvas doesn't gap.
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize',
                    Utils.debounce(() => this.onResize(), 100));
            }

            console.log('✅ Renderer initialized');

        } catch (error) {
            console.error('❌ Renderer init failed:', error);
            throw error;
        }
    }

    // ─── Apply canvas display + buffer size ──────────────────────────────────
    _applyCanvasSize() {
        const { width, height } = this._getCanvasDisplaySize();
        const scale = CONFIG.PERFORMANCE.RENDER_SCALE;
        const dpr   = Math.min(window.devicePixelRatio || 1, 2);

        // CSS display size — the canvas element's visible area
        this.canvas.style.position = 'fixed';
        this.canvas.style.top      = '0';
        this.canvas.style.left     = '0';
        this.canvas.style.width    = '100vw';
        this.canvas.style.height   = height + 'px';
        // Note: canvas top offset is handled by CSS (#main-canvas { top: ... })
        // We only set height here so Three.js renderer matches.

        // WebGL buffer size — higher resolution for sharp rendering
        const bufferW = Math.floor(window.innerWidth  * dpr * scale);
        const bufferH = Math.floor(height * dpr * scale);

        this.canvas.width  = bufferW;
        this.canvas.height = bufferH;

        // Sync Three.js renderer
        const renderer = sceneManager.getRenderer();
        if (renderer) {
            renderer.setSize(window.innerWidth, height);
            renderer.setPixelRatio(Math.min(dpr, 2));
        }

        // Sync camera aspect
        const camera = sceneManager.getCamera();
        if (camera) {
            camera.aspect = window.innerWidth / height;
            camera.updateProjectionMatrix();
        }

        console.log(`📐 Canvas: display=${window.innerWidth}x${height} buffer=${bufferW}x${bufferH}`);
    }

    setupVideoBackground() {
        const video = cameraManager.video;
        if (!video) { console.warn('⚠️ Video element not found'); return; }

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
        console.log('🎥 Creating mirrored video background...');

        this.videoTexture = new THREE.VideoTexture(video);
        this.videoTexture.minFilter = THREE.LinearFilter;
        this.videoTexture.magFilter = THREE.LinearFilter;
        this.videoTexture.format    = THREE.RGBAFormat;
        this.videoTexture.colorSpace = THREE.SRGBColorSpace;

        // Mirror the texture horizontally so user sees selfie view.
        this.videoTexture.repeat.set(-1, 1);
        this.videoTexture.offset.set(1, 0);

        this._createVideoPlane(video);
    }

    _createVideoPlane(video) {
        const camera = sceneManager.getCamera();
        const scene  = sceneManager.getScene();

        if (this.videoPlane) {
            scene.remove(this.videoPlane);
            this.videoPlane.geometry.dispose();
            this.videoPlane.material.dispose();
            this.videoPlane = null;
        }

        const vW = video.videoWidth  || this._videoW;
        const vH = video.videoHeight || this._videoH;

        const videoAspect  = vW / vH;
        const cameraAspect = camera.aspect;
        const distance = 10;
        const vFOV = camera.fov * Math.PI / 180;

        console.log(`📹 Video: ${vW}x${vH} (aspect ${videoAspect.toFixed(2)})`);
        console.log(`📷 Camera aspect: ${cameraAspect.toFixed(2)}`);

        let planeHeight, planeWidth;
        if (videoAspect > cameraAspect) {
            planeHeight = 2 * Math.tan(vFOV / 2) * distance;
            planeWidth  = planeHeight * videoAspect;
        } else {
            const basePlaneHeight = 2 * Math.tan(vFOV / 2) * distance;
            planeWidth  = basePlaneHeight * cameraAspect;
            planeHeight = planeWidth / videoAspect;
        }

        console.log(`📐 Video plane: ${planeWidth.toFixed(2)} x ${planeHeight.toFixed(2)}`);

        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const material = new THREE.MeshBasicMaterial({
            map:        this.videoTexture,
            depthWrite: false,
            depthTest:  false,
            toneMapped: false,
            side:       THREE.FrontSide
        });

        this.videoPlane = new THREE.Mesh(geometry, material);
        this.videoPlane.position.set(0, 0, -distance);
        this.videoPlane.renderOrder = -1000;

        scene.add(this.videoPlane);
        console.log('✅ Mirrored video background created');
    }

    updateVideoPlaneSize() {
        const video = cameraManager.video;
        if (!video || !this.videoTexture) return;
        this._createVideoPlane(video);
    }

    // ─── World position helper ────────────────────────────────────────────────
    getWorldPositionFromScreen(nx, ny, depth = 2.5) {
        const camera = sceneManager.getCamera();
        const fov    = camera.fov * (Math.PI / 180);
        const halfH  = Math.tan(fov / 2) * depth;
        const halfW  = halfH * camera.aspect;

        const ndcX = (nx - 0.5) *  2;
        const ndcY = (ny - 0.5) * -2;

        return new THREE.Vector3(ndcX * halfW, ndcY * halfH, -depth);
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
            const now   = performance.now();
            const delta = now - this.lastRenderTime;
            const targetDelta = 1000 / CONFIG.PERFORMANCE.TARGET_FPS;

            if (delta < targetDelta - 1) return;
            this.lastRenderTime = now;

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
        const now     = performance.now();
        const elapsed = now - this.lastFpsUpdate;

        if (elapsed >= 1000) {
            const instantFps = Math.round((this.frameCount * 1000) / elapsed);
            this.fpsHistory.push(instantFps);
            if (this.fpsHistory.length > this.fpsHistorySize) this.fpsHistory.shift();
            this.fps = Math.round(
                this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
            );
            Utils.updateFPS(this.fps);
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }

    onResize() {
        console.log('🔄 Resize detected — recalculating layout');
        this._applyCanvasSize();
        this.updateVideoPlaneSize();
    }

    getFPS() { return this.fps; }

    dispose() {
        this.stop();
        if (this.videoTexture) this.videoTexture.dispose();
        if (this.videoPlane) {
            this.videoPlane.geometry.dispose();
            this.videoPlane.material.dispose();
            sceneManager.getScene().remove(this.videoPlane);
        }
    }
}

const compositeRenderer = new CompositeRenderer();
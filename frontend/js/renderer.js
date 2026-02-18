// Composite Renderer — FIXED
// Key fix: mirror the video plane horizontally so user sees selfie view,
// matching the mirrored X coords we apply in skeleton-mapper.js

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

            this.canvas.style.position = 'fixed';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
            this.canvas.style.width = '100vw';
            this.canvas.style.height = '100vh';

            const scale = CONFIG.PERFORMANCE.RENDER_SCALE;
            const displayWidth  = this.canvas.clientWidth  || window.innerWidth;
            const displayHeight = this.canvas.clientHeight || window.innerHeight;

            this.canvas.width  = displayWidth  * scale;
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

        // FIX: Mirror the texture horizontally so user sees selfie view.
        // Without this, the video is unmirrored but the jacket coords ARE
        // mirrored (via 1-x in skeleton-mapper) → they won't match visually.
        this.videoTexture.repeat.set(-1, 1);   // flip U axis
        this.videoTexture.offset.set(1, 0);    // shift back into 0-1 range

        const camera = sceneManager.getCamera();
        const scene  = sceneManager.getScene();

        const videoAspect  = video.videoWidth / video.videoHeight;
        const cameraAspect = camera.aspect;

        console.log(`📹 Video aspect: ${videoAspect.toFixed(2)} (${video.videoWidth}x${video.videoHeight})`);
        console.log(`📷 Camera aspect: ${cameraAspect.toFixed(2)}`);

        const distance = 10;
        const vFOV = camera.fov * Math.PI / 180;

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
            map:       this.videoTexture,
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
        if (!this.videoPlane) return;
        const video = cameraManager.video;
        if (!video || video.videoWidth === 0) return;

        const camera       = sceneManager.getCamera();
        const videoAspect  = video.videoWidth / video.videoHeight;
        const cameraAspect = camera.aspect;
        const distance     = 10;
        const vFOV         = camera.fov * Math.PI / 180;

        let planeHeight, planeWidth;
        if (videoAspect > cameraAspect) {
            planeHeight = 2 * Math.tan(vFOV / 2) * distance;
            planeWidth  = planeHeight * videoAspect;
        } else {
            const basePlaneHeight = 2 * Math.tan(vFOV / 2) * distance;
            planeWidth  = basePlaneHeight * cameraAspect;
            planeHeight = planeWidth / videoAspect;
        }

        this.videoPlane.geometry.dispose();
        this.videoPlane.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        console.log(`📐 Video plane resized: ${planeWidth.toFixed(2)} x ${planeHeight.toFixed(2)}`);
    }

    // Convert normalized screen coords (0-1) to 3D world position.
    // NOTE: skeleton-mapper has its own _normToWorld(); use that for jacket placement.
    // This helper is kept for other uses (e.g. UI overlays).
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
            this.fps = Math.round(this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length);
            Utils.updateFPS(this.fps);
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }

    onResize() {
        const displayWidth  = this.canvas.clientWidth  || window.innerWidth;
        const displayHeight = this.canvas.clientHeight || window.innerHeight;
        const scale         = CONFIG.PERFORMANCE.RENDER_SCALE;

        this.canvas.width  = displayWidth  * scale;
        this.canvas.height = displayHeight * scale;

        const renderer = sceneManager.getRenderer();
        if (renderer) renderer.setSize(displayWidth, displayHeight);

        const camera = sceneManager.getCamera();
        if (camera) {
            camera.aspect = displayWidth / displayHeight;
            camera.updateProjectionMatrix();
        }

        this.updateVideoPlaneSize();
        console.log(`📐 Resized: ${displayWidth}x${displayHeight}`);
    }

    getFPS()  { return this.fps; }

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
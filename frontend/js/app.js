// app.js — v2.0: integrates SMPL pose driver

class LucyApp {
    constructor() {
        this.isInitialized = false;
        this.isRunning     = false;
    }

    async init() {
        try {
            console.log('🎭 Starting Lucy Virtual Try-On v2.0…');

            Utils.checkBrowserSupport();

            // Step 1: Camera
            Utils.updateLoadingText('Initializing camera…');
            const { width, height } = await cameraManager.init();
            console.log(`✓ Camera: ${width}×${height}`);

            // Step 2: Pose tracker (MediaPipe in browser — for positioning)
            Utils.updateLoadingText('Loading pose tracking…');
            await poseTracker.init();
            console.log('✓ Pose tracker ready');

            // Step 3: Three.js scene
            Utils.updateLoadingText('Setting up 3D scene…');
            sceneManager.init();
            sceneManager.updateCamera(width, height);
            console.log('✓ Scene ready');

            // Step 4: Materials
            Utils.updateLoadingText('Initializing materials…');
            materialsManager.init();
            console.log('✓ Materials ready');

            // Step 5: Jacket model
            Utils.updateLoadingText('Loading jacket model…');
            await modelLoader.loadJacket();
            console.log('✓ Jacket model loaded');

            // Step 6: Renderer
            Utils.updateLoadingText('Initializing renderer…');
            compositeRenderer.init(width, height);
            console.log('✓ Renderer ready');

            // Step 7: Skeleton mapper (position / scale from browser MediaPipe)
            Utils.updateLoadingText('Setting up body tracking…');
            skeletonMapper.init(width, height);
            console.log('✓ Skeleton mapper ready');

            // Step 8: Fabrics
            Utils.updateLoadingText('Loading fabrics…');
            await fabricSelector.init();
            console.log('✓ Fabric selector ready');

            // Step 9: Capture manager
            captureManager.init();
            console.log('✓ Capture manager ready');

            // Step 10: AI keyframe pipeline (legacy, optional)
            Utils.updateLoadingText('Connecting AI pipeline…');
            await aiPipeline.init();
            console.log('✓ AI pipeline checked');

            // Step 11: SMPL pose driver (NEW — connects to /ws/pose)
            Utils.updateLoadingText('Connecting SMPL pose server…');
            const smplOk = await smplDriver.init();
            if (smplOk) {
                console.log('✓ SMPL pose driver active');
                smplDriver.setSmoothing(CONFIG.SMPL.SMOOTHING);
                smplDriver.setSendInterval(CONFIG.SMPL.SEND_INTERVAL_MS);
                Utils.updateStatus('ai', true);
            } else {
                console.log('ℹ️  SMPL pose server unavailable — 3D-only mode');
            }

            this.isInitialized = true;
            console.log('✅ All systems initialized');
            await this.start();

        } catch (error) {
            console.error('❌ Init failed:', error);
            Utils.showError(error.message || 'Initialization failed');
            throw error;
        }
    }

    async start() {
        if (!this.isInitialized) throw new Error('Not initialized');

        const video = cameraManager.video;
        if (!video) throw new Error('Camera video element missing');

        let attempts = 0;
        while (video.readyState < 2 && attempts < 50) {
            await Utils.wait(100);
            attempts++;
        }

        console.log('📹 Video ready:', video.videoWidth, '×', video.videoHeight);

        // Browser-side pose tracker drives positioning
        poseTracker.onPoseUpdate((poseData) => {
            skeletonMapper.update(poseData);
        });

        await poseTracker.start(video);
        console.log('✅ Browser pose tracking started');

        compositeRenderer.start();
        console.log('✅ Renderer started');

        if (aiPipeline.isActive()) aiPipeline.start();

        Utils.hideLoadingScreen();
        this._showPoseGuide();

        this.isRunning = true;
        console.log('✅ Lucy running! Stand in front of camera.');
    }

    _showPoseGuide() {
        const el = document.getElementById('pose-guide');
        if (el) {
            el.style.display = 'block';
            setTimeout(() => { el.style.display = 'none'; }, CONFIG.UI.POSE_GUIDE_DURATION);
        }
    }

    stop() {
        this.isRunning = false;
        compositeRenderer.stop();
        poseTracker.stop();
        aiPipeline.stop();
        smplDriver.stop();     // ← NEW
        cameraManager.stop();
        console.log('Application stopped');
    }

    handleError(error) {
        console.error('App error:', error);
        Utils.showError(error.message || 'An error occurred');
    }

    getStatus() {
        return {
            initialized: this.isInitialized,
            running:     this.isRunning,
            camera:      cameraManager.isReady(),
            pose:        poseTracker.isPoseDetected(),
            ai:          aiPipeline.isActive(),
            smpl:        smplDriver.isActive(),   // ← NEW
            model:       modelLoader.isModelLoaded(),
        };
    }
}

const app = new LucyApp();

function waitForMediaPipe() {
    return new Promise(resolve => {
        const t = setInterval(() => {
            if (window.Pose && window.Camera) { clearInterval(t); resolve(); }
        }, 100);
        setTimeout(() => { clearInterval(t); resolve(); }, 10000);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await waitForMediaPipe();
        app.init().catch(err => {
            console.error('Fatal:', err);
            Utils.showError('Failed to start. Please refresh.');
        });
    });
} else {
    waitForMediaPipe().then(() => {
        app.init().catch(err => {
            console.error('Fatal:', err);
            Utils.showError('Failed to start. Please refresh.');
        });
    });
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (app.isRunning) { cameraManager.pause(); compositeRenderer.stop(); }
    } else {
        if (app.isRunning) { cameraManager.resume(); compositeRenderer.start(); }
    }
});

window.addEventListener('beforeunload', () => app.stop());

window.addEventListener('error', ev => { console.error('Global error:', ev.error); app.handleError(ev.error); });
window.addEventListener('unhandledrejection', ev => { console.error('Unhandled rejection:', ev.reason); app.handleError(ev.reason); });

console.log('🎭 Lucy Virtual Try-On v2.0 — ready to initialize');
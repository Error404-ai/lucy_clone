// Main application entry point - EMERGENCY FIX

class LucyApp {
    constructor() {
        this.isInitialized = false;
        this.isRunning = false;
    }

    async init() {
        try {
            console.log('🎭 Starting Lucy Virtual Try-On...');
            console.log('🔴 EMERGENCY MODE - Extra logging enabled');
            
            // Check browser support
            Utils.checkBrowserSupport();
            
            // Step 1: Initialize camera
            Utils.updateLoadingText('Initializing camera...');
            const { width, height } = await cameraManager.init();
            console.log(`✓ Camera ready: ${width}x${height}`);
            
            // Step 2: Initialize MediaPipe Pose
            Utils.updateLoadingText('Loading pose tracking...');
            await poseTracker.init();
            console.log('✓ Pose tracking ready');
            
            // Step 3: Initialize Three.js scene
            Utils.updateLoadingText('Setting up 3D scene...');
            sceneManager.init();
            sceneManager.updateCamera(width, height);
            console.log('✓ Scene ready');
            
            // Step 4: Initialize materials manager FIRST
            Utils.updateLoadingText('Initializing materials...');
            materialsManager.init();
            console.log('✓ Materials manager ready');
            
            // Step 5: Load jacket model
            Utils.updateLoadingText('Loading jacket model...');
            await modelLoader.loadJacket();
            console.log('✓ Jacket model loaded');
            
            // Step 6: Initialize renderer
            Utils.updateLoadingText('Initializing renderer...');
            compositeRenderer.init(width, height);
            console.log('✓ Renderer ready');
            
            // Step 7: Initialize skeleton mapper
            Utils.updateLoadingText('Setting up body tracking...');
            skeletonMapper.init(width, height);
            console.log('✓ Skeleton mapper ready');
            
            // Step 8: Initialize fabric selector
            Utils.updateLoadingText('Loading fabrics...');
            await fabricSelector.init();
            console.log('✓ Fabric selector ready');
            
            // Step 9: Initialize capture manager
            captureManager.init();
            console.log('✓ Capture manager ready');
            
            // Step 10: Initialize AI pipeline (optional)
            Utils.updateLoadingText('Connecting to AI server...');
            await aiPipeline.init();
            console.log('✓ AI pipeline ready');
            
            this.isInitialized = true;
            console.log('✅ All systems initialized!');
            
            // Start the application
            await this.start();
            
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            console.error('Stack:', error.stack);
            Utils.showError(error.message || 'Initialization failed');
            throw error;
        }
    }

   async start() {
    if (!this.isInitialized) {
        throw new Error('App not initialized');
    }

    try {
        console.log('Starting application...');

        // IMPORTANT: get real video element
       const video = document.getElementById("camera-video");
await poseTracker.start(video);

        // Start pose tracking with video
        await poseTracker.start(video);

        poseTracker.onPoseUpdate((poseData) => {
            this.onPoseUpdate(poseData);
        });

        compositeRenderer.start();

        if (aiPipeline.isActive()) {
            aiPipeline.start();
        }

        Utils.hideLoadingScreen();
        this.showPoseGuide();

        this.isRunning = true;
        console.log('✅ Application running!');

    } catch (error) {
        console.error('Failed to start application:', error);
        throw error;
    }
}

    onPoseUpdate(poseData) {
        // Update skeleton mapper with new pose data
        skeletonMapper.update(poseData);
    }

    showPoseGuide() {
        const guideEl = document.getElementById('pose-guide');
        if (guideEl) {
            guideEl.style.display = 'block';
            
            setTimeout(() => {
                guideEl.style.display = 'none';
            }, CONFIG.UI.POSE_GUIDE_DURATION);
        }
    }

    stop() {
        console.log('Stopping application...');
        
        this.isRunning = false;
        
        // Stop all systems
        compositeRenderer.stop();
        poseTracker.stop();
        aiPipeline.stop();
        cameraManager.stop();
        
        console.log('Application stopped');
    }

    async restart() {
        this.stop();
        await Utils.wait(1000);
        await this.start();
    }

    handleError(error) {
        console.error('Application error:', error);
        console.error('Stack:', error.stack);
        Utils.showError(error.message || 'An error occurred');
    }

    getStatus() {
        return {
            initialized: this.isInitialized,
            running: this.isRunning,
            camera: cameraManager.isReady(),
            pose: poseTracker.isPoseDetected(),
            ai: aiPipeline.isActive(),
            model: modelLoader.isModelLoaded()
        };
    }
}

// Create global app instance
const app = new LucyApp();

// Wait for MediaPipe scripts to load
function waitForMediaPipe() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (window.Pose && window.Camera) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
        
        setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
        }, 10000);
    });
}

// Initialize when DOM and MediaPipe are ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await waitForMediaPipe();
        app.init().catch(error => {
            console.error('Fatal error:', error);
            Utils.showError('Failed to start application. Please refresh the page.');
        });
    });
} else {
    waitForMediaPipe().then(() => {
        app.init().catch(error => {
            console.error('Fatal error:', error);
            Utils.showError('Failed to start application. Please refresh the page.');
        });
    });
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Page hidden - pausing');
        if (app.isRunning) {
            cameraManager.pause();
            compositeRenderer.stop();
        }
    } else {
        console.log('Page visible - resuming');
        if (app.isRunning) {
            cameraManager.resume();
            compositeRenderer.start();
        }
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    app.stop();
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    app.handleError(event.error);
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    app.handleError(event.reason);
});

console.log('🎭 Lucy Virtual Try-On - Ready to initialize');
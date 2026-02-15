// Pose Tracker - ENHANCED with better detection reporting

class PoseTracker {
    constructor() {
        this.pose = null;
        this.landmarks = null;
        this.smoothedLandmarks = null;
        this.callbacks = [];
        this.isInitialized = false;

        this.lastProcessTime = 0;
        this.processInterval = 1000 / 30;
        this.isProcessing = false;
        
        // Detection tracking
        this.detectionCount = 0;
        this.lastDetectionLog = 0;
    }

    async init() {
        const Pose = window.Pose;

        this.pose = new Pose({
            locateFile: file =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        this.pose.setOptions({
            modelComplexity: 0,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.pose.onResults(r => this.onResults(r));
        this.isInitialized = true;
        console.log("✅ PoseTracker ready");
    }

    async start(video) {
        if (!video) {
            console.error('❌ No video element provided to pose tracker');
            return;
        }
        
        console.log('🎯 Starting pose detection on video:', video.videoWidth, 'x', video.videoHeight);
        
        const loop = async () => {
            const now = performance.now();
            if (now - this.lastProcessTime < this.processInterval || this.isProcessing) {
                requestAnimationFrame(loop);
                return;
            }

            if (video.readyState >= 2) {
                this.isProcessing = true;
                this.lastProcessTime = now;
                
                try {
                    await this.pose.send({ image: video });
                } catch (error) {
                    console.error('❌ Pose detection error:', error);
                }
                
                this.isProcessing = false;
            }

            requestAnimationFrame(loop);
        };
        loop();
    }

    onResults(results) {
        if (!results.poseLandmarks) {
            // ✅ Log when NO pose detected (but not too frequently)
            const now = performance.now();
            if (now - this.lastDetectionLog > 5000) {
                console.log('⚠️ No pose detected in last 5 seconds');
                this.lastDetectionLog = now;
            }
            
            // Still notify callbacks with null data
            this.callbacks.forEach(cb => cb({ landmarks: null }));
            return;
        }

        this.landmarks = results.poseLandmarks;
        this.detectionCount++;

        // ✅ Log successful detection (first time and every 100 frames)
        if (this.detectionCount === 1 || this.detectionCount % 100 === 0) {
            console.log(`✅ Pose detected! (count: ${this.detectionCount})`);
            console.log('   Landmarks:', this.landmarks.length, 'points');
            
            // Log key landmarks
            const L = CONFIG.SKELETON.LANDMARKS;
            const leftShoulder = this.landmarks[L.LEFT_SHOULDER];
            const rightShoulder = this.landmarks[L.RIGHT_SHOULDER];
            if (leftShoulder && rightShoulder) {
                console.log('   Shoulders visible:', 
                    `L(${leftShoulder.x.toFixed(2)}, ${leftShoulder.y.toFixed(2)})`,
                    `R(${rightShoulder.x.toFixed(2)}, ${rightShoulder.y.toFixed(2)})`
                );
            }
        }

        if (!this.smoothedLandmarks) {
            this.smoothedLandmarks = this.landmarks;
        } else {
            this.smoothedLandmarks = this.landmarks.map((lm, i) => ({
                x: Utils.ema(lm.x, this.smoothedLandmarks[i].x, 0.6),
                y: Utils.ema(lm.y, this.smoothedLandmarks[i].y, 0.6),
                z: Utils.ema(lm.z, this.smoothedLandmarks[i].z, 0.6),
                visibility: lm.visibility
            }));
        }

        // Update status indicator
        Utils.updateStatus('tracking', true);

        this.callbacks.forEach(cb => cb({ landmarks: this.smoothedLandmarks }));
    }

    // ---------- coordinate helpers ----------

    toScreenSpace(lm) {
        return {
            x: lm.x * CONFIG.CAMERA.WIDTH,
            y: lm.y * CONFIG.CAMERA.HEIGHT,
            z: lm.z * CONFIG.CAMERA.WIDTH
        };
    }

    getLandmark(name) {
        if (!this.smoothedLandmarks) return null;
        const i = CONFIG.SKELETON.LANDMARKS[name];
        return this.toScreenSpace(this.smoothedLandmarks[i]);
    }

    getShoulderWidth() {
        const l = this.getLandmark('LEFT_SHOULDER');
        const r = this.getLandmark('RIGHT_SHOULDER');
        if (!l || !r) return null;

        const dx = l.x - r.x;
        const dy = l.y - r.y;
        const dz = l.z - r.z;
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
    }

    getBodyRotation() {
        const l = this.getLandmark('LEFT_SHOULDER');
        const r = this.getLandmark('RIGHT_SHOULDER');
        if (!l || !r) return 0;

        const dz = r.z - l.z;
        const dx = r.x - l.x;
        return Math.atan2(dz, dx);
    }

    onPoseUpdate(cb) {
        this.callbacks.push(cb);
    }

    isPoseDetected() {
        return !!this.smoothedLandmarks;
    }
    
    getDetectionCount() {
        return this.detectionCount;
    }
    
    stop() {
        this.isProcessing = false;
        console.log('⏹️ Pose tracker stopped');
    }
}

const poseTracker = new PoseTracker();
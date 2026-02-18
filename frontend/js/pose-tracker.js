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

        // detection monitoring
        this.detectionCount = 0;
        this.lastDetectionLog = 0;
    }

    /* ================= INIT ================= */

    async init() {
        const Pose = window.Pose;

        this.pose = new Pose({
           locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`
        });

        this.pose.setOptions({
            modelComplexity: 0,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.55,
            minTrackingConfidence: 0.55
        });

        this.pose.onResults(r => this.onResults(r));

        this.isInitialized = true;
        console.log("✅ PoseTracker ready (AR mode)");
    }

    /* ================= START ================= */

    async start(video) {
        if (!video) {
            console.error('❌ No video provided to PoseTracker');
            return;
        }

        // ensure video is playing
        if (video.readyState < 2) {
            try { await video.play(); } catch {}
        }

        console.log('🎯 Pose detection started:', video.videoWidth, 'x', video.videoHeight);

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
                } catch (err) {
                    console.error('❌ Pose detection error:', err);
                }

                this.isProcessing = false;
            }

            requestAnimationFrame(loop);
        };

        loop();
    }

    /* ================= RESULTS ================= */

    onResults(results) {

        // --- No pose detected ---
        if (!results.poseLandmarks) {

            const now = performance.now();
            if (now - this.lastDetectionLog > 5000) {
                console.log('⚠️ No pose detected (5s)');
                this.lastDetectionLog = now;
            }

            this.smoothedLandmarks = null;
            this.callbacks.forEach(cb => cb({ landmarks: null }));
            Utils.updateStatus('tracking', false);
            return;
        }

        // --- Smooth landmarks ---
        this.landmarks = results.poseLandmarks;
        this.detectionCount++;

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

        /* ---------- STABILITY FILTER ---------- */

        const L = CONFIG.SKELETON.LANDMARKS;
        const LS = this.smoothedLandmarks[L.LEFT_SHOULDER];
        const RS = this.smoothedLandmarks[L.RIGHT_SHOULDER];

        // Reject unstable detection
        if (!LS || !RS || LS.visibility < 0.35 || RS.visibility < 0.35) {
            this.callbacks.forEach(cb => cb({ landmarks: null }));
            return;
        }

        /* ---------- VALID POSE ---------- */

        Utils.updateStatus('tracking', true);

        if (this.detectionCount === 1 || this.detectionCount % 120 === 0) {
            console.log(`✅ Stable pose detected (#${this.detectionCount})`);

        }

        this.callbacks.forEach(cb => cb({ landmarks: this.smoothedLandmarks }));
    }

    /* ================= API ================= */

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
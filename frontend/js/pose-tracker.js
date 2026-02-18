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
            modelComplexity: 1,          // FIX: was 0 (lite). Use 1 (full) for stable shoulder tracking
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.55,
            minTrackingConfidence: 0.55
        });

        this.pose.onResults(r => this.onResults(r));

        this.isInitialized = true;
        console.log("✅ PoseTracker ready");
    }

    /* ================= START ================= */

    async start(video) {
        if (!video) {
            console.error('❌ No video provided to PoseTracker');
            return;
        }

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

        this.landmarks = results.poseLandmarks;
        this.detectionCount++;

        // FIX: EMA alpha was 0.6 — way too high, caused wild jitter.
        // 0.6 means 60% new noisy value every frame → jacket flies around.
        // 0.18 means 18% new value → smooth, stable, still responsive.
        const EMA_ALPHA = 0.18;

        if (!this.smoothedLandmarks) {
            this.smoothedLandmarks = this.landmarks.map(lm => ({ ...lm }));
        } else {
            this.smoothedLandmarks = this.landmarks.map((lm, i) => ({
                x:          Utils.ema(lm.x,          this.smoothedLandmarks[i].x,          EMA_ALPHA),
                y:          Utils.ema(lm.y,          this.smoothedLandmarks[i].y,          EMA_ALPHA),
                z:          Utils.ema(lm.z,          this.smoothedLandmarks[i].z,          EMA_ALPHA),
                visibility: Utils.ema(lm.visibility, this.smoothedLandmarks[i].visibility, EMA_ALPHA)
            }));
        }

        /* ---------- STABILITY FILTER ---------- */
        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = this.smoothedLandmarks[L.LEFT_SHOULDER];
        const RS = this.smoothedLandmarks[L.RIGHT_SHOULDER];

        if (!LS || !RS || LS.visibility < 0.35 || RS.visibility < 0.35) {
            this.callbacks.forEach(cb => cb({ landmarks: null }));
            return;
        }

        Utils.updateStatus('tracking', true);

        if (this.detectionCount === 1 || this.detectionCount % 120 === 0) {
            console.log(`✅ Stable pose #${this.detectionCount} — LS=(${LS.x.toFixed(2)},${LS.y.toFixed(2)}) RS=(${RS.x.toFixed(2)},${RS.y.toFixed(2)})`);
        }

        this.callbacks.forEach(cb => cb({ landmarks: this.smoothedLandmarks }));
    }

    /* ================= API ================= */

    onPoseUpdate(cb)     { this.callbacks.push(cb); }
    isPoseDetected()     { return !!this.smoothedLandmarks; }
    getDetectionCount()  { return this.detectionCount; }
    stop()               { this.isProcessing = false; console.log('⏹️ Pose tracker stopped'); }
}

const poseTracker = new PoseTracker();
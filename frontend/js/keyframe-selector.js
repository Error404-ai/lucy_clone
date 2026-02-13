// Smart Keyframe Selector - Intelligently choose frames for AI enhancement
// Only sends high-quality, stable frames to AI pipeline

class FrameQualityAnalyzer {
    /**
     * Analyzes frame quality (blur, lighting, exposure)
     */
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
    }

    /**
     * Assess overall frame quality
     */
    async assess(videoElement) {
        // Capture frame
        this.canvas.width = videoElement.videoWidth;
        this.canvas.height = videoElement.videoHeight;
        this.ctx.drawImage(videoElement, 0, 0);

        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        // Parallel assessment
        const [blurScore, lightingScore, exposureScore] = await Promise.all([
            this.assessBlur(imageData),
            this.assessLighting(imageData),
            this.assessExposure(imageData)
        ]);

        // Combined quality score (0-1)
        const quality = (blurScore * 0.4) + (lightingScore * 0.3) + (exposureScore * 0.3);

        return {
            quality,
            blur: blurScore,
            lighting: lightingScore,
            exposure: exposureScore
        };
    }

    /**
     * Detect blur using Laplacian variance
     */
    async assessBlur(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;

        // Convert to grayscale and calculate Laplacian
        let variance = 0;
        let count = 0;

        // Sample every 4th pixel for performance
        for (let y = 2; y < height - 2; y += 4) {
            for (let x = 2; x < width - 2; x += 4) {
                const idx = (y * width + x) * 4;
                const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

                // Simplified Laplacian (edge detection)
                const center = gray;
                const top = 0.299 * data[((y - 1) * width + x) * 4];
                const bottom = 0.299 * data[((y + 1) * width + x) * 4];
                const left = 0.299 * data[(y * width + (x - 1)) * 4];
                const right = 0.299 * data[(y * width + (x + 1)) * 4];

                const laplacian = Math.abs(4 * center - top - bottom - left - right);
                variance += laplacian * laplacian;
                count++;
            }
        }

        variance = variance / count;

        // Higher variance = sharper image
        // Normalize to 0-1 (empirical threshold: 100)
        const blurScore = Math.min(variance / 100, 1.0);

        return blurScore;
    }

    /**
     * Assess lighting quality
     */
    async assessLighting(imageData) {
        const data = imageData.data;
        let total = 0;
        let count = 0;

        // Sample brightness
        for (let i = 0; i < data.length; i += 16) { // Sample every 4 pixels
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            total += brightness;
            count++;
        }

        const avgBrightness = total / count;

        // Good lighting: 80-180 (out of 255)
        const optimal = 130;
        const distance = Math.abs(avgBrightness - optimal);
        const lightingScore = Math.max(0, 1 - (distance / 130));

        return lightingScore;
    }

    /**
     * Assess exposure (dynamic range)
     */
    async assessExposure(imageData) {
        const data = imageData.data;
        const histogram = new Array(256).fill(0);

        // Build brightness histogram
        for (let i = 0; i < data.length; i += 16) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const brightness = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
            histogram[brightness]++;
        }

        // Check for clipping (overexposure or underexposure)
        const totalPixels = histogram.reduce((a, b) => a + b, 0);
        const clippedDark = histogram.slice(0, 10).reduce((a, b) => a + b, 0);
        const clippedBright = histogram.slice(245, 256).reduce((a, b) => a + b, 0);

        const clippedRatio = (clippedDark + clippedBright) / totalPixels;

        // Less clipping = better exposure
        const exposureScore = Math.max(0, 1 - (clippedRatio * 5));

        return exposureScore;
    }
}

class PoseQualityAnalyzer {
    /**
     * Analyzes pose quality for virtual try-on
     */
    constructor() {
        this.optimalShoulderWidth = 0.22; // Normalized (0-1)
        this.optimalDepthDiff = 0.05;
    }

    /**
     * Assess pose quality for try-on
     */
    assess(pose) {
        if (!pose || !pose.landmarks) {
            return { quality: 0, reasons: ['No pose detected'] };
        }

        const landmarks = pose.landmarks;
        const L = CONFIG.SKELETON.LANDMARKS;

        const scores = {
            frontal: this.assessFrontal(landmarks, L),
            visibility: this.assessVisibility(landmarks, L),
            symmetry: this.assessSymmetry(landmarks, L),
            distance: this.assessDistance(landmarks, L),
            stability: this.assessStability(landmarks, L)
        };

        // Weighted combination
        const quality = 
            scores.frontal * 0.30 +
            scores.visibility * 0.25 +
            scores.symmetry * 0.20 +
            scores.distance * 0.15 +
            scores.stability * 0.10;

        return {
            quality,
            scores,
            reasons: this.generateReasons(scores)
        };
    }

    /**
     * Check if pose is frontal (facing camera)
     */
    assessFrontal(landmarks, L) {
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];

        if (!leftShoulder || !rightShoulder) return 0;

        const depthDiff = Math.abs(leftShoulder.z - rightShoulder.z);

        // Closer to 0 = more frontal
        const frontalScore = Math.max(0, 1 - (depthDiff / this.optimalDepthDiff));

        return frontalScore;
    }

    /**
     * Check landmark visibility
     */
    assessVisibility(landmarks, L) {
        const keyPoints = [
            L.LEFT_SHOULDER, L.RIGHT_SHOULDER,
            L.LEFT_ELBOW, L.RIGHT_ELBOW,
            L.LEFT_HIP, L.RIGHT_HIP,
            L.NOSE
        ];

        let totalVisibility = 0;
        let count = 0;

        keyPoints.forEach(idx => {
            const landmark = landmarks[idx];
            if (landmark && landmark.visibility !== undefined) {
                totalVisibility += landmark.visibility;
                count++;
            }
        });

        return count > 0 ? totalVisibility / count : 0;
    }

    /**
     * Check left-right symmetry
     */
    assessSymmetry(landmarks, L) {
        const pairs = [
            [L.LEFT_SHOULDER, L.RIGHT_SHOULDER],
            [L.LEFT_ELBOW, L.RIGHT_ELBOW],
            [L.LEFT_HIP, L.RIGHT_HIP]
        ];

        let symmetrySum = 0;
        let validPairs = 0;

        pairs.forEach(([leftIdx, rightIdx]) => {
            const left = landmarks[leftIdx];
            const right = landmarks[rightIdx];

            if (left && right && left.visibility && right.visibility) {
                const visibilityDiff = Math.abs(left.visibility - right.visibility);
                symmetrySum += (1 - visibilityDiff);
                validPairs++;
            }
        });

        return validPairs > 0 ? symmetrySum / validPairs : 0;
    }

    /**
     * Check distance from camera (shoulder width)
     */
    assessDistance(landmarks, L) {
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];

        if (!leftShoulder || !rightShoulder) return 0;

        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);

        // Compare to optimal
        const deviation = Math.abs(shoulderWidth - this.optimalShoulderWidth);
        const distanceScore = Math.max(0, 1 - (deviation / this.optimalShoulderWidth));

        return distanceScore;
    }

    /**
     * Check pose stability (low movement)
     */
    assessStability(landmarks, L) {
        // This would compare to previous frame
        // For now, return neutral score
        // TODO: Implement frame-to-frame comparison
        return 0.8;
    }

    /**
     * Generate human-readable reasons
     */
    generateReasons(scores) {
        const reasons = [];

        if (scores.frontal < 0.7) reasons.push('Turn to face camera directly');
        if (scores.visibility < 0.7) reasons.push('Ensure full body is visible');
        if (scores.distance < 0.6) reasons.push('Adjust distance from camera');
        if (scores.stability < 0.5) reasons.push('Hold still for better capture');

        return reasons;
    }
}

class SmartKeyframeSelector {
    /**
     * Intelligently selects optimal frames for AI enhancement
     */
    constructor() {
        this.frameAnalyzer = new FrameQualityAnalyzer();
        this.poseAnalyzer = new PoseQualityAnalyzer();
        
        this.lastKeyframe = null;
        this.lastKeyframeTime = 0;
        
        // Thresholds
        this.minQuality = 0.75;  // Minimum quality to send
        this.minInterval = 2000;  // Min 2s between keyframes
        this.maxInterval = 5000;  // Force send after 5s
        this.movementThreshold = 0.08;  // Normalized movement threshold
        
        // History
        this.qualityHistory = [];
        this.historySize = 30;  // Last 1 second at 30fps
    }

    /**
     * Decide if current frame should be sent as keyframe
     */
    async shouldSendKeyframe(currentFrame, currentPose) {
        const now = performance.now();

        // Enforce minimum interval
        if (now - this.lastKeyframeTime < this.minInterval) {
            return { should: false, reason: 'Too soon after last keyframe' };
        }

        // Force send after maximum interval
        if (now - this.lastKeyframeTime > this.maxInterval) {
            console.log('Force sending keyframe - max interval reached');
            return { should: true, reason: 'Max interval reached', quality: 0.5 };
        }

        // Assess frame quality
        const frameQuality = await this.frameAnalyzer.assess(currentFrame);
        
        if (frameQuality.quality < this.minQuality) {
            return {
                should: false,
                reason: `Frame quality too low (${frameQuality.quality.toFixed(2)})`,
                details: frameQuality
            };
        }

        // Assess pose quality
        const poseQuality = this.poseAnalyzer.assess(currentPose);
        
        if (poseQuality.quality < this.minQuality) {
            return {
                should: false,
                reason: `Pose quality too low (${poseQuality.quality.toFixed(2)})`,
                details: poseQuality
            };
        }

        // Check movement (stable pose)
        if (this.lastKeyframe && this.lastKeyframe.pose) {
            const movement = this.calculateMovement(currentPose, this.lastKeyframe.pose);
            
            if (movement > this.movementThreshold) {
                return {
                    should: false,
                    reason: `Too much movement (${movement.toFixed(3)})`,
                    movement
                };
            }
        }

        // All checks passed!
        const combinedQuality = (frameQuality.quality + poseQuality.quality) / 2;

        return {
            should: true,
            reason: 'High quality keyframe',
            quality: combinedQuality,
            frameQuality,
            poseQuality
        };
    }

    /**
     * Calculate movement between poses
     */
    calculateMovement(pose1, pose2) {
        if (!pose1 || !pose2 || !pose1.landmarks || !pose2.landmarks) return 1.0;

        const L = CONFIG.SKELETON.LANDMARKS;
        const keyPoints = [
            L.LEFT_SHOULDER, L.RIGHT_SHOULDER,
            L.LEFT_ELBOW, L.RIGHT_ELBOW,
            L.NOSE
        ];

        let totalMovement = 0;
        let count = 0;

        keyPoints.forEach(idx => {
            const p1 = pose1.landmarks[idx];
            const p2 = pose2.landmarks[idx];

            if (p1 && p2) {
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const dz = (p2.z || 0) - (p1.z || 0);
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                totalMovement += distance;
                count++;
            }
        });

        return count > 0 ? totalMovement / count : 0;
    }

    /**
     * Record keyframe sent
     */
    recordKeyframe(frame, pose, quality) {
        this.lastKeyframe = {
            frame,
            pose,
            quality,
            timestamp: performance.now()
        };
        this.lastKeyframeTime = this.lastKeyframe.timestamp;

        // Add to history
        this.qualityHistory.push(quality);
        if (this.qualityHistory.length > this.historySize) {
            this.qualityHistory.shift();
        }
    }

    /**
     * Get average recent quality
     */
    getAverageQuality() {
        if (this.qualityHistory.length === 0) return 0;
        const sum = this.qualityHistory.reduce((a, b) => a + b, 0);
        return sum / this.qualityHistory.length;
    }

    /**
     * Get time since last keyframe
     */
    getTimeSinceLastKeyframe() {
        return performance.now() - this.lastKeyframeTime;
    }

    /**
     * Reset selector state
     */
    reset() {
        this.lastKeyframe = null;
        this.lastKeyframeTime = 0;
        this.qualityHistory = [];
        console.log('Keyframe selector reset');
    }

    /**
     * Update thresholds dynamically
     */
    updateThresholds(thresholds) {
        Object.assign(this, thresholds);
        console.log('Keyframe thresholds updated:', thresholds);
    }
}

// Create global instance
const smartKeyframeSelector = new SmartKeyframeSelector();

// Export for use in AI pipeline
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartKeyframeSelector;
}
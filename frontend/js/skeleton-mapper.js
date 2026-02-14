// Enhanced Skeleton Mapper - Maps MediaPipe pose to jacket shoulders
// FIXED: Proper shoulder alignment and scaling

class EnhancedSkeletonMapper {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.initialized = false;
        this.lastPose = null;
        
        // Smoothing buffers
        this.smoothBuffer = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: 1
        };
        
        // ✅ FIXED: Calibration for proper shoulder mapping
        this.calibration = {
            // Scale: shoulder width to jacket size
            scaleMultiplier: 12.0, // ✅ Adjusted for better fit
            
            // Depth positioning
            depthOffset: -2.0, // ✅ Bring jacket closer to camera
            depthMultiplier: 4.0,
            
            // Vertical alignment
            verticalOffset: -0.3, // ✅ Align to shoulders (not torso)
            
            // Horizontal centering
            horizontalOffset: 0.0,
            
            // Smoothing factor
            smoothingAlpha: 0.3 // Higher = more responsive, lower = smoother
        };
        
        // Tracking state
        this.isTracking = false;
        this.confidenceHistory = [];
        this.minConfidence = 0.6;
    }

    init(width, height) {
        this.width = width;
        this.height = height;
        this.initialized = true;
        console.log("✅ Skeleton Mapper initialized:", width, "x", height);
    }

    update(poseData) {
        if (!this.initialized || !poseData) return;

        const landmarks = poseData.landmarks;
        if (!landmarks || landmarks.length < 33) return;

        // Check confidence
        const confidence = this.calculateConfidence(landmarks);
        if (confidence < this.minConfidence) {
            console.warn(`Low confidence: ${confidence.toFixed(2)}`);
            return;
        }

        const jacket = modelLoader.getModel();
        if (!jacket) return;

        try {
            // ✅ Calculate transformations based on SHOULDERS
            const position = this.calculateShoulderPosition(landmarks);
            const rotation = this.calculateBodyRotation(landmarks);
            const scale = this.calculateShoulderScale(landmarks);

            // Apply smoothing
            const smoothPos = this.applySmoothing(position, 'position');
            const smoothRot = this.applySmoothing(rotation, 'rotation');
            const smoothScale = this.applySmoothing({ x: scale, y: scale, z: scale }, 'scale').x;

            // Apply to jacket
            jacket.position.set(smoothPos.x, smoothPos.y, smoothPos.z);
            jacket.rotation.set(smoothRot.x, smoothRot.y, smoothRot.z);
            jacket.scale.set(smoothScale, smoothScale, smoothScale);

            // Show jacket
            this.isTracking = true;
            if (!jacket.visible) {
                jacket.visible = true;
                console.log('✅ Jacket visible - tracking shoulders');
            }

            this.lastPose = poseData;

        } catch (error) {
            console.error('Skeleton update error:', error);
        }
    }

    /**
     * ✅ FIXED: Calculate position based on SHOULDER CENTER
     */
    calculateShoulderPosition(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];
        
        if (!leftShoulder || !rightShoulder) {
            return { x: 0, y: 0, z: 0 };
        }

        // Calculate shoulder center
        const shoulderCenter = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: (leftShoulder.y + rightShoulder.y) / 2,
            z: (leftShoulder.z + rightShoulder.z) / 2
        };

        // Get nose for depth reference
        const nose = landmarks[L.NOSE];
        const avgDepth = nose ? (leftShoulder.z + rightShoulder.z + nose.z) / 3 : shoulderCenter.z;

        // Map to world coordinates
        const x = (shoulderCenter.x - 0.5) * 10 + this.calibration.horizontalOffset;
        const y = -(shoulderCenter.y - 0.5) * 10 + this.calibration.verticalOffset;
        const z = this.calibration.depthOffset + (avgDepth * this.calibration.depthMultiplier);

        return { x, y, z };
    }

    /**
     * ✅ Calculate rotation from shoulder orientation
     */
    calculateBodyRotation(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];
        
        if (!leftShoulder || !rightShoulder) {
            return { x: Math.PI, y: Math.PI, z: 0 };
        }

        // Roll (shoulder tilt)
        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;
        const rollAngle = Math.atan2(dy, dx);
        
        // Yaw (turning left/right)
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);
        const depthDiff = rightShoulder.z - leftShoulder.z;
        const yawAngle = Math.atan2(depthDiff, shoulderWidth) * 1.5;
        
        return {
            x: Math.PI,
            y: Math.PI + yawAngle,
            z: -rollAngle
        };
    }

    /**
     * ✅ FIXED: Calculate scale based on SHOULDER WIDTH
     */
    calculateShoulderScale(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];
        
        if (!leftShoulder || !rightShoulder) {
            return 1.0;
        }

        // Calculate shoulder width
        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;
        const dz = rightShoulder.z - leftShoulder.z;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Scale based on shoulder width
        let scale = shoulderWidth * this.calibration.scaleMultiplier;

        // Clamp to reasonable range
        return Utils.clamp(scale, 4.0, 12.0);
    }

    /**
     * Apply exponential smoothing
     */
    applySmoothing(current, key) {
        const alpha = this.calibration.smoothingAlpha;
        const prev = this.smoothBuffer[key];

        const smoothed = {
            x: Utils.ema(current.x, prev.x, alpha),
            y: Utils.ema(current.y, prev.y, alpha),
            z: Utils.ema(current.z, prev.z, alpha)
        };

        this.smoothBuffer[key] = smoothed;
        return smoothed;
    }

    /**
     * Calculate pose confidence
     */
    calculateConfidence(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        const keyPoints = [
            L.LEFT_SHOULDER, L.RIGHT_SHOULDER,
            L.LEFT_ELBOW, L.RIGHT_ELBOW,
            L.NOSE
        ];
        
        let totalVisibility = 0;
        let validPoints = 0;
        
        keyPoints.forEach(idx => {
            const landmark = landmarks[idx];
            if (landmark && landmark.visibility !== undefined) {
                totalVisibility += landmark.visibility;
                validPoints++;
            }
        });
        
        return validPoints > 0 ? totalVisibility / validPoints : 0;
    }

    /**
     * Reset mapper state
     */
    reset() {
        this.smoothBuffer = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: 1
        };
        this.lastPose = null;
        this.isTracking = false;
        console.log('Skeleton mapper reset');
    }

    /**
     * Get tracking status
     */
    getTrackingStatus() {
        return {
            isTracking: this.isTracking
        };
    }

    /**
     * Update calibration
     */
    updateCalibration(params) {
        Object.assign(this.calibration, params);
        console.log('Calibration updated:', params);
    }
}

// Create global instance
const skeletonMapper = new EnhancedSkeletonMapper();
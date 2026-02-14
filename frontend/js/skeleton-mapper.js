// Skeleton Mapper - CORRECTED with forced jacket visibility and better positioning

class EnhancedSkeletonMapper {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.initialized = false;
        this.lastPose = null;
        this.hasShownJacket = false;
        
        // Smoothing buffers
        this.smoothBuffer = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: 1
        };
        
        // ✅ CORRECTED: Much more aggressive calibration
        this.calibration = {
            // Scale based on shoulder width
            scaleMultiplier: 16.0, // ✅ INCREASED from 12 to 16
            
            // Depth positioning (bring closer)
            depthOffset: -1.0, // ✅ MUCH closer (was -2.0)
            depthMultiplier: 3.0, // ✅ Reduced
            
            // Vertical alignment (at shoulders)
            verticalOffset: -0.8, // ✅ Raised up (was -0.3)
            
            // Horizontal centering
            horizontalOffset: 0.0,
            
            // Smoothing
            smoothingAlpha: 0.2
        };
        
        // Tracking state
        this.isTracking = false;
        this.confidenceHistory = [];
        this.minConfidence = 0.4; // ✅ Lower threshold
        this.updateCount = 0;
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

        this.updateCount++;

        // ✅ Get jacket immediately
        const jacket = modelLoader.getModel();
        if (!jacket) {
            console.warn('Jacket model not loaded');
            return;
        }

        // Check confidence
        const confidence = this.calculateConfidence(landmarks);
        this.confidenceHistory.push(confidence);
        if (this.confidenceHistory.length > 30) {
            this.confidenceHistory.shift();
        }

        // ✅ FORCE SHOW jacket after a few frames, regardless of confidence
        if (!this.hasShownJacket && this.updateCount > 10) {
            jacket.visible = true;
            this.hasShownJacket = true;
            console.log('🎯 FORCING jacket visible at update', this.updateCount);
        }

        // ✅ Continue updating even with lower confidence
        if (confidence < this.minConfidence) {
            if (this.updateCount % 30 === 0) {
                console.warn(`Low confidence: ${confidence.toFixed(2)} (still updating)`);
            }
            // Don't return - keep updating position
        }

        try {
            // Calculate transformations
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

            // Ensure visibility
            if (!jacket.visible) {
                jacket.visible = true;
                console.log('✅ Jacket made visible');
            }

            this.isTracking = true;
            this.lastPose = poseData;

            // Log every 60 frames
            if (this.updateCount % 60 === 0) {
                console.log(`📊 Jacket pos: (${smoothPos.x.toFixed(2)}, ${smoothPos.y.toFixed(2)}, ${smoothPos.z.toFixed(2)}), scale: ${smoothScale.toFixed(2)}`);
            }

        } catch (error) {
            console.error('Skeleton update error:', error);
        }
    }

    /**
     * ✅ Calculate position based on SHOULDER CENTER
     */
    calculateShoulderPosition(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];
        
        if (!leftShoulder || !rightShoulder) {
            return { x: 0, y: 0, z: 0 };
        }

        // Shoulder center
        const shoulderCenter = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: (leftShoulder.y + rightShoulder.y) / 2,
            z: (leftShoulder.z + rightShoulder.z) / 2
        };

        // Depth reference
        const nose = landmarks[L.NOSE];
        const avgDepth = nose ? (leftShoulder.z + rightShoulder.z + nose.z) / 3 : shoulderCenter.z;

        // ✅ Map to world coordinates (wider multiplier)
        const x = (shoulderCenter.x - 0.5) * 15 + this.calibration.horizontalOffset; // ✅ WIDER (was 10)
        const y = -(shoulderCenter.y - 0.5) * 15 + this.calibration.verticalOffset; // ✅ WIDER (was 10)
        const z = this.calibration.depthOffset + (avgDepth * this.calibration.depthMultiplier);

        return { x, y, z };
    }

    /**
     * Calculate rotation from shoulder orientation
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
        
        // Yaw (turning)
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
     * ✅ Calculate scale based on SHOULDER WIDTH
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

        // ✅ WIDER clamp range
        return Utils.clamp(scale, 5.0, 18.0); // ✅ Increased max from 12 to 18
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
     * Force show jacket (call this from fabric selector)
     */
    forceShowJacket() {
        const jacket = modelLoader.getModel();
        if (jacket) {
            jacket.visible = true;
            this.hasShownJacket = true;
            console.log('🎯 Jacket FORCED visible');
        }
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
        this.hasShownJacket = false;
        this.updateCount = 0;
        console.log('Skeleton mapper reset');
    }

    /**
     * Get tracking status
     */
    getTrackingStatus() {
        return {
            isTracking: this.isTracking,
            hasShownJacket: this.hasShownJacket,
            updateCount: this.updateCount
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
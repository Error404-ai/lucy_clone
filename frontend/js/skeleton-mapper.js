// Enhanced Skeleton Mapper - Production-Grade Pose Tracking
// Maps MediaPipe pose to 3D jacket with precision and stability

class KalmanFilter {
    /**
     * 1D Kalman filter for smooth tracking
     */
    constructor(processNoise = 0.001, measurementNoise = 0.1) {
        this.x = 0;  // estimated state
        this.P = 1;  // estimation error covariance
        this.Q = processNoise;  // process noise
        this.R = measurementNoise;  // measurement noise
    }
    
    update(measurement) {
        // Prediction step
        const P_pred = this.P + this.Q;
        
        // Update step
        const K = P_pred / (P_pred + this.R);
        this.x = this.x + K * (measurement - this.x);
        this.P = (1 - K) * P_pred;
        
        return this.x;
    }
    
    reset() {
        this.x = 0;
        this.P = 1;
    }
}

class BodyMeasurements {
    /**
     * Extract body measurements from pose landmarks
     */
    constructor() {
        this.measurements = {
            shoulderWidth: 0,
            torsoLength: 0,
            armLength: 0,
            chestWidth: 0,
            hipWidth: 0
        };
    }
    
    extract(landmarks) {
        if (!landmarks || landmarks.length < 33) return null;
        
        const L = CONFIG.SKELETON.LANDMARKS;
        
        // Shoulder width
        this.measurements.shoulderWidth = this.distance3D(
            landmarks[L.LEFT_SHOULDER],
            landmarks[L.RIGHT_SHOULDER]
        );
        
        // Torso length (shoulder to hip center)
        const shoulderCenter = this.midpoint(
            landmarks[L.LEFT_SHOULDER],
            landmarks[L.RIGHT_SHOULDER]
        );
        const hipCenter = this.midpoint(
            landmarks[L.LEFT_HIP],
            landmarks[L.RIGHT_HIP]
        );
        this.measurements.torsoLength = this.distance3D(shoulderCenter, hipCenter);
        
        // Arm length (shoulder to wrist)
        const leftArmLength = 
            this.distance3D(landmarks[L.LEFT_SHOULDER], landmarks[L.LEFT_ELBOW]) +
            this.distance3D(landmarks[L.LEFT_ELBOW], landmarks[L.LEFT_WRIST]);
        const rightArmLength =
            this.distance3D(landmarks[L.RIGHT_SHOULDER], landmarks[L.RIGHT_ELBOW]) +
            this.distance3D(landmarks[L.RIGHT_ELBOW], landmarks[L.RIGHT_WRIST]);
        this.measurements.armLength = (leftArmLength + rightArmLength) / 2;
        
        // Chest width (approximation from shoulders and elbow positions)
        this.measurements.chestWidth = this.measurements.shoulderWidth * 1.1;
        
        // Hip width
        this.measurements.hipWidth = this.distance3D(
            landmarks[L.LEFT_HIP],
            landmarks[L.RIGHT_HIP]
        );
        
        return this.measurements;
    }
    
    distance3D(p1, p2) {
        if (!p1 || !p2) return 0;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = (p2.z || 0) - (p1.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    midpoint(p1, p2) {
        if (!p1 || !p2) return { x: 0, y: 0, z: 0 };
        return {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2,
            z: ((p1.z || 0) + (p2.z || 0)) / 2
        };
    }
}

class EnhancedSkeletonMapper {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.initialized = false;
        this.lastPose = null;
        
        // Body measurements
        this.bodyMeasurements = new BodyMeasurements();
        this.currentMeasurements = null;
        
        // Kalman filters for smooth tracking
        this.filters = {
            posX: new KalmanFilter(0.001, 0.05),
            posY: new KalmanFilter(0.001, 0.05),
            posZ: new KalmanFilter(0.001, 0.1),
            rotX: new KalmanFilter(0.001, 0.1),
            rotY: new KalmanFilter(0.001, 0.1),
            rotZ: new KalmanFilter(0.001, 0.1),
            scale: new KalmanFilter(0.001, 0.05)
        };
        
        // Confidence tracking
        this.confidenceHistory = [];
        this.confidenceHistorySize = 10;
        this.minConfidence = 0.7;
        
        // Performance optimization
        this.lastUpdateTime = 0;
        this.updateInterval = 1000 / 60; // 60 FPS max
        
        // Enhanced calibration
        this.calibration = {
            scaleMultiplier: 18.0,
            depthMultiplier: -8.0,
            verticalOffset: -0.5,
            horizontalOffset: 0.0,
            
            // Regional scale factors
            shoulderScale: 1.15,
            chestScale: 1.1,
            waistScale: 1.0,
            hipScale: 0.95
        };
        
        // Tracking state
        this.isTracking = false;
        this.trackingQuality = 0;
    }

    /**
     * Initialize the mapper
     */
    init(width, height) {
        this.width = width;
        this.height = height;
        this.initialized = true;
        console.log("✅ EnhancedSkeletonMapper initialized:", width, "x", height);
    }

    /**
     * Main update loop - enhanced with multi-point tracking
     */
    update(poseData) {
        if (!this.initialized || !poseData) return;

        // Throttle updates for performance
        const now = performance.now();
        if (now - this.lastUpdateTime < this.updateInterval) return;
        this.lastUpdateTime = now;

        const landmarks = poseData.landmarks;
        if (!landmarks || landmarks.length < 33) return;

        // Calculate pose confidence
        const confidence = this.calculateConfidence(landmarks);
        this.updateConfidenceHistory(confidence);
        
        // Only update if confidence is sufficient
        if (this.getAverageConfidence() < this.minConfidence) {
            console.warn(`Low pose confidence: ${confidence.toFixed(2)}`);
            this.handleLowConfidence();
            return;
        }

        const jacket = modelLoader.getModel();
        if (!jacket) return;

        try {
            // Extract body measurements
            this.currentMeasurements = this.bodyMeasurements.extract(landmarks);
            
            // Calculate transformations with multi-point tracking
            const position = this.calculateEnhancedPosition(landmarks);
            const rotation = this.calculateEnhancedRotation(landmarks);
            const scale = this.calculateEnhancedScale(landmarks);

            // Apply Kalman smoothing
            const smoothedPosition = this.applyKalmanSmoothing(position, 'pos');
            const smoothedRotation = this.applyKalmanSmoothing(rotation, 'rot');
            const smoothedScale = this.filters.scale.update(scale);

            // Apply to jacket
            jacket.position.set(smoothedPosition.x, smoothedPosition.y, smoothedPosition.z);
            jacket.rotation.set(smoothedRotation.x, smoothedRotation.y, smoothedRotation.z);
            jacket.scale.set(smoothedScale, smoothedScale, smoothedScale);

            // Update tracking state
            this.isTracking = true;
            this.trackingQuality = confidence;

            // Auto-show jacket on first successful tracking
            if (!jacket.visible) {
                jacket.visible = true;
                console.log('✅ Jacket visible - tracking active');
            }

            this.lastPose = poseData;

        } catch (error) {
            console.error('Error in skeleton update:', error);
            this.handleUpdateError();
        }
    }

    /**
     * Enhanced position calculation with torso center tracking
     */
    calculateEnhancedPosition(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        // Get key points
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];
        const leftHip = landmarks[L.LEFT_HIP];
        const rightHip = landmarks[L.RIGHT_HIP];
        const nose = landmarks[L.NOSE];
        
        // Calculate centers
        const shoulderCenter = this.midpoint(leftShoulder, rightShoulder);
        const hipCenter = this.midpoint(leftHip, rightHip);
        
        // Torso center for stable positioning
        const torsoCenter = {
            x: (shoulderCenter.x + hipCenter.x) / 2,
            y: (shoulderCenter.y + hipCenter.y) / 2,
            z: (shoulderCenter.z + hipCenter.z) / 2
        };
        
        // Enhanced depth estimation using multiple reference points
        const avgDepth = (leftShoulder.z + rightShoulder.z + nose.z) / 3;
        const depthOffset = this.calibration.depthMultiplier + (avgDepth * 4);
        
        // Map to world coordinates
        const x = (torsoCenter.x - 0.5) * 12 + this.calibration.horizontalOffset;
        const y = -(torsoCenter.y - 0.5) * 12 + this.calibration.verticalOffset;
        const z = depthOffset;

        return { x, y, z };
    }

    /**
     * Enhanced rotation calculation with pitch/yaw/roll
     */
    calculateEnhancedRotation(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];
        const nose = landmarks[L.NOSE];
        const leftHip = landmarks[L.LEFT_HIP];
        const rightHip = landmarks[L.RIGHT_HIP];
        
        // Roll (shoulder tilt)
        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;
        const rollAngle = Math.atan2(dy, dx);
        
        // Yaw (left/right turn) - enhanced with shoulder depth
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);
        const depthDiff = rightShoulder.z - leftShoulder.z;
        const yawAngle = Math.atan2(depthDiff, shoulderWidth) * 1.8;
        
        // Pitch (looking up/down) - using nose and torso relationship
        const shoulderCenter = this.midpoint(leftShoulder, rightShoulder);
        const hipCenter = this.midpoint(leftHip, rightHip);
        const torsoCenter = this.midpoint(shoulderCenter, hipCenter);
        const pitchAngle = (nose.y - torsoCenter.y) * 0.5;
        
        return {
            x: Math.PI + pitchAngle,
            y: Math.PI + yawAngle,
            z: -rollAngle
        };
    }

    /**
     * Enhanced scale calculation with body measurements
     */
    calculateEnhancedScale(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        // Primary: shoulder width
        const shoulderWidth = this.distance3D(
            landmarks[L.LEFT_SHOULDER],
            landmarks[L.RIGHT_SHOULDER]
        );
        
        // Secondary: torso length for aspect ratio
        const shoulderCenter = this.midpoint(
            landmarks[L.LEFT_SHOULDER],
            landmarks[L.RIGHT_SHOULDER]
        );
        const hipCenter = this.midpoint(
            landmarks[L.LEFT_HIP],
            landmarks[L.RIGHT_HIP]
        );
        const torsoLength = this.distance3D(shoulderCenter, hipCenter);
        
        // Base scale from shoulder width
        let scale = shoulderWidth * this.calibration.scaleMultiplier;
        
        // Adjust based on torso proportions
        const torsoRatio = torsoLength / shoulderWidth;
        if (torsoRatio > 1.5) {
            scale *= 1.1; // Taller torso = slightly larger jacket
        } else if (torsoRatio < 1.0) {
            scale *= 0.95; // Shorter torso = slightly smaller jacket
        }
        
        // Clamp to reasonable range
        return Utils.clamp(scale, 3.0, 15.0);
    }

    /**
     * Calculate pose confidence from landmark visibilities
     */
    calculateConfidence(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        // Key points for upper body tracking
        const keyPoints = [
            L.LEFT_SHOULDER, L.RIGHT_SHOULDER,
            L.LEFT_ELBOW, L.RIGHT_ELBOW,
            L.LEFT_HIP, L.RIGHT_HIP,
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
        
        if (validPoints === 0) return 0;
        
        const avgVisibility = totalVisibility / validPoints;
        
        // Bonus for frontal pose
        const isFrontal = this.isFrontalPose(landmarks);
        const frontalBonus = isFrontal ? 0.1 : 0;
        
        // Bonus for symmetry
        const symmetryScore = this.calculateSymmetry(landmarks);
        const symmetryBonus = symmetryScore * 0.05;
        
        return Utils.clamp(avgVisibility + frontalBonus + symmetryBonus, 0, 1);
    }

    /**
     * Check if pose is frontal (facing camera)
     */
    isFrontalPose(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];
        
        if (!leftShoulder || !rightShoulder) return false;
        
        // Check shoulder depth difference
        const depthDiff = Math.abs(leftShoulder.z - rightShoulder.z);
        
        // Frontal if depth difference is small
        return depthDiff < 0.15;
    }

    /**
     * Calculate pose symmetry score
     */
    calculateSymmetry(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        // Compare left and right side visibilities
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
                const diff = Math.abs(left.visibility - right.visibility);
                symmetrySum += (1 - diff);
                validPairs++;
            }
        });
        
        return validPairs > 0 ? symmetrySum / validPairs : 0;
    }

    /**
     * Update confidence history for smoothing
     */
    updateConfidenceHistory(confidence) {
        this.confidenceHistory.push(confidence);
        if (this.confidenceHistory.length > this.confidenceHistorySize) {
            this.confidenceHistory.shift();
        }
    }

    /**
     * Get average confidence from recent history
     */
    getAverageConfidence() {
        if (this.confidenceHistory.length === 0) return 0;
        const sum = this.confidenceHistory.reduce((a, b) => a + b, 0);
        return sum / this.confidenceHistory.length;
    }

    /**
     * Apply Kalman filtering for smooth tracking
     */
    applyKalmanSmoothing(values, prefix) {
        return {
            x: this.filters[`${prefix}X`].update(values.x),
            y: this.filters[`${prefix}Y`].update(values.y),
            z: this.filters[`${prefix}Z`].update(values.z)
        };
    }

    /**
     * Handle low confidence situations
     */
    handleLowConfidence() {
        // Don't hide immediately - maintain last good pose
        if (this.isTracking) {
            console.log('Maintaining last known pose due to low confidence');
        }
        
        // If confidence has been low for extended period, hide jacket
        const recentConfidence = this.confidenceHistory.slice(-5);
        const avgRecentConfidence = recentConfidence.reduce((a, b) => a + b, 0) / recentConfidence.length;
        
        if (avgRecentConfidence < this.minConfidence * 0.5) {
            this.hideJacket();
            this.isTracking = false;
        }
    }

    /**
     * Handle update errors
     */
    handleUpdateError() {
        console.error('Skeleton update failed - resetting tracking');
        this.reset();
    }

    /**
     * Helper: calculate 3D distance
     */
    distance3D(p1, p2) {
        if (!p1 || !p2) return 0;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = (p2.z || 0) - (p1.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Helper: calculate midpoint
     */
    midpoint(p1, p2) {
        if (!p1 || !p2) return { x: 0, y: 0, z: 0 };
        return {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2,
            z: ((p1.z || 0) + (p2.z || 0)) / 2
        };
    }

    /**
     * Reset all tracking state
     */
    reset() {
        Object.values(this.filters).forEach(filter => filter.reset());
        this.confidenceHistory = [];
        this.lastPose = null;
        this.isTracking = false;
        this.trackingQuality = 0;
        console.log('Skeleton mapper reset');
    }

    /**
     * Force show jacket
     */
    forceShowJacket() {
        const jacket = modelLoader.getModel();
        if (jacket) {
            jacket.visible = true;
            this.isTracking = true;
            console.log('Jacket forced visible');
        }
    }

    /**
     * Hide jacket
     */
    hideJacket() {
        const jacket = modelLoader.getModel();
        if (jacket) {
            jacket.visible = false;
            console.log('Jacket hidden - low tracking quality');
        }
    }

    /**
     * Get current tracking status
     */
    getTrackingStatus() {
        return {
            isTracking: this.isTracking,
            quality: this.trackingQuality,
            confidence: this.getAverageConfidence(),
            measurements: this.currentMeasurements
        };
    }

    /**
     * Update calibration parameters dynamically
     */
    updateCalibration(params) {
        Object.assign(this.calibration, params);
        console.log('Calibration updated:', params);
    }
}

// Create global instance (replaces old skeletonMapper)
const skeletonMapper = new EnhancedSkeletonMapper();
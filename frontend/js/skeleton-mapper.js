// Skeleton Mapper - BALANCED for face + jacket visibility

class EnhancedSkeletonMapper {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.initialized = false;
        this.lastPose = null;
        this.hasShownJacket = false;
        this.updateCount = 0;
        
        this.smoothBuffer = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: 1
        };
        
        // ✅ BALANCED calibration - face + jacket both visible
        this.calibration = {
            scaleMultiplier: 14.0, // ✅ Moderate (was 25)
            depthOffset: -1.5, // ✅ Behind camera (was +0.5)
            depthMultiplier: 3.5,
            verticalOffset: -0.5, // ✅ At shoulders (was -2.0)
            horizontalOffset: 0.0,
            smoothingAlpha: 0.25
        };
        
        this.isTracking = false;
        this.minConfidence = 0.4;
    }

    init(width, height) {
        this.width = width;
        this.height = height;
        this.initialized = true;
        console.log("✅ Skeleton Mapper initialized");
    }

    update(poseData) {
        if (!this.initialized || !poseData) return;

        const landmarks = poseData.landmarks;
        if (!landmarks || landmarks.length < 33) return;

        this.updateCount++;

        const jacket = modelLoader.getModel();
        if (!jacket) return;

        // Show jacket after 5 frames
        if (!this.hasShownJacket && this.updateCount > 5) {
            jacket.visible = true;
            this.hasShownJacket = true;
            console.log('✅ Jacket visible');
        }

        const confidence = this.calculateConfidence(landmarks);

        try {
            const position = this.calculateShoulderPosition(landmarks);
            const rotation = this.calculateBodyRotation(landmarks);
            const scale = this.calculateShoulderScale(landmarks);

            const smoothPos = this.applySmoothing(position, 'position');
            const smoothRot = this.applySmoothing(rotation, 'rotation');
            const smoothScale = this.applySmoothing({ x: scale, y: scale, z: scale }, 'scale').x;

            jacket.position.set(smoothPos.x, smoothPos.y, smoothPos.z);
            jacket.rotation.set(smoothRot.x, smoothRot.y, smoothRot.z);
            jacket.scale.set(smoothScale, smoothScale, smoothScale);

            if (!jacket.visible) {
                jacket.visible = true;
            }

            this.isTracking = true;
            this.lastPose = poseData;

        } catch (error) {
            console.error('Skeleton update error:', error);
        }
    }

    calculateShoulderPosition(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];
        
        if (!leftShoulder || !rightShoulder) {
            return { x: 0, y: 0, z: this.calibration.depthOffset };
        }

        const shoulderCenter = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: (leftShoulder.y + rightShoulder.y) / 2,
            z: (leftShoulder.z + rightShoulder.z) / 2
        };

        const nose = landmarks[L.NOSE];
        const avgDepth = nose ? (leftShoulder.z + rightShoulder.z + nose.z) / 3 : shoulderCenter.z;

        // ✅ BALANCED position multipliers
        const x = (shoulderCenter.x - 0.5) * 12 + this.calibration.horizontalOffset;
        const y = -(shoulderCenter.y - 0.5) * 12 + this.calibration.verticalOffset;
        const z = this.calibration.depthOffset + (avgDepth * this.calibration.depthMultiplier);

        return { x, y, z };
    }

    calculateBodyRotation(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];
        
        if (!leftShoulder || !rightShoulder) {
            return { x: Math.PI, y: Math.PI, z: 0 };
        }

        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;
        const rollAngle = Math.atan2(dy, dx);
        
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);
        const depthDiff = rightShoulder.z - leftShoulder.z;
        const yawAngle = Math.atan2(depthDiff, shoulderWidth) * 1.5;
        
        return {
            x: Math.PI,
            y: Math.PI + yawAngle,
            z: -rollAngle
        };
    }

    calculateShoulderScale(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];
        
        if (!leftShoulder || !rightShoulder) {
            return 8.0;
        }

        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;
        const dz = rightShoulder.z - leftShoulder.z;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy + dz * dz);

        let scale = shoulderWidth * this.calibration.scaleMultiplier;

        // ✅ BALANCED scale range
        return Utils.clamp(scale, 5.0, 15.0);
    }

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

    forceShowJacket() {
        const jacket = modelLoader.getModel();
        if (jacket) {
            jacket.visible = true;
            this.hasShownJacket = true;
        }
    }

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
    }

    getTrackingStatus() {
        return {
            isTracking: this.isTracking,
            hasShownJacket: this.hasShownJacket,
            updateCount: this.updateCount
        };
    }

    updateCalibration(params) {
        Object.assign(this.calibration, params);
        console.log('Calibration updated:', params);
    }
}

const skeletonMapper = new EnhancedSkeletonMapper();
// Skeleton Mapper - EMERGENCY FIX for mobile visibility

class EnhancedSkeletonMapper {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.initialized = false;
        this.lastPose = null;
        this.hasShownJacket = false;
        this.updateCount = 0;
        this.forceShowAttempts = 0;
        
        this.smoothBuffer = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: 1
        };
        
        // 🔴 MOBILE-OPTIMIZED calibration
        this.calibration = {
            scaleMultiplier: 16.0,
            depthOffset: -0.5,
            depthMultiplier: 3.0,
            verticalOffset: -0.8,
            horizontalOffset: 0.0,
            smoothingAlpha: 0.2
        };
        
        this.isTracking = false;
        this.minConfidence = 0.3;
    }

    init(width, height) {
        this.width = width;
        this.height = height;
        this.initialized = true;
        console.log("✅ Skeleton Mapper initialized:", width, "x", height);
        
        // 🔴 FORCE show jacket after short delay
        setTimeout(() => {
            this.forceShowJacketNow();
        }, 2000);
    }

    update(poseData) {
        if (!this.initialized || !poseData) return;

        const landmarks = poseData.landmarks;
        if (!landmarks || landmarks.length < 33) return;

        this.updateCount++;

        const jacket = modelLoader.getModel();
        if (!jacket) return;

        // 🔴 AGGRESSIVE force show
        if (this.updateCount % 30 === 0 && !jacket.visible) {
            console.log('🔴 FORCING jacket visible at frame', this.updateCount);
            jacket.visible = true;
            this.hasShownJacket = true;
        }

        if (!this.hasShownJacket && this.updateCount > 3) {
            jacket.visible = true;
            this.hasShownJacket = true;
            console.log('🔴 Initial show at frame', this.updateCount);
        }

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

            if (this.updateCount % 60 === 0) {
                console.log(`📍 pos(${smoothPos.x.toFixed(1)}, ${smoothPos.y.toFixed(1)}, ${smoothPos.z.toFixed(1)}), scale: ${smoothScale.toFixed(1)}, visible: ${jacket.visible}`);
            }

        } catch (error) {
            console.error('❌ Update error:', error);
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

        const x = (shoulderCenter.x - 0.5) * 14 + this.calibration.horizontalOffset;
        const y = -(shoulderCenter.y - 0.5) * 14 + this.calibration.verticalOffset;
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
            return 10.0;
        }

        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;
        const dz = rightShoulder.z - leftShoulder.z;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy + dz * dz);

        let scale = shoulderWidth * this.calibration.scaleMultiplier;
        return Utils.clamp(scale, 6.0, 18.0);
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
        const keyPoints = [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_ELBOW, L.RIGHT_ELBOW, L.NOSE];
        
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
        this.forceShowJacketNow();
    }

    forceShowJacketNow() {
        this.forceShowAttempts++;
        const jacket = modelLoader.getModel();
        
        if (jacket) {
            jacket.visible = true;
            this.hasShownJacket = true;
            jacket.position.set(0, -0.8, -0.5);
            jacket.scale.set(10, 10, 10);
            
            console.log(`🔴 FORCE SHOW JACKET (attempt ${this.forceShowAttempts})`);
            console.log('   Position:', jacket.position);
            console.log('   Scale:', jacket.scale);
            console.log('   Visible:', jacket.visible);
        } else {
            console.error('❌ Jacket model not loaded');
        }
    }

    reset() {
        this.smoothBuffer = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 };
        this.lastPose = null;
        this.isTracking = false;
        this.hasShownJacket = false;
        this.updateCount = 0;
        this.forceShowAttempts = 0;
    }

    getTrackingStatus() {
        return {
            isTracking: this.isTracking,
            hasShownJacket: this.hasShownJacket,
            updateCount: this.updateCount,
            forceShowAttempts: this.forceShowAttempts
        };
    }

    updateCalibration(params) {
        Object.assign(this.calibration, params);
        console.log('📐 Calibration updated:', params);
    }
}

const skeletonMapper = new EnhancedSkeletonMapper();
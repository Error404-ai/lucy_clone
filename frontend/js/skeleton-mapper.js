// Skeleton Mapper - CRITICAL FIX - Continuous pose tracking

class SkeletonMapper {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.initialized = false;
        this.lastPoseTime = 0;
        
        // Smoothing buffers
        this.smoothBuffer = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: Math.PI, z: 0 },
            scale: 2.5
        };
        
        // Track if we've ever had pose data
        this.hasHadPose = false;
    }

    init(width, height) {
        this.width = width;
        this.height = height;
        this.initialized = true;
        console.log("✅ Skeleton Mapper initialized:", width, "x", height);
    }

    update(poseData) {
        if (!this.initialized) return;

        const jacket = modelLoader.getModel();
        if (!jacket) return;

        // ✅ Always ensure jacket is visible
        if (!jacket.visible) {
            jacket.visible = true;
            console.log('👁 Jacket made visible');
        }

        // ✅ Check if we have valid pose data
        if (!poseData || !poseData.landmarks || poseData.landmarks.length < 33) {
            // No pose detected - use center position
            if (!this.hasHadPose) {
                this.setCenterPosition(jacket);
            }
            return;
        }

        // ✅ We have pose data!
        this.hasHadPose = true;
        this.lastPoseTime = performance.now();

        try {
            const landmarks = poseData.landmarks;

            // ✅ Calculate position from shoulder landmarks
            const position = this.calculatePosition(landmarks);
            
            // ✅ Calculate rotation from shoulder orientation
            const rotation = this.calculateRotation(landmarks);
            
            // ✅ Calculate scale from shoulder width
            const scale = this.calculateScale(landmarks);

            // ✅ Apply with smoothing
            const smoothPos = this.applySmoothing(position, 'position', 0.2);
            const smoothRot = this.applySmoothing(rotation, 'rotation', 0.3);
            const smoothScale = this.applySmoothing(
                { x: scale, y: scale, z: scale },
                'scale',
                0.25
            ).x;

            // ✅ Update jacket transform
            jacket.position.set(smoothPos.x, smoothPos.y, smoothPos.z);
            jacket.rotation.set(smoothRot.x, smoothRot.y, smoothRot.z);
            jacket.scale.set(smoothScale, smoothScale, smoothScale);

            // Debug logging (throttled)
            if (Math.random() < 0.01) { // 1% of frames
                console.log('🎯 Jacket tracking:');
                console.log('   Pos:', jacket.position.toArray().map(v => v.toFixed(2)));
                console.log('   Scale:', smoothScale.toFixed(2));
            }

        } catch (error) {
            console.error('❌ Tracking error:', error);
        }
    }

    setCenterPosition(jacket) {
        // Default centered position when no pose is detected
        jacket.position.set(0, 0, 0);
        jacket.scale.set(2.5, 2.5, 2.5);
        jacket.rotation.set(0, Math.PI, 0);
        
        // Ensure visibility
        jacket.visible = true;
        
        const meshes = modelLoader.getMeshes();
        meshes.forEach(mesh => {
            mesh.visible = true;
            mesh.frustumCulled = false;
            if (mesh.renderOrder !== -1000) { // Don't change video plane
                mesh.renderOrder = 0;
            }
        });

        console.log('📍 Jacket centered (no pose)');
    }

    calculatePosition(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];

        if (!leftShoulder || !rightShoulder) {
            return { x: 0, y: 0, z: 0 };
        }

        // ✅ Calculate shoulder center
        const shoulderCenter = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: (leftShoulder.y + rightShoulder.y) / 2,
            z: (leftShoulder.z + rightShoulder.z) / 2
        };

        // ✅ Convert normalized (0-1) to Three.js world space
        // MediaPipe: (0,0) is top-left, (1,1) is bottom-right
        // Three.js: (0,0) is center
        const x = (shoulderCenter.x - 0.5) * 4;  // Scale to world units
        const y = -(shoulderCenter.y - 0.4) * 4; // Flip Y and offset
        const z = -1 + (shoulderCenter.z * 1.5); // Depth

        return { x, y, z };
    }

    calculateRotation(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];

        if (!leftShoulder || !rightShoulder) {
            return { x: 0, y: Math.PI, z: 0 };
        }

        // ✅ Calculate shoulder angle (roll)
        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;
        const rollAngle = Math.atan2(dy, dx);

        // ✅ Calculate body rotation (yaw) from depth difference
        const depthDiff = rightShoulder.z - leftShoulder.z;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);
        const yawAngle = Math.atan2(depthDiff, shoulderWidth);

        return {
            x: 0,
            y: Math.PI + yawAngle * 1.5,  // Base rotation + body turn
            z: -rollAngle * 0.8            // Shoulder tilt
        };
    }

    calculateScale(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];

        if (!leftShoulder || !rightShoulder) {
            return 2.5;  // Default scale
        }

        // ✅ Calculate shoulder width
        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);

        // ✅ Convert to scale (empirical multiplier)
        const scale = shoulderWidth * 6.0;
        
        // ✅ Clamp to reasonable range
        return Utils.clamp(scale, 2.0, 4.0);
    }

    applySmoothing(current, key, alpha) {
        const prev = this.smoothBuffer[key];

        const smoothed = {
            x: Utils.ema(current.x, prev.x, alpha),
            y: Utils.ema(current.y, prev.y, alpha),
            z: Utils.ema(current.z, prev.z, alpha)
        };

        this.smoothBuffer[key] = smoothed;
        return smoothed;
    }

    forceShowJacket() {
        const jacket = modelLoader.getModel();
        if (!jacket) return;
        
        this.setCenterPosition(jacket);
        console.log('✅ Jacket force shown at center');
    }

    reset() {
        this.smoothBuffer = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: Math.PI, z: 0 },
            scale: 2.5
        };
        this.hasHadPose = false;
        this.lastPoseTime = 0;
        console.log('🔄 Skeleton mapper reset');
    }

    getTrackingStatus() {
        const timeSinceLastPose = performance.now() - this.lastPoseTime;
        return {
            initialized: this.initialized,
            hasHadPose: this.hasHadPose,
            isTracking: timeSinceLastPose < 1000, // Lost if >1s since last pose
            timeSinceLastPose: timeSinceLastPose
        };
    }
}

const skeletonMapper = new SkeletonMapper();
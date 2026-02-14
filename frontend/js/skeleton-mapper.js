// Skeleton Mapper - CORRECTED FOR FACE VISIBILITY

class SkeletonMapper {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.initialized = false;
        this.hasSetInitialPosition = false;
        
        this.smoothBuffer = {
            position: { x: 0, y: 0.5, z: -1 },
            rotation: { x: 0, y: Math.PI, z: 0 },
            scale: 2.5  // ✅ CORRECTED: Smaller default
        };
    }

    init(width, height) {
        this.width = width;
        this.height = height;
        this.initialized = true;
        console.log("✅ Skeleton Mapper initialized:", width, "x", height);
        
        // ✅ Set initial position - CORRECTED for face visibility
        setTimeout(() => {
            this.setInitialPosition();
        }, 500);
    }

    setInitialPosition() {
        const jacket = modelLoader.getModel();
        if (!jacket) {
            console.warn('⚠️ Jacket not ready, retrying...');
            setTimeout(() => this.setInitialPosition(), 100);
            return;
        }

        // ✅ CORRECTED: Jacket on torso only, face fully visible
        jacket.position.set(0, 0.5, -1);      // Upper body, closer
        jacket.scale.set(2.5, 2.5, 2.5);      // Much smaller
        jacket.rotation.set(0, Math.PI, 0);   // Face camera
        jacket.visible = true;

        // Force all meshes visible
        const meshes = modelLoader.getMeshes();
        meshes.forEach(mesh => {
            mesh.visible = true;
            mesh.frustumCulled = false;
        });

        this.hasSetInitialPosition = true;

        console.log('✅ JACKET POSITIONED (CORRECTED):');
        console.log('   Position:', jacket.position.toArray(), '← Upper body');
        console.log('   Scale:', jacket.scale.toArray(), '← Torso size');
        console.log('   Rotation:', jacket.rotation.toArray());
        console.log('   Visible:', jacket.visible);
        console.log('   Meshes visible:', meshes.length);
    }

    update(poseData) {
        if (!this.initialized) return;

        const jacket = modelLoader.getModel();
        if (!jacket) return;

        // Always ensure visibility
        if (!jacket.visible) {
            jacket.visible = true;
        }

        // If no initial position set, set it now
        if (!this.hasSetInitialPosition) {
            this.setInitialPosition();
            return;
        }

        // If we have pose data, track it
        if (poseData && poseData.landmarks && poseData.landmarks.length >= 33) {
            try {
                const landmarks = poseData.landmarks;

                const position = this.calculatePosition(landmarks);
                const rotation = this.calculateRotation(landmarks);
                const scale = this.calculateScale(landmarks);

                // Apply with smoothing
                const smoothPos = this.applySmoothing(position, 'position', 0.2);
                const smoothRot = this.applySmoothing(rotation, 'rotation', 0.3);
                const smoothScale = this.applySmoothing(
                    { x: scale, y: scale, z: scale },
                    'scale',
                    0.25
                ).x;

                jacket.position.set(smoothPos.x, smoothPos.y, smoothPos.z);
                jacket.rotation.set(smoothRot.x, smoothRot.y, smoothRot.z);
                jacket.scale.set(smoothScale, smoothScale, smoothScale);

            } catch (error) {
                console.error('❌ Tracking error:', error);
            }
        }
        // If no pose, keep at initial position
    }

    calculatePosition(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];

        if (!leftShoulder || !rightShoulder) {
            // Default: upper body position
            return { x: 0, y: 0.5, z: -1 };
        }

        const shoulderCenter = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: (leftShoulder.y + rightShoulder.y) / 2,
            z: (leftShoulder.z + rightShoulder.z) / 2
        };

        // ✅ CORRECTED: Smaller position scaling
        const x = (shoulderCenter.x - 0.5) * (CONFIG.SKELETON.POSITION_SCALE_X || 4);
        const y = -(shoulderCenter.y - 0.35) * (CONFIG.SKELETON.POSITION_SCALE_Y || 4) + 0.5;
        const z = CONFIG.SKELETON.DEPTH_OFFSET + (shoulderCenter.z * 1.5);

        return { x, y, z };
    }

    calculateRotation(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];

        if (!leftShoulder || !rightShoulder) {
            return { x: 0, y: Math.PI, z: 0 };
        }

        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;
        const rollAngle = Math.atan2(dy, dx);

        const depthDiff = rightShoulder.z - leftShoulder.z;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);
        const yawAngle = Math.atan2(depthDiff, shoulderWidth);

        return {
            x: 0,
            y: Math.PI + yawAngle * 1.5,
            z: -rollAngle * 0.8
        };
    }

    calculateScale(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];

        if (!leftShoulder || !rightShoulder) {
            return CONFIG.JACKET.SCALE;  // Use config default
        }

        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);

        // ✅ CORRECTED: Smaller multiplier
        const scale = shoulderWidth * (CONFIG.SKELETON.BASE_SCALE || 8.0);

        // ✅ CORRECTED: Tighter range for torso only
        const minScale = CONFIG.SKELETON.MIN_SCALE || 2.0;
        const maxScale = CONFIG.SKELETON.MAX_SCALE || 4.0;
        
        return Utils.clamp(scale, minScale, maxScale);
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
        this.setInitialPosition();
    }

    reset() {
        this.smoothBuffer = {
            position: { x: 0, y: 0.5, z: -1 },
            rotation: { x: 0, y: Math.PI, z: 0 },
            scale: 2.5
        };
        this.hasSetInitialPosition = false;
    }

    getTrackingStatus() {
        return {
            initialized: this.initialized,
            hasSetInitialPosition: this.hasSetInitialPosition
        };
    }
}

const skeletonMapper = new SkeletonMapper();
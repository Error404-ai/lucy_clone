class SkeletonMapper {
    constructor() {
        this.model = null;
        this.smooth = {
            position: new THREE.Vector3(),
            scale: 1.0,
            rotation: 0
        };
        this.initialized = false;
        this.hasShownJacket = false;
    }

    async init() {
        console.log('🦴 SkeletonMapper initializing...');
        this.initialized = true;
        return true;
    }

    setJacket(model) {
        this.model = model;
        console.log('🔗 Jacket linked to body tracker');
    }

    /**
     * ✅ CRITICAL FIX: Proper body tracking with correct depth and scaling
     */
    update(poseData) {
        if (!this.model) {
            console.warn('⚠️ No jacket model');
            return;
        }

        // No pose detected - hide jacket
        if (!poseData || !poseData.landmarks) {
            this.model.visible = false;
            this.hasShownJacket = false;
            return;
        }

        const landmarks = poseData.landmarks;
        const L = CONFIG.SKELETON.LANDMARKS;

        const LS = landmarks[L.LEFT_SHOULDER];
        const RS = landmarks[L.RIGHT_SHOULDER];
        const LH = landmarks[L.LEFT_HIP];
        const RH = landmarks[L.RIGHT_HIP];

        // Check visibility
        if (!LS || !RS || !LH || !RH ||
            LS.visibility < 0.4 || RS.visibility < 0.4) {
            this.model.visible = false;
            return;
        }

        /* ================= POSITION ================= */

        // Calculate torso center (average of shoulders and hips)
        const centerX = (LS.x + RS.x + LH.x + RH.x) / 4;
        const centerY = (LS.y + RS.y + LH.y + RH.y) / 4;

        // Convert to world space with proper depth
        const DEPTH = 2.5;  // Distance from camera
        const worldPos = compositeRenderer.getWorldPositionFromScreen(
            centerX, 
            centerY, 
            DEPTH
        );

        // Smooth position
        this.smooth.position.lerp(worldPos, 0.3);
        this.model.position.copy(this.smooth.position);

        /* ================= SCALE ================= */

        // Calculate shoulder width (in normalized screen space)
        const dx = RS.x - LS.x;
        const dy = RS.y - LS.y;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);

        // ✅ FIXED: Proper scaling for normal-sized jacket
        // The jacket is now at scale 1.0, not 0.01
        const targetScale = shoulderWidth * 0.08;  // Much smaller multiplier
        const clampedScale = THREE.MathUtils.clamp(targetScale, 0.03, 0.12);

        // Smooth scale
        this.smooth.scale += (clampedScale - this.smooth.scale) * 0.3;
        this.model.scale.setScalar(this.smooth.scale);

        /* ================= ROTATION ================= */

        // Calculate body roll (shoulder tilt)
        const roll = Math.atan2(dy, dx);

        // Smooth rotation
        this.smooth.rotation += (roll - this.smooth.rotation) * 0.3;

        // Apply rotation (Y faces camera, Z is roll)
        this.model.rotation.set(
            0,
            Math.PI,  // Face camera
            this.smooth.rotation
        );

        /* ================= VISIBILITY ================= */

        this.model.visible = true;

        // Log first successful track
        if (!this.hasShownJacket) {
            console.log('✅ Jacket tracking active');
            console.log(`   Position: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`);
            console.log(`   Scale: ${this.smooth.scale.toFixed(2)}`);
            console.log(`   Shoulder width: ${shoulderWidth.toFixed(3)}`);
            this.hasShownJacket = true;
        }
    }

    /**
     * Reset tracking state
     */
    reset() {
        this.smooth.position.set(0, 0, 0);
        this.smooth.scale = 1.0;
        this.smooth.rotation = 0;
        this.hasShownJacket = false;
        if (this.model) {
            this.model.visible = false;
        }
    }

    /**
     * Get current tracking quality
     */
    getTrackingQuality() {
        if (!this.model || !this.model.visible) {
            return 0;
        }
        return 1.0;  // Simplified - could add more sophisticated metrics
    }
}

const skeletonMapper = new SkeletonMapper();
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
        
        // Store video dimensions for proper scaling
        this.videoWidth = 1280;
        this.videoHeight = 720;
    }

    async init(videoWidth, videoHeight) {
        console.log('🦴 SkeletonMapper initializing...');
        this.videoWidth = videoWidth || 1280;
        this.videoHeight = videoHeight || 720;
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
        const NOSE = landmarks[L.NOSE];

        // Check visibility
        if (!LS || !RS || !LH || !RH ||
            LS.visibility < 0.4 || RS.visibility < 0.4) {
            this.model.visible = false;
            return;
        }

        /* ================= POSITION ================= */
        
        // ✅ FIX: Anchor to SHOULDERS, not torso center
        // Calculate shoulder midpoint
        const shoulderCenterX = (LS.x + RS.x) / 2;
        const shoulderCenterY = (LS.y + RS.y) / 2;
        
        // Slight offset downward to account for collar/neckline
        const neckOffsetY = 0.02; // Move down slightly from pure shoulder center
        const anchorY = shoulderCenterY + neckOffsetY;

        // ✅ FIX: Dynamic depth based on shoulder width (closer person = wider shoulders)
        const dx = RS.x - LS.x;
        const dy = RS.y - LS.y;
        const shoulderWidthNormalized = Math.sqrt(dx * dx + dy * dy);
        
        // Estimate depth: wider shoulders = closer to camera
        // Typical shoulder width at 2.5m distance ≈ 0.2 normalized units
        const referenceWidth = 0.2;
        const estimatedDepth = 2.5 * (referenceWidth / Math.max(shoulderWidthNormalized, 0.1));
        const DEPTH = THREE.MathUtils.clamp(estimatedDepth, 1.5, 4.0);

        // Convert to world space
        const worldPos = compositeRenderer.getWorldPositionFromScreen(
            shoulderCenterX, 
            anchorY, 
            DEPTH
        );

        // Smooth position with higher weight for stability
        this.smooth.position.lerp(worldPos, 0.25);
        this.model.position.copy(this.smooth.position);

        /* ================= SCALE ================= */

        // ✅ FIX: Better scaling formula
        // The jacket model is at scale 1.0 in Blender units
        // We need to scale it based on detected shoulder width
        
        // Calculate world-space shoulder width
        const leftShoulderWorld = compositeRenderer.getWorldPositionFromScreen(LS.x, LS.y, DEPTH);
        const rightShoulderWorld = compositeRenderer.getWorldPositionFromScreen(RS.x, RS.y, DEPTH);
        const worldShoulderWidth = leftShoulderWorld.distanceTo(rightShoulderWorld);
        
        // Average human shoulder width is ~45cm = 0.45 units
        // Jacket should be slightly wider than shoulders
        const jacketToShoulderRatio = 1.4; // Jacket is 40% wider than shoulders
        const targetScale = (worldShoulderWidth * jacketToShoulderRatio) / 0.6; // 0.6 = jacket model's base width
        
        // Clamp to reasonable range
        const clampedScale = THREE.MathUtils.clamp(targetScale, 0.4, 2.0);

        // Smooth scale with gentle interpolation
        this.smooth.scale += (clampedScale - this.smooth.scale) * 0.2;
        this.model.scale.setScalar(this.smooth.scale);

        /* ================= ROTATION ================= */

        // Calculate body roll (shoulder tilt)
        const roll = Math.atan2(dy, dx);

        // Smooth rotation
        this.smooth.rotation += (roll - this.smooth.rotation) * 0.25;

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
            console.log(`   Scale: ${this.smooth.scale.toFixed(3)}`);
            console.log(`   Depth: ${DEPTH.toFixed(2)}m`);
            console.log(`   Shoulder width (normalized): ${shoulderWidthNormalized.toFixed(3)}`);
            console.log(`   Shoulder width (world): ${worldShoulderWidth.toFixed(3)}`);
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
        return 1.0;
    }
}

const skeletonMapper = new SkeletonMapper();
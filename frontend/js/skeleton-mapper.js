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
        
        // ✅ CRITICAL: Force jacket meshes to always render on top
        const meshes = modelLoader.getMeshes();
        meshes.forEach(mesh => {
            mesh.renderOrder = 9999;  // WAY above video
            mesh.frustumCulled = false;
            mesh.material.depthTest = false;  // Don't check depth
            mesh.material.side = THREE.DoubleSide;
        });
    }

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

        // Calculate torso center
        const centerX = (LS.x + RS.x) / 2;  // Use shoulders only
        const centerY = (LS.y + RS.y) / 2;

        // ✅ ULTIMATE FIX: Put jacket DIRECTLY in front of camera
        // Not in 3D space, but in screen space
        const camera = sceneManager.getCamera();
        const projectionScale = sceneManager.getProjectionScale();
        
        // Convert normalized screen coords to camera-relative position
        const screenX = (centerX - 0.5) * 2;  // -1 to 1
        const screenY = -(centerY - 0.5) * 2; // -1 to 1, flipped
        
        // Distance from camera (close enough to be visible)
        const depth = 1.5;
        
        // Calculate world position relative to camera
        const worldX = screenX * depth * projectionScale * camera.aspect;
        const worldY = screenY * depth * projectionScale;
        const worldZ = -depth;  // In front of camera
        
        const worldPos = new THREE.Vector3(worldX, worldY, worldZ);

        // Smooth position
        this.smooth.position.lerp(worldPos, 0.4);
        this.model.position.copy(this.smooth.position);

        /* ================= SCALE ================= */

        // Calculate shoulder width
        const dx = RS.x - LS.x;
        const dy = RS.y - LS.y;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);

        // Scale based on shoulder width and depth
        const targetScale = shoulderWidth * depth * 4.0;
        const clampedScale = THREE.MathUtils.clamp(targetScale, 0.5, 2.0);

        // Smooth scale
        this.smooth.scale += (clampedScale - this.smooth.scale) * 0.4;
        this.model.scale.setScalar(this.smooth.scale);

        /* ================= ROTATION ================= */

        // Calculate body roll
        const roll = Math.atan2(dy, dx);

        // Smooth rotation
        this.smooth.rotation += (roll - this.smooth.rotation) * 0.4;

        // Apply rotation (face camera)
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
            console.log(`   🎯 JACKET SHOULD BE VISIBLE NOW`);
            this.hasShownJacket = true;
        }
    }

    reset() {
        this.smooth.position.set(0, 0, 0);
        this.smooth.scale = 1.0;
        this.smooth.rotation = 0;
        this.hasShownJacket = false;
        if (this.model) {
            this.model.visible = false;
        }
    }

    getTrackingQuality() {
        if (!this.model || !this.model.visible) {
            return 0;
        }
        return 1.0;
    }
}

const skeletonMapper = new SkeletonMapper();
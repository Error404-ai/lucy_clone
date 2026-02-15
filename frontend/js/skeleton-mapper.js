// Skeleton Mapper - FIXED with CENTER fallback when no pose detected

class SkeletonMapper {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.initialized = false;

        // Jacket reference
        this.jacket = null;

        // Smooth values
        this.smooth = {
            pos: { x: 0, y: 0, z: -2 },
            rot: { x: 0, y: Math.PI, z: 0 },
            scale: 1.8
        };
        
        // Track if we have valid pose
        this.hasValidPose = false;
        this.noPoseFrames = 0;
    }

    init(w, h) {
        this.width = w;
        this.height = h;
        this.initialized = true;
        console.log('✅ SkeletonMapper initialized:', w, 'x', h);
    }

    setJacket(jacket) {
        this.jacket = jacket;
        console.log('🔗 Jacket linked to SkeletonMapper');
        
        // ✅ CRITICAL: Show jacket in CENTER immediately
        if (jacket && !this.hasValidPose) {
            this.showInCenter();
        }
    }

    forceShowJacket() {
        if (this.jacket) {
            this.jacket.visible = true;
            console.log('👁 Jacket forced visible');
            
            // Show in center if no pose
            if (!this.hasValidPose) {
                this.showInCenter();
            }
        }
    }

    /**
     * Show jacket in center of screen (fallback when no pose detected)
     */
    showInCenter() {
        if (!this.jacket) return;
        
        console.log('📍 Showing jacket in CENTER (no pose detected)');
        
        // Center position
        this.jacket.position.set(0, 0, -2);
        
        // Forward rotation
        this.jacket.rotation.set(0, Math.PI, 0);
        
        // Medium scale
        this.jacket.scale.setScalar(1.8);
        
        // Make visible
        this.jacket.visible = true;
        
        console.log('✅ Jacket positioned at center');
    }

    update(poseData) {
        const jacket = this.jacket || modelLoader.getModel();
        if (!jacket) return;

        // Check if we have valid pose data
        if (!poseData?.landmarks) {
            this.noPoseFrames++;
            
            // After 10 frames of no pose, show in center
            if (this.noPoseFrames > 10 && !this.hasValidPose) {
                this.showInCenter();
            }
            return;
        }

        const L = CONFIG.SKELETON.LANDMARKS;
        const lm = poseData.landmarks;

        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];
        const LH = lm[L.LEFT_HIP];
        const RH = lm[L.RIGHT_HIP];

        // Check if we have minimum required landmarks
        if (!LS || !RS || !LH || !RH) {
            this.noPoseFrames++;
            if (this.noPoseFrames > 10 && !this.hasValidPose) {
                this.showInCenter();
            }
            return;
        }

        // ✅ We have valid pose!
        this.hasValidPose = true;
        this.noPoseFrames = 0;

        // ---- Position (torso center, adjusted up for face visibility) ----
        const center = {
            x: (LS.x + RS.x + LH.x + RH.x) / 4,
            y: (LS.y + RS.y) / 2,          // Use shoulder midpoint (higher)
            z: (LS.z + RS.z + LH.z + RH.z) / 4
        };

        const aspect = this.width / this.height;
        const x = (center.x - 0.5) * aspect * 2;
        const y = -(center.y - 0.45) * 2;  // Offset to show face

        const shoulderDist = Math.sqrt(
            (LS.x - RS.x) ** 2 +
            (LS.y - RS.y) ** 2 +
            (LS.z - RS.z) ** 2
        );

        if (shoulderDist < 0.001) {
            this.showInCenter();
            return;
        }

        // Adjust Z distance for proper viewing
        const z = -2.0 / shoulderDist;

        // ---- Rotation ----
        const dx = RS.x - LS.x;
        const dy = RS.y - LS.y;
        const dz = RS.z - LS.z;

        const yaw = Math.atan2(dz, dx);
        const roll = Math.atan2(dy, dx);

        // ---- Scale (smaller range for proper fit) ----
        const rawScale = 1.5 / shoulderDist;
        const scale = Utils.clamp(rawScale, 1.2, 2.5);

        // ---- Smoothing ----
        this.smooth.pos = this.lerp3(this.smooth.pos, { x, y, z }, 0.25);
        this.smooth.rot = this.lerp3(
            this.smooth.rot,
            { x: 0, y: Math.PI - yaw, z: -roll },
            0.3
        );
        this.smooth.scale = Utils.ema(scale, this.smooth.scale, 0.25);

        jacket.position.set(
            this.smooth.pos.x,
            this.smooth.pos.y,
            this.smooth.pos.z
        );

        jacket.rotation.set(
            this.smooth.rot.x,
            this.smooth.rot.y,
            this.smooth.rot.z
        );

        jacket.scale.setScalar(this.smooth.scale);
        
        // Force visibility
        jacket.visible = true;
    }
    
    // Helper method for 3D lerp
    lerp3(start, end, t) {
        return {
            x: Utils.lerp(start.x, end.x, t),
            y: Utils.lerp(start.y, end.y, t),
            z: Utils.lerp(start.z, end.z, t)
        };
    }
    
    /**
     * Get current status
     */
    getStatus() {
        return {
            hasValidPose: this.hasValidPose,
            noPoseFrames: this.noPoseFrames,
            position: this.jacket ? this.jacket.position.toArray() : null,
            visible: this.jacket ? this.jacket.visible : false
        };
    }
}

// Global instance
const skeletonMapper = new SkeletonMapper();
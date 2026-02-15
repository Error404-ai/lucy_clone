// Skeleton Mapper - FIXED for proper face + torso visibility

class SkeletonMapper {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.initialized = false;

        // Jacket reference
        this.jacket = null;

        this.smooth = {
            pos: { x: 0, y: 0, z: -2 },
            rot: { x: 0, y: Math.PI, z: 0 },
            scale: 1.5                    // ✅ FIXED: Start smaller
        };
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
    }

    forceShowJacket() {
        if (this.jacket) {
            this.jacket.visible = true;
            console.log('👁 Jacket forced visible');
        }
    }

    update(poseData) {
        if (!poseData?.landmarks) return;

        const jacket = this.jacket || modelLoader.getModel();
        if (!jacket) return;

        const L = CONFIG.SKELETON.LANDMARKS;
        const lm = poseData.landmarks;

        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];
        const LH = lm[L.LEFT_HIP];
        const RH = lm[L.RIGHT_HIP];

        if (!LS || !RS || !LH || !RH) return;

        // ---- position (torso center, adjusted up for face visibility) ----
        const center = {
            x: (LS.x + RS.x + LH.x + RH.x) / 4,
            y: (LS.y + RS.y) / 2,          // ✅ FIXED: Use shoulder midpoint (higher)
            z: (LS.z + RS.z + LH.z + RH.z) / 4
        };

        const aspect = this.width / this.height;
        const x = (center.x - 0.5) * aspect * 2;
        const y = -(center.y - 0.45) * 2;  // ✅ FIXED: Offset to show face

        const shoulderDist = Math.sqrt(
            (LS.x - RS.x) ** 2 +
            (LS.y - RS.y) ** 2 +
            (LS.z - RS.z) ** 2
        );

        if (shoulderDist < 0.001) return;

        // ✅ FIXED: Adjust Z distance for proper viewing (not too close, not too far)
        const z = -2.0 / shoulderDist;

        // ---- rotation ----
        const dx = RS.x - LS.x;
        const dy = RS.y - LS.y;
        const dz = RS.z - LS.z;

        const yaw = Math.atan2(dz, dx);
        const roll = Math.atan2(dy, dx);

        // ---- scale (smaller range for proper fit) ----
        const rawScale = 1.5 / shoulderDist;
        const scale = Utils.clamp(rawScale, 1.2, 2.5);  // ✅ FIXED: Much smaller range

        // ---- smoothing ----
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
        
        // ✅ Force visibility
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
}

// Global instance
const skeletonMapper = new SkeletonMapper();
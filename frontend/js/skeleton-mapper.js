// skeleton-mapper.js — CORRECT PIPELINE
//
//  Camera → MediaPipe → Shoulder positions in screen space
//          ↓
//  Compute scale relative to screen size
//          ↓
//  Convert to world position using camera.unproject  ← no manual FOV math
//          ↓
//  Attach jacket to skeleton root via clavicle bone anchor

class SkeletonMapper {
    constructor() {
        this.model        = null;
        this.jacketMeshes = [];
        this._modelW      = 1.0;
        this._clavicleL   = null;
        this._clavicleR   = null;
        this._fabricReady = false;
        this.frameCount   = 0;
        this.initialized  = false;

        this.smooth = {
            pos:   new THREE.Vector3(0, 0, -2.5),
            scale: 0.01,
            roll:  0,
            lean:  0,
        };
    }

    async init(videoWidth, videoHeight) {
        this.initialized = true;
        console.log('🦴 SkeletonMapper initialized');
        return true;
    }

    // ─── JACKET SETUP ────────────────────────────────────────────────────────

    setJacket(model) {
        this.model        = model;
        this.jacketMeshes = modelLoader.getMeshes();

        const skeleton = modelLoader.getSkeleton();
        this._clavicleL = null;
        this._clavicleR = null;

        if (skeleton) {
            skeleton.bones.forEach(b => {
                const n = b.name.toLowerCase();
                if (n === 'clavicle_l') this._clavicleL = b;
                if (n === 'clavicle_r') this._clavicleR = b;
            });
            poseRetargeter.init(skeleton);
            console.log(`🦴 Clavicle L: ${this._clavicleL?.name ?? 'NOT FOUND'}`);
            console.log(`🦴 Clavicle R: ${this._clavicleR?.name ?? 'NOT FOUND'}`);
        }

        const bbox = new THREE.Box3().setFromObject(model);
        const sz   = new THREE.Vector3();
        bbox.getSize(sz);
        // sz.x is in model units (centimetres from the GLB)
        this._modelW = sz.x > 0 ? sz.x : 88.57;
        console.log(`📐 Model width (model units): ${this._modelW.toFixed(2)}`);

        model.visible = true;
        this._parkAtCenter();
        console.log('🧥 Jacket ready');
    }

    onFabricApplied() {
        this._fabricReady = true;
        if (this.model) this.model.visible = true;
        this.jacketMeshes = modelLoader.getMeshes();
    }

    // ─── CORE: NDC → World at a given Z depth ────────────────────────────────
    //
    // This is the ONLY correct way.
    // camera.unproject handles FOV, aspect, near/far — we don't touch any of it.
    //
    //   ndcX, ndcY : Three.js NDC  (-1 left/bottom → +1 right/top)
    //   targetZ    : world-space Z where we want the point (e.g. -2.5)
    //
    _unprojectToZ(ndcX, ndcY, targetZ, camera) {
        // Cast a ray from camera through this NDC point, find where it hits Z=targetZ
        const near = new THREE.Vector3(ndcX, ndcY, -1).unproject(camera);
        const far  = new THREE.Vector3(ndcX, ndcY,  1).unproject(camera);
        const dir  = far.clone().sub(near).normalize();
        const t    = (targetZ - near.z) / dir.z;
        return near.clone().addScaledVector(dir, t);
    }

    // ─── MAIN UPDATE ─────────────────────────────────────────────────────────

    update(poseData) {
        if (!this.model) return;
        this.model.visible = true;
        this.frameCount++;

        const cam = sceneManager.getCamera();

        if (!poseData?.landmarks) {
            this.smooth.pos.lerp(new THREE.Vector3(0, 0, -2.5), 0.05);
            this._applyTransform(this.smooth.pos, this.smooth.scale, 0, 0);
            if (poseRetargeter.initialized) poseRetargeter.resetToRest();
            return;
        }

        const lm = poseData.landmarks;
        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];

        if (!LS || !RS || LS.visibility < 0.25 || RS.visibility < 0.25) return;

        const FIXED_Z = -2.5;

        // ── STEP 1: Shoulder positions in screen space ───────────────────────
        // MediaPipe gives normalized [0,1] with origin top-left.
        // Mirror X for front-facing (selfie) camera.
        // Convert to NDC: x → [-1, 1], y → [1, -1]  (Three.js Y is up)
        const lNdcX = -(LS.x * 2 - 1);   // mirrored
        const lNdcY = -(LS.y * 2 - 1);
        const rNdcX = -(RS.x * 2 - 1);   // mirrored
        const rNdcY = -(RS.y * 2 - 1);

        // ── STEP 2: Compute scale relative to screen size ────────────────────
        // Unproject both shoulders into world space at FIXED_Z.
        // The distance between them IS the world-space shoulder width.
        const lWorld = this._unprojectToZ(lNdcX, lNdcY, FIXED_Z, cam);
        const rWorld = this._unprojectToZ(rNdcX, rNdcY, FIXED_Z, cam);
        const worldShoulderWidth = lWorld.distanceTo(rWorld);

        // Model width is in centimetres (GLB export units).
        // Three.js world units here are whatever the scene uses (effectively metres).
        // spanRatio = fraction of jacket width that maps to detected shoulder width.
        const spanRatio     = CONFIG.RIG?.SHOULDER_SPAN_RATIO ?? 0.85;
        const scaleMult     = CONFIG.JACKET.SCALE_MULTIPLIER  ?? 1.0;
        const effectiveScale = THREE.MathUtils.clamp(
            (worldShoulderWidth / (this._modelW * spanRatio)) * scaleMult,
            0.000001, 10.0
        );

        // ── STEP 3: Convert shoulder midpoint to world position ──────────────
        const midNdcX = (lNdcX + rNdcX) * 0.5;
        const midNdcY = (lNdcY + rNdcY) * 0.5;
        const worldShoulder = this._unprojectToZ(midNdcX, midNdcY, FIXED_Z, cam);

        // Tilt / lean from shoulder angle
        const roll = THREE.MathUtils.clamp(
            Math.atan2(lNdcY - rNdcY, rNdcX - lNdcX), -0.30, 0.30
        );
        const lean = (LS.z !== undefined && RS.z !== undefined)
            ? THREE.MathUtils.clamp((LS.z + RS.z) * 0.35, -0.25, 0.25) : 0;

        // Smooth everything
        this.smooth.pos.lerp(worldShoulder, 0.15);
        this.smooth.scale += (effectiveScale - this.smooth.scale) * 0.15;
        this.smooth.roll  += (roll  - this.smooth.roll)  * 0.08;
        this.smooth.lean  += (lean  - this.smooth.lean)  * 0.08;

        // ── STEP 4: Attach jacket — clavicle bones land on detected shoulders ─
        this._applyTransform(
            this.smooth.pos,
            this.smooth.scale,
            this.smooth.lean,
            this.smooth.roll
        );

        if (poseRetargeter.initialized && !smplDriver.isActive()) {
            poseRetargeter.update(lm, FIXED_Z, cam);
        }

        if (this.frameCount % 90 === 1) {
            console.log(
                `[f${this.frameCount}] ` +
                `worldSW=${worldShoulderWidth.toFixed(3)} ` +
                `modelW=${this._modelW.toFixed(2)} ` +
                `scale=${effectiveScale.toFixed(6)} ` +
                `anchor=(${worldShoulder.x.toFixed(2)}, ${worldShoulder.y.toFixed(2)}) ` +
                `Z=${FIXED_Z}`
            );
        }
    }

    // ─── APPLY TRANSFORM — bone-anchored ─────────────────────────────────────
    //
    // 1. Apply scale + rotation to model
    // 2. Place at target Z (X/Y=0) so world matrices are computed correctly
    // 3. Read actual clavicle world positions after scale
    // 4. Offset model so clavicle midpoint aligns with detected shoulder midpoint
    //
    _applyTransform(worldShoulderPos, effectiveScale, lean, roll) {
        if (!this.model) return;

        // 1. Scale and rotation
        this.model.scale.setScalar(effectiveScale);
        this.model.rotation.order = 'YXZ';
        this.model.rotation.y     =  Math.PI; // GLB faces away from camera
        this.model.rotation.x     =  lean ?? 0;
        this.model.rotation.z     =  roll ?? 0;

        // 2. Temp position: only set Z so matrixWorld is valid
        this.model.position.set(0, 0, worldShoulderPos.z);
        this.model.updateMatrixWorld(true);

        // 3. Read clavicle positions in world space
        if (this._clavicleL && this._clavicleR) {
            const wpL = new THREE.Vector3();
            const wpR = new THREE.Vector3();
            this._clavicleL.getWorldPosition(wpL);
            this._clavicleR.getWorldPosition(wpR);
            const boneMid = wpL.clone().add(wpR).multiplyScalar(0.5);

            // 4. Shift model so bone midpoint lands on detected shoulder midpoint
            this.model.position.x = worldShoulderPos.x - boneMid.x;
            this.model.position.y = worldShoulderPos.y - boneMid.y;
        } else {
            // Fallback: direct placement (no bone anchor)
            this.model.position.x = worldShoulderPos.x;
            this.model.position.y = worldShoulderPos.y;
        }
    }

    // ─── PARK AT CENTER (before pose is detected) ────────────────────────────

    _parkAtCenter() {
        const cam = sceneManager.getCamera();
        if (!cam || !this.model) return;

        const FIXED_Z  = -2.5;
        const center   = this._unprojectToZ(0, 0, FIXED_Z, cam);
        // Use 60% of screen width as a reference shoulder span
        const leftEdge = this._unprojectToZ(-0.3, 0, FIXED_Z, cam);
        const rightEdge= this._unprojectToZ( 0.3, 0, FIXED_Z, cam);
        const refWidth = leftEdge.distanceTo(rightEdge);
        const scale    = THREE.MathUtils.clamp(
            (refWidth / (this._modelW * 0.85)) * (CONFIG.JACKET.SCALE_MULTIPLIER ?? 1.0),
            0.000001, 10.0
        );
        this._applyTransform(center, scale, 0, 0);
    }

    // ─── PUBLIC API ──────────────────────────────────────────────────────────

    recalibrate() {
        this.smooth = { pos: new THREE.Vector3(0, 0, -2.5), scale: 0.01, roll: 0, lean: 0 };
        if (poseRetargeter.initialized) poseRetargeter.resetToRest();
        console.log('🔄 Reset smooth state');
    }

    isCalibrated()     { return true; }
    reset()            { this.recalibrate(); }
    getShoulderWidth() { return 0; }
    getBodyRotation()  { return this.smooth.lean; }
}

const skeletonMapper = new SkeletonMapper();
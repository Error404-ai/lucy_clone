// skeleton-mapper.js — FIXED Z + BONE-ANCHORED v4

class SkeletonMapper {
    constructor() {
        this.model          = null;
        this.jacketMeshes   = [];
        this.jacketMaterial = null;

        this.smooth = {
            pos:   new THREE.Vector3(0, 0, 0),
            scale: 0.01,
            roll:  0,
            lean:  0,
        };

        this._modelW       = 1.0;
        this._clavicleL    = null;
        this._clavicleR    = null;
        this._fabricReady  = false;
        this.frameCount    = 0;
        this.initialized   = false;
    }

    async init(videoWidth, videoHeight) {
        this.initialized = true;
        console.log('🦴 SkeletonMapper initialized');
        return true;
    }

    _videoAspect() {
        const d = cameraManager.getDimensions();
        return (d && d.width && d.height) ? d.width / d.height : 16 / 9;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // JACKET SETUP
    // ═══════════════════════════════════════════════════════════════════════════

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

        // Model width for scale calculation
        const bbox = new THREE.Box3().setFromObject(model);
        const sz   = new THREE.Vector3();
        bbox.getSize(sz);
        this._modelW = sz.x > 0 ? sz.x : 88.57;

        model.visible = true;
        this._parkAtCenter();
        console.log('🧥 Jacket ready — fixed-Z bone-anchored positioning');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FABRIC APPLIED
    // ═══════════════════════════════════════════════════════════════════════════

    onFabricApplied() {
        this._fabricReady = true;
        if (this.model) this.model.visible = true;
        this.jacketMeshes = modelLoader.getMeshes();
        this.jacketMeshes.forEach(m => {
            if (m.material) {
                this.jacketMaterial = Array.isArray(m.material) ? m.material[0] : m.material;
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MAIN UPDATE
    // ═══════════════════════════════════════════════════════════════════════════

    update(poseData) {
        if (!this.model) return;
        this.model.visible = true;
        this.frameCount++;

        const cam = sceneManager.getCamera();

        if (!poseData || !poseData.landmarks) {
            this.smooth.pos.lerp(this._centerPos(cam), 0.05);
            this.smooth.scale += (this._centerScale(cam) - this.smooth.scale) * 0.05;
            this._applyTransform(this.smooth.pos, this.smooth.scale, 0, 0);
            if (poseRetargeter.initialized) poseRetargeter.resetToRest();
            return;
        }

        const lm = poseData.landmarks;
        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];

        if (!LS || !RS || LS.visibility < 0.25 || RS.visibility < 0.25) return;

        // Mirror X for front-facing camera
        const mLSx = 1 - LS.x;
        const mRSx = 1 - RS.x;

        // Fixed Z — no monocular depth estimation
        const FIXED_Z = -2.5;

        // Shoulder midpoint in world space
        const shoulderMidNX = (mLSx + mRSx) * 0.5;
        const shoulderMidNY = (LS.y  + RS.y) * 0.5;
        const worldShoulder = this._normToWorld(shoulderMidNX, shoulderMidNY, FIXED_Z, cam);

        // Scale from detected shoulder width
        const sw            = Math.hypot(RS.x - LS.x, RS.y - LS.y);
        const worldSw       = this._normWidthToWorld(sw, FIXED_Z, cam);
        const spanRatio     = CONFIG.RIG?.SHOULDER_SPAN_RATIO ?? 0.85;
        const scaleMult     = CONFIG.JACKET.SCALE_MULTIPLIER  ?? 1.0;
        const jacketSwUnits = this._modelW * spanRatio;
        const effectiveScale = THREE.MathUtils.clamp(
            (worldSw / Math.max(jacketSwUnits, 0.0001)) * scaleMult,
            0.000001, 1.0
        );

        // Roll and lean
        const roll = THREE.MathUtils.clamp(
            Math.atan2(RS.y - LS.y, mRSx - mLSx), -0.30, 0.30
        );
        const lean = (LS.z !== undefined && RS.z !== undefined)
            ? THREE.MathUtils.clamp((LS.z + RS.z) * 0.35, -0.25, 0.25) : 0;

        // Smooth
        this.smooth.pos.lerp(worldShoulder, 0.15);
        this.smooth.scale += (effectiveScale - this.smooth.scale) * 0.15;
        this.smooth.roll  += (roll  - this.smooth.roll)  * 0.08;
        this.smooth.lean  += (lean  - this.smooth.lean)  * 0.08;

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
                `[f${this.frameCount}] sw=${sw.toFixed(3)} scale=${effectiveScale.toFixed(5)} ` +
                `anchor=(${worldShoulder.x.toFixed(2)},${worldShoulder.y.toFixed(2)}) Z=${FIXED_Z}`
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // APPLY TRANSFORM — bone-anchored
    // Sets scale/rotation first, then reads actual bone world positions,
    // then offsets the group so clavicle midpoint lands on detected shoulders.
    // ═══════════════════════════════════════════════════════════════════════════

    _applyTransform(worldShoulderPos, effectiveScale, lean, roll) {
        if (!this.model) return;

        // Step 1: apply scale and rotation
        this.model.scale.setScalar(effectiveScale);
        this.model.rotation.order = 'YXZ';
        this.model.rotation.y     = Math.PI;
        this.model.rotation.x     = lean ?? 0;
        this.model.rotation.z     = roll ?? 0;

        // Step 2: place at target Z, X=0, Y=0 so world matrices are valid
        this.model.position.set(0, 0, worldShoulderPos.z);
        this.model.updateMatrixWorld(true);

        // Step 3: read where clavicle bones landed
        if (this._clavicleL && this._clavicleR) {
            const wpL = new THREE.Vector3();
            const wpR = new THREE.Vector3();
            this._clavicleL.getWorldPosition(wpL);
            this._clavicleR.getWorldPosition(wpR);
            const boneMid = wpL.clone().add(wpR).multiplyScalar(0.5);

            // Step 4: shift group so bone midpoint aligns with detected shoulder
            this.model.position.x = worldShoulderPos.x - boneMid.x;
            this.model.position.y = worldShoulderPos.y - boneMid.y;
        } else {
            // Fallback — direct placement
            this.model.position.x = worldShoulderPos.x;
            this.model.position.y = worldShoulderPos.y;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COORDINATE UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════

    _normToWorld(nx, ny, depth, cam) {
        const va    = this._videoAspect();
        const halfH = Math.tan(cam.fov * Math.PI / 360) * Math.abs(depth);
        const halfW = halfH * va;
        return new THREE.Vector3(
            (nx - 0.5) *  2 * halfW,
            (ny - 0.5) * -2 * halfH,
            depth
        );
    }

    _normWidthToWorld(normW, depth, cam) {
        const va = this._videoAspect();
        return normW * 2 * Math.tan(cam.fov * Math.PI / 360) * Math.abs(depth) * va;
    }

    _centerPos(cam) {
        return new THREE.Vector3(0, 0, -2.5);
    }

    _centerScale(cam) {
        const FIXED_Z   = 2.5;
        const scaleMult = CONFIG.JACKET.SCALE_MULTIPLIER ?? 1.0;
        const sceneH    = 2 * Math.tan(cam.fov * Math.PI / 360) * FIXED_Z;
        const targetH   = sceneH * 0.7;
        return THREE.MathUtils.clamp(
            (targetH / this._modelW) * scaleMult,
            0.000001, 1.0
        );
    }

    _parkAtCenter() {
        const cam = sceneManager.getCamera();
        if (!cam || !this.model) return;
        this._applyTransform(this._centerPos(cam), this._centerScale(cam), 0, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    recalibrate() {
        this.smooth = { pos: new THREE.Vector3(), scale: 0.01, roll: 0, lean: 0 };
        if (poseRetargeter.initialized) poseRetargeter.resetToRest();
        console.log('🔄 Reset smooth state');
    }

    isCalibrated()     { return true; }
    reset()            { this.recalibrate(); }
    getShoulderWidth() { return 0; }
    getBodyRotation()  { return this.smooth.lean; }
}

const skeletonMapper = new SkeletonMapper();
// skeleton-mapper.js — SHOULDER-ANCHORED v3
//
// FIXES:
//   1. Anchor = SHOULDER MIDPOINT (not hip)
//      → jacket shoulder seam aligns with real shoulders
//   2. SHOULDER_SPAN_RATIO raised to 0.85 → fixes "too zoomed" oversizing
//   3. SCALE_MULTIPLIER knob in config for fine-tuning
//   4. _applyTransform offsets group so shoulderLocalY lands on detected shoulder

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

        this.cal = {
            ready:         false,
            frames:        0,
            FRAMES_NEEDED: 15,
            sumShoulderW:  0,
            shoulderWidth: null,
            depth:         null,
        };

        this._modelW         = 1.0;
        this._modelH         = 1.0;
        this._shoulderLocalY = 0.0;  // shoulder seam Y in model-local units

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

        const bbox = new THREE.Box3();
        if (this.jacketMeshes.length > 0) {
            this.jacketMeshes.forEach(m => bbox.expandByObject(m));
        } else {
            bbox.setFromObject(model);
        }

        if (!bbox.isEmpty()) {
            const sz     = new THREE.Vector3();
            bbox.getSize(sz);
            this._modelW = sz.x > 0 ? sz.x : 1.0;
            this._modelH = sz.y > 0 ? sz.y : 1.0;
            console.log(`📐 Jacket bbox — W:${sz.x.toFixed(2)} H:${sz.y.toFixed(2)} (model units)`);
        }

        this._shoulderLocalY = this._findShoulderLocalY(model, bbox);
        console.log(`🦴 Shoulder seam local Y: ${this._shoulderLocalY.toFixed(2)} model-units`);

        const skeleton = modelLoader.getSkeleton();
        if (skeleton) poseRetargeter.init(skeleton);

        this._parkAtCenter();
        model.visible = true;
        console.log('🧥 Jacket visible — waiting for pose calibration');
    }

    _findShoulderLocalY(model, bbox) {
        const skeleton = modelLoader.getSkeleton();
        if (skeleton && skeleton.bones.length > 0) {
            const bone = skeleton.bones.find(b => {
                const n = b.name.toLowerCase();
                return n.includes('clavicle') || n.includes('collar') ||
                       (n.includes('shoulder') && !n.includes('upper'));
            });
            if (bone) {
                model.updateWorldMatrix(true, true);
                const wPos = new THREE.Vector3();
                bone.getWorldPosition(wPos);
                const inv  = new THREE.Matrix4().copy(model.matrixWorld).invert();
                const lPos = wPos.clone().applyMatrix4(inv);
                console.log(`  clavicle world Y=${wPos.y.toFixed(3)} → local Y=${lPos.y.toFixed(3)}`);
                return lPos.y;
            }
        }
        // Fallback: 88% up the bbox
        if (!bbox.isEmpty()) {
            const sz = new THREE.Vector3();
            bbox.getSize(sz);
            return bbox.min.y + sz.y * 0.88;
        }
        return 0;
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
            const cp = this._centerPos(cam);
            const cs = this._centerScale(cam);
            this.smooth.pos.lerp(cp, 0.05);
            this.smooth.scale += (cs - this.smooth.scale) * 0.05;
            this._applyTransform(this.smooth.pos, this.smooth.scale, 0, 0);
            if (poseRetargeter.initialized) poseRetargeter.resetToRest();
            return;
        }

        const lm = poseData.landmarks;
        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];

        if (!LS || !RS || LS.visibility < 0.25 || RS.visibility < 0.25) return;

        if (!this.cal.ready) {
            this._calibrate(LS, RS, cam);
            this._parkAtCenter();
            return;
        }

        // Mirror X for front-facing camera
        const mLSx = 1 - LS.x;
        const mRSx = 1 - RS.x;

        // Shoulder width (normalised)
        const sw = Math.hypot(RS.x - LS.x, RS.y - LS.y);

        // Depth from shoulder width
        const depth = THREE.MathUtils.clamp(
            this.cal.depth * (this.cal.shoulderWidth / Math.max(sw, 0.03)),
            0.4, 9.0
        );

        // ── ANCHOR = shoulder midpoint ─────────────────────────────────────────
        const shoulderMidNX = (mLSx + mRSx) * 0.5;
        const shoulderMidNY = (LS.y  + RS.y) * 0.5;
        const worldShoulder = this._normToWorld(shoulderMidNX, shoulderMidNY, depth, cam);

        // ── SCALE ──────────────────────────────────────────────────────────────
        // Model is in cm (W=88.57). worldSw is in metres.
        // effectiveScale = worldSw(m) / modelW(cm) × spanRatio
        // e.g. 0.45m / (88.57 × 0.85) = 0.45/75.3 = 0.006  ← correct THREE.js scale
        // DO NOT multiply by unitScale — that caused 100× overscale before.
        const spanRatio      = CONFIG.RIG?.SHOULDER_SPAN_RATIO ?? 0.85;
        const scaleMult      = CONFIG.JACKET.SCALE_MULTIPLIER  ?? 1.0;
        const jacketSwUnits  = this._modelW * spanRatio;               // in model units (cm)
        const worldSw        = this._normWidthToWorld(sw, depth, cam); // in metres
        const effectiveScale = THREE.MathUtils.clamp(
            (worldSw / Math.max(jacketSwUnits, 0.0001)) * scaleMult,
            0.000001, 1.0
        );

        // ── ROLL & LEAN ────────────────────────────────────────────────────────
        const roll = THREE.MathUtils.clamp(
            Math.atan2(RS.y - LS.y, mRSx - mLSx), -0.30, 0.30
        );
        const lean = (LS.z !== undefined && RS.z !== undefined)
            ? THREE.MathUtils.clamp((LS.z + RS.z) * 0.35, -0.25, 0.25) : 0;

        // ── SMOOTH ────────────────────────────────────────────────────────────
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
    poseRetargeter.update(lm, depth, cam);
}

        if (this.frameCount % 90 === 1) {
            console.log(
                `[f${this.frameCount}] sw=${sw.toFixed(3)} depth=${depth.toFixed(2)}m ` +
                `scale=${effectiveScale.toFixed(5)} ` +
                `anchor=(${worldShoulder.x.toFixed(2)},${worldShoulder.y.toFixed(2)})`
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // APPLY TRANSFORM — shoulder-anchored
    //
    // worldShoulderPos = world position where the jacket SHOULDER SEAM should be
    // effectiveScale   = final THREE.js group scale (includes unitScale)
    //
    // group.position.y = worldShoulderPos.y − shoulderLocalY × effectiveScale
    // ═══════════════════════════════════════════════════════════════════════════
    _applyTransform(worldShoulderPos, effectiveScale, lean, roll) {
        if (!this.model) return;

        const pos = worldShoulderPos.clone();
        pos.y -= this._shoulderLocalY * effectiveScale;  // shift so shoulder seam aligns

        this.model.position.copy(pos);
        this.model.scale.setScalar(effectiveScale);
        this.model.rotation.order = 'YXZ';
        this.model.rotation.y     = Math.PI;
        this.model.rotation.x     = lean ?? 0;
        this.model.rotation.z     = roll ?? 0;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CALIBRATION
    // ═══════════════════════════════════════════════════════════════════════════
    _calibrate(LS, RS, cam) {
        const sw = Math.hypot(RS.x - LS.x, RS.y - LS.y);
        this.cal.sumShoulderW += sw;
        this.cal.frames++;

        if (this.cal.frames >= this.cal.FRAMES_NEEDED) {
            this.cal.shoulderWidth = this.cal.sumShoulderW / this.cal.frames;

            // Assume real shoulder width ≈ 0.45 m
            const va    = this._videoAspect();
            const halfW = Math.tan(cam.fov * Math.PI / 360) * va;
            this.cal.depth = THREE.MathUtils.clamp(
                0.45 / (this.cal.shoulderWidth * 2 * halfW),
                0.5, 7.0
            );

            this.cal.ready = true;
            console.log(
                `✅ Calibrated — shoulderW=${this.cal.shoulderWidth.toFixed(3)} ` +
                `depth=${this.cal.depth.toFixed(2)}m`
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COORDINATE UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════
    _normToWorld(nx, ny, depth, cam) {
        const va    = this._videoAspect();
        const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
        const halfW = halfH * va;
        return new THREE.Vector3(
            (nx - 0.5) *  2 * halfW,
            (ny - 0.5) * -2 * halfH,
            -depth
        );
    }

    _normWidthToWorld(normW, depth, cam) {
        const va = this._videoAspect();
        return normW * 2 * Math.tan(cam.fov * Math.PI / 360) * depth * va;
    }

    _centerPos(cam) {
        const depth = 2.5;
        const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
        return new THREE.Vector3(0, halfH * 0.10, -depth);
    }

    _centerScale(cam) {
        if (!this.model || this._modelH <= 0) return 0.006;
        const depth     = 2.5;
        const scaleMult = CONFIG.JACKET.SCALE_MULTIPLIER ?? 1.0;
        const sceneH    = 2 * Math.tan(cam.fov * Math.PI / 360) * depth;
        const targetH   = sceneH * 0.55;  // jacket fills ~55% of screen height
        // _modelH is in cm (69.39), targetH is in metres → ratio gives correct scale
        return THREE.MathUtils.clamp(
            (targetH / this._modelH) * scaleMult,
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
        this.cal = {
            ready: false, frames: 0, FRAMES_NEEDED: 15,
            sumShoulderW: 0, shoulderWidth: null, depth: null
        };
        this.smooth = { pos: new THREE.Vector3(), scale: 0.01, roll: 0, lean: 0 };
        if (poseRetargeter.initialized) poseRetargeter.resetToRest();
        console.log('🔄 Recalibrating...');
    }

    isCalibrated()     { return this.cal.ready; }
    reset()            { this.recalibrate(); }
    getShoulderWidth() { return this.cal.shoulderWidth ?? 0; }
    getBodyRotation()  { return this.smooth.lean; }
}

const skeletonMapper = new SkeletonMapper();
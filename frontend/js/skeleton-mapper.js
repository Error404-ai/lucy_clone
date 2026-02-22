// skeleton-mapper.js — HIP-ANCHORED, UNIT-SCALE FIXED
//
// THE BUG THAT CAUSED INVISIBLE JACKET:
//   _applyGroupTransform was calling:
//     this.model.scale.setScalar(scale)          ← scale ≈ 0.962
//     pos.y -= pelvisLocalY * unitScale * scale  ← offset used unitScale=0.01
//
//   These were INCONSISTENT:
//     • The offset assumed the model would be at scale 0.962 × 0.01 = 0.00962
//     • But the model was actually set to scale 0.962 (100× too large)
//     • Pelvis bone world Y = group.pos.y + 91.354 × 0.962 = group.pos.y + 87.9m
//     • ALL bones were ≈88 metres off-screen → jacket invisible
//
// THE FIX:
//     effectiveScale = scale × unitScale          (0.962 × 0.01 = 0.00962)
//     this.model.scale.setScalar(effectiveScale)  ← apply BOTH factors to model
//     pos.y -= pelvisLocalY × effectiveScale      ← offset now consistent with scale
//
//   Verification:
//     pelvis world Y = group.pos.y + 91.354 × 0.00962 = group.pos.y + 0.879m ✓
//     shoulder (local Y≈130) world Y = group.pos.y + 130 × 0.00962 = group.pos.y + 1.25m ✓
//     jacket width = 88.574 × 0.60 × 0.00962 ≈ 0.511m = detected shoulder width ✓

class SkeletonMapper {
    constructor() {
        this.model          = null;
        this.jacketMeshes   = [];
        this.jacketMaterial = null;

        this.smooth = {
            position: new THREE.Vector3(0, 0, 0),
            scale:    1.0,
            roll:     0,
            lean:     0,
        };

        this.cal = {
            ready:         false,
            frames:        0,
            FRAMES_NEEDED: 20,
            sumShoulderW:  0,
            ref: {
                shoulderWidth: null,
                depth:         null
            }
        };

        this._modelW       = 1.0;
        this._modelH       = 1.0;
        this._pelvisLocalY = 0.0;   // pelvis bone local Y in model units (e.g. cm)

        this._baseEnvIntensity = 0.4;
        this.dynamicLight      = null;

        this._fabricReady = false;
        this.frameCount   = 0;
        this.initialized  = false;

        this._DEBUG_INTERVAL = 90;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    async init(videoWidth, videoHeight) {
        this.initialized = true;
        console.log('🦴 SkeletonMapper ready (hip-anchored, unit-scale fixed)');
        return true;
    }

    _getVideoAspect() {
        const dims = cameraManager.getDimensions();
        if (dims && dims.width && dims.height) return dims.width / dims.height;
        return 16 / 9;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // JACKET SETUP
    // ═══════════════════════════════════════════════════════════════════════════

    setJacket(model) {
        this.model = model;

        model.traverse(child => {
            if ((child.isMesh || child.isSkinnedMesh) && child.visible && child.material) {
                this.jacketMaterial = Array.isArray(child.material)
                    ? child.material[0] : child.material;
            }
        });

        const jacketMeshes = modelLoader.getMeshes();
        this.jacketMeshes  = jacketMeshes;

        let bbox = new THREE.Box3();
        if (jacketMeshes.length > 0) {
            jacketMeshes.forEach(m => bbox.expandByObject(m));
        } else {
            bbox.setFromObject(model);
        }

        if (bbox.isEmpty()) {
            console.warn('⚠️ Jacket bbox empty — using defaults');
            this._modelW = 1.0;
            this._modelH = 1.0;
        } else {
            const size = new THREE.Vector3();
            bbox.getSize(size);
            this._modelW = size.x > 0 ? size.x : 1.0;
            this._modelH = size.y > 0 ? size.y : 1.0;
            console.log(`Jacket bbox: W=${size.x.toFixed(3)} H=${size.y.toFixed(3)}`);
            this._warnScaleIfNeeded(size);
        }

        this._pelvisLocalY = this._computePelvisLocalY(model, bbox);
        console.log(`🦴 Pelvis anchor local Y: ${this._pelvisLocalY.toFixed(3)} units`);

        const skeleton = modelLoader.getSkeleton();
        if (skeleton) {
            poseRetargeter.init(skeleton);
        } else {
            console.log('ℹ️ No skeleton — position-only mode');
        }

        // Show at safe centre immediately (no pose yet)
        const pos   = this._safeCenterPosition();
        const scale = this._safeDefaultScale();
        this._applyGroupTransform(pos, scale, 0, 0);
        model.visible = true;
        console.log('🧥 Jacket shown at centre — waiting for pose');
    }

    // ─── Pelvis bone local Y ─────────────────────────────────────────────────
    _computePelvisLocalY(model, bbox) {
        const skeleton = modelLoader.getSkeleton();
        if (skeleton && skeleton.bones.length > 0) {
            const pelvisBone = skeleton.bones.find(b => {
                const n = b.name.toLowerCase();
                return n === 'pelvis' || n === 'hips'
                    || (n.includes('pelvis') && !n.includes('_l') && !n.includes('_r'))
                    || (n.includes('hip')    && !n.includes('upper') && !n.includes('_l') && !n.includes('_r'));
            });

            if (pelvisBone) {
                model.updateWorldMatrix(true, true);
                const pelvisWorld = new THREE.Vector3();
                pelvisBone.getWorldPosition(pelvisWorld);

                // Convert to model local space
                const modelInv    = new THREE.Matrix4().copy(model.matrixWorld).invert();
                const pelvisLocal = pelvisWorld.clone().applyMatrix4(modelInv);

                console.log(`  pelvis world Y=${pelvisWorld.y.toFixed(3)} → local Y=${pelvisLocal.y.toFixed(3)}`);
                return pelvisLocal.y;
            }
        }

        // Fallback: just above the jacket hem (~8% of jacket height up)
        if (bbox && !bbox.isEmpty()) {
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const estimate = bbox.min.y + size.y * 0.08;
            console.warn(`⚠️ Pelvis bone not found — estimating from bbox: ${estimate.toFixed(3)}`);
            return estimate;
        }

        return 0;
    }

    setDynamicLight(light) { this.dynamicLight = light; }

    // ═══════════════════════════════════════════════════════════════════════════
    // FABRIC APPLIED
    // ═══════════════════════════════════════════════════════════════════════════

    onFabricApplied() {
        this._fabricReady = true;

        this.jacketMeshes.forEach(mesh => {
            if (mesh.material) {
                this.jacketMaterial = Array.isArray(mesh.material)
                    ? mesh.material[0] : mesh.material;
            }
        });

        if (this.model) {
            this.model.visible = true;
            console.log('🧥 Fabric applied — jacket tracking active');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MAIN UPDATE
    // ═══════════════════════════════════════════════════════════════════════════

    update(poseData) {
        if (!this.model) return;

        this.model.visible = true;
        this.frameCount++;

        const cam = sceneManager.getCamera();

        // No pose — hold safe centre
        if (!poseData || !poseData.landmarks) {
            this.smooth.position.lerp(this._safeCenterPosition(), 0.05);
            this.smooth.scale += (this._safeDefaultScale() - this.smooth.scale) * 0.05;
            this._applyGroupTransform(this.smooth.position, this.smooth.scale, 0, 0);
            poseRetargeter.resetToRest();
            return;
        }

        const lm = poseData.landmarks;
        const L  = CONFIG.SKELETON.LANDMARKS;

        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];

        if (!LS || !RS || LS.visibility < 0.25 || RS.visibility < 0.25) {
            return; // hold last transform
        }

        // Calibration
        if (!this.cal.ready) {
            this._accumulate(LS, RS);
            this.smooth.position.lerp(this._safeCenterPosition(), 0.05);
            this.smooth.scale += (this._safeDefaultScale() - this.smooth.scale) * 0.05;
            this._applyGroupTransform(this.smooth.position, this.smooth.scale, 0, 0);
            if (this.frameCount % 5 === 0) {
                console.log(`🔧 Calibrating… ${Math.round(this.cal.frames / this.cal.FRAMES_NEEDED * 100)}%`);
            }
            return;
        }

        // Mirror X (front-facing camera)
        const mLS_x = 1 - LS.x;
        const mRS_x = 1 - RS.x;

        const shoulderWidth = Math.hypot(RS.x - LS.x, RS.y - LS.y);
        const ref = this.cal.ref;

        const depth = THREE.MathUtils.clamp(
            ref.depth * (ref.shoulderWidth / Math.max(shoulderWidth, 0.04)),
            0.5, 8.0
        );

        // ── HIP ANCHOR ────────────────────────────────────────────────────────
        const LH = lm[L.LEFT_HIP];
        const RH = lm[L.RIGHT_HIP];

        let worldAnchorPos;
        if (LH && RH && LH.visibility > 0.20 && RH.visibility > 0.20) {
            const hipMidNX = ((1 - LH.x) + (1 - RH.x)) * 0.5;
            const hipMidNY = (LH.y + RH.y) * 0.5;
            worldAnchorPos = this._normToWorld(hipMidNX, hipMidNY, depth, cam);
        } else {
            // Estimate hips: shoulders + 18% of frame height down
            const shoulderMidNX = (mLS_x + mRS_x) * 0.5;
            const shoulderMidNY = (LS.y + RS.y) * 0.5;
            worldAnchorPos = this._normToWorld(shoulderMidNX, shoulderMidNY + 0.18, depth, cam);
        }

        // ── SCALE ─────────────────────────────────────────────────────────────
        // targetScale is the multiplier BEFORE unitScale.
        // _applyGroupTransform will multiply by unitScale internally.
        const unitScale       = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        const jacketShoulderW = this._modelW * unitScale * (CONFIG.RIG?.SHOULDER_SPAN_RATIO ?? 0.60);
        const worldShoulderW  = this._normWidthToWorld(shoulderWidth, depth, cam);
        const targetScale     = THREE.MathUtils.clamp(
            worldShoulderW / Math.max(jacketShoulderW, 0.0001),
            0.001, 500.0
        );

        // Body rotation
        const roll = THREE.MathUtils.clamp(Math.atan2(RS.y - LS.y, RS.x - LS.x), -0.30, 0.30);
        const lean = (LS.z !== undefined && RS.z !== undefined)
            ? THREE.MathUtils.clamp((LS.z + RS.z) * 0.35, -0.25, 0.25) : 0;

        // Smooth
        this.smooth.position.lerp(worldAnchorPos, 0.15);
        this.smooth.scale += (targetScale  - this.smooth.scale) * 0.15;
        this.smooth.roll  += (roll         - this.smooth.roll)  * 0.08;
        this.smooth.lean  += (lean         - this.smooth.lean)  * 0.08;

        this._applyGroupTransform(
            this.smooth.position, this.smooth.scale,
            this.smooth.lean, this.smooth.roll
        );

        if (poseRetargeter.initialized) {
            poseRetargeter.update(lm, depth, cam);
        }

        this._updateDynamicShading(lm, shoulderWidth);

        if (this.frameCount % this._DEBUG_INTERVAL === 0) {
            const src = (LH && LH.visibility > 0.20) ? 'hips' : 'est';
            const es  = this.smooth.scale * unitScale;
            console.log(
                `[f${this.frameCount}] anchor=${src} sw=${shoulderWidth.toFixed(3)} ` +
                `depth=${depth.toFixed(2)}m scale=${this.smooth.scale.toFixed(3)} ` +
                `effectiveScale=${es.toFixed(5)}`
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GROUP TRANSFORM — hip-anchored, unit-scale included
    //
    // worldPos  = world position where the PELVIS BONE should appear.
    // scale     = size multiplier BEFORE unit conversion (e.g. 0.962).
    // effectiveScale = scale × unitScale is the actual THREE.js group scale.
    //
    // Math:
    //   group.scale = effectiveScale
    //   pelvis bone world Y = group.pos.y + pelvisLocalY × effectiveScale
    //   We want that to equal worldPos.y, so:
    //   group.pos.y = worldPos.y − pelvisLocalY × effectiveScale
    // ═══════════════════════════════════════════════════════════════════════════

    _applyGroupTransform(worldPos, scale, lean, roll) {
        if (!this.model) return;

        const unitScale      = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        const effectiveScale = scale * unitScale;   // e.g. 0.962 × 0.01 = 0.00962

        const pos = worldPos.clone();
        pos.y -= this._pelvisLocalY * effectiveScale;   // shift group so pelvis aligns

        this.model.position.copy(pos);
        this.model.scale.setScalar(effectiveScale);     // ← THE FIX: include unitScale
        this.model.rotation.order = 'YXZ';
        this.model.rotation.y = Math.PI;               // face camera
        this.model.rotation.x = lean ?? 0;
        this.model.rotation.z = roll ?? 0;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CALIBRATION
    // ═══════════════════════════════════════════════════════════════════════════

    _accumulate(LS, RS) {
        this.cal.sumShoulderW += Math.hypot(RS.x - LS.x, RS.y - LS.y);
        this.cal.frames++;
        if (this.cal.frames >= this.cal.FRAMES_NEEDED) this._lockCalibration();
    }

    _lockCalibration() {
        const ref = this.cal.ref;
        ref.shoulderWidth = this.cal.sumShoulderW / this.cal.frames;

        const cam         = sceneManager.getCamera();
        const videoAspect = this._getVideoAspect();

        ref.depth = THREE.MathUtils.clamp(
            0.45 / (ref.shoulderWidth * 2 * Math.tan(cam.fov * Math.PI / 180 / 2) * videoAspect),
            0.5, 7.0
        );

        this.cal.ready = true;
        console.log(`✅ Calibration — sw=${ref.shoulderWidth.toFixed(3)} depth=${ref.depth.toFixed(2)}m`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SAFE DEFAULTS (no pose / pre-calibration)
    //
    // Returns scale BEFORE unitScale — _applyGroupTransform multiplies by unitScale.
    // Hip position is slightly below screen centre (typical upper-body framing).
    // ═══════════════════════════════════════════════════════════════════════════

    _safeCenterPosition() {
        const depth = 2.5;
        const cam   = sceneManager.getCamera();
        const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
        return new THREE.Vector3(0, -halfH * 0.15, -depth);
    }

    _safeDefaultScale() {
        if (!this.model || this._modelH <= 0) return 1.0;
        const depth     = 2.5;
        const cam       = sceneManager.getCamera();
        const sceneH    = 2 * Math.tan(cam.fov * Math.PI / 360) * depth;
        const targetH   = sceneH * 0.40;
        const unitScale = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        // Divide by (modelH × unitScale) so that when _applyGroupTransform
        // multiplies by unitScale the final model scale = targetH / modelH_in_metres
        return THREE.MathUtils.clamp(targetH / (this._modelH * unitScale), 0.001, 500.0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DYNAMIC SHADING
    // ═══════════════════════════════════════════════════════════════════════════

    _updateDynamicShading(lm, shoulderWidth) {
        const mat = this.jacketMaterial;
        if (!mat) return;

        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];
        if (!LS || !RS) return;

        const turn = THREE.MathUtils.clamp((LS.z - RS.z) * 3.0, -1, 1);

        if (mat.roughness !== undefined && this.cal.ref.shoulderWidth) {
            const stretch = (shoulderWidth - this.cal.ref.shoulderWidth) / this.cal.ref.shoulderWidth;
            const targetR = THREE.MathUtils.clamp(0.75 + stretch * 0.3, 0.35, 1.0);
            mat.roughness += (targetR - mat.roughness) * 0.08;
        }

        if (mat.envMapIntensity !== undefined) {
            const targetE = this._baseEnvIntensity + Math.abs(turn) * 0.7;
            mat.envMapIntensity += (targetE - mat.envMapIntensity) * 0.06;
        }

        if (this.dynamicLight) {
            this.dynamicLight.position.x +=
                (-turn * 2.5 - this.dynamicLight.position.x) * 0.05;
            if (this.cal.ref.shoulderWidth) {
                const proxR = THREE.MathUtils.clamp(
                    shoulderWidth / this.cal.ref.shoulderWidth, 0.4, 2.0
                );
                this.dynamicLight.intensity += (proxR - this.dynamicLight.intensity) * 0.04;
            }
        }

        mat.needsUpdate = true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COORDINATE UTILITIES — video aspect throughout
    // ═══════════════════════════════════════════════════════════════════════════

    _normToWorld(nx, ny, depth, cam) {
        const va    = this._getVideoAspect();
        const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
        const halfW = halfH * va;
        return new THREE.Vector3(
            (nx - 0.5) *  2 * halfW,
            (ny - 0.5) * -2 * halfH,
            -depth
        );
    }

    _normWidthToWorld(normWidth, depth, cam) {
        const va = this._getVideoAspect();
        return normWidth * 2 * Math.tan(cam.fov * Math.PI / 360) * depth * va;
    }

    _warnScaleIfNeeded(size) {
        const u = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        const w = size.x * u;
        if (w > 10)      console.warn(`⚠️ Jacket wide (${w.toFixed(2)} m). Try MODEL_UNIT_SCALE = 0.01`);
        else if (w < 0.05) console.warn(`⚠️ Jacket narrow (${w.toFixed(4)} m). Try MODEL_UNIT_SCALE = 10`);
        else               console.log(`✅ Jacket scale OK — width ~${w.toFixed(3)} m`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    recalibrate() {
        this.cal = { ready: false, frames: 0, FRAMES_NEEDED: 20, sumShoulderW: 0,
                     ref: { shoulderWidth: null, depth: null } };
        this.smooth = { position: new THREE.Vector3(), scale: 1, roll: 0, lean: 0 };
        poseRetargeter.resetToRest();
        console.log('🔄 Recalibrating…');
    }

    setFabricReflectivity(v) { this._baseEnvIntensity = THREE.MathUtils.clamp(v, 0, 1); }
    isCalibrated()     { return this.cal.ready; }
    reset()            { this.recalibrate(); }
    getShoulderWidth() { return this.cal.ref.shoulderWidth ?? 0; }
    getBodyRotation()  { return this.smooth.lean; }
}

const skeletonMapper = new SkeletonMapper();
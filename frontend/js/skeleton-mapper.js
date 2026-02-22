// skeleton-mapper.js — HIP-ANCHORED VERSION
//
// KEY FIX — why "seam offset" was pushing jacket off-screen:
//   Old code: shoulder seam Y = 137.6 local units → 1.376 m after unit scale
//   Offset applied = 1.376 × scale (~2) = 2.87 m DOWN
//   Visible scene height at depth 2.5 m ≈ 3.8 m total → 1.9 m below centre
//   So the jacket group origin was 2.87 m below the shoulder → below the canvas.
//
//   Root cause: for a SKINNED mesh the group origin sits at the skeleton ROOT
//   (pelvis), not at the shoulder mesh surface. Bounding-box offsets are wrong
//   because bone animation moves verts away from rest position.
//
// CORRECT APPROACH:
//   1. setJacket(): find the pelvis bone and record its local Y (_pelvisLocalY).
//   2. update(): anchor the group to the DETECTED HIP world position.
//   3. _applyGroupTransform(): shift group DOWN by pelvisLocalY × scale so the
//      pelvis bone aligns with the detected hip. PoseRetargeter then drives
//      spine/shoulder/arm bones correctly on top of this root anchor.

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
        this._pelvisLocalY = 0.0;  // replaces _shoulderSeamY

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
        console.log('🦴 SkeletonMapper ready (hip-anchored)');
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

        // Find pelvis bone Y — the core of the hip-anchor fix
        this._pelvisLocalY = this._computePelvisLocalY(model, bbox);
        console.log(`🦴 Pelvis anchor local Y: ${this._pelvisLocalY.toFixed(3)} (units)`);

        const skeleton = modelLoader.getSkeleton();
        if (skeleton) {
            poseRetargeter.init(skeleton);
        } else {
            console.log('ℹ️ No skeleton — position-only mode');
        }

        // Show jacket at safe centre immediately
        const pos   = this._safeCenterPosition();
        const scale = this._safeDefaultScale();
        this._applyGroupTransform(pos, scale, 0, 0);
        model.visible = true;
        console.log('🧥 Jacket shown at centre — waiting for pose');
    }

    // ─── Determine pelvis bone local Y ────────────────────────────────────────
    // Priority 1: read from the actual pelvis bone world position.
    // Priority 2: estimate from bounding box (just above jacket hem ≈ waist).
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

                const modelInv    = new THREE.Matrix4().copy(model.matrixWorld).invert();
                const pelvisLocal = pelvisWorld.clone().applyMatrix4(modelInv);

                console.log(`  pelvis bone world Y=${pelvisWorld.y.toFixed(3)} → local Y=${pelvisLocal.y.toFixed(3)}`);
                return pelvisLocal.y;
            }
        }

        // Fallback: hips sit just above the jacket hem (~8% of jacket height)
        if (!bbox.isEmpty()) {
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

        // Lowered threshold: 0.35 → 0.25 for better detection at angles
        if (!LS || !RS || LS.visibility < 0.25 || RS.visibility < 0.25) {
            return; // hold last known position
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
        // Use hip midpoint as group anchor so pelvis bone aligns with body root.
        const LH = lm[L.LEFT_HIP];
        const RH = lm[L.RIGHT_HIP];

        let worldAnchorPos;
        if (LH && RH && LH.visibility > 0.20 && RH.visibility > 0.20) {
            const hipMidNX = ((1 - LH.x) + (1 - RH.x)) * 0.5;
            const hipMidNY = (LH.y + RH.y) * 0.5;
            worldAnchorPos = this._normToWorld(hipMidNX, hipMidNY, depth, cam);
        } else {
            // Fallback: estimate hips from shoulders (~18% of frame height below)
            const shoulderMidNX = (mLS_x + mRS_x) * 0.5;
            const shoulderMidNY = (LS.y + RS.y) * 0.5;
            worldAnchorPos = this._normToWorld(shoulderMidNX, shoulderMidNY + 0.18, depth, cam);
        }

        // Scale from shoulder width
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
        this.smooth.scale += (targetScale - this.smooth.scale) * 0.15;
        this.smooth.roll  += (roll - this.smooth.roll) * 0.08;
        this.smooth.lean  += (lean - this.smooth.lean) * 0.08;

        this._applyGroupTransform(this.smooth.position, this.smooth.scale, this.smooth.lean, this.smooth.roll);

        if (poseRetargeter.initialized) {
            poseRetargeter.update(lm, depth, cam);
        }

        this._updateDynamicShading(lm, shoulderWidth);

        if (this.frameCount % this._DEBUG_INTERVAL === 0) {
            const src = (LH && LH.visibility > 0.20) ? 'hips' : 'est';
            console.log(`[f${this.frameCount}] anchor=${src} sw=${shoulderWidth.toFixed(3)} depth=${depth.toFixed(2)}m scale=${this.smooth.scale.toFixed(3)}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GROUP TRANSFORM — hip-anchored
    //
    // worldPos is the DETECTED HIP position. We shift the group DOWN by
    // (pelvisLocalY × unitScale × scale) so the pelvis bone in model space
    // ends up AT worldPos.y in world space.
    // ═══════════════════════════════════════════════════════════════════════════

    _applyGroupTransform(worldPos, scale, lean, roll) {
        if (!this.model) return;

        const unitScale    = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        const pelvisOffset = this._pelvisLocalY * unitScale;  // metres

        const pos = worldPos.clone();
        pos.y -= pelvisOffset * scale;

        this.model.position.copy(pos);
        this.model.scale.setScalar(scale);
        this.model.rotation.order = 'YXZ';
        this.model.rotation.y = Math.PI;
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
    // SAFE DEFAULTS (no pose)
    // ═══════════════════════════════════════════════════════════════════════════

    // Hip-level world position — slightly below screen centre for upper-body framing
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
        const va   = this._getVideoAspect();
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
        if (w > 10) console.warn(`⚠️ Jacket wide (${w.toFixed(2)} m). Try MODEL_UNIT_SCALE = 0.01`);
        else if (w < 0.05) console.warn(`⚠️ Jacket narrow (${w.toFixed(4)} m). Try MODEL_UNIT_SCALE = 10`);
        else console.log(`✅ Jacket scale OK — width ~${w.toFixed(3)} m`);
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
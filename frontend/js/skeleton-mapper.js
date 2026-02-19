// skeleton-mapper.js — MOBILE + DESKTOP SAFE
// Fixes:
//   1. Fallback (no-pose) jacket position now correct on portrait mobile
//   2. _normToWorld uses actual canvas aspect, not full-window aspect
//   3. Calibration shows jacket immediately once fabric is applied
//   4. Scale clamp is looser so jacket isn't invisibly small on mobile
//   5. Pose detection confidence lowered slightly for upper-body-only frames

class SkeletonMapper {
    constructor() {
        this.model         = null;
        this.skeleton      = null;
        this.bones         = {};
        this.boneMatrices  = {};
        this.initialized   = false;

        // Smoothing
        this.smooth = {
            position:      new THREE.Vector3(0, 0, 0),
            scale:         1.0,
            roll:          0,
            lean:          0,
            boneRotations: {}
        };

        // Per-person calibration
        this.cal = {
            ready:         false,
            frames:        0,
            FRAMES_NEEDED: 15,        // was 20 — faster first-show on mobile
            sum: {
                shoulderWidth: 0,
                torsoHeight:   0,
            },
            ref: {
                shoulderWidth: null,
                torsoHeight:   null,
                depth:         null,
            }
        };

        // Material / lighting
        this.jacketMaterial    = null;
        this.dynamicLight      = null;
        this._baseEnvIntensity = 0.4;

        // Jacket geometry reference
        this._modelW = 1.0;
        this._modelH = 1.0;
        this._jacketShoulderOffsetY = 0; // how far the shoulder line is from model origin

        this.frameCount  = 0;
        this.debugMode   = true;
        this._fabricReady = false;  // set true once applyFabric() has run
    }

    async init(videoWidth, videoHeight) {
        this.initialized = true;
        console.log('🦴 SkeletonMapper ready (mobile+desktop safe)');
        return true;
    }

    // ─── Called by materials.js after fabric applied ──────────────────────────
    // Lets the mapper know it's OK to show the jacket now.
    onFabricApplied() {
        this._fabricReady = true;
        // Show immediately at a safe center position until pose kicks in
        if (this.model) {
            const pos = this._safeCenterPosition();
            this._applyTransform(pos, this._safeDefaultScale(), 0, 0);
            this.model.visible = true;
            console.log('🧥 Jacket shown at center (fabric ready, waiting for pose)');
        }
    }

    // ─── Returns a world-space position that is always visible ───────────────
    // On portrait mobile, the screen is tall and narrow. On landscape desktop,
    // it's wide and short. The safe center is always 0,0 in X/Y NDC but we
    // push it back far enough that it occupies a natural portion of the frame.
    _safeCenterPosition() {
        const depth = 2.5;
        const cam   = sceneManager.getCamera();
        const fov   = cam.fov * Math.PI / 180;
        const halfH = Math.tan(fov / 2) * depth;
        // Y: place jacket center slightly below the vertical midpoint
        // so it sits on the chest rather than the face
        return new THREE.Vector3(0, -halfH * 0.15, -depth);
    }

    // ─── Default scale when we have no pose yet ──────────────────────────────
    // Computed from the jacket model's bounding box vs the visible scene height.
    // Target: jacket fills ~40% of screen height — clearly visible but not huge.
    _safeDefaultScale() {
        if (!this.model || this._modelH <= 0) return 1.0;

        const depth = 2.5;
        const cam   = sceneManager.getCamera();
        const fov   = cam.fov * Math.PI / 180;
        const sceneH = 2 * Math.tan(fov / 2) * depth;     // world-space scene height
        const targetH = sceneH * 0.40;                     // 40% of scene height
        const scale   = targetH / this._modelH;

        return THREE.MathUtils.clamp(scale, 0.01, 50.0);   // very loose clamp
    }

    // ─── LINK MODEL ──────────────────────────────────────────────────────────
    setJacket(model) {
        this.model = model;

        let mesh = null;
        model.traverse(c => { if (c.isSkinnedMesh && !mesh) mesh = c; });
        if (!mesh) model.traverse(c => { if (c.isMesh && !mesh) mesh = c; });
        if (!mesh) { console.error('❌ No mesh found'); return; }

        if (mesh.material) {
            this.jacketMaterial = mesh.material;
        }

        this.skeleton = mesh.skeleton || null;
        if (this.skeleton) {
            console.log(`✅ Skeleton: ${this.skeleton.bones.length} bones`);
            this._mapBones();
            this._cacheRestPose();
        }

        // Keep invisible until fabric is applied
        model.visible = false;

        // Measure jacket geometry in model-space
        const bbox = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        bbox.getSize(size);

        this._modelW = size.x > 0 ? size.x : 1.0;
        this._modelH = size.y > 0 ? size.y : 1.0;

        // Shoulder offset: jacket shoulders are typically ~80-90% up from bottom
        // Knowing this lets us anchor by shoulder line rather than bounding-box center
        this._jacketShoulderOffsetY = bbox.min.y + this._modelH * 0.15;
        // (positive = shift model DOWN so shoulder line aligns with detected shoulder)

        console.log(`📏 Jacket model: W=${size.x.toFixed(3)} H=${size.y.toFixed(3)}`);
        console.log(`📏 Jacket shoulder offset Y: ${this._jacketShoulderOffsetY.toFixed(3)}`);

        // Diagnose unit scale
        if (size.x > 10) {
            console.warn('⚠️  Jacket model seems large (W > 10 units). Likely authored in cm.');
            console.warn('⚠️  Set CONFIG.JACKET.MODEL_UNIT_SCALE = 0.01 in config.js');
        } else if (size.x < 0.05) {
            console.warn('⚠️  Jacket model seems tiny (W < 0.05 units). Likely authored in mm.');
            console.warn('⚠️  Set CONFIG.JACKET.MODEL_UNIT_SCALE = 10 in config.js');
        } else {
            console.log('✅ Jacket model unit scale looks correct (W between 0.05 and 10)');
        }
    }

    setDynamicLight(light) { this.dynamicLight = light; }

    // ─── CALIBRATION ─────────────────────────────────────────────────────────
    _accumulate(LS, RS, LH, RH) {
        const sw = Math.sqrt((RS.x - LS.x) ** 2 + (RS.y - LS.y) ** 2);
        this.cal.sum.shoulderWidth += sw;

        const hipsOK = LH && RH && LH.visibility > 0.3 && RH.visibility > 0.3;
        if (hipsOK) {
            const shY  = (LS.y + RS.y) / 2;
            const hipY = (LH.y + RH.y) / 2;
            this.cal.sum.torsoHeight += Math.abs(hipY - shY);
        }

        this.cal.frames++;
        if (this.cal.frames >= this.cal.FRAMES_NEEDED) this._lockCalibration(hipsOK);
    }

    _lockCalibration(hasHips) {
        const n   = this.cal.frames;
        const ref = this.cal.ref;

        ref.shoulderWidth = this.cal.sum.shoulderWidth / n;
        ref.torsoHeight   = hasHips
            ? this.cal.sum.torsoHeight / n
            : ref.shoulderWidth * 1.4;

        // Back-calculate depth from observed shoulder width
        // Average human shoulder span = 0.45m
        const cam    = sceneManager.getCamera();
        const fov    = cam.fov * (Math.PI / 180);
        const aspect = this._getEffectiveAspect();

        ref.depth = THREE.MathUtils.clamp(
            0.45 / (ref.shoulderWidth * 2 * Math.tan(fov / 2) * aspect),
            0.3, 6.0
        );

        this.cal.ready = true;
        console.log('✅ Calibration complete:');
        console.log(`   Shoulder width (norm): ${ref.shoulderWidth.toFixed(3)}`);
        console.log(`   Torso height   (norm): ${ref.torsoHeight.toFixed(3)}`);
        console.log(`   Computed depth    (m): ${ref.depth.toFixed(2)}`);
    }

    // ─── EFFECTIVE ASPECT ─────────────────────────────────────────────────────
    // CRITICAL on mobile: use the CANVAS aspect, not the full-window aspect.
    // The canvas height excludes the top bar and fabric panel, so it's shorter
    // than window.innerHeight. Using window aspect on portrait mobile makes
    // the coordinate math put the jacket in the wrong Y position.
    _getEffectiveAspect() {
        const cam = sceneManager.getCamera();
        // camera.aspect is already set correctly by scene.js / renderer.js
        return cam.aspect;
    }

    // ─── MAIN UPDATE ─────────────────────────────────────────────────────────
    update(poseData) {
        if (!this.model || !this._fabricReady) return;
        this.frameCount++;

        if (!poseData || !poseData.landmarks) {
            // No pose — show jacket at safe center position
            const pos = this._safeCenterPosition();
            this.smooth.position.lerp(pos, 0.05);
            const targetScale = this._safeDefaultScale();
            this.smooth.scale += (targetScale - this.smooth.scale) * 0.05;
            this._applyTransform(this.smooth.position, this.smooth.scale, 0, 0);
            if (this.skeleton) this._resetToRestPose();
            this.model.visible = true;
            return;
        }

        const lm = poseData.landmarks;
        const L  = CONFIG.SKELETON.LANDMARKS;

        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];
        const LH = lm[L.LEFT_HIP];
        const RH = lm[L.RIGHT_HIP];
        const LE = lm[L.LEFT_ELBOW];
        const RE = lm[L.RIGHT_ELBOW];
        const LW = lm[L.LEFT_WRIST];
        const RW = lm[L.RIGHT_WRIST];

        // ── Visibility threshold: 0.35 instead of 0.40
        // Mobile front cameras often get lower confidence scores
        if (!LS || !RS || LS.visibility < 0.35 || RS.visibility < 0.35) {
            // Still show jacket at last known good position
            this.model.visible = true;
            return;
        }

        // ── Calibration phase ────────────────────────────────────────────────
        if (!this.cal.ready) {
            this._accumulate(LS, RS, LH, RH);
            if (!this.cal.ready) {
                // During calibration, show jacket at center so user sees SOMETHING
                const pos = this._safeCenterPosition();
                this.smooth.position.lerp(pos, 0.05);
                const s = this._safeDefaultScale();
                this.smooth.scale += (s - this.smooth.scale) * 0.05;
                this._applyTransform(this.smooth.position, this.smooth.scale, 0, 0);
                this.model.visible = true;
                if (this.frameCount % 5 === 0) {
                    const pct = Math.round((this.cal.frames / this.cal.FRAMES_NEEDED) * 100);
                    console.log(`⏳ Calibrating... ${pct}%`);
                }
            }
            return;
        }

        const ref = this.cal.ref;

        // ── Mirror correction ────────────────────────────────────────────────
        // Front camera is shown mirrored; MediaPipe coords are raw → flip X
        const lsX = 1 - LS.x;
        const rsX = 1 - RS.x;
        const shoulderMidX = (lsX + rsX) * 0.5;
        const shoulderMidY = (LS.y + RS.y) * 0.5;

        const dxS           = RS.x - LS.x;
        const dyS           = RS.y - LS.y;
        const shoulderWidth = Math.sqrt(dxS * dxS + dyS * dyS);

        // ── Depth ────────────────────────────────────────────────────────────
        const depth = THREE.MathUtils.clamp(
            ref.depth * (ref.shoulderWidth / Math.max(shoulderWidth, 0.05)),
            0.3, 7.0
        );

        // ── Torso Y anchor ───────────────────────────────────────────────────
        // Sitting-safe: if hips are close to shoulders (ratio < 0.08), treat as sitting
        const hipsOK  = LH && RH && LH.visibility > 0.3 && RH.visibility > 0.3;
        let torsoY;

        if (hipsOK) {
            const hipMidY    = (LH.y + RH.y) * 0.5;
            const torsoLen   = hipMidY - shoulderMidY;
            if (torsoLen < 0.08) {
                // Sitting or only upper body visible — anchor just below shoulders
                torsoY = shoulderMidY + 0.04;
            } else {
                torsoY = shoulderMidY + torsoLen * 0.30;
            }
        } else {
            // No hip data — use calibrated torso proportion
            const scaleFactor = shoulderWidth / Math.max(ref.shoulderWidth, 0.01);
            torsoY = shoulderMidY + (ref.torsoHeight * scaleFactor * 0.30);
        }

        const worldTarget = this._normToWorld(shoulderMidX, torsoY, depth);

        // ── Scale ────────────────────────────────────────────────────────────
        // Convert detected shoulder width to world units, fit jacket to it
        const wsWidth     = this._normWidthToWorld(shoulderWidth, depth);

        // Apply unit scale correction from config (handles cm/mm authoring units)
        const unitScale   = CONFIG.JACKET.MODEL_UNIT_SCALE || 1.0;
        const effectiveModelW = this._modelW * unitScale;

        const targetScale = THREE.MathUtils.clamp(
            wsWidth / Math.max(effectiveModelW, 0.001),
            0.001, 100.0          // very loose — prevents invisible-but-technically-valid models
        );

        // ── Rotation ─────────────────────────────────────────────────────────
        const rawRoll = Math.atan2(dyS, dxS);
        const roll    = THREE.MathUtils.clamp(rawRoll, -0.26, 0.26);

        let lean = 0;
        if (LS.z !== undefined && RS.z !== undefined) {
            lean = THREE.MathUtils.clamp(((LS.z + RS.z) * 0.5) * 0.8, -0.3, 0.3);
        }

        // ── Smooth ───────────────────────────────────────────────────────────
        this.smooth.position.lerp(worldTarget, 0.15);
        this.smooth.scale += (targetScale - this.smooth.scale) * 0.15;
        this.smooth.roll  += (roll         - this.smooth.roll)  * 0.08;
        this.smooth.lean  += (lean         - this.smooth.lean)  * 0.08;

        this._applyTransform(
            this.smooth.position,
            this.smooth.scale,
            this.smooth.lean,
            this.smooth.roll
        );

        if (this.skeleton) {
            this._updateSpine(lm);
            this._updateArm('left',  LS, LE, LW);
            this._updateArm('right', RS, RE, RW);
            this._updateNeck(lm);
        }

        this._updateDynamicShading(lm, shoulderWidth);
        this.model.visible = true;

        if (this.debugMode && this.frameCount % 90 === 0) {
            console.log(
                `[f${this.frameCount}] sw=${shoulderWidth.toFixed(3)}` +
                ` depth=${depth.toFixed(2)}m scale=${this.smooth.scale.toFixed(3)}` +
                ` wsWidth=${wsWidth.toFixed(3)} modelW=${effectiveModelW.toFixed(3)}` +
                ` hips=${hipsOK ? 'real' : 'est'}`
            );
        }
    }

    // ─── DYNAMIC SHADING ─────────────────────────────────────────────────────
    _updateDynamicShading(lm, shoulderWidth) {
        const mat = this.jacketMaterial;
        if (!mat) return;
        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = lm[L.LEFT_SHOULDER], RS = lm[L.RIGHT_SHOULDER];
        if (!LS || !RS) return;

        const turn = THREE.MathUtils.clamp((LS.z - RS.z) * 3.0, -1, 1);

        if (mat.roughness !== undefined) {
            const calSW  = this.cal.ref.shoulderWidth || shoulderWidth;
            const stretch = (shoulderWidth - calSW) / calSW;
            mat.roughness += (THREE.MathUtils.clamp(0.75 + stretch * 0.3, 0.4, 1.0) - mat.roughness) * 0.08;
        }

        if (mat.envMapIntensity !== undefined) {
            mat.envMapIntensity +=
                (this._baseEnvIntensity + Math.abs(turn) * 0.7 - mat.envMapIntensity) * 0.06;
        }

        if (this.dynamicLight) {
            this.dynamicLight.position.x += (-turn * 2.5 - this.dynamicLight.position.x) * 0.05;
            const calSW  = this.cal.ref.shoulderWidth || 0.2;
            const proxR  = THREE.MathUtils.clamp(shoulderWidth / calSW, 0.4, 2.0);
            this.dynamicLight.intensity += (proxR - this.dynamicLight.intensity) * 0.04;
        }

        mat.needsUpdate = true;
    }

    // ─── TRANSFORM ───────────────────────────────────────────────────────────
    _applyTransform(position, scale, lean, roll) {
        // Shift model down so its shoulder line aligns with the detected shoulder,
        // instead of its bounding-box center. This is the key alignment fix.
        const alignedPos = position.clone();
        alignedPos.y -= this._jacketShoulderOffsetY * scale;

        this.model.position.copy(alignedPos);
        this.model.scale.setScalar(scale);
        this.model.rotation.order = 'YXZ';
        this.model.rotation.y = Math.PI;
        this.model.rotation.x = lean || 0;
        this.model.rotation.z = roll || 0;
    }

    // ─── BONES ───────────────────────────────────────────────────────────────
    _updateSpine(lm) {
        if (!this.skeleton) return;
        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = lm[L.LEFT_SHOULDER],  RS = lm[L.RIGHT_SHOULDER];
        const LH = lm[L.LEFT_HIP],       RH = lm[L.RIGHT_HIP];
        if (!LS || !RS || !LH || !RH) return;

        const shMid  = new THREE.Vector3((LS.x + RS.x) / 2, (LS.y + RS.y) / 2, (LS.z + RS.z) / 2);
        const hipMid = new THREE.Vector3((LH.x + RH.x) / 2, (LH.y + RH.y) / 2, (LH.z + RH.z) / 2);
        const bend   = Math.atan2(
            new THREE.Vector3().subVectors(shMid, hipMid).normalize().x, 1
        ) * 0.25;

        ['spine1', 'spine2', 'spine3', 'spine4', 'spine5'].forEach((k, i, a) => {
            const b = this.bones[k]; if (!b) return;
            b.rotation.z += (bend * (i + 1) / a.length - b.rotation.z) * 0.12;
        });
    }

    _updateArm(side, shoulder, elbow, wrist) {
        if (!shoulder || !elbow || !wrist || !this.skeleton) return;
        const isLeft   = side === 'left';
        const upperArm = isLeft ? this.bones.upperArmL : this.bones.upperArmR;
        const lowerArm = isLeft ? this.bones.lowerArmL : this.bones.lowerArmR;
        if (!upperArm || !lowerArm) return;

        const a    = 0.18;
        const rest = new THREE.Vector3(isLeft ? 1 : -1, -1, 0).normalize();

        const uDir = new THREE.Vector3(
            elbow.x - shoulder.x, elbow.y - shoulder.y, elbow.z - shoulder.z
        ).normalize();
        const uQ = new THREE.Quaternion().setFromUnitVectors(rest, uDir);
        const uk = `u_${side}`;
        if (!this.smooth.boneRotations[uk]) this.smooth.boneRotations[uk] = uQ.clone();
        this.smooth.boneRotations[uk].slerp(uQ, a);
        upperArm.quaternion.copy(this.smooth.boneRotations[uk]);

        const lDir = new THREE.Vector3(
            wrist.x - elbow.x, wrist.y - elbow.y, wrist.z - elbow.z
        ).normalize();
        const lQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), lDir);
        const lk = `l_${side}`;
        if (!this.smooth.boneRotations[lk]) this.smooth.boneRotations[lk] = lQ.clone();
        this.smooth.boneRotations[lk].slerp(lQ, a);
        lowerArm.quaternion.copy(this.smooth.boneRotations[lk]);
    }

    _updateNeck(lm) {
        if (!this.bones.head || !this.skeleton) return;
        const L    = CONFIG.SKELETON.LANDMARKS;
        const nose = lm[L.NOSE], LS = lm[L.LEFT_SHOULDER], RS = lm[L.RIGHT_SHOULDER];
        if (!nose || !LS || !RS) return;
        const tilt = Math.atan2(nose.x - (LS.x + RS.x) / 2, -((nose.y - (LS.y + RS.y) / 2))) * 0.2;
        this.bones.head.rotation.z += (tilt - this.bones.head.rotation.z) * 0.15;
    }

    // ─── COORDINATE HELPERS ──────────────────────────────────────────────────
    // CRITICAL FIX: use camera.aspect which reflects the actual canvas aspect ratio
    // (set by scene.js using display dimensions, not video dimensions).
    // This makes portrait mobile work correctly.
    _normToWorld(nx, ny, depth) {
        const cam   = sceneManager.getCamera();
        const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
        const halfW = halfH * cam.aspect;
        return new THREE.Vector3(
            (nx - 0.5) *  2 * halfW,
            (ny - 0.5) * -2 * halfH,
            -depth
        );
    }

    _normWidthToWorld(nw, depth) {
        const cam = sceneManager.getCamera();
        return nw * 2 * Math.tan(cam.fov * Math.PI / 360) * depth * cam.aspect;
    }

    // ─── BONE MAPPING ────────────────────────────────────────────────────────
    _mapBones() {
        const f = n => this.skeleton
            ? (this.skeleton.bones.find(b => b.name.toLowerCase().includes(n)) || null)
            : null;

        this.bones = {
            pelvis:    f('pelvis'),
            spine1:    f('spine_01'),
            spine2:    f('spine_02'),
            spine3:    f('spine_03'),
            spine4:    f('spine_04'),
            spine5:    f('spine_05'),
            neck1:     f('neck_01'),
            neck2:     f('neck_02'),
            head:      f('head'),
            clavicleL: f('clavicle_l'),
            upperArmL: f('upperarm_l'),
            lowerArmL: f('lowerarm_l'),
            handL:     f('hand_l'),
            clavicleR: f('clavicle_r'),
            upperArmR: f('upperarm_r'),
            lowerArmR: f('lowerarm_r'),
            handR:     f('hand_r'),
        };

        const found = Object.entries(this.bones).filter(([, v]) => v).map(([k]) => k);
        console.log('🦴 Bones mapped:', found.join(', ') || 'none');
    }

    _cacheRestPose() {
        if (!this.skeleton) return;
        this.skeleton.bones.forEach(b => {
            this.boneMatrices[b.name] = {
                position:   b.position.clone(),
                quaternion: b.quaternion.clone(),
                scale:      b.scale.clone()
            };
        });
    }

    _resetToRestPose() {
        if (!this.skeleton) return;
        this.skeleton.bones.forEach(b => {
            const r = this.boneMatrices[b.name]; if (!r) return;
            b.position.copy(r.position);
            b.quaternion.copy(r.quaternion);
            b.scale.copy(r.scale);
        });
    }

    // ─── PUBLIC API ──────────────────────────────────────────────────────────
    recalibrate() {
        this.cal = {
            ready: false, frames: 0, FRAMES_NEEDED: 15,
            sum: { shoulderWidth: 0, torsoHeight: 0 },
            ref: { shoulderWidth: null, torsoHeight: null, depth: null }
        };
        this.smooth = {
            position:      new THREE.Vector3(),
            scale:         1,
            roll:          0,
            lean:          0,
            boneRotations: {}
        };
        if (this.model) this.model.visible = false;
        console.log('🔄 Recalibrating for new person…');
    }

    setFabricReflectivity(v) {
        this._baseEnvIntensity = THREE.MathUtils.clamp(v, 0, 1);
    }

    isCalibrated()  { return this.cal.ready; }
    reset()         { this.recalibrate(); }
}

const skeletonMapper = new SkeletonMapper();
// skeleton-mapper.js — FULLY ADAPTIVE VERSION
// Zero hardcoded person values. Everything is derived from landmarks each frame.
// Works for any person at any distance from any camera.

class SkeletonMapper {
    constructor() {
        this.model         = null;
        this.skeleton      = null;
        this.bones         = {};
        this.boneMatrices  = {};
        this.initialized   = false;

        // ── Smoothing ────────────────────────────────────────────────
        this.smooth = {
            position:      new THREE.Vector3(0, 0, 0),
            scale:         1.0,
            roll:          0,
            lean:          0,
            boneRotations: {}
        };

        // ── Per-person calibration ────────────────────────────────────
        // Collected from the first N stable frames, never hardcoded.
        // This makes the jacket fit ANY person at ANY distance.
        this.cal = {
            ready:         false,
            frames:        0,
            FRAMES_NEEDED: 20,
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

        // ── Material / lighting ───────────────────────────────────────
        this.jacketMaterial    = null;
        this.dynamicLight      = null;
        this._baseEnvIntensity = 0.4;

        this.frameCount = 0;
        this.debugMode  = true;
    }

    async init(videoWidth, videoHeight) {
        this.initialized = true;
        console.log('🦴 SkeletonMapper ready (fully adaptive — no hardcoded values)');
        return true;
    }

    // ─────────────────────────────────────────────────────────────────
    //  LINK MODEL
    // ─────────────────────────────────────────────────────────────────
    setJacket(model) {
        this.model = model;

        let mesh = null;
        model.traverse(c => { if (c.isSkinnedMesh && !mesh) mesh = c; });
        if (!mesh) model.traverse(c => { if (c.isMesh && !mesh) mesh = c; });
        if (!mesh) { console.error('❌ No mesh found'); return; }

        if (mesh.material) {
            this.jacketMaterial = mesh.material;
            if (this.jacketMaterial.type === 'MeshBasicMaterial')
                console.warn('⚠️  MeshBasicMaterial — switch to MeshStandardMaterial for shading.');
        }

        this.skeleton = mesh.skeleton || null;
        if (this.skeleton) {
            console.log(`✅ Skeleton: ${this.skeleton.bones.length} bones`);
            this._mapBones();
            this._cacheRestPose();
        }

        model.visible = false;

        // Measure jacket geometry — used for scaling, not person-specific
   // Find where the shoulders are relative to model origin
const bbox = new THREE.Box3().setFromObject(model);
const modelTop = bbox.max.y;
const modelBottom = bbox.min.y;
const modelHeight = modelTop - modelBottom;

// Jacket "shoulder line" is typically ~85% up from bottom
this._jacketShoulderOffsetY = modelBottom + modelHeight * 0.85;
console.log("📏 Jacket shoulder Y offset:", this._jacketShoulderOffsetY);
    }

    setDynamicLight(light) { this.dynamicLight = light; }

    // ─────────────────────────────────────────────────────────────────
    //  CALIBRATION
    //  Observes the person for 20 frames to measure:
    //    • their shoulder width in normalized 0-1 coords
    //    • their torso height (shoulder→hip)
    //  Then computes the correct depth using real human proportions
    //  (average shoulder span = 45cm) — no manual distance needed.
    // ─────────────────────────────────────────────────────────────────
    _accumulate(LS, RS, LH, RH) {
        const sw = Math.sqrt((RS.x-LS.x)**2 + (RS.y-LS.y)**2);
        this.cal.sum.shoulderWidth += sw;

        const hipsOK = LH && RH && LH.visibility > 0.4 && RH.visibility > 0.4;
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

        // If hips were visible during calibration, use real measurement.
        // Otherwise estimate: human torso ≈ 1.4× shoulder width.
        ref.torsoHeight = hasHips
            ? this.cal.sum.torsoHeight / n
            : ref.shoulderWidth * 1.4;

        // Back-calculate real-world depth from observed shoulder width.
        // Average human shoulder span = 0.45m.
        // normWidth = worldWidth / (2 × tan(fov/2) × depth × aspect)
        // → depth = 0.45 / (normWidth × 2 × tan(fov/2) × aspect)
        const cam    = sceneManager.getCamera();
        const fov    = cam.fov * (Math.PI / 180);
        const aspect = cam.aspect;
        ref.depth = THREE.MathUtils.clamp(
            0.45 / (ref.shoulderWidth * 2 * Math.tan(fov/2) * aspect),
            0.5, 5.0
        );

        this.cal.ready = true;
        console.log('✅ Calibrated for this person:');
        console.log(`   Shoulder width (norm): ${ref.shoulderWidth.toFixed(3)}`);
        console.log(`   Torso height   (norm): ${ref.torsoHeight.toFixed(3)}`);
        console.log(`   Computed depth    (m): ${ref.depth.toFixed(2)}`);
    }

    // ─────────────────────────────────────────────────────────────────
    //  MAIN UPDATE
    // ─────────────────────────────────────────────────────────────────
    update(poseData) {
        if (!this.model) return;
        this.frameCount++;

        if (!poseData || !poseData.landmarks) {
            this.model.visible = true;
            this._applyTransform(new THREE.Vector3(0, 0, -2), 1.0, 0, 0);
            if (this.skeleton) this._resetToRestPose();
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

        if (!LS || !RS || LS.visibility < 0.4 || RS.visibility < 0.4) {
            this.model.visible = true;
            return;
        }

        // ── Calibration phase ────────────────────────────────────────
        if (!this.cal.ready) {
            this._accumulate(LS, RS, LH, RH);
            this.model.visible = false;
            if (this.frameCount % 5 === 0) {
                const pct = Math.round((this.cal.frames / this.cal.FRAMES_NEEDED) * 100);
                console.log(`⏳ Measuring your body... ${pct}%`);
            }
            return;
        }

        const ref = this.cal.ref;

        // ── Mirror correction ─────────────────────────────────────────
        // Webcam is shown mirrored; MediaPipe coords are unmirrored → flip X
        const lsX = 1 - LS.x;
        const rsX = 1 - RS.x;
        const shoulderMidX = (lsX + rsX) * 0.5;
        const shoulderMidY = (LS.y + RS.y) * 0.5;

        // Shoulder width (distance is mirror-invariant)
        const dxS          = RS.x - LS.x;
        const dyS          = RS.y - LS.y;
        const shoulderWidth = Math.sqrt(dxS*dxS + dyS*dyS);

        // ── Depth — tracks person moving closer/further ───────────────
        // depth scales inversely with apparent shoulder width
        const depth = THREE.MathUtils.clamp(
            ref.depth * (ref.shoulderWidth / Math.max(shoulderWidth, 0.05)),
            0.4, 6.0
        );

        // ── Torso anchor — 100% landmark driven ──────────────────────
        const hipsOK = LH && RH && LH.visibility > 0.4 && RH.visibility > 0.4;
        let torsoY;

        if (hipsOK) {
            // Real hip data available — sit jacket 30% down from shoulders
            const hipMidY = (LH.y + RH.y) * 0.5;
            torsoY = shoulderMidY + (hipMidY - shoulderMidY) * 0.30;
        } else {
            // Estimate torso using calibrated proportions scaled to current distance
            const scaleFactor = shoulderWidth / ref.shoulderWidth;
            torsoY = shoulderMidY + (ref.torsoHeight * scaleFactor * 0.30);
        }

        const worldTarget = this._normToWorld(shoulderMidX, torsoY, depth);

        // ── Scale ─────────────────────────────────────────────────────
        // Convert person's current shoulder width to world metres,
        // then scale jacket so its model-space width matches exactly.
        const wsWidth     = this._normWidthToWorld(shoulderWidth, depth);
        const targetScale = THREE.MathUtils.clamp(wsWidth / this._modelW, 0.05, 20.0);
        // Clamp is purely physical sanity — not person-specific.

        // ── Rotation ─────────────────────────────────────────────────
        const rawRoll = Math.atan2(dyS, dxS);
        const roll    = THREE.MathUtils.clamp(rawRoll, -0.26, 0.26); // ±15°

        let lean = 0;
        if (LS.z !== undefined && RS.z !== undefined)
            lean = THREE.MathUtils.clamp(((LS.z + RS.z) * 0.5) * 0.8, -0.3, 0.3);

        // ── Smooth ───────────────────────────────────────────────────
        this.smooth.position.lerp(worldTarget, 0.15);
        this.smooth.scale += (targetScale - this.smooth.scale) * 0.15;
        this.smooth.roll  += (roll        - this.smooth.roll)  * 0.08;
        this.smooth.lean  += (lean        - this.smooth.lean)  * 0.08;

        this._applyTransform(
            this.smooth.position, this.smooth.scale,
            this.smooth.lean, this.smooth.roll
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
                ` hips=${hipsOK?'real':'est'}`
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  DYNAMIC SHADING
    // ─────────────────────────────────────────────────────────────────
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
            mat.roughness += (THREE.MathUtils.clamp(0.75 + stretch*0.3, 0.4, 1.0) - mat.roughness) * 0.08;
        }

        if (mat.envMapIntensity !== undefined) {
            mat.envMapIntensity +=
                (this._baseEnvIntensity + Math.abs(turn)*0.7 - mat.envMapIntensity) * 0.06;
        }

        if (this.dynamicLight) {
            this.dynamicLight.position.x += (-turn*2.5 - this.dynamicLight.position.x) * 0.05;
            const calSW   = this.cal.ref.shoulderWidth || 0.2;
            const proxR   = THREE.MathUtils.clamp(shoulderWidth / calSW, 0.4, 2.0);
            this.dynamicLight.intensity += (proxR - this.dynamicLight.intensity) * 0.04;
        }

        mat.needsUpdate = true;
    }

    // ─────────────────────────────────────────────────────────────────
    //  TRANSFORM
    // ─────────────────────────────────────────────────────────────────
    _applyTransform(position, scale, lean, roll) {
            const offset = new THREE.Vector3(0, -this._jacketShoulderOffsetY * scale, 0);
    this.model.position.copy(position).add(offset);
    this.model.scale.setScalar(scale);
        this.model.position.copy(position);
        this.model.scale.setScalar(scale);
        this.model.rotation.order = 'YXZ';
        this.model.rotation.y = Math.PI;
        this.model.rotation.x = lean || 0;
        this.model.rotation.z = roll || 0;
    }

    // ─────────────────────────────────────────────────────────────────
    //  BONES
    // ─────────────────────────────────────────────────────────────────
    _updateSpine(lm) {
        if (!this.skeleton) return;
        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = lm[L.LEFT_SHOULDER],  RS = lm[L.RIGHT_SHOULDER];
        const LH = lm[L.LEFT_HIP],       RH = lm[L.RIGHT_HIP];
        if (!LS||!RS||!LH||!RH) return;
        const shMid  = new THREE.Vector3((LS.x+RS.x)/2,(LS.y+RS.y)/2,(LS.z+RS.z)/2);
        const hipMid = new THREE.Vector3((LH.x+RH.x)/2,(LH.y+RH.y)/2,(LH.z+RH.z)/2);
        const bend   = Math.atan2(
            new THREE.Vector3().subVectors(shMid, hipMid).normalize().x, 1
        ) * 0.25;
        ['spine1','spine2','spine3','spine4','spine5'].forEach((k,i,a) => {
            const b = this.bones[k]; if (!b) return;
            b.rotation.z += (bend * (i+1)/a.length - b.rotation.z) * 0.12;
        });
    }

    _updateArm(side, shoulder, elbow, wrist) {
        if (!shoulder||!elbow||!wrist||!this.skeleton) return;
        const isLeft   = side === 'left';
        const upperArm = isLeft ? this.bones.upperArmL : this.bones.upperArmR;
        const lowerArm = isLeft ? this.bones.lowerArmL : this.bones.lowerArmR;
        if (!upperArm||!lowerArm) return;
        const a = 0.18;
        const rest = new THREE.Vector3(isLeft?1:-1,-1,0).normalize();

        const uDir = new THREE.Vector3(elbow.x-shoulder.x,elbow.y-shoulder.y,elbow.z-shoulder.z).normalize();
        const uQ   = new THREE.Quaternion().setFromUnitVectors(rest, uDir);
        const uk   = `u_${side}`;
        if (!this.smooth.boneRotations[uk]) this.smooth.boneRotations[uk] = uQ.clone();
        this.smooth.boneRotations[uk].slerp(uQ, a);
        upperArm.quaternion.copy(this.smooth.boneRotations[uk]);

        const lDir = new THREE.Vector3(wrist.x-elbow.x,wrist.y-elbow.y,wrist.z-elbow.z).normalize();
        const lQ   = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0), lDir);
        const lk   = `l_${side}`;
        if (!this.smooth.boneRotations[lk]) this.smooth.boneRotations[lk] = lQ.clone();
        this.smooth.boneRotations[lk].slerp(lQ, a);
        lowerArm.quaternion.copy(this.smooth.boneRotations[lk]);
    }

    _updateNeck(lm) {
        if (!this.bones.head||!this.skeleton) return;
        const L    = CONFIG.SKELETON.LANDMARKS;
        const nose = lm[L.NOSE], LS = lm[L.LEFT_SHOULDER], RS = lm[L.RIGHT_SHOULDER];
        if (!nose||!LS||!RS) return;
        const tilt = Math.atan2(nose.x-(LS.x+RS.x)/2, -((nose.y-(LS.y+RS.y)/2))) * 0.2;
        this.bones.head.rotation.z += (tilt - this.bones.head.rotation.z) * 0.15;
    }

    // ─────────────────────────────────────────────────────────────────
    //  HELPERS
    // ─────────────────────────────────────────────────────────────────
    _normToWorld(nx, ny, depth) {
        const cam   = sceneManager.getCamera();
        const halfH = Math.tan(cam.fov * Math.PI/360) * depth;
        const halfW = halfH * cam.aspect;
        return new THREE.Vector3((nx-0.5)*2*halfW, (ny-0.5)*-2*halfH, -depth);
    }

    _normWidthToWorld(nw, depth) {
        const cam = sceneManager.getCamera();
        return nw * 2 * Math.tan(cam.fov * Math.PI/360) * depth * cam.aspect;
    }

    _mapBones() {
        const f = n => this.skeleton
            ? (this.skeleton.bones.find(b=>b.name.toLowerCase().includes(n))||null)
            : null;
        this.bones = {
            pelvis:f('pelvis'), spine1:f('spine_01'), spine2:f('spine_02'),
            spine3:f('spine_03'), spine4:f('spine_04'), spine5:f('spine_05'),
            neck1:f('neck_01'), neck2:f('neck_02'), head:f('head'),
            clavicleL:f('clavicle_l'), upperArmL:f('upperarm_l'),
            lowerArmL:f('lowerarm_l'), handL:f('hand_l'),
            clavicleR:f('clavicle_r'), upperArmR:f('upperarm_r'),
            lowerArmR:f('lowerarm_r'), handR:f('hand_r'),
        };
        console.log('🦴 Bones:', Object.entries(this.bones).filter(([,v])=>v).map(([k])=>k).join(', ')||'none');
    }

    _measureJacketShoulderWidth() {
    // If bones exist, measure shoulder-to-shoulder distance directly
    const L = this.bones.clavicleL || this.bones.upperArmL;
    const R = this.bones.clavicleR || this.bones.upperArmR;

    if (L && R) {
        // Get world positions of left/right shoulder bones
        const posL = new THREE.Vector3();
        const posR = new THREE.Vector3();
        L.getWorldPosition(posL);
        R.getWorldPosition(posR);
        const boneW = posL.distanceTo(posR);
        console.log("📏 Jacket shoulder width (from bones):", boneW);
        if (boneW > 0.001) return boneW;
    }

    // Fallback: use bounding box but add a correction hint
    const bbox = new THREE.Box3().setFromObject(this.model);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    console.warn("⚠️ Using bbox width:", size.x, "— set MODEL_UNIT_SCALE in config if jacket is wrong size");
    return size.x * CONFIG.JACKET.MODEL_UNIT_SCALE; // see below
}

    _cacheRestPose() {
        if (!this.skeleton) return;
        this.skeleton.bones.forEach(b => {
            this.boneMatrices[b.name] = {
                position: b.position.clone(), quaternion: b.quaternion.clone(), scale: b.scale.clone()
            };
        });
    }

    _resetToRestPose() {
        if (!this.skeleton) return;
        this.skeleton.bones.forEach(b => {
            const r = this.boneMatrices[b.name]; if (!r) return;
            b.position.copy(r.position); b.quaternion.copy(r.quaternion); b.scale.copy(r.scale);
        });
    }

    // ─────────────────────────────────────────────────────────────────
    //  PUBLIC API
    // ─────────────────────────────────────────────────────────────────

    /** Call this when a new person steps in front of the camera */
    recalibrate() {
        this.cal = {
            ready: false, frames: 0, FRAMES_NEEDED: 20,
            sum: { shoulderWidth:0, torsoHeight:0 },
            ref: { shoulderWidth:null, torsoHeight:null, depth:null }
        };
        this.smooth = { position:new THREE.Vector3(), scale:1, roll:0, lean:0, boneRotations:{} };
        if (this.model) this.model.visible = false;
        console.log('🔄 Recalibrating for new person…');
    }

    /** 0.1 = matte cotton, 0.5 = leather, 0.9 = silk */
    setFabricReflectivity(v) { this._baseEnvIntensity = THREE.MathUtils.clamp(v, 0, 1); }

    isCalibrated() { return this.cal.ready; }

    reset() { this.recalibrate(); }
}

const skeletonMapper = new SkeletonMapper();
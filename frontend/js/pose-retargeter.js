// pose-retargeter.js — MediaPipe Landmarks → Skeleton Bone Rotations
//
// This module is the bridge between MediaPipe's 2D/3D joint positions and the
// THREE.js skeleton's local bone rotations.
//
// HOW IT WORKS
// ─────────────
// 1.  Each bone has a "rest direction" — the direction it points in the T-pose
//     (stored at bind time, extracted from the skeleton's rest matrices).
// 2.  MediaPipe gives us world-space 3D positions for each joint.
// 3.  We compute a direction vector from parent-joint → child-joint.
// 4.  We find the quaternion that rotates rest-direction → observed-direction.
// 5.  We apply that quaternion in the bone's LOCAL space via the bone's
//     bindMatrix so it composes correctly with the rest of the hierarchy.
//
// BONE NAME CONVENTIONS (auto-detected, configurable via CONFIG.RIG)
// ────────────────────────────────────────────────────────────────────
// Blender default (applies-transforms export, humanoid):
//   spine_01 … spine_05  |  upperarm_l / upperarm_r
//   lowerarm_l / lowerarm_r  |  hand_l / hand_r
//   clavicle_l / clavicle_r  |  neck_01  |  head
//   thigh_l / thigh_r  |  calf_l / calf_r  |  foot_l / foot_r
//
// Alternative (mixamo / standard humanoid):
//   Hips, Spine, Spine1, Spine2  |  LeftArm, RightArm
//   LeftForeArm, RightForeArm    |  LeftHand, RightHand
//   Neck, Head
//
// The retargeter tries both conventions automatically.

class PoseRetargeter {
    constructor() {
        this.skeleton    = null;
        this.bones       = {};        // named bone references
        this.restDirs    = {};        // rest-pose directions per bone key
        this.initialized = false;

        // EMA smoothing per bone rotation
        this._smoothQ    = {};
        this._ALPHA      = CONFIG.SKELETON.BONE_ANIMATION.ROTATION_SMOOTHING ?? 0.18;

        // Mirror: MediaPipe left ↔ scene left depends on camera facing mode
        // For front-facing camera the X axis is mirrored.
        this._mirrorX = true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INIT — call once after the model is loaded and the skeleton is available
    // ─────────────────────────────────────────────────────────────────────────

    init(skeleton) {
        if (!skeleton || !skeleton.bones || skeleton.bones.length === 0) {
            console.warn('PoseRetargeter: no skeleton provided — bone animation disabled');
            return false;
        }

        this.skeleton = skeleton;
        this._mapBones();
        this._cacheRestDirections();

        this.initialized = true;
        console.log('✅ PoseRetargeter ready —', Object.keys(this.bones).length, 'bones mapped');
        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BONE MAPPING — finds bones by name regardless of convention
    // ─────────────────────────────────────────────────────────────────────────

    _mapBones() {
        // Allow full override from config
        const overrides = CONFIG.RIG?.BONE_NAME_OVERRIDES ?? {};

        const find = (keywords) => {
            // 1. Try config override (exact name)
            for (const kw of keywords) {
                if (overrides[kw]) {
                    const b = this.skeleton.bones.find(
                        b => b.name === overrides[kw]
                    );
                    if (b) return b;
                }
            }
            // 2. Keyword substring search (case-insensitive)
            for (const kw of keywords) {
                const b = this.skeleton.bones.find(
                    b => b.name.toLowerCase().includes(kw.toLowerCase())
                );
                if (b) return b;
            }
            return null;
        };

        this.bones = {
            // ── Core spine chain ─────────────────────────────────────────────
            pelvis:  find(['pelvis', 'hips', 'root']),
            spine1:  find(['spine_01', 'spine.001', 'spine1', 'spine']),
            spine2:  find(['spine_02', 'spine.002', 'spine2']),
            spine3:  find(['spine_03', 'spine.003', 'spine3']),
            spine4:  find(['spine_04', 'spine.004']),
            spine5:  find(['spine_05', 'spine.005']),

            // ── Neck / head ───────────────────────────────────────────────────
            neck:    find(['neck_01', 'neck.001', 'neck']),
            head:    find(['head']),

            // ── Arms — LEFT (screen right in front-facing mode) ───────────────
            clavicleL:  find(['clavicle_l', 'leftshoulder', 'l_clavicle', 'collar_l']),
            upperArmL:  find(['upperarm_l', 'leftarm', 'l_upperarm', 'upper arm.l']),
            lowerArmL:  find(['lowerarm_l', 'leftforearm', 'l_forearm', 'forearm.l']),
            handL:      find(['hand_l', 'lefthand', 'l_hand']),

            // ── Arms — RIGHT ──────────────────────────────────────────────────
            clavicleR:  find(['clavicle_r', 'rightshoulder', 'r_clavicle', 'collar_r']),
            upperArmR:  find(['upperarm_r', 'rightarm', 'r_upperarm', 'upper arm.r']),
            lowerArmR:  find(['lowerarm_r', 'rightforearm', 'r_forearm', 'forearm.r']),
            handR:      find(['hand_r', 'righthand', 'r_hand']),
        };

        // Report what was found / missing
        const found   = Object.entries(this.bones).filter(([, v]) => v).map(([k]) => k);
        const missing = Object.entries(this.bones).filter(([, v]) => !v).map(([k]) => k);

        console.log('🦴 Bones found   :', found.join(', ') || 'none');
        if (missing.length) {
            console.warn('🦴 Bones missing :', missing.join(', '));
            console.warn('   → Check CONFIG.RIG.BONE_NAME_OVERRIDES if pose looks wrong');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REST DIRECTIONS — the direction each bone points in T-pose
    // Used as the "from" vector when building rotation quaternions.
    // ─────────────────────────────────────────────────────────────────────────

    _cacheRestDirections() {
        this.restDirs = {};

        const _getDir = (bone) => {
            if (!bone || !bone.parent) return null;

            // Direction from parent's world position to bone's world position
            const parentWP = new THREE.Vector3();
            const boneWP   = new THREE.Vector3();
            bone.parent.getWorldPosition(parentWP);
            bone.getWorldPosition(boneWP);

            const dir = boneWP.clone().sub(parentWP);
            if (dir.lengthSq() < 1e-10) return null;
            return dir.normalize();
        };

        // We capture the direction in the model's LOCAL frame so that our
        // rotations are relative to the rest pose, not absolute world space.
        const snapshot = {};
        Object.entries(this.bones).forEach(([key, bone]) => {
            if (!bone) return;
            const d = _getDir(bone);
            if (d) snapshot[key] = d;
        });

        this.restDirs = snapshot;
        console.log('📐 Rest directions cached for', Object.keys(snapshot).length, 'bones');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN UPDATE — call every frame with fresh MediaPipe landmarks
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param {Array}  landmarks  - poseData.landmarks (normalized, 33 points)
     * @param {number} depth      - estimated depth of the person in world units
     * @param {THREE.Camera} cam  - scene camera (for world conversion)
     */
    update(landmarks, depth, cam) {
        if (!this.initialized || !landmarks) return;

        const L = CONFIG.SKELETON.LANDMARKS;

        // Convert landmarks to world-space 3D vectors
        // MediaPipe x,y are normalized [0,1], z is rough depth relative to hips
        const toWorld = (lm) => {
            if (!lm) return null;
            const x = this._mirrorX ? (1 - lm.x) : lm.x;
            const y = lm.y;
            const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
            const halfW = halfH * cam.aspect;
            return new THREE.Vector3(
                (x - 0.5) *  2 * halfW,
                (y - 0.5) * -2 * halfH,
                -depth + (lm.z ?? 0) * depth * 0.5   // rough depth offset
            );
        };

        // ── World joint positions ─────────────────────────────────────────────
        const wLS  = toWorld(landmarks[L.LEFT_SHOULDER]);
        const wRS  = toWorld(landmarks[L.RIGHT_SHOULDER]);
        const wLE  = toWorld(landmarks[L.LEFT_ELBOW]);
        const wRE  = toWorld(landmarks[L.RIGHT_ELBOW]);
        const wLW  = toWorld(landmarks[L.LEFT_WRIST]);
        const wRW  = toWorld(landmarks[L.RIGHT_WRIST]);
        const wLH  = toWorld(landmarks[L.LEFT_HIP]);
        const wRH  = toWorld(landmarks[L.RIGHT_HIP]);
        const wNose = toWorld(landmarks[L.NOSE]);

        // ── Spine ─────────────────────────────────────────────────────────────
        if (wLS && wRS && wLH && wRH) {
            this._driveSpine(wLS, wRS, wLH, wRH);
        }

        // ── Arms ──────────────────────────────────────────────────────────────
        if (wLS && wLE && wLW) {
            this._driveArm('left',  wLS, wLE, wLW);
        }
        if (wRS && wRE && wRW) {
            this._driveArm('right', wRS, wRE, wRW);
        }

        // ── Clavicles (shoulder shrug / raise) ────────────────────────────────
        if (wLS && wRS) {
            this._driveClavicles(wLS, wRS);
        }

        // ── Head tilt ─────────────────────────────────────────────────────────
        if (wNose && wLS && wRS) {
            this._driveHead(wNose, wLS, wRS);
        }

        // Notify Three.js that skeleton matrices need rebuilding
        if (this.skeleton) this.skeleton.update();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SPINE
    // ─────────────────────────────────────────────────────────────────────────

    _driveSpine(wLS, wRS, wLH, wRH) {
        const shoulderMid = wLS.clone().add(wRS).multiplyScalar(0.5);
        const hipMid      = wLH.clone().add(wRH).multiplyScalar(0.5);

        // Torso direction (hip → shoulder, world space)
        const torsoDir = shoulderMid.clone().sub(hipMid).normalize();

        // Side tilt: left-right lean of spine
        const sideTilt = Math.atan2(wRS.y - wLS.y, wRS.x - wLS.x);
        // Forward lean: depth difference shoulder vs hip
        const fwdLean  = Math.atan2(
            (wLS.z + wRS.z) * 0.5 - (wLH.z + wRH.z) * 0.5,
            Math.abs(shoulderMid.y - hipMid.y) + 0.001
        );

        const spineKeys = ['spine1', 'spine2', 'spine3', 'spine4', 'spine5'];
        const nSpine    = spineKeys.filter(k => this.bones[k]).length;
        let idx = 0;

        spineKeys.forEach(k => {
            const bone = this.bones[k];
            if (!bone) return;

            // Distribute rotation across the spine chain
            const t = nSpine > 1 ? idx / (nSpine - 1) : 0.5;
            idx++;

            const targetZ = sideTilt * (0.1 + t * 0.15);  // side tilt
            const targetX = fwdLean  * (0.05 + t * 0.10); // forward lean

            const sk = `spine_${k}`;
            if (!this._smoothQ[sk]) {
                this._smoothQ[sk] = { x: 0, z: 0 };
            }

            this._smoothQ[sk].z += (targetZ - this._smoothQ[sk].z) * this._ALPHA;
            this._smoothQ[sk].x += (targetX - this._smoothQ[sk].x) * this._ALPHA;

            bone.rotation.order = 'YXZ';
            bone.rotation.z = THREE.MathUtils.clamp(this._smoothQ[sk].z, -0.35, 0.35);
            bone.rotation.x = THREE.MathUtils.clamp(this._smoothQ[sk].x, -0.25, 0.25);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ARMS  (upper + lower, both sides)
    // ─────────────────────────────────────────────────────────────────────────

    _driveArm(side, shoulder, elbow, wrist) {
        const isLeft   = side === 'left';
        const upperArm = isLeft ? this.bones.upperArmL : this.bones.upperArmR;
        const lowerArm = isLeft ? this.bones.lowerArmL : this.bones.lowerArmR;

        if (!upperArm && !lowerArm) return;

        // ── Upper arm ────────────────────────────────────────────────────────
        if (upperArm) {
            const dir = elbow.clone().sub(shoulder).normalize();
            this._rotateBoneToDir(upperArm, dir, `ua_${side}`);
        }

        // ── Lower arm / forearm ──────────────────────────────────────────────
        if (lowerArm) {
            const dir = wrist.clone().sub(elbow).normalize();
            this._rotateBoneToDir(lowerArm, dir, `la_${side}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CLAVICLES — rise/fall with shoulder elevation
    // ─────────────────────────────────────────────────────────────────────────

    _driveClavicles(wLS, wRS) {
        // How much each shoulder is raised relative to horizontal
        const liftL = THREE.MathUtils.clamp(-(wLS.y + 0.1) * 0.4, -0.3, 0.3);
        const liftR = THREE.MathUtils.clamp(-(wRS.y + 0.1) * 0.4, -0.3, 0.3);

        if (this.bones.clavicleL) {
            if (!this._smoothQ['clav_l']) this._smoothQ['clav_l'] = 0;
            this._smoothQ['clav_l'] += (liftL - this._smoothQ['clav_l']) * this._ALPHA;
            this.bones.clavicleL.rotation.z = this._smoothQ['clav_l'];
        }
        if (this.bones.clavicleR) {
            if (!this._smoothQ['clav_r']) this._smoothQ['clav_r'] = 0;
            this._smoothQ['clav_r'] += (liftR - this._smoothQ['clav_r']) * this._ALPHA;
            this.bones.clavicleR.rotation.z = this._smoothQ['clav_r'];
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HEAD
    // ─────────────────────────────────────────────────────────────────────────

    _driveHead(nose, wLS, wRS) {
        if (!this.bones.head) return;

        const shoulderMidX = (wLS.x + wRS.x) * 0.5;
        const shoulderMidY = (wLS.y + wRS.y) * 0.5;

        // Horizontal nod (look left/right)
        const yaw  = THREE.MathUtils.clamp((nose.x - shoulderMidX) * 0.8, -0.4, 0.4);
        // Vertical nod (look up/down)
        const pitch = THREE.MathUtils.clamp((nose.y - shoulderMidY + 0.15) * 1.0, -0.3, 0.3);

        if (!this._smoothQ['head']) this._smoothQ['head'] = { y: 0, x: 0 };
        this._smoothQ['head'].y += (yaw   - this._smoothQ['head'].y) * this._ALPHA;
        this._smoothQ['head'].x += (pitch - this._smoothQ['head'].x) * this._ALPHA;

        this.bones.head.rotation.order = 'YXZ';
        this.bones.head.rotation.y = this._smoothQ['head'].y;
        this.bones.head.rotation.x = this._smoothQ['head'].x;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CORE UTILITY — rotate a bone so its rest-direction aligns with targetDir
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Rotate `bone` so that its rest-pose direction aligns with `targetDir`.
     * The rotation is applied in the bone's local space using slerp smoothing.
     *
     * @param {THREE.Bone}    bone       - the bone to rotate
     * @param {THREE.Vector3} targetDir  - desired world-space direction (normalized)
     * @param {string}        key        - unique smoothing key
     */
    _rotateBoneToDir(bone, targetDir, key) {
        if (!bone || targetDir.lengthSq() < 0.0001) return;

        // Get the rest direction for this bone in world space
        const restDir = this.restDirs[this._boneToKey(bone)];

        let targetQ;

        if (restDir && restDir.lengthSq() > 0.0001) {
            // Quaternion that rotates rest-direction → target-direction
            targetQ = new THREE.Quaternion().setFromUnitVectors(
                restDir.clone().normalize(),
                targetDir.clone().normalize()
            );

            // Convert from world space to bone's local space
            const boneWorldQ   = new THREE.Quaternion();
            bone.getWorldQuaternion(boneWorldQ);
            const restLocalQ   = bone.quaternion.clone();
            const worldToLocal = boneWorldQ.clone().invert();
            targetQ.premultiply(worldToLocal).multiply(boneWorldQ);
        } else {
            // Fallback: use a simple direction-based euler (less accurate)
            const euler = new THREE.Euler(
                Math.atan2(targetDir.y, targetDir.z),
                Math.atan2(targetDir.x, targetDir.z),
                0,
                'XYZ'
            );
            targetQ = new THREE.Quaternion().setFromEuler(euler);
        }

        // Initialise smoothing state
        if (!this._smoothQ[key]) {
            this._smoothQ[key] = bone.quaternion.clone();
        }

        // Slerp toward target
        this._smoothQ[key].slerp(targetQ, this._ALPHA);

        // Clamp: prevent wild flips from low-confidence landmarks
        // (quaternion component magnitude > 0.98 means >~160° rotation — clamp it)
        const q = this._smoothQ[key];
        const maxW = 0.20; // cos(~78°) — allows ±~78° from rest
        if (q.w < maxW) {
            q.set(q.x, q.y, q.z, maxW).normalize();
        }

        bone.quaternion.copy(this._smoothQ[key]);
    }

    // Helper: find the bone key in this.bones by reference
    _boneToKey(bone) {
        return Object.keys(this.bones).find(k => this.bones[k] === bone) ?? '';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REST POSE — call to reset all bones to their bind pose
    // ─────────────────────────────────────────────────────────────────────────

    resetToRest() {
        if (!this.skeleton) return;
        this.skeleton.pose(); // THREE.js built-in: resets to bind pose
        this._smoothQ = {};
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIG HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    setSmoothing(alpha) {
        this._ALPHA = THREE.MathUtils.clamp(alpha, 0.01, 1.0);
    }

    setMirrorX(mirror) {
        this._mirrorX = mirror;
    }
}

const poseRetargeter = new PoseRetargeter();
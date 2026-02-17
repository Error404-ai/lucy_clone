// skeleton-mapper.js - PRODUCTION VERSION FOR RIGGED JACKET
// Implements PDF Step 22: Skeleton Mapping (MediaPipe → Jacket Bones)

class SkeletonMapper {
    constructor() {
        this.model = null;
        this.skeleton = null;
        this.bones = {};
        this.boneMatrices = {};
        this.videoWidth = 1280;
        this.videoHeight = 720;
        this.initialized = false;
        this.smooth = {
            position: new THREE.Vector3(0, 0, -2.5),
            scale: 1.0,
            rotation: 0,
            boneRotations: {}
        };
    }

    async init(videoWidth, videoHeight) {
        console.log('🦴 Initializing SkeletonMapper for rigged jacket...');
        this.videoWidth = videoWidth || 1280;
        this.videoHeight = videoHeight || 720;
        this.initialized = true;
        return true;
    }

    /**
     * Set the loaded jacket model and extract bones
     */
    setJacket(model) {
        this.model = model;
        console.log('🔗 Linking rigged jacket to body tracker...');
        
        // Find the SkinnedMesh (the jacket mesh)
        let jacketMesh = null;
        model.traverse(child => {
            if (child.isSkinnedMesh && child.name.includes('Jacket')) {
                jacketMesh = child;
            }
        });

        if (!jacketMesh) {
            console.error('❌ No SkinnedMesh found in jacket model!');
            return;
        }

        console.log(`✅ Found jacket mesh: ${jacketMesh.name}`);
        this.skeleton = jacketMesh.skeleton;

        if (!this.skeleton) {
            console.error('❌ Jacket mesh has no skeleton!');
            return;
        }

        console.log(`✅ Skeleton found with ${this.skeleton.bones.length} bones`);

        // Map bones by name for easy access
        this.extractBones();
        
        // Store original bone matrices for reference
        this.storeOriginalBoneMatrices();

        console.log('✅ Skeleton mapper ready with bone mapping');
    }

    /**
     * Extract and categorize bones from the skeleton
     */
    extractBones() {
        this.bones = {
            // Spine chain
            pelvis: this.findBone('pelvis'),
            spine1: this.findBone('spine_01'),
            spine2: this.findBone('spine_02'),
            spine3: this.findBone('spine_03'),
            spine4: this.findBone('spine_04'),
            spine5: this.findBone('spine_05'),
            
            // Neck and head
            neck1: this.findBone('neck_01'),
            neck2: this.findBone('neck_02'),
            head: this.findBone('head'),
            
            // Left arm
            clavicleL: this.findBone('clavicle_l'),
            upperArmL: this.findBone('upperarm_l'),
            lowerArmL: this.findBone('lowerarm_l'),
            handL: this.findBone('hand_l'),
            
            // Right arm (mirror naming)
            clavicleR: this.findBone('clavicle_r'),
            upperArmR: this.findBone('upperarm_r'),
            lowerArmR: this.findBone('lowerarm_r'),
            handR: this.findBone('hand_r')
        };

        // Log what we found
        console.log('📋 Bone mapping:');
        Object.entries(this.bones).forEach(([key, bone]) => {
            if (bone) {
                console.log(`  ✅ ${key}: ${bone.name}`);
            } else {
                console.log(`  ⚠️  ${key}: not found`);
            }
        });
    }

    /**
     * Find a bone by name (case-insensitive, handles variations)
     */
    findBone(name) {
        if (!this.skeleton) return null;
        
        return this.skeleton.bones.find(bone => 
            bone.name.toLowerCase().includes(name.toLowerCase())
        );
    }

    /**
     * Store original bone transforms for reset
     */
    storeOriginalBoneMatrices() {
        this.skeleton.bones.forEach(bone => {
            this.boneMatrices[bone.name] = {
                position: bone.position.clone(),
                quaternion: bone.quaternion.clone(),
                scale: bone.scale.clone()
            };
        });
    }

    /**
     * Main update function - called every frame with pose data
     */
    update(poseData) {
        if (!this.model || !this.skeleton) {
            return;
        }

        // No pose detected - show jacket at center in T-pose
        if (!poseData || !poseData.landmarks) {
            this.model.visible = true;
            this.model.position.set(0, 0, -2.5);
            this.model.scale.setScalar(0.5);
            this.model.rotation.set(0, Math.PI, 0);
            this.resetToTPose();
            return;
        }

        const landmarks = poseData.landmarks;
        const L = CONFIG.SKELETON.LANDMARKS;

        const LS = landmarks[L.LEFT_SHOULDER];
        const RS = landmarks[L.RIGHT_SHOULDER];
        const LE = landmarks[L.LEFT_ELBOW];
        const RE = landmarks[L.RIGHT_ELBOW];
        const LW = landmarks[L.LEFT_WRIST];
        const RW = landmarks[L.RIGHT_WRIST];
        const LH = landmarks[L.LEFT_HIP];
        const RH = landmarks[L.RIGHT_HIP];

        // Check minimum visibility
        if (!LS || !RS || LS.visibility < 0.3 || RS.visibility < 0.3) {
            this.model.visible = true;
            return;
        }

        /* ==================== POSITION ==================== */
        
        // Calculate torso center (between shoulders and hips)
        const centerX = (LS.x + RS.x + LH.x + RH.x) / 4;
        const centerY = (LS.y + RS.y + LH.y + RH.y) / 4;

        // Calculate adaptive depth based on shoulder width
        const dx = RS.x - LS.x;
        const dy = RS.y - LS.y;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);
        
        const BASE_DEPTH = 2.5;
        const REFERENCE_WIDTH = 0.2;
        const depth = BASE_DEPTH * (REFERENCE_WIDTH / Math.max(shoulderWidth, 0.1));
        const clampedDepth = THREE.MathUtils.clamp(depth, 1.5, 4.0);

        // Convert to world space
        const worldPos = this.normalizedToWorld(centerX, centerY, clampedDepth);

        // Smooth position
        this.smooth.position.lerp(worldPos, 0.3);
        this.model.position.copy(this.smooth.position);

        /* ==================== SCALE ==================== */
        
        // Scale based on shoulder width
        const targetScale = shoulderWidth * 2.5;  // Adjusted for rigged model
        const clampedScale = THREE.MathUtils.clamp(targetScale, 0.3, 1.0);

        this.smooth.scale += (clampedScale - this.smooth.scale) * 0.25;
        this.model.scale.setScalar(this.smooth.scale);

        /* ==================== ROTATION ==================== */
        
        // Body roll (shoulder tilt)
        const roll = Math.atan2(dy, dx);
        this.smooth.rotation += (roll - this.smooth.rotation) * 0.3;
        
        // Face camera
        this.model.rotation.set(0, Math.PI, this.smooth.rotation);

        /* ==================== BONE ANIMATION ==================== */
        
        // Update spine/torso
        this.updateSpine(landmarks);
        
        // Update arms (THE KEY FEATURE!)
        this.updateArm('left', LS, LE, LW);
        this.updateArm('right', RS, RE, RW);
        
        // Update neck/head
        this.updateNeck(landmarks);

        this.model.visible = true;
    }

    /**
     * Convert normalized screen coordinates to 3D world space
     */
    normalizedToWorld(nx, ny, depth) {
        const camera = sceneManager.getCamera();
        const fov = camera.fov * (Math.PI / 180);
        const aspect = camera.aspect;
        
        const ndcX = (nx - 0.5) * 2;
        const ndcY = -(ny - 0.5) * 2;
        
        const viewHeight = 2 * Math.tan(fov / 2) * depth;
        const viewWidth = viewHeight * aspect;
        
        const worldX = ndcX * (viewWidth / 2);
        const worldY = ndcY * (viewHeight / 2);
        const worldZ = -depth;

        return new THREE.Vector3(worldX, worldY, worldZ);
    }

    /**
     * Update spine bones based on pose
     */
    updateSpine(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        const LS = landmarks[L.LEFT_SHOULDER];
        const RS = landmarks[L.RIGHT_SHOULDER];
        const LH = landmarks[L.LEFT_HIP];
        const RH = landmarks[L.RIGHT_HIP];

        if (!LS || !RS || !LH || !RH) return;

        // Calculate torso direction
        const shoulderCenter = new THREE.Vector3(
            (LS.x + RS.x) / 2,
            (LS.y + RS.y) / 2,
            (LS.z + RS.z) / 2
        );

        const hipCenter = new THREE.Vector3(
            (LH.x + RH.x) / 2,
            (LH.y + RH.y) / 2,
            (LH.z + RH.z) / 2
        );

        const spineDirection = new THREE.Vector3()
            .subVectors(shoulderCenter, hipCenter)
            .normalize();

        // Apply slight rotation to spine bones
        // (In production, you'd calculate proper quaternion rotations)
        // For now, this is simplified
        if (this.bones.spine3) {
            const targetRot = Math.atan2(spineDirection.x, spineDirection.y);
            this.bones.spine3.rotation.z = targetRot * 0.2; // Subtle effect
        }
    }

    /**
     * Update arm bones - THIS IS THE MAGIC!
     */
    updateArm(side, shoulder, elbow, wrist) {
        if (!shoulder || !elbow || !wrist) return;

        const clavicle = side === 'left' ? this.bones.clavicleL : this.bones.clavicleR;
        const upperArm = side === 'left' ? this.bones.upperArmL : this.bones.upperArmR;
        const lowerArm = side === 'left' ? this.bones.lowerArmL : this.bones.lowerArmR;

        if (!upperArm || !lowerArm) return;

        /* UPPER ARM (Shoulder to Elbow) */
        
        const upperArmDir = new THREE.Vector3(
            elbow.x - shoulder.x,
            elbow.y - shoulder.y,
            elbow.z - shoulder.z
        ).normalize();

        // Calculate rotation to point upper arm toward elbow
        const upperArmRotation = new THREE.Quaternion();
        upperArmRotation.setFromUnitVectors(
            new THREE.Vector3(0, -1, 0), // Bone's default direction (down)
            upperArmDir
        );

        // Smooth the rotation
        const key = `upperArm${side}`;
        if (!this.smooth.boneRotations[key]) {
            this.smooth.boneRotations[key] = upperArmRotation.clone();
        }
        this.smooth.boneRotations[key].slerp(upperArmRotation, 0.3);
        
        upperArm.quaternion.copy(this.smooth.boneRotations[key]);

        /* LOWER ARM (Elbow to Wrist) */
        
        const lowerArmDir = new THREE.Vector3(
            wrist.x - elbow.x,
            wrist.y - elbow.y,
            wrist.z - elbow.z
        ).normalize();

        const lowerArmRotation = new THREE.Quaternion();
        lowerArmRotation.setFromUnitVectors(
            new THREE.Vector3(0, -1, 0),
            lowerArmDir
        );

        const lowerKey = `lowerArm${side}`;
        if (!this.smooth.boneRotations[lowerKey]) {
            this.smooth.boneRotations[lowerKey] = lowerArmRotation.clone();
        }
        this.smooth.boneRotations[lowerKey].slerp(lowerArmRotation, 0.3);
        
        lowerArm.quaternion.copy(this.smooth.boneRotations[lowerKey]);
    }

    /**
     * Update neck and head bones
     */
    updateNeck(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        const nose = landmarks[L.NOSE];
        const LS = landmarks[L.LEFT_SHOULDER];
        const RS = landmarks[L.RIGHT_SHOULDER];

        if (!nose || !LS || !RS || !this.bones.head) return;

        const shoulderCenter = new THREE.Vector3(
            (LS.x + RS.x) / 2,
            (LS.y + RS.y) / 2,
            (LS.z + RS.z) / 2
        );

        const headDir = new THREE.Vector3(
            nose.x - shoulderCenter.x,
            nose.y - shoulderCenter.y,
            nose.z - shoulderCenter.z
        ).normalize();

        // Apply subtle head rotation
        const headRotation = Math.atan2(headDir.x, headDir.y);
        if (this.bones.head) {
            this.bones.head.rotation.z = headRotation * 0.3;
        }
    }

    /**
     * Reset skeleton to T-pose
     */
    resetToTPose() {
        if (!this.skeleton) return;

        this.skeleton.bones.forEach(bone => {
            if (this.boneMatrices[bone.name]) {
                const original = this.boneMatrices[bone.name];
                bone.position.copy(original.position);
                bone.quaternion.copy(original.quaternion);
                bone.scale.copy(original.scale);
            }
        });
    }

    /**
     * Reset tracking state
     */
    reset() {
        this.smooth = {
            position: new THREE.Vector3(0, 0, -2.5),
            scale: 1.0,
            rotation: 0,
            boneRotations: {}
        };
        this.resetToTPose();
        
        if (this.model) {
            this.model.visible = false;
        }
        
        console.log('🔄 Skeleton mapper reset');
    }
}

const skeletonMapper = new SkeletonMapper();
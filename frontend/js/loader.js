// 3D Model loader - STABLE AR VERSION (Pivot Fixed)

class ModelLoader {
    constructor() {
        this.loader = new THREE.GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();

        this.jacketModel = null;
        this.jacketMeshes = [];
        this.jacketSkeleton = null;
        this.isLoaded = false;

        this.setupMeshoptDecoder();
    }

    setupMeshoptDecoder() {
        if (typeof MeshoptDecoder !== 'undefined') {
            this.loader.setMeshoptDecoder(MeshoptDecoder);
            console.log('✓ Meshopt decoder initialized');
        }
    }

    /* ====================== LOAD MODEL ====================== */

    async loadJacket(modelPath = CONFIG.JACKET.MODEL_PATH) {
        return new Promise((resolve, reject) => {

            console.log('📦 Loading jacket model:', modelPath);
            Utils.updateLoadingText('Loading 3D jacket model...');

            this.loader.load(
                modelPath,
                (gltf) => {
                    try {
                        this.jacketModel = gltf.scene;

                        console.log('=== MODEL ANALYSIS ===');
                        this.analyzeModel(this.jacketModel);

                        this.findJacketMeshes(this.jacketModel);

                        if (this.jacketMeshes.length === 0) {
                            throw new Error('❌ No meshes found in model');
                        }

                        console.log(`✅ Found ${this.jacketMeshes.length} jacket mesh(es)`);

                        this.optimizeAllMeshes();

                        // Skeleton detection
                        this.jacketSkeleton = this.findSkeleton(this.jacketModel);
                        if (this.jacketSkeleton) {
                            console.log(`✓ Skeleton: ${this.jacketSkeleton.bones.length} bones`);
                        } else {
                            console.log('⚠ No skeleton found (model may not be rigged)');
                        }

                        // ⭐ CRITICAL FIX: normalize pivot to torso
                        this.normalizeModelSize();
                        this.centerModelToTorso();

                        // Apply initial position and scale from CONFIG
                        this.jacketModel.position.set(
                            CONFIG.JACKET.POSITION.x,
                            CONFIG.JACKET.POSITION.y,
                            CONFIG.JACKET.POSITION.z
                        );
                        this.jacketModel.scale.setScalar(CONFIG.JACKET.SCALE);
                        this.jacketModel.rotation.set(
                            CONFIG.JACKET.ROTATION.x,
                            CONFIG.JACKET.ROTATION.y,
                            CONFIG.JACKET.ROTATION.z
                        );

                        // Start hidden
                        this.jacketModel.visible = false;
                        console.log('📍 Jacket initially hidden');
                        console.log(`📍 Initial position: [${CONFIG.JACKET.POSITION.x}, ${CONFIG.JACKET.POSITION.y}, ${CONFIG.JACKET.POSITION.z}]`);
                        console.log(`📍 Initial scale: ${CONFIG.JACKET.SCALE}`);

                        // Add to scene
                        if (typeof sceneManager !== 'undefined') {
                            sceneManager.add(this.jacketModel);
                        }

                        // Link to skeleton mapper
                        if (typeof skeletonMapper !== 'undefined') {
                            skeletonMapper.setJacket(this.jacketModel);
                            console.log('🔗 Jacket linked to SkeletonMapper');
                        }

                        this.isLoaded = true;

                        console.log('✅ Jacket loaded successfully');
                        console.log('===================');

                        resolve(this.jacketModel);

                    } catch (error) {
                        console.error('❌ Error processing model:', error);
                        reject(error);
                    }
                },
                (progress) => {
                    // Optional: loading progress
                    if (progress.lengthComputable) {
                        const percentComplete = (progress.loaded / progress.total * 100).toFixed(0);
                        console.log(`Loading: ${percentComplete}%`);
                    }
                },
                (error) => {
                    console.error('❌ Failed to load model:', error);
                    reject(error);
                }
            );
        });
    }

    /* ====================== PIVOT FIX ====================== */

    normalizeModelSize() {
        const box = new THREE.Box3().setFromObject(this.jacketModel);
        const size = new THREE.Vector3();
        box.getSize(size);

        const targetHeight = 1.6; // human torso height
        const scale = targetHeight / size.y;

        this.jacketModel.scale.setScalar(scale);

        console.log('📏 Model normalized scale:', scale.toFixed(3));
    }

    centerModelToTorso() {
        const box = new THREE.Box3().setFromObject(this.jacketModel);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();

        box.getCenter(center);
        box.getSize(size);

        // move pivot to chest area (not geometric center)
        const chestOffsetY = size.y * 0.25;

        this.jacketModel.position.x -= center.x;
        this.jacketModel.position.y -= (center.y - chestOffsetY);
        this.jacketModel.position.z -= center.z;

        console.log('🎯 Model pivot centered to torso');
    }

    /* ====================== ANALYSIS ====================== */

    analyzeModel(object) {
        object.traverse(child => {
            if (child.isMesh || child.isSkinnedMesh) {
                console.log(`  Mesh: ${child.name}`);
            }
        });
    }

    findJacketMeshes(object) {
        this.jacketMeshes = [];
        object.traverse(child => {
            if (child.isMesh || child.isSkinnedMesh) {
                // ⭐ CRITICAL FIX: Skip helper meshes like "Cube"
                if (child.name === 'Cube' || child.name.toLowerCase().includes('helper')) {
                    console.log(`⚠️ Skipping helper mesh: ${child.name}`);
                    child.visible = false; // Hide it completely
                    return;
                }
                
                this.jacketMeshes.push(child);
                child.frustumCulled = false;
                console.log(`✅ Added jacket mesh: ${child.name}`);
            }
        });
    }

    optimizeAllMeshes() {
        this.jacketMeshes.forEach(mesh => {
            if (!mesh.geometry) return;
            mesh.geometry.computeBoundingSphere();
        });
        console.log('✓ Optimization complete');
    }

    findSkeleton(object) {
        let skeleton = null;
        object.traverse(child => {
            if (child.isSkinnedMesh && child.skeleton) {
                skeleton = child.skeleton;
            }
        });
        return skeleton;
    }

    /* ====================== HELPERS ====================== */

    getModel() { 
        return this.jacketModel; 
    }
    
    getMeshes() { 
        return this.jacketMeshes; 
    }
    
    getSkeleton() {
        return this.jacketSkeleton;
    }
    
    setVisible(visible) { 
        if (this.jacketModel) {
            this.jacketModel.visible = visible;
            console.log(`👁 Jacket visibility set to: ${visible}`);
        }
    }
    
    isModelLoaded() {
        return this.isLoaded;
    }
}

// Initialize global instance
const modelLoader = new ModelLoader();
// loader.js - UPDATED with DRACOLoader + SkinnedMesh support

class ModelLoader {
    constructor() {
        // ✅ Setup DRACOLoader first
        this.dracoLoader = new THREE.DRACOLoader();
        this.dracoLoader.setDecoderPath(
            'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'
        );
        this.dracoLoader.preload();

        // ✅ Setup GLTFLoader with DRACOLoader attached
        this.loader = new THREE.GLTFLoader();
        this.loader.setDRACOLoader(this.dracoLoader);

        this.jacketModel = null;
        this.jacketMeshes = [];
        this.jacketSkeleton = null;
        this.isLoaded = false;
    }

    async loadJacket(modelPath = CONFIG.JACKET.MODEL_PATH) {
        return new Promise((resolve, reject) => {
            console.log('📦 Loading jacket model:', modelPath);

            this.loader.load(
                modelPath,
                (gltf) => {
                    try {
                        this.jacketModel = gltf.scene;

                        // ✅ Find all meshes including SkinnedMesh
                        this.findJacketMeshes(this.jacketModel);

                        if (this.jacketMeshes.length === 0) {
                            console.error('❌ No jacket mesh found');
                            return reject(new Error('No jacket mesh found'));
                        }

                        // ✅ Check for SkinnedMesh (rigged jacket)
                        let hasSkinnedMesh = false;
                        this.jacketModel.traverse(child => {
                            if (child.isSkinnedMesh) {
                                hasSkinnedMesh = true;
                                this.jacketSkeleton = child.skeleton;
                                console.log(`✅ SkinnedMesh found: ${child.name}`);
                                console.log(`✅ Bones: ${child.skeleton.bones.length}`);

                                // Enable skinning
                                child.frustumCulled = false;
                                child.castShadow = false;
                                child.receiveShadow = false;
                            }
                        });

                        if (hasSkinnedMesh) {
                            console.log('✅ Rigged jacket loaded! Arm movement enabled.');
                        } else {
                            console.log('ℹ️ Static jacket loaded (no bones found)');
                        }

                        // Set initial transform
                        this.jacketModel.scale.setScalar(1.0);
                        this.jacketModel.position.set(0, 0, 0);
                        this.jacketModel.rotation.set(0, Math.PI, 0);
                        this.jacketModel.visible = false;

                        // Add to scene
                        sceneManager.add(this.jacketModel);

                        // ✅ Pass to skeleton mapper
                        skeletonMapper.setJacket(this.jacketModel);

                        this.isLoaded = true;
                        console.log(`✅ Jacket loaded successfully`);
                        console.log(`   Meshes: ${this.jacketMeshes.length}`);
                        console.log(`   Has Skeleton: ${hasSkinnedMesh}`);

                        resolve(this.jacketModel);

                    } catch (error) {
                        console.error('❌ Error processing jacket:', error);
                        reject(error);
                    }
                },
                // Progress callback
                (progress) => {
                    if (progress.total > 0) {
                        const percent = Math.round((progress.loaded / progress.total) * 100);
                        Utils.updateLoadingText(`Loading jacket model... ${percent}%`);
                    }
                },
                // Error callback
                (error) => {
                    console.error('❌ Failed to load jacket:', error);
                    reject(error);
                }
            );
        });
    }

    findJacketMeshes(object) {
        this.jacketMeshes = [];

        object.traverse(child => {
            // ✅ Accept BOTH regular Mesh AND SkinnedMesh
            if (!child.isMesh && !child.isSkinnedMesh) return;

            const vertexCount = child.geometry?.attributes?.position?.count || 0;
            const name = child.name.toLowerCase();

            // Skip helpers
            const helperKeywords = ['cube', 'plane', 'helper', 'collider', 'bound', 'reference', 'guide'];
            const isHelper = helperKeywords.some(keyword => name.includes(keyword));

            if (isHelper) {
                child.visible = false;
                return;
            }

            // ✅ Lower vertex threshold for jacket-only mesh
            if (vertexCount < 100) {
                child.visible = false;
                return;
            }

            this.jacketMeshes.push(child);
            child.frustumCulled = false;
            child.castShadow = false;
            child.receiveShadow = false;

            console.log(`✅ Found mesh: "${child.name}" (${vertexCount} vertices, ${child.isSkinnedMesh ? 'SKINNED' : 'STATIC'})`);
        });

        console.log(`📊 Total meshes found: ${this.jacketMeshes.length}`);
    }

    getModel() { return this.jacketModel; }
    getMeshes() { return this.jacketMeshes; }
    getSkeleton() { return this.jacketSkeleton; }
    isModelLoaded() { return this.isLoaded; }
    
    setVisible(visible) {
        if (this.jacketModel) {
            this.jacketModel.visible = visible;
        }
    }

    dispose() {
        if (this.dracoLoader) {
            this.dracoLoader.dispose();
        }
    }
}

const modelLoader = new ModelLoader();
class ModelLoader {
    constructor() {
        this.loader = new THREE.GLTFLoader();
        this.jacketModel = null;
        this.jacketMeshes = [];
        this.jacketSkeleton = null;
        this.isLoaded = false;

        if (typeof MeshoptDecoder !== 'undefined') {
            this.loader.setMeshoptDecoder(MeshoptDecoder);
        }
    }

    async loadJacket(modelPath = CONFIG.JACKET.MODEL_PATH) {
        return new Promise((resolve, reject) => {
            console.log('📦 Loading jacket model:', modelPath);

            this.loader.load(modelPath, (gltf) => {
                try {
                    this.jacketModel = gltf.scene;

                    // Find actual clothing meshes (filter out helpers)
                    this.findJacketMeshes(this.jacketModel);

                    if (this.jacketMeshes.length === 0) {
                        console.error('❌ No valid jacket mesh found');
                        return reject(new Error('No valid jacket mesh found'));
                    }

                    // Initial setup
                    this.jacketModel.scale.setScalar(0.01);  // Convert cm to meters
                    this.jacketModel.position.set(0, 0, 0);
                    this.jacketModel.rotation.set(0, Math.PI, 0);
                    this.jacketModel.visible = false;  // Start hidden

                    // Add to scene
                    sceneManager.add(this.jacketModel);

                    // Link to skeleton mapper
                    skeletonMapper.setJacket(this.jacketModel);

                    this.isLoaded = true;
                    console.log(`✅ Jacket loaded with ${this.jacketMeshes.length} mesh(es)`);

                    resolve(this.jacketModel);

                } catch (error) {
                    console.error('❌ Error processing jacket:', error);
                    reject(error);
                }
            }, undefined, (error) => {
                console.error('❌ Failed to load jacket:', error);
                reject(error);
            });
        });
    }

    /**
     * ✅ CRITICAL FIX: Intelligent mesh filtering to avoid helper geometry
     */
    findJacketMeshes(object) {
        this.jacketMeshes = [];

        object.traverse(child => {
            // Only process meshes
            if (!(child.isMesh || child.isSkinnedMesh)) return;

            const vertexCount = child.geometry?.attributes?.position?.count || 0;
            const name = child.name.toLowerCase();

            console.log(`🔍 Found mesh: "${child.name}" (${vertexCount} vertices)`);

            // ❌ Filter out helper/collider meshes by name
            const helperKeywords = [
                'cube', 'plane', 'helper', 'mannequin', 'body',
                'collider', 'bound', 'reference', 'guide', 'armature'
            ];

            const isHelper = helperKeywords.some(keyword => name.includes(keyword));

            if (isHelper) {
                console.log(`   ❌ Skipped: Helper geometry (name)`);
                child.visible = false;
                return;
            }

            // ❌ Filter out tiny meshes (buttons, zippers, < 2000 vertices)
            if (vertexCount < 2000) {
                console.log(`   ❌ Skipped: Too small (${vertexCount} < 2000 verts)`);
                child.visible = false;
                return;
            }

            // ❌ Filter out huge meshes (likely bounding boxes, > 100k vertices)
            if (vertexCount > 100000) {
                console.log(`   ❌ Skipped: Too large (${vertexCount} > 100k verts)`);
                child.visible = false;
                return;
            }

            // ✅ This is likely the actual jacket mesh
            console.log(`   ✅ Accepted as jacket mesh`);

            this.jacketMeshes.push(child);

            // Ensure proper rendering settings
            child.frustumCulled = false;
            child.castShadow = false;
            child.receiveShadow = false;
        });

        console.log(`📊 Final jacket mesh count: ${this.jacketMeshes.length}`);

        if (this.jacketMeshes.length === 0) {
            console.error('❌ No valid jacket meshes found after filtering');
        }
    }

    getModel() {
        return this.jacketModel;
    }

    getMeshes() {
        return this.jacketMeshes;
    }

    isModelLoaded() {
        return this.isLoaded;
    }

    setVisible(visible) {
        if (this.jacketModel) {
            this.jacketModel.visible = visible;
        }
    }

    /**
     * Debug: Print mesh hierarchy
     */
    debugPrintHierarchy() {
        if (!this.jacketModel) {
            console.log('No model loaded');
            return;
        }

        console.log('📋 Model Hierarchy:');
        this.jacketModel.traverse(child => {
            const indent = '  '.repeat(child.parent ? 1 : 0);
            const type = child.isMesh ? 'Mesh' : 
                        child.isSkinnedMesh ? 'SkinnedMesh' :
                        child.isBone ? 'Bone' : 'Object3D';
            const verts = child.geometry?.attributes?.position?.count || 0;
            console.log(`${indent}${type}: ${child.name} (${verts} verts)`);
        });
    }
}

const modelLoader = new ModelLoader();
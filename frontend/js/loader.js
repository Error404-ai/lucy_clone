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

                    this.findJacketMeshes(this.jacketModel);

                    if (this.jacketMeshes.length === 0) {
                        console.error('❌ No valid jacket mesh found');
                        return reject(new Error('No valid jacket mesh found'));
                    }

                    // ✅ FIX: Jacket is upside down (collar at bottom in GLB)
                    this.jacketModel.scale.setScalar(1.0);
                    this.jacketModel.position.set(0, 0, 0);
                    this.jacketModel.rotation.set(Math.PI, 0, 0);  // Flip 180° on X
                    this.jacketModel.visible = false;

                    sceneManager.add(this.jacketModel);
                    skeletonMapper.setJacket(this.jacketModel);

                    this.isLoaded = true;
                    console.log(`✅ Jacket loaded (flipped right-side up)`);

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

    findJacketMeshes(object) {
        this.jacketMeshes = [];

        object.traverse(child => {
            if (!(child.isMesh || child.isSkinnedMesh)) return;

            const vertexCount = child.geometry?.attributes?.position?.count || 0;
            const name = child.name.toLowerCase();

            const helperKeywords = ['cube', 'plane', 'helper', 'mannequin', 'body', 'collider', 'bound', 'reference', 'guide', 'armature'];
            const isHelper = helperKeywords.some(keyword => name.includes(keyword));

            if (isHelper || vertexCount < 2000 || vertexCount > 100000) {
                child.visible = false;
                return;
            }

            this.jacketMeshes.push(child);
            child.frustumCulled = false;
            child.castShadow = false;
            child.receiveShadow = false;
        });

        console.log(`📊 Found ${this.jacketMeshes.length} jacket mesh(es)`);
    }

    getModel() { return this.jacketModel; }
    getMeshes() { return this.jacketMeshes; }
    isModelLoaded() { return this.isLoaded; }
    setVisible(visible) { if (this.jacketModel) this.jacketModel.visible = visible; }

    debugPrintHierarchy() {
        if (!this.jacketModel) { console.log('No model loaded'); return; }
        console.log('📋 Model Hierarchy:');
        this.jacketModel.traverse(child => {
            const type = child.isMesh ? 'Mesh' : child.isSkinnedMesh ? 'SkinnedMesh' : child.isBone ? 'Bone' : 'Object3D';
            const verts = child.geometry?.attributes?.position?.count || 0;
            console.log(`  ${type}: ${child.name} (${verts} verts)`);
        });
    }
}

const modelLoader = new ModelLoader();
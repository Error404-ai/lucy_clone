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

    /* ================= LOAD ================= */

    async loadJacket(modelPath = CONFIG.JACKET.MODEL_PATH) {
        return new Promise((resolve, reject) => {

            console.log('📦 Loading jacket:', modelPath);

            this.loader.load(modelPath, (gltf) => {

                this.jacketModel = gltf.scene;

                this.findJacketMeshes(this.jacketModel);
                if (this.jacketMeshes.length === 0)
                    return reject('No meshes in model');

                // IMPORTANT: normalize ONLY ONCE
                this.normalizeModelSize();
                this.centerPivotToChest();

                // DO NOT position or scale here
                this.jacketModel.position.set(0,0,-2);
                this.jacketModel.scale.setScalar(1);
                this.jacketModel.rotation.set(0,Math.PI,0);

                this.jacketModel.visible = false;

                sceneManager.add(this.jacketModel);
                skeletonMapper.setJacket(this.jacketModel);

                this.isLoaded = true;
                console.log('✅ Jacket ready for AR tracking');

                resolve(this.jacketModel);

            }, undefined, reject);
        });
    }

    /* ================= SIZE NORMALIZATION ================= */

    normalizeModelSize() {
        const box = new THREE.Box3().setFromObject(this.jacketModel);
        const size = new THREE.Vector3();
        box.getSize(size);

        const TARGET_TORSO_HEIGHT = 1.6;
        const scale = TARGET_TORSO_HEIGHT / size.y;

        this.jacketModel.scale.setScalar(scale);

        console.log('📏 Normalized torso height to 1.6m');
    }

    /* ================= PIVOT FIX ================= */

    centerPivotToChest() {
        const box = new THREE.Box3().setFromObject(this.jacketModel);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();

        box.getCenter(center);
        box.getSize(size);

        const chestY = center.y - size.y * 0.25;

        this.jacketModel.position.x -= center.x;
        this.jacketModel.position.y -= chestY;
        this.jacketModel.position.z -= center.z;

        console.log('🎯 Pivot moved to chest');
    }

    /* ================= MESH FIND ================= */

    findJacketMeshes(object) {
        this.jacketMeshes = [];

        object.traverse(child => {
            if (child.isMesh || child.isSkinnedMesh) {
                if (child.name.toLowerCase().includes('helper')) return;
                this.jacketMeshes.push(child);
                child.frustumCulled = false;
            }
        });
    }

    /* ================= GETTERS ================= */

    getModel() { return this.jacketModel; }
    getMeshes() { return this.jacketMeshes; }
    isModelLoaded() { return this.isLoaded; }

    setVisible(v){
        if(this.jacketModel) this.jacketModel.visible = v;
    }
}

const modelLoader = new ModelLoader();
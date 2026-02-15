class MaterialsManager {
    constructor() {
        this.currentMaterial = null;
        this.currentFabric = null;
        this.defaultMaterial = null;
    }

    /* ---------------- INIT ---------------- */

    init() {
        this.defaultMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.85,
            metalness: 0.05,
            side: THREE.DoubleSide
        });

        console.log('✅ Default material created');
    }

    /* ---------------- APPLY FABRIC ---------------- */

    async applyFabric(fabricData) {
        try {
            console.log('🎨 Applying fabric:', fabricData.name);

            const model = modelLoader.getModel();
            if (!model) {
                console.error('❌ Model not loaded');
                return false;
            }

            const jacketMeshes = modelLoader.getMeshes();
            if (!jacketMeshes || jacketMeshes.length === 0) {
                console.error('❌ No jacket meshes found');
                return false;
            }

            /* ---------- CREATE MATERIAL ---------- */

            let newMaterial;

            try {
                if (fabricData.color) {
                    const colorValue =
                        typeof fabricData.color === 'string'
                            ? fabricData.color
                            : '#808080';

                    newMaterial = new THREE.MeshStandardMaterial({
                        color: colorValue,
                        roughness: fabricData.roughness ?? 0.85,
                        metalness: fabricData.metalness ?? 0.05,
                        side: THREE.DoubleSide
                    });

                    console.log('✅ Created fabric material:', colorValue);
                } else {
                    newMaterial = this.defaultMaterial.clone();
                    console.log('✅ Using default material');
                }
            } catch (matError) {
                console.error('❌ Material creation failed:', matError);
                newMaterial = this.defaultMaterial.clone();
            }

            /* ---------- APPLY TO MESHES ---------- */

            let appliedCount = 0;

            for (const mesh of jacketMeshes) {
                try {
                    if (!mesh || !(mesh.isMesh || mesh.isSkinnedMesh)) continue;

                    const oldMaterial = mesh.material;

                    mesh.material = newMaterial.clone();

                    /* ⭐⭐⭐ AR DEPTH FIX ⭐⭐⭐ */
                    mesh.material.depthWrite = false;  // VERY IMPORTANT
                    mesh.material.depthTest = true;
                    mesh.material.transparent = false;
                    mesh.material.opacity = 1.0;
                    mesh.material.side = THREE.DoubleSide;

                    mesh.castShadow = false;
                    mesh.receiveShadow = false;

                    // Render AFTER video plane
                    mesh.renderOrder = 10;

                    mesh.frustumCulled = false;
                    mesh.material.needsUpdate = true;

                    appliedCount++;

console.log(`✅ Applied to: "${mesh.name}"`);

                    if (oldMaterial && oldMaterial !== this.defaultMaterial) {
                        try { oldMaterial.dispose(); } catch {}
                    }

                } catch (meshError) {
console.error(`❌ Failed on mesh ${mesh.name}:`, meshError);
                }
            }

            /* ---------- FINALIZE ---------- */

            if (appliedCount > 0) {
                this.currentMaterial = newMaterial;
                this.currentFabric = fabricData;

                modelLoader.setVisible(true);

console.log(`✅ Fabric applied to ${appliedCount} mesh(es)`);
                console.log('📊 Layering: Video(-1000) → Jacket(10)');

                try { sceneManager.render(); } catch {}

                return true;
            }

            console.error('❌ No meshes updated');
            return false;

        } catch (error) {
            console.error('❌ CRITICAL ERROR in applyFabric:', error);

            // Recovery
            try {
                const jacketMeshes = modelLoader.getMeshes();
                jacketMeshes.forEach(mesh => {
                    mesh.material = this.defaultMaterial.clone();
                });
                console.log('🔧 Emergency recovery applied');
            } catch {}

            return false;
        }
    }

    /* ---------------- HELPERS ---------------- */

    getCurrentFabric() {
        return this.currentFabric;
    }

    reset() {
        try {
            const jacketMeshes = modelLoader.getMeshes();
            jacketMeshes.forEach(mesh => {
                mesh.material = this.defaultMaterial.clone();
                mesh.renderOrder = 10;
            });

            console.log('✅ Materials reset');
        } catch (error) {
            console.error('❌ Reset failed:', error);
        }
    }

    dispose() {
        if (this.currentMaterial && this.currentMaterial !== this.defaultMaterial) {
            this.currentMaterial.dispose();
        }
        if (this.defaultMaterial) {
            this.defaultMaterial.dispose();
        }
    }
}

const materialsManager = new MaterialsManager();
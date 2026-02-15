
class MaterialsManager {
    constructor() {
        this.currentMaterial = null;
        this.currentFabric = null;
        this.defaultMaterial = null;
    }

    /**
     * Initialize with default material
     */
    init() {
        this.defaultMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.8,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        console.log('✅ Default material created');
    }

    /**
     * Apply fabric to jacket meshes
     */
    async applyFabric(fabricData) {
        try {
            console.log('🎨 Applying fabric:', fabricData.name);

            const model = modelLoader.getModel();
            if (!model) {
                console.error('❌ Model not loaded');
                return false;
            }

            const jacketMeshes = modelLoader.getMeshes();
            if (jacketMeshes.length === 0) {
                console.error('❌ No jacket meshes found');
                return false;
            }

           console.log(`✅ Fabric applied to ${appliedCount} mesh(es)`);

            let newMaterial;

            try {
                if (fabricData.color) {
                    const colorValue =
                        typeof fabricData.color === 'string'
                            ? fabricData.color
                            : '#808080';

                    newMaterial = new THREE.MeshStandardMaterial({
                        color: colorValue,
                        roughness: fabricData.roughness ?? 0.8,
                        metalness: fabricData.metalness ?? 0.0,
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

            let appliedCount = 0;

            for (const mesh of jacketMeshes) {
                try {
                    if (!mesh || !mesh.isMesh) continue;

                    const oldMaterial = mesh.material;

                    // ===== APPLY MATERIAL =====
                    mesh.material = newMaterial.clone();

                    // ⭐⭐⭐ VERY IMPORTANT AR FIXES ⭐⭐⭐
                    mesh.material.depthWrite = true;      // jacket writes depth
                    mesh.material.depthTest = true;       // jacket respects depth
                    mesh.material.transparent = false;
                    mesh.material.opacity = 1.0;
                    mesh.material.side = THREE.DoubleSide;

                    // Shadows OFF (prevents black artifacts on webcam)
                    mesh.castShadow = false;
                    mesh.receiveShadow = false;

                    // Render AFTER video plane
                    mesh.renderOrder = 1;

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

            if (appliedCount > 0) {
                this.currentMaterial = newMaterial;
                this.currentFabric = fabricData;

                modelLoader.setVisible(true);

               console.log(`🎯 Targeting ${jacketMeshes.length} jacket mesh(es)`);
                console.log('📊 Layering: Video(-1000) → Jacket(1)');

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

    /**
     * Get current fabric
     */
    getCurrentFabric() {
        return this.currentFabric;
    }

    /**
     * Reset materials
     */
    reset() {
        try {
            const jacketMeshes = modelLoader.getMeshes();
            jacketMeshes.forEach(mesh => {
                mesh.material = this.defaultMaterial.clone();
                mesh.renderOrder = 1;
            });

            console.log('✅ Materials reset');
        } catch (error) {
            console.error('❌ Reset failed:', error);
        }
    }

    /**
     * Cleanup
     */
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
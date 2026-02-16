class MaterialsManager {
    constructor() {
        this.currentMaterial = null;
        this.currentFabric = null;
        this.defaultMaterial = null;
    }

    init() {
        // Create default material
        this.defaultMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.7,
            metalness: 0.1,
            side: THREE.DoubleSide
        });

        console.log('✅ Materials manager initialized');
    }

    /**
     * ✅ CRITICAL FIX: Apply fabric with proper rendering settings
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
            if (!jacketMeshes || jacketMeshes.length === 0) {
                console.error('❌ No jacket meshes found');
                return false;
            }

            // Create material
            let newMaterial;

            if (fabricData.color) {
                const colorValue = typeof fabricData.color === 'string' 
                    ? fabricData.color 
                    : '#808080';

                newMaterial = new THREE.MeshStandardMaterial({
                    color: colorValue,
                    roughness: fabricData.roughness ?? 0.7,
                    metalness: fabricData.metalness ?? 0.1,
                    side: THREE.DoubleSide,
                    transparent: false,
                    opacity: 1.0
                });

                console.log('✅ Created material:', colorValue);
            } else {
                newMaterial = this.defaultMaterial.clone();
            }

            // Apply to all jacket meshes
            let appliedCount = 0;

            for (const mesh of jacketMeshes) {
                if (!mesh || !(mesh.isMesh || mesh.isSkinnedMesh)) continue;

                try {
                    const oldMaterial = mesh.material;

                    // ✅ CRITICAL: Proper rendering settings
                    mesh.material = newMaterial.clone();
                    mesh.material.depthWrite = true;
                    mesh.material.depthTest = true;
                    mesh.material.transparent = false;
                    mesh.material.side = THREE.DoubleSide;
                    mesh.material.needsUpdate = true;

                    // Render after video background (-1000) but before other objects
                    mesh.renderOrder = 100;

                    mesh.castShadow = false;
                    mesh.receiveShadow = true;
                    mesh.frustumCulled = false;
                    mesh.visible = true;  // ✅ CRITICAL: Make mesh visible

                    appliedCount++;
                    console.log(`✅ Applied to mesh: "${mesh.name}"`);

                    // Dispose old material
                    if (oldMaterial && oldMaterial !== this.defaultMaterial) {
                        try {
                            oldMaterial.dispose();
                        } catch (e) {}
                    }

                } catch (meshError) {
                    console.error(`❌ Failed on mesh "${mesh.name}":`, meshError);
                }
            }

            if (appliedCount > 0) {
                this.currentMaterial = newMaterial;
                this.currentFabric = fabricData;

                // Make model visible
                modelLoader.setVisible(true);

                console.log(`✅ Fabric applied to ${appliedCount} mesh(es)`);
                console.log('📊 Render order: Video(-1000) → Jacket(100)');

                // Force render
                try {
                    sceneManager.render();
                } catch (e) {}

                return true;
            }

            console.error('❌ No meshes were updated');
            return false;

        } catch (error) {
            console.error('❌ Error applying fabric:', error);
            console.error('Stack:', error.stack);

            // Emergency recovery
            try {
                const jacketMeshes = modelLoader.getMeshes();
                for (const mesh of jacketMeshes) {
                    mesh.material = this.defaultMaterial.clone();
                    mesh.visible = true;
                }
                console.log('🔧 Applied default material as fallback');
            } catch (e) {}

            return false;
        }
    }

    getCurrentFabric() {
        return this.currentFabric;
    }

    reset() {
        try {
            const jacketMeshes = modelLoader.getMeshes();
            for (const mesh of jacketMeshes) {
                mesh.material = this.defaultMaterial.clone();
                mesh.material.needsUpdate = true;
                mesh.renderOrder = 100;
                mesh.visible = true;
            }
            console.log('✅ Materials reset to default');
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

    /**
     * Debug: Check material state
     */
    debugPrintMaterials() {
        const jacketMeshes = modelLoader.getMeshes();
        console.log('📋 Material Status:');
        jacketMeshes.forEach(mesh => {
            const mat = mesh.material;
            console.log(`  ${mesh.name}:`);
            console.log(`    Color: ${mat.color.getHexString()}`);
            console.log(`    Visible: ${mesh.visible}`);
            console.log(`    Render Order: ${mesh.renderOrder}`);
            console.log(`    Depth Write: ${mat.depthWrite}`);
        });
    }
}

const materialsManager = new MaterialsManager();
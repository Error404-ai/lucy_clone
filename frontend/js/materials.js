class MaterialsManager {
    constructor() {
        this.currentMaterial = null;
        this.currentFabric = null;
        this.defaultMaterial = null;
    }

    init() {
        // Create default material with NO depth testing
        this.defaultMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.7,
            metalness: 0.1,
            side: THREE.DoubleSide,
            depthTest: false,  // ✅ CRITICAL
            depthWrite: false, // ✅ CRITICAL
            transparent: false,
            opacity: 1.0
        });

        console.log('✅ Materials manager initialized (NO DEPTH TEST)');
    }

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
            const colorValue = typeof fabricData.color === 'string' 
                ? fabricData.color 
                : '#808080';

            const newMaterial = new THREE.MeshStandardMaterial({
                color: colorValue,
                roughness: fabricData.roughness ?? 0.7,
                metalness: fabricData.metalness ?? 0.1,
                side: THREE.DoubleSide,
                
                // ✅ ULTIMATE FIX: Remove ALL depth testing
                depthTest: false,   // Don't check if behind other objects
                depthWrite: false,  // Don't write to depth buffer
                transparent: false,
                opacity: 1.0
            });

            console.log('✅ Created NO-DEPTH material:', colorValue);

            // Apply to all jacket meshes
            let appliedCount = 0;

            for (const mesh of jacketMeshes) {
                if (!mesh || !(mesh.isMesh || mesh.isSkinnedMesh)) continue;

                try {
                    const oldMaterial = mesh.material;

                    mesh.material = newMaterial.clone();
                    
                    // ✅ FORCE rendering on top of everything
                    mesh.renderOrder = 9999;
                    mesh.frustumCulled = false;
                    mesh.visible = true;
                    mesh.castShadow = false;
                    mesh.receiveShadow = false;
                    
                    // Double-check material settings
                    mesh.material.depthTest = false;
                    mesh.material.depthWrite = false;
                    mesh.material.side = THREE.DoubleSide;
                    mesh.material.needsUpdate = true;

                    appliedCount++;
                    console.log(`✅ Applied NO-DEPTH material to: "${mesh.name}"`);

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
                console.log('📊 Render order: Video(-1000) → Jacket(9999 NO DEPTH)');

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
                mesh.renderOrder = 9999;
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
}

const materialsManager = new MaterialsManager();
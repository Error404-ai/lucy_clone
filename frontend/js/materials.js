// Materials Manager - CRITICAL FIX - Only target jacket meshes

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
        // Create default material that always works
        this.defaultMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.8,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        console.log('✅ Default material created');
    }

    /**
     * Apply fabric - CRITICAL FIX: Only apply to JACKET meshes
     */
    async applyFabric(fabricData) {
        try {
            console.log('🎨 Applying fabric:', fabricData.name);
            
            const model = modelLoader.getModel();
            if (!model) {
                console.error('❌ Model not loaded');
                return false;
            }

            // ✅ CRITICAL: Get ONLY jacket meshes (from loader)
            const jacketMeshes = modelLoader.getMeshes();
            
            if (jacketMeshes.length === 0) {
                console.error('❌ No jacket meshes found');
                return false;
            }

            console.log(`🎯 Targeting ${jacketMeshes.length} jacket mesh(es):`);
            jacketMeshes.forEach((mesh, i) => {
                console.log(`   ${i + 1}. "${mesh.name}" (${mesh.type})`);
            });

            // Create new material
            let newMaterial;
            
            try {
                if (fabricData.color) {
                    // Parse color safely
                    let colorValue;
                    if (typeof fabricData.color === 'string') {
                        colorValue = fabricData.color;
                    } else {
                        colorValue = '#808080'; // Fallback
                    }
                    
                    // ✅ CRITICAL: Use MeshStandardMaterial for proper lighting
                    newMaterial = new THREE.MeshStandardMaterial({
                        color: colorValue,
                        roughness: fabricData.roughness || 0.8,
                        metalness: fabricData.metalness || 0.0,
                        side: THREE.DoubleSide,
                        flatShading: false,
                        transparent: false,
                        opacity: 1.0
                    });
                    
                    console.log('✅ Created color material:', colorValue);
                    
                } else {
                    // Use default material if no color
                    newMaterial = this.defaultMaterial.clone();
                    console.log('✅ Using default material');
                }
                
            } catch (matError) {
                console.error('❌ Material creation failed:', matError);
                newMaterial = this.defaultMaterial.clone();
            }

            // ✅ CRITICAL: Apply ONLY to jacket meshes (not video plane!)
            let appliedCount = 0;
            
            for (const mesh of jacketMeshes) {
                try {
                    // ✅ Skip if this is the video plane (safety check)
                    if (mesh.name === 'VideoBackground' || mesh.renderOrder === -1000) {
                        console.log(`⚠️ Skipping video plane: ${mesh.name}`);
                        continue;
                    }
                    
                    const oldMaterial = mesh.material;
                    
                    // Apply new material
                    mesh.material = newMaterial.clone();
                    mesh.material.needsUpdate = true;
                    
                    // ✅ Set proper render order (jacket renders AFTER video)
                    mesh.renderOrder = 0;
                    
                    appliedCount++;
                    console.log(`✅ Applied to: "${mesh.name}" (renderOrder: ${mesh.renderOrder})`);
                    
                    // Dispose old material (but not default)
                    if (oldMaterial && oldMaterial !== this.defaultMaterial) {
                        try {
                            oldMaterial.dispose();
                        } catch (disposeError) {
                            console.warn('⚠️ Could not dispose old material:', disposeError);
                        }
                    }
                    
                } catch (meshError) {
                    console.error(`❌ Failed to apply to mesh ${mesh.name}:`, meshError);
                }
            }

            if (appliedCount > 0) {
                this.currentMaterial = newMaterial;
                this.currentFabric = fabricData;
                
                // Ensure jacket is visible
                modelLoader.setVisible(true);
                
                console.log(`✅ Fabric "${fabricData.name}" applied to ${appliedCount} mesh(es)`);
                console.log('📊 Scene composition:');
                console.log('   - Video plane at z=-10 (renderOrder: -1000)');
                console.log(`   - Jacket meshes at z=0 (renderOrder: 0)`);
                
                // Force a render
                try {
                    sceneManager.render();
                } catch (renderError) {
                    console.error('⚠️ Render error:', renderError);
                }
                
                return true;
            } else {
                console.error('❌ No meshes were updated');
                return false;
            }

        } catch (error) {
            console.error('❌ CRITICAL ERROR in applyFabric:', error);
            console.error('Stack:', error.stack);
            
            // Emergency recovery
            try {
                const jacketMeshes = modelLoader.getMeshes();
                jacketMeshes.forEach(mesh => {
                    mesh.material = this.defaultMaterial.clone();
                });
                console.log('🔧 Emergency recovery applied');
            } catch (recoveryError) {
                console.error('❌ Recovery failed:', recoveryError);
            }
            
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
     * Reset to default material
     */
    reset() {
        try {
            const jacketMeshes = modelLoader.getMeshes();
            jacketMeshes.forEach(mesh => {
                mesh.material = this.defaultMaterial.clone();
            });
            console.log('✅ Materials reset to default');
        } catch (error) {
            console.error('❌ Reset failed:', error);
        }
    }

    /**
     * Dispose all materials
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
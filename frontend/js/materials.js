// materials.js — VISIBILITY FIX
// Key changes:
//   1. onFabricApplied() is ALWAYS called after applyFabric(), even on failure,
//      so _fabricReady is always set and the jacket stays visible.
//   2. reset() no longer sets renderOrder 9999 (was fighting with loader's value of 1).

class MaterialsManager {
    constructor() {
        this.currentMaterial = null;
        this.currentFabric   = null;
        this.defaultMaterial = null;
    }

    init() {
        this.defaultMaterial = new THREE.MeshStandardMaterial({
            color:      0x1a1a1a,
            roughness:  0.7,
            metalness:  0.1,
            side:       THREE.DoubleSide,
            depthTest:  true,
            depthWrite: true,
            transparent: false,
            opacity:    1.0
        });
        console.log('✅ Materials manager initialized');
    }

    async applyFabric(fabricData) {
        let appliedCount = 0;

        try {
            console.log('🎨 Applying fabric:', fabricData.name);

            const model        = modelLoader.getModel();
            const jacketMeshes = modelLoader.getMeshes();

            if (!model) {
                console.error('❌ Model not loaded yet');
                // Still call onFabricApplied so the jacket stays visible
                this._notifyFabricApplied();
                return false;
            }
            if (!jacketMeshes || jacketMeshes.length === 0) {
                console.error('❌ No jacket meshes found');
                this._notifyFabricApplied();
                return false;
            }

            const colorValue = typeof fabricData.color === 'string'
                ? fabricData.color
                : '#808080';

            const newMaterial = new THREE.MeshStandardMaterial({
                color:       colorValue,
                roughness:   fabricData.roughness  ?? 0.7,
                metalness:   fabricData.metalness  ?? 0.1,
                side:        THREE.DoubleSide,
                depthTest:   true,
                depthWrite:  true,
                transparent: false,
                opacity:     1.0
            });

            for (const mesh of jacketMeshes) {
                if (!mesh || !(mesh.isMesh || mesh.isSkinnedMesh)) continue;

                try {
                    const oldMaterial = mesh.material;
                    mesh.material = newMaterial.clone();

                    mesh.renderOrder    = 1;
                    mesh.frustumCulled  = false;
                    mesh.visible        = true;
                    mesh.castShadow     = false;
                    mesh.receiveShadow  = false;

                    mesh.material.needsUpdate = true;

                    appliedCount++;

                    if (oldMaterial && oldMaterial !== this.defaultMaterial) {
                        try { oldMaterial.dispose(); } catch (e) {}
                    }
                } catch (meshError) {
                    console.error(`❌ Failed on mesh "${mesh.name}":`, meshError);
                }
            }

            if (appliedCount > 0) {
                this.currentMaterial = newMaterial;
                this.currentFabric   = fabricData;

                // Ensure the jacket group is visible
                modelLoader.setVisible(true);

                // Force a render immediately
                try { sceneManager.render(); } catch (e) {}

                console.log(`✅ Fabric "${fabricData.name}" applied to ${appliedCount} mesh(es)`);
            } else {
                console.error('❌ No meshes were updated');
            }

        } catch (error) {
            console.error('❌ Error applying fabric:', error);
        }

        // ── VISIBILITY FIX ────────────────────────────────────────────────────
        // Always notify skeleton-mapper regardless of success/failure.
        // This ensures _fabricReady=true and the jacket stays visible.
        this._notifyFabricApplied();

        return appliedCount > 0;
    }

    /**
     * Notify skeleton-mapper that a fabric has been applied (or attempted).
     * Called unconditionally so the jacket is never left invisible due to a
     * silent material-apply failure.
     */
    _notifyFabricApplied() {
        if (typeof skeletonMapper !== 'undefined' && skeletonMapper.onFabricApplied) {
            skeletonMapper.onFabricApplied();
        }
    }

    getCurrentFabric() { return this.currentFabric; }

    reset() {
        try {
            const jacketMeshes = modelLoader.getMeshes();
            for (const mesh of jacketMeshes) {
                mesh.material = this.defaultMaterial.clone();
                mesh.material.needsUpdate = true;
                mesh.renderOrder = 1;   // was 9999 — keep consistent with loader
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
// materials.js — MOBILE + DESKTOP SAFE
// Key change: calls skeletonMapper.onFabricApplied() after material is set,
// which tells the mapper it's safe to show the jacket now.

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
            depthTest:  false,
            depthWrite: false,
            transparent: false,
            opacity:    1.0
        });
        console.log('✅ Materials manager initialized');
    }

    async applyFabric(fabricData) {
        try {
            console.log('🎨 Applying fabric:', fabricData.name);

            const model       = modelLoader.getModel();
            const jacketMeshes = modelLoader.getMeshes();

            if (!model) {
                console.error('❌ Model not loaded yet');
                return false;
            }
            if (!jacketMeshes || jacketMeshes.length === 0) {
                console.error('❌ No jacket meshes found');
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
                depthTest:   false,
                depthWrite:  false,
                transparent: false,
                opacity:     1.0
            });

            let appliedCount = 0;

            for (const mesh of jacketMeshes) {
                if (!mesh || !(mesh.isMesh || mesh.isSkinnedMesh)) continue;

                try {
                    const oldMaterial = mesh.material;
                    mesh.material = newMaterial.clone();

                    // Force render on top of everything including the video plane
                    mesh.renderOrder     = 9999;
                    mesh.frustumCulled   = false;
                    mesh.visible         = true;
                    mesh.castShadow      = false;
                    mesh.receiveShadow   = false;

                    mesh.material.depthTest  = false;
                    mesh.material.depthWrite = false;
                    mesh.material.side       = THREE.DoubleSide;
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

                // Make jacket group visible
                modelLoader.setVisible(true);

                // ── CRITICAL: tell skeleton mapper it can now show the jacket ──
                // Without this, the jacket stays invisible until pose is detected,
                // which on mobile can take a long time or never happen if the
                // person is too close to the camera.
                if (typeof skeletonMapper !== 'undefined' && skeletonMapper.onFabricApplied) {
                    skeletonMapper.onFabricApplied();
                }

                console.log(`✅ Fabric "${fabricData.name}" applied to ${appliedCount} mesh(es)`);

                // Force a render to make it immediately visible
                try { sceneManager.render(); } catch (e) {}

                return true;
            }

            console.error('❌ No meshes were updated');
            return false;

        } catch (error) {
            console.error('❌ Error applying fabric:', error);
            return false;
        }
    }

    getCurrentFabric() { return this.currentFabric; }

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
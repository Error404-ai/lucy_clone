// Materials Manager - FIXED to apply to jacket meshes only

class MaterialsManager {
    constructor() {
        this.currentMaterial = null;
        this.currentFabric = null;
    }

    async applyFabric(fabricData) {
        try {
            console.log('🎨 Applying fabric:', fabricData.name);
            
            const model = modelLoader.getModel();
            if (!model) throw new Error('Model not found');

            // Get all jacket meshes (not body)
            const jacketMeshes = modelLoader.getMeshes();
            
            if (jacketMeshes.length === 0) {
                throw new Error('No jacket meshes found');
            }

            // Create material
            const material = fabricData.color 
                ? this.createColorMaterial(fabricData)
                : await this.createTextureMaterial(fabricData);

            // Apply to ALL jacket meshes
            let applied = 0;
            jacketMeshes.forEach(mesh => {
                const oldMaterial = mesh.material;
                mesh.material = material;
                mesh.material.needsUpdate = true;
                applied++;
                console.log('✓ Applied to:', mesh.name);
                
                // Dispose old material
                if (oldMaterial && oldMaterial !== material) {
                    this.disposeMaterial(oldMaterial);
                }
            });

            this.currentMaterial = material;
            this.currentFabric = fabricData;

            // Show jacket
            modelLoader.setVisible(true);

            console.log(`✅ Fabric applied to ${applied} mesh(es)`);
            return true;

        } catch (error) {
            console.error('❌ Error applying fabric:', error);
            Utils.showError('Could not apply fabric');
            return false;
        }
    }

    createColorMaterial(fabricData) {
        return new THREE.MeshStandardMaterial({
            color: new THREE.Color(fabricData.color),
            roughness: fabricData.roughness || 0.8,
            metalness: fabricData.metalness || 0.0,
            side: THREE.DoubleSide,
            flatShading: false,
            wireframe: false,
            transparent: false
        });
    }

    async createTextureMaterial(fabricData) {
        const [diffuseMap, normalMap, roughnessMap] = await Promise.all([
            fabricData.diffuseUrl ? this.loadTexture(fabricData.diffuseUrl) : null,
            fabricData.normalUrl ? this.loadTexture(fabricData.normalUrl) : null,
            fabricData.roughnessUrl ? this.loadTexture(fabricData.roughnessUrl) : null
        ]);

        [diffuseMap, normalMap, roughnessMap].forEach(tex => {
            if (tex) {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(2, 2);
            }
        });

        return new THREE.MeshStandardMaterial({
            map: diffuseMap,
            normalMap: normalMap,
            roughnessMap: roughnessMap,
            roughness: fabricData.roughness || 0.8,
            metalness: fabricData.metalness || 0.0,
            side: THREE.DoubleSide
        });
    }

    async loadTexture(url) {
        return new Promise((resolve, reject) => {
            new THREE.TextureLoader().load(
                url,
                (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.flipY = false;
                    resolve(texture);
                },
                undefined,
                reject
            );
        });
    }

    disposeMaterial(material) {
        if (material.map) material.map.dispose();
        if (material.normalMap) material.normalMap.dispose();
        if (material.roughnessMap) material.roughnessMap.dispose();
        material.dispose();
    }
}

const materialsManager = new MaterialsManager();
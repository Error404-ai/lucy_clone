// Materials Manager - FIXED for proper fabric color application

class MaterialsManager {
    constructor() {
        this.currentMaterial = null;
        this.currentFabric = null;
    }

    /**
     * ✅ FIXED: Apply fabric to jacket meshes with proper color/texture handling
     */
    async applyFabric(fabricData) {
        try {
            console.log('🎨 Applying fabric:', fabricData.name);
            
            const model = modelLoader.getModel();
            if (!model) {
                throw new Error('Model not loaded');
            }

            const jacketMeshes = modelLoader.getMeshes();
            
            if (jacketMeshes.length === 0) {
                throw new Error('No jacket meshes found');
            }

            // ✅ Create material based on fabric data
            let material;
            
            if (fabricData.color) {
                // ✅ Use solid color
                material = this.createColorMaterial(fabricData);
                console.log('✓ Created color material:', fabricData.color);
            } else if (fabricData.diffuseUrl || fabricData.texture) {
                // ✅ Use texture
                material = await this.createTextureMaterial(fabricData);
                console.log('✓ Created texture material');
            } else {
                // Fallback to default color
                material = this.createColorMaterial({
                    ...fabricData,
                    color: '#808080'
                });
                console.log('✓ Created fallback material');
            }

            // ✅ Apply to ALL jacket meshes
            let applied = 0;
            jacketMeshes.forEach(mesh => {
                const oldMaterial = mesh.material;
                
                // Clone material for each mesh to avoid conflicts
                mesh.material = material.clone();
                mesh.material.needsUpdate = true;
                
                applied++;
                console.log(`✓ Applied to: ${mesh.name}`);
                
                // Dispose old material
                if (oldMaterial && oldMaterial !== material) {
                    this.disposeMaterial(oldMaterial);
                }
            });

            this.currentMaterial = material;
            this.currentFabric = fabricData;

            // ✅ Show jacket immediately
            modelLoader.setVisible(true);

            console.log(`✅ Fabric "${fabricData.name}" applied to ${applied} mesh(es)`);
            return true;

        } catch (error) {
            console.error('❌ Error applying fabric:', error);
            Utils.showError(`Could not apply fabric: ${error.message}`);
            return false;
        }
    }

    /**
     * ✅ Create material from solid color
     */
    createColorMaterial(fabricData) {
        return new THREE.MeshStandardMaterial({
            color: new THREE.Color(fabricData.color),
            roughness: fabricData.roughness || 0.8,
            metalness: fabricData.metalness || 0.0,
            side: THREE.DoubleSide,
            flatShading: false,
            wireframe: false,
            transparent: false,
            // ✅ Better lighting response
            emissive: new THREE.Color(fabricData.color).multiplyScalar(0.1),
            emissiveIntensity: 0.2
        });
    }

    /**
     * ✅ Create material from texture
     */
    async createTextureMaterial(fabricData) {
        try {
            // Load textures
            const textures = await Promise.all([
                fabricData.diffuseUrl ? this.loadTexture(fabricData.diffuseUrl) : null,
                fabricData.normalUrl ? this.loadTexture(fabricData.normalUrl) : null,
                fabricData.roughnessUrl ? this.loadTexture(fabricData.roughnessUrl) : null
            ]);

            const [diffuseMap, normalMap, roughnessMap] = textures;

            // Configure textures
            [diffuseMap, normalMap, roughnessMap].forEach(tex => {
                if (tex) {
                    tex.wrapS = THREE.RepeatWrapping;
                    tex.wrapT = THREE.RepeatWrapping;
                    tex.repeat.set(
                        CONFIG.FABRIC.DEFAULT_REPEAT.u,
                        CONFIG.FABRIC.DEFAULT_REPEAT.v
                    );
                }
            });

            return new THREE.MeshStandardMaterial({
                map: diffuseMap,
                normalMap: normalMap,
                roughnessMap: roughnessMap,
                roughness: fabricData.roughness || 0.8,
                metalness: fabricData.metalness || 0.0,
                side: THREE.DoubleSide,
                flatShading: false,
                transparent: false
            });

        } catch (error) {
            console.error('Error loading textures:', error);
            // Fallback to color
            return this.createColorMaterial({
                ...fabricData,
                color: fabricData.color || '#808080'
            });
        }
    }

    /**
     * Load texture
     */
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
                (error) => {
                    console.warn('Texture load failed:', url);
                    resolve(null); // Don't reject, just return null
                }
            );
        });
    }

    /**
     * Dispose material
     */
    disposeMaterial(material) {
        if (!material) return;
        
        if (material.map) material.map.dispose();
        if (material.normalMap) material.normalMap.dispose();
        if (material.roughnessMap) material.roughnessMap.dispose();
        material.dispose();
    }

    /**
     * Get current fabric
     */
    getCurrentFabric() {
        return this.currentFabric;
    }

    /**
     * Update current material properties
     */
    updateMaterialProperties(properties) {
        if (!this.currentMaterial) return;

        Object.assign(this.currentMaterial, properties);
        this.currentMaterial.needsUpdate = true;
    }
}

const materialsManager = new MaterialsManager();
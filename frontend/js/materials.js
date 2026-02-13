// Enhanced Materials Manager - Adaptive Garment Deformation
// Handles PBR materials + dynamic fit adjustments

class GarmentDeformer {
    /**
     * Deforms garment geometry to match body measurements
     */
    constructor(mesh) {
        this.mesh = mesh;
        this.originalGeometry = mesh.geometry.clone();
        this.referenceMeasurements = {
            shoulderWidth: 0.25,
            torsoLength: 0.5,
            chestCircumference: 0.35
        };
    }

    /**
     * Apply non-uniform deformation based on body measurements
     */
    deformToBody(measurements) {
        if (!measurements || !this.mesh) return;

        // Calculate scale factors per body region
        const scaleFactors = {
            shoulders: measurements.shoulderWidth / this.referenceMeasurements.shoulderWidth,
            chest: measurements.chestWidth / this.referenceMeasurements.chestCircumference,
            torso: measurements.torsoLength / this.referenceMeasurements.torsoLength,
            hips: measurements.hipWidth / this.referenceMeasurements.chestCircumference
        };

        const positions = this.mesh.geometry.attributes.position;
        const originalPos = this.originalGeometry.attributes.position;

        // Per-vertex deformation
        for (let i = 0; i < positions.count; i++) {
            const x = originalPos.getX(i);
            const y = originalPos.getY(i);
            const z = originalPos.getZ(i);

            // Classify vertex into body region
            const region = this.classifyVertex(y);
            const scale = this.getRegionalScale(region, scaleFactors);

            // Apply regional scaling
            positions.setXYZ(
                i,
                x * scale.x,
                y * scale.y,
                z * scale.z
            );
        }

        positions.needsUpdate = true;
        this.mesh.geometry.computeVertexNormals();
        this.mesh.geometry.computeBoundingSphere();
    }

    /**
     * Classify vertex into body region based on Y coordinate
     */
    classifyVertex(y) {
        // Normalized Y coordinates for body regions
        if (y > 0.6) return 'shoulders';
        if (y > 0.3) return 'chest';
        if (y > -0.1) return 'waist';
        return 'hips';
    }

    /**
     * Get scale factors for specific region
     */
    getRegionalScale(region, factors) {
        const base = { x: 1, y: 1, z: 1 };

        switch (region) {
            case 'shoulders':
                return {
                    x: factors.shoulders * 1.05,
                    y: 1.0,
                    z: factors.shoulders
                };
            case 'chest':
                return {
                    x: factors.chest,
                    y: 1.0,
                    z: factors.chest * 1.1
                };
            case 'waist':
                return {
                    x: factors.chest * 0.95,
                    y: factors.torso,
                    z: factors.chest * 0.95
                };
            case 'hips':
                return {
                    x: factors.hips,
                    y: factors.torso,
                    z: factors.hips
                };
            default:
                return base;
        }
    }

    /**
     * Reset to original geometry
     */
    reset() {
        this.mesh.geometry.copy(this.originalGeometry);
        this.mesh.geometry.attributes.position.needsUpdate = true;
    }
}

class WrinkleSimulator {
    /**
     * Simulates dynamic wrinkles based on pose
     */
    constructor(material) {
        this.material = material;
        this.baseNormalMap = null;
        this.wrinkleIntensity = 0;
    }

    /**
     * Update wrinkle intensity based on arm bending
     */
    updateWrinkles(pose) {
        if (!pose) return;

        const L = CONFIG.SKELETON.LANDMARKS;
        const landmarks = pose.landmarks;

        // Calculate elbow angles
        const leftElbowAngle = this.calculateElbowAngle(
            landmarks[L.LEFT_SHOULDER],
            landmarks[L.LEFT_ELBOW],
            landmarks[L.LEFT_WRIST]
        );

        const rightElbowAngle = this.calculateElbowAngle(
            landmarks[L.RIGHT_SHOULDER],
            landmarks[L.RIGHT_ELBOW],
            landmarks[L.RIGHT_WRIST]
        );

        // Average angle determines wrinkle intensity
        const avgAngle = (leftElbowAngle + rightElbowAngle) / 2;
        
        // More bent = more wrinkles (non-linear)
        this.wrinkleIntensity = Math.pow(avgAngle / Math.PI, 1.5);

        // Update material roughness for wrinkled areas
        this.applyWrinkleEffect(this.wrinkleIntensity);
    }

    /**
     * Calculate angle at elbow joint
     */
    calculateElbowAngle(shoulder, elbow, wrist) {
        if (!shoulder || !elbow || !wrist) return 0;

        // Vectors: shoulder -> elbow, elbow -> wrist
        const v1 = {
            x: elbow.x - shoulder.x,
            y: elbow.y - shoulder.y,
            z: (elbow.z || 0) - (shoulder.z || 0)
        };

        const v2 = {
            x: wrist.x - elbow.x,
            y: wrist.y - elbow.y,
            z: (wrist.z || 0) - (elbow.z || 0)
        };

        // Dot product and magnitudes
        const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

        if (mag1 === 0 || mag2 === 0) return 0;

        // Angle in radians
        const cosAngle = dot / (mag1 * mag2);
        return Math.acos(Utils.clamp(cosAngle, -1, 1));
    }

    /**
     * Apply wrinkle effect to material
     */
    applyWrinkleEffect(intensity) {
        if (!this.material) return;

        // Increase roughness slightly in bent areas
        const baseRoughness = this.material.userData.baseRoughness || 0.8;
        this.material.roughness = baseRoughness + (intensity * 0.1);

        // Could also modulate normal map intensity here
        if (this.material.normalScale) {
            const baseNormalScale = 1.0;
            this.material.normalScale.set(
                baseNormalScale + intensity * 0.2,
                baseNormalScale + intensity * 0.2
            );
        }

        this.material.needsUpdate = true;
    }
}

class EnhancedMaterialsManager {
    constructor() {
        this.currentMaterial = null;
        this.currentFabric = null;
        this.textures = {
            diffuse: null,
            normal: null,
            roughness: null,
            metalness: null
        };
        
        // Deformation and wrinkles
        this.deformer = null;
        this.wrinkleSimulator = null;
        
        // Material variants for LOD
        this.materialLODs = {
            high: null,
            medium: null,
            low: null
        };
    }

    /**
     * Apply fabric with enhanced rendering
     */
    async applyFabric(fabricData) {
        try {
            console.log('🎨 Applying fabric with enhancements:', fabricData.name);
            
            const model = modelLoader.getModel();
            if (!model) {
                throw new Error('Jacket model not found');
            }

            // Find mesh (skip bones)
            let mesh = null;
            model.traverse((child) => {
                if (child.type === 'Bone') return;
                if ((child.isSkinnedMesh || child.isMesh) && !mesh) {
                    mesh = child;
                }
            });

            if (!mesh) {
                throw new Error('Jacket mesh not found');
            }

            console.log('📍 Applying material to:', mesh.name || 'unnamed mesh');

            // Initialize deformer if needed
            if (!this.deformer) {
                this.deformer = new GarmentDeformer(mesh);
            }

            // Create material based on fabric type
            let material;
            if (fabricData.color) {
                material = await this.createColorMaterial(fabricData);
            } else {
                material = await this.createTextureMaterial(fabricData);
            }

            // Apply material
            const oldMaterial = mesh.material;
            mesh.material = material;
            mesh.material.needsUpdate = true;
            
            this.currentMaterial = material;
            this.currentFabric = fabricData;

            // Initialize wrinkle simulator
            this.wrinkleSimulator = new WrinkleSimulator(material);

            // Dispose old material
            if (oldMaterial && oldMaterial !== material) {
                this.disposeMaterial(oldMaterial);
            }

            // Create LOD variants
            await this.createLODVariants(material);

            // Show jacket
            modelLoader.setVisible(true);
            skeletonMapper.forceShowJacket();

            console.log('✅ Enhanced fabric applied:', fabricData.name);
            return true;

        } catch (error) {
            console.error('❌ Error applying fabric:', error);
            Utils.showError('Could not apply fabric');
            return false;
        }
    }

    /**
     * Create color-based material with enhanced properties
     */
    createColorMaterial(fabricData) {
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(fabricData.color),
            roughness: fabricData.roughness || 0.8,
            metalness: fabricData.metalness || 0.0,
            
            // Enhanced rendering
            side: THREE.DoubleSide,
            flatShading: false,
            wireframe: false,
            transparent: false,
            opacity: 1.0,
            
            // Environmental effects
            envMapIntensity: 1.2,
            
            // Lighting response
            emissive: new THREE.Color(fabricData.color).multiplyScalar(0.05),
            emissiveIntensity: 0.1
        });

        // Store base roughness for wrinkle simulation
        material.userData.baseRoughness = fabricData.roughness || 0.8;

        return material;
    }

    /**
     * Create texture-based PBR material
     */
    async createTextureMaterial(fabricData) {
        console.log('📥 Loading textures for', fabricData.name);

        // Load all texture maps
        const [diffuseMap, normalMap, roughnessMap, metalnessMap] = await Promise.all([
            fabricData.diffuseUrl ? this.loadTexture(fabricData.diffuseUrl) : null,
            fabricData.normalUrl ? this.loadTexture(fabricData.normalUrl) : null,
            fabricData.roughnessUrl ? this.loadTexture(fabricData.roughnessUrl) : null,
            fabricData.metalnessUrl ? this.loadTexture(fabricData.metalnessUrl) : null
        ]);

        // Configure texture tiling and filtering
        [diffuseMap, normalMap, roughnessMap, metalnessMap].forEach(texture => {
            if (texture) {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(
                    CONFIG.FABRIC.DEFAULT_REPEAT.u,
                    CONFIG.FABRIC.DEFAULT_REPEAT.v
                );
                texture.anisotropy = 16; // Better quality at angles
            }
        });

        const material = new THREE.MeshStandardMaterial({
            map: diffuseMap,
            normalMap: normalMap,
            normalScale: new THREE.Vector2(1.0, 1.0),
            roughnessMap: roughnessMap,
            metalnessMap: metalnessMap,
            roughness: fabricData.roughness || 0.8,
            metalness: fabricData.metalness || 0.0,
            
            // Enhanced rendering
            envMapIntensity: 1.2,
            side: THREE.DoubleSide,
            wireframe: false,
            flatShading: false,
            
            // Ambient occlusion (if available)
            aoMapIntensity: 1.0
        });

        // Store textures for later use
        this.textures.diffuse = diffuseMap;
        this.textures.normal = normalMap;
        this.textures.roughness = roughnessMap;
        this.textures.metalness = metalnessMap;

        material.userData.baseRoughness = fabricData.roughness || 0.8;

        return material;
    }

    /**
     * Create LOD material variants for performance
     */
    async createLODVariants(baseMaterial) {
        // High quality (original)
        this.materialLODs.high = baseMaterial;

        // Medium quality (reduced texture res)
        const mediumMat = baseMaterial.clone();
        if (mediumMat.map) {
            mediumMat.map.minFilter = THREE.LinearFilter;
        }
        this.materialLODs.medium = mediumMat;

        // Low quality (no normal map, lower anisotropy)
        const lowMat = baseMaterial.clone();
        lowMat.normalMap = null;
        if (lowMat.map) {
            lowMat.map.anisotropy = 4;
            lowMat.map.minFilter = THREE.LinearFilter;
        }
        this.materialLODs.low = lowMat;

        console.log('✅ LOD variants created');
    }

    /**
     * Switch material LOD based on performance
     */
    switchLOD(level) {
        const material = this.materialLODs[level];
        if (!material) return;

        const mesh = this.getMesh();
        if (mesh) {
            mesh.material = material;
            console.log(`Switched to ${level} quality material`);
        }
    }

    /**
     * Update deformation based on body measurements
     */
    updateDeformation(measurements) {
        if (this.deformer && measurements) {
            this.deformer.deformToBody(measurements);
            console.log('Garment deformation updated');
        }
    }

    /**
     * Update wrinkles based on pose
     */
    updateWrinkles(pose) {
        if (this.wrinkleSimulator && pose) {
            this.wrinkleSimulator.updateWrinkles(pose);
        }
    }

    /**
     * Load texture with proper configuration
     */
    async loadTexture(url) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.TextureLoader();
            loader.load(
                url,
                (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.flipY = false;
                    texture.anisotropy = 16;
                    texture.generateMipmaps = true;
                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    resolve(texture);
                },
                undefined,
                (error) => {
                    console.error('Texture load error:', error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Update texture tiling
     */
    updateTextureRepeat(u, v) {
        Object.values(this.textures).forEach(texture => {
            if (texture) {
                texture.repeat.set(u, v);
                texture.needsUpdate = true;
            }
        });
    }

    /**
     * Update material properties dynamically
     */
    updateMaterialProperties(properties) {
        if (!this.currentMaterial) return;

        if (properties.roughness !== undefined) {
            this.currentMaterial.roughness = properties.roughness;
            this.currentMaterial.userData.baseRoughness = properties.roughness;
        }
        if (properties.metalness !== undefined) {
            this.currentMaterial.metalness = properties.metalness;
        }
        if (properties.envMapIntensity !== undefined) {
            this.currentMaterial.envMapIntensity = properties.envMapIntensity;
        }
        if (properties.normalScale !== undefined) {
            if (this.currentMaterial.normalScale) {
                this.currentMaterial.normalScale.set(
                    properties.normalScale,
                    properties.normalScale
                );
            }
        }

        this.currentMaterial.needsUpdate = true;
    }

    /**
     * Get current fabric
     */
    getCurrentFabric() {
        return this.currentFabric;
    }

    /**
     * Get current material
     */
    getCurrentMaterial() {
        return this.currentMaterial;
    }

    /**
     * Get mesh reference
     */
    getMesh() {
        const model = modelLoader.getModel();
        if (!model) return null;

        let mesh = null;
        model.traverse((child) => {
            if ((child.isSkinnedMesh || child.isMesh) && !mesh) {
                mesh = child;
            }
        });
        return mesh;
    }

    /**
     * Remove current fabric
     */
    removeFabric() {
        if (this.currentMaterial) {
            this.disposeMaterial(this.currentMaterial);
            this.currentMaterial = null;
        }

        // Dispose LOD variants
        Object.values(this.materialLODs).forEach(mat => {
            if (mat) this.disposeMaterial(mat);
        });
        this.materialLODs = { high: null, medium: null, low: null };

        this.currentFabric = null;

        Object.keys(this.textures).forEach(key => {
            if (this.textures[key]) {
                this.textures[key].dispose();
                this.textures[key] = null;
            }
        });

        modelLoader.setVisible(false);
        skeletonMapper.hideJacket();
        
        console.log('Fabric removed');
    }

    /**
     * Dispose material and textures
     */
    disposeMaterial(material) {
        if (material.map) material.map.dispose();
        if (material.normalMap) material.normalMap.dispose();
        if (material.roughnessMap) material.roughnessMap.dispose();
        if (material.metalnessMap) material.metalnessMap.dispose();
        if (material.aoMap) material.aoMap.dispose();
        if (material.emissiveMap) material.emissiveMap.dispose();
        material.dispose();
    }

    /**
     * Clone current material
     */
    cloneMaterial() {
        if (!this.currentMaterial) return null;
        return this.currentMaterial.clone();
    }
}

// Create enhanced global instance (replaces old materialsManager)
const materialsManager = new EnhancedMaterialsManager();
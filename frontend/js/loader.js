// 3D Model loader - CORRECTED with verbose logging and simplified detection

class ModelLoader {
    constructor() {
        this.loader = new THREE.GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();
        this.jacketModel = null;
        this.jacketMeshes = [];
        this.jacketSkeleton = null;
        this.isLoaded = false;
        
        this.setupMeshoptDecoder();
    }

    setupMeshoptDecoder() {
        if (typeof MeshoptDecoder !== 'undefined') {
            this.loader.setMeshoptDecoder(MeshoptDecoder);
            console.log('✓ Meshopt decoder initialized');
        }
    }

    async loadJacket(modelPath = CONFIG.JACKET.MODEL_PATH) {
        return new Promise((resolve, reject) => {
            console.log('📦 Loading jacket model:', modelPath);
            Utils.updateLoadingText('Loading 3D jacket model...');

            this.loader.load(
                modelPath,
                (gltf) => {
                    try {
                        this.jacketModel = gltf.scene;
                        
                        console.log('=== MODEL ANALYSIS ===');
                        this.analyzeModel(this.jacketModel);
                        
                        // Find ALL meshes as jacket meshes
                        this.findJacketMeshes(this.jacketModel);
                        
                        if (this.jacketMeshes.length === 0) {
                            throw new Error('❌ No meshes found in model');
                        }

                        console.log(`✅ Found ${this.jacketMeshes.length} jacket mesh(es)`);

                        // Optimize
                        this.optimizeAllMeshes();

                        // Find skeleton
                        this.jacketSkeleton = this.findSkeleton(this.jacketModel);
                        if (this.jacketSkeleton) {
                            console.log(`✓ Skeleton: ${this.jacketSkeleton.bones.length} bones`);
                        } else {
                            console.log('⚠ No skeleton found (model may not be rigged)');
                        }

                        // Apply transforms
                        this.jacketModel.scale.set(
                            CONFIG.JACKET.SCALE,
                            CONFIG.JACKET.SCALE,
                            CONFIG.JACKET.SCALE
                        );
                        this.jacketModel.position.set(
                            CONFIG.JACKET.POSITION.x,
                            CONFIG.JACKET.POSITION.y,
                            CONFIG.JACKET.POSITION.z
                        );
                        this.jacketModel.rotation.set(
                            CONFIG.JACKET.ROTATION.x,
                            CONFIG.JACKET.ROTATION.y,
                            CONFIG.JACKET.ROTATION.z
                        );

                        // ✅ Start HIDDEN (will be shown when fabric is selected)
                        this.jacketModel.visible = true;
                        console.log('📍 Jacket initially hidden (will show when fabric selected)');

                        // Add to scene
                        sceneManager.add(this.jacketModel);
                        
                        this.isLoaded = true;
                        console.log('✅ Jacket loaded successfully');
                        console.log('===================');
                        
                        resolve(this.jacketModel);

                    } catch (error) {
                        console.error('❌ Error processing model:', error);
                        reject(error);
                    }
                },
                (progress) => {
                    const percent = (progress.loaded / progress.total * 100).toFixed(0);
                    Utils.updateLoadingText(`Loading jacket... ${percent}%`);
                },
                (error) => {
                    console.error('❌ Error loading jacket:', error);
                    reject(new Error(`Failed to load jacket: ${error.message}`));
                }
            );
        });
    }

    analyzeModel(object) {
        const meshes = [];
        const bones = [];
        
        object.traverse((child) => {
            if (child.isMesh || child.isSkinnedMesh) {
                meshes.push({
                    name: child.name,
                    type: child.type,
                    verts: child.geometry?.attributes?.position?.count || 0,
                    visible: child.visible
                });
            }
            if (child.type === 'Bone') {
                bones.push(child.name);
            }
        });
        
        console.log(`📊 Total meshes: ${meshes.length}`);
        meshes.forEach((m, i) => {
            console.log(`  ${i + 1}. "${m.name}" (${m.type}): ${m.verts.toLocaleString()} verts, visible: ${m.visible}`);
        });
        
        if (bones.length > 0) {
            console.log(`🦴 Bones: ${bones.length} found`);
        }
    }

    findJacketMeshes(object) {
        this.jacketMeshes = [];
        
        object.traverse((child) => {
            // Skip bones
            if (child.type === 'Bone') return;
            
            // ✅ Accept ALL meshes as jacket meshes
            if (child.isMesh || child.isSkinnedMesh) {
                this.jacketMeshes.push(child);
                child.visible = true; // Ensure visible
                child.frustumCulled = false; // Don't cull
                console.log(`✅ Jacket mesh: "${child.name}"`);
            }
        });
        
        console.log(`📦 Total jacket meshes: ${this.jacketMeshes.length}`);
    }

    optimizeAllMeshes() {
        console.log('🔧 Optimizing meshes...');
        
        this.jacketMeshes.forEach((mesh, i) => {
            const geo = mesh.geometry;
            if (!geo) return;
            
            const vertCount = geo.attributes.position.count;
            
            // Only decimate if very high poly
            if (vertCount > 50000) {
                const factor = Math.ceil(vertCount / 25000);
                this.decimateGeometry(geo, factor);
                console.log(`  Mesh ${i + 1}: Decimated ${vertCount} → ${geo.attributes.position.count} verts`);
            } else {
                console.log(`  Mesh ${i + 1}: ${vertCount} verts (no decimation needed)`);
            }
            
            geo.computeBoundingSphere();
            
            // Optimize material
            if (mesh.material) {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach(mat => {
                    mat.precision = 'mediump';
                    mat.wireframe = false;
                });
            }
        });
        
        console.log('✓ Optimization complete');
    }

    decimateGeometry(geometry, factor) {
        const pos = geometry.attributes.position.array;
        const newPos = [];
        const vertCount = pos.length / 3;
        
        for (let i = 0; i < vertCount; i += factor) {
            newPos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
        geometry.computeVertexNormals();
    }

    findSkeleton(object) {
        let skeleton = null;
        object.traverse((child) => {
            if (child.isSkinnedMesh && child.skeleton) {
                skeleton = child.skeleton;
            }
        });
        return skeleton;
    }

    getMeshes() {
        return this.jacketMeshes;
    }

    getMesh() {
        return this.jacketMeshes[0] || null;
    }

   setVisible(visible) {
    if (!this.jacketModel) return;

    this.jacketModel.visible = visible;

    this.jacketMeshes.forEach(mesh => {
        mesh.visible = visible;
    });
    console.log(`👁 Jacket visibility set to: ${visible}`);
}


    setPosition(x, y, z) {
        if (this.jacketModel) {
            this.jacketModel.position.set(x, y, z);
        }
    }

    setRotation(x, y, z) {
        if (this.jacketModel) {
            this.jacketModel.rotation.set(x, y, z);
        }
    }

    setScale(scale) {
        if (this.jacketModel) {
            this.jacketModel.scale.set(scale, scale, scale);
        }
    }

    getModel() {
        return this.jacketModel;
    }

    getSkeleton() {
        return this.jacketSkeleton;
    }

    isModelLoaded() {
        return this.isLoaded;
    }

    async loadTexture(url) {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
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

    dispose() {
        if (this.jacketModel) {
            this.jacketModel.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        if (mat.map) mat.map.dispose();
                        if (mat.normalMap) mat.normalMap.dispose();
                        mat.dispose();
                    });
                }
            });
            
            sceneManager.remove(this.jacketModel);
            this.jacketModel = null;
        }
        
        this.jacketMeshes = [];
        this.jacketSkeleton = null;
        this.isLoaded = false;
    }
}

const modelLoader = new ModelLoader();
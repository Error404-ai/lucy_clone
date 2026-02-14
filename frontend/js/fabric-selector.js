// Fabric selector UI module - CORRECTED with forced jacket visibility

class FabricSelector {
    constructor() {
        this.fabrics = [];
        this.selectedFabric = null;
        this.container = document.getElementById('fabric-scroll');
        this.scanBtn = document.getElementById('scan-fabric-btn');
        this.scanModal = document.getElementById('fabric-scan-modal');
        this.isLoading = false;
        this.backendAvailable = false;
    }

    async init() {
        try {
            console.log('Initializing fabric selector...');
            
            // Load mock fabrics
            this.fabrics = this.getMockFabrics();
            this.renderFabrics();
            
            // ✅ Auto-select first fabric and FORCE show jacket
            if (this.fabrics.length > 0) {
                setTimeout(() => {
                    this.selectFabric(this.fabrics[0]);
                }, 1000); // ✅ Wait 1 second for models to load
            }
            
            // Try backend in background
            if (!CONFIG.OFFLINE_MODE.ENABLED) {
                this.loadCatalogFromBackend();
            }
            
            this.setupEventListeners();
            
            console.log('✓ Fabric selector initialized with', this.fabrics.length, 'fabrics');
            
        } catch (error) {
            console.error('Error initializing fabric selector:', error);
            Utils.showError('Using offline fabric catalog');
        }
    }

    async loadCatalogFromBackend() {
        try {
            console.log('Attempting to load fabrics from backend...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.API.REQUEST_TIMEOUT);
            
            const response = await fetch(
                `${CONFIG.API.BASE_URL}${CONFIG.API.ENDPOINTS.FABRIC_CATALOG}`,
                { signal: controller.signal }
            );
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error('Backend returned error');
            }
            
            const data = await response.json();
            
            if (data.fabrics && data.fabrics.length > 0) {
                console.log(`✓ Loaded ${data.fabrics.length} fabrics from backend`);
                this.fabrics = data.fabrics;
                this.backendAvailable = true;
                this.renderFabrics();
            }
            
        } catch (error) {
            console.log('Backend not available, using offline catalog');
            this.backendAvailable = false;
        }
    }

    getMockFabrics() {
        return [
            {
                id: 'black-leather',
                name: 'Black Leather',
                color: '#1a1a1a',
                roughness: 0.3,
                metalness: 0.2,
                description: 'Classic black leather'
            },
            {
                id: 'blue-denim',
                name: 'Blue Denim',
                color: '#4169E1',
                roughness: 0.85,
                metalness: 0.0,
                description: 'Casual blue denim'
            },
            {
                id: 'grey-cotton',
                name: 'Grey Cotton',
                color: '#6B7280',
                roughness: 0.9,
                metalness: 0.0,
                description: 'Soft grey cotton'
            },
            {
                id: 'navy-wool',
                name: 'Navy Wool',
                color: '#1E3A8A',
                roughness: 0.75,
                metalness: 0.0,
                description: 'Warm navy wool'
            },
            {
                id: 'champagne-silk',
                name: 'Champagne Silk',
                color: '#F7E7CE',
                roughness: 0.2,
                metalness: 0.3,
                description: 'Luxurious silk'
            },
            {
                id: 'red-polyester',
                name: 'Red Polyester',
                color: '#DC143C',
                roughness: 0.5,
                metalness: 0.1,
                description: 'Vibrant red'
            },
            {
                id: 'tan-suede',
                name: 'Tan Suede',
                color: '#D2B48C',
                roughness: 0.95,
                metalness: 0.0,
                description: 'Soft suede'
            },
            {
                id: 'olive-nylon',
                name: 'Olive Nylon',
                color: '#556B2F',
                roughness: 0.4,
                metalness: 0.0,
                description: 'Durable outdoor'
            }
        ];
    }

    renderFabrics() {
        if (!this.container) {
            console.error('Fabric container not found');
            return;
        }
        
        this.container.innerHTML = '';
        
        this.fabrics.forEach(fabric => {
            const item = this.createFabricItem(fabric);
            this.container.appendChild(item);
        });
        
        console.log(`Rendered ${this.fabrics.length} fabric items`);
    }

    createFabricItem(fabric) {
        const item = document.createElement('div');
        item.className = 'fabric-item';
        item.dataset.fabricId = fabric.id;
        
        const thumbnail = document.createElement('div');
        thumbnail.className = 'fabric-thumbnail';
        
        if (fabric.color) {
            thumbnail.style.backgroundColor = fabric.color;
            thumbnail.style.backgroundImage = 'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.1) 0%, transparent 50%)';
        } else if (fabric.thumbnail || fabric.diffuseUrl) {
            thumbnail.style.backgroundImage = `url(${fabric.thumbnail || fabric.diffuseUrl})`;
        }
        
        const name = document.createElement('span');
        name.textContent = fabric.name;
        
        item.appendChild(thumbnail);
        item.appendChild(name);
        
        item.addEventListener('click', () => this.selectFabric(fabric));
        
        return item;
    }

    async selectFabric(fabric) {
        if (this.isLoading) return;
        
        try {
            this.isLoading = true;
            console.log('🎨 Selecting fabric:', fabric.name);
            
            // Update UI immediately
            document.querySelectorAll('.fabric-item').forEach(item => {
                item.classList.remove('selected');
            });
            
            const selectedItem = document.querySelector(`[data-fabric-id="${fabric.id}"]`);
            if (selectedItem) {
                selectedItem.classList.add('selected');
            }
            
            // Show fabric info
            const infoEl = document.getElementById('selected-fabric-info');
            if (infoEl) {
                const nameEl = infoEl.querySelector('.fabric-name');
                if (nameEl) {
                    nameEl.textContent = fabric.name;
                }
                infoEl.style.display = 'block';
            }
            
            // ✅ Apply fabric to jacket
            const success = await materialsManager.applyFabric(fabric);
            
            if (success) {
                this.selectedFabric = fabric;
                
                // ✅ FORCE jacket visibility
                modelLoader.setVisible(true);
                skeletonMapper.forceShowJacket();
                
                console.log('✅ Fabric applied successfully:', fabric.name);
                console.log('✅ Jacket visibility FORCED');
            } else {
                console.warn('Failed to apply fabric');
                Utils.showError('Could not apply fabric');
            }
            
        } catch (error) {
            console.error('Error selecting fabric:', error);
            Utils.showError('Could not apply fabric');
        } finally {
            this.isLoading = false;
        }
    }

    setupEventListeners() {
        if (!this.scanBtn) {
            console.warn('Scan button not found');
            return;
        }
        
        this.scanBtn.addEventListener('click', () => {
            if (!this.backendAvailable && !CONFIG.OFFLINE_MODE.ENABLED) {
                Utils.showError('Fabric scanning requires backend connection');
                return;
            }
            this.openScanModal();
        });
        
        const closeBtn = document.getElementById('fabric-scan-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeScanModal();
            });
        }
        
        const uploadInput = document.getElementById('fabric-upload');
        if (uploadInput) {
            uploadInput.addEventListener('change', (e) => {
                this.handleFabricUpload(e.target.files[0]);
            });
        }
    }

    openScanModal() {
        if (this.scanModal) {
            this.scanModal.classList.add('active');
        }
    }

    closeScanModal() {
        if (this.scanModal) {
            this.scanModal.classList.remove('active');
            const processingEl = document.getElementById('scan-processing');
            if (processingEl) {
                processingEl.style.display = 'none';
            }
        }
    }

    async handleFabricUpload(file) {
        if (!file) return;
        
        if (!this.backendAvailable) {
            Utils.showError('Backend not available for fabric processing');
            this.closeScanModal();
            return;
        }
        
        try {
            const processingEl = document.getElementById('scan-processing');
            if (processingEl) {
                processingEl.style.display = 'block';
            }
            
            const base64 = await Utils.blobToBase64(file);
            
            const response = await fetch(
                `${CONFIG.API.BASE_URL}${CONFIG.API.ENDPOINTS.FABRIC_SCAN}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ image: base64 })
                }
            );
            
            if (!response.ok) {
                throw new Error('Fabric processing failed');
            }
            
            const data = await response.json();
            
            const customFabric = {
                id: `custom-${Date.now()}`,
                name: 'Custom Fabric',
                diffuseUrl: data.diffuseUrl,
                normalUrl: data.normalUrl,
                roughnessUrl: data.roughnessUrl,
                thumbnail: data.diffuseUrl,
                roughness: data.roughness || 0.8,
                metalness: data.metalness || 0.0
            };
            
            this.fabrics.unshift(customFabric);
            this.renderFabrics();
            
            await this.selectFabric(customFabric);
            
            this.closeScanModal();
            
            Utils.showError('Fabric scanned successfully!');
            
        } catch (error) {
            console.error('Error uploading fabric:', error);
            Utils.showError('Could not process fabric photo');
        } finally {
            const processingEl = document.getElementById('scan-processing');
            if (processingEl) {
                processingEl.style.display = 'none';
            }
        }
    }

    getSelectedFabric() {
        return this.selectedFabric;
    }

    addFabric(fabric) {
        this.fabrics.push(fabric);
        this.renderFabrics();
    }
    
    isBackendAvailable() {
        return this.backendAvailable;
    }
}

const fabricSelector = new FabricSelector();
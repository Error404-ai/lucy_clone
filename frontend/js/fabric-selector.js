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

            // Load offline fabrics first
            this.fabrics = this.getMockFabrics();
            this.renderFabrics();

            // Wait until jacket model actually loads
            const waitForModel = setInterval(() => {
                if (modelLoader.isModelLoaded()) {
                    clearInterval(waitForModel);
                    console.log('🧥 Model ready → auto selecting first fabric');
                    this.selectFabric(this.fabrics[0]);
                }
            }, 200);

            // Backend optional
            if (!CONFIG.OFFLINE_MODE.ENABLED) {
                this.loadCatalogFromBackend();
            }

            this.setupEventListeners();

            console.log('✓ Fabric selector initialized');

        } catch (error) {
            console.error('Error initializing fabric selector:', error);
            Utils.showError('Using offline fabric catalog');
        }
    }

    /* ================= FABRICS ================= */

    getMockFabrics() {
        return [
            { id:'black', name:'Black Leather', color:'#1a1a1a', roughness:0.3, metalness:0.2 },
            { id:'denim', name:'Blue Denim', color:'#4169E1', roughness:0.85, metalness:0.0 },
            { id:'cotton', name:'Grey Cotton', color:'#6B7280', roughness:0.9, metalness:0.0 },
            { id:'wool', name:'Navy Wool', color:'#1E3A8A', roughness:0.75, metalness:0.0 },
            { id:'silk', name:'Champagne Silk', color:'#F7E7CE', roughness:0.2, metalness:0.3 },
            { id:'red', name:'Red Polyester', color:'#DC143C', roughness:0.5, metalness:0.1 },
            { id:'suede', name:'Tan Suede', color:'#D2B48C', roughness:0.95, metalness:0.0 },
            { id:'nylon', name:'Olive Nylon', color:'#556B2F', roughness:0.4, metalness:0.0 }
        ];
    }

    renderFabrics() {
        if (!this.container) return;
        this.container.innerHTML = '';

        this.fabrics.forEach(fabric => {
            const item = document.createElement('div');
            item.className = 'fabric-item';
            item.dataset.fabricId = fabric.id;

            const thumb = document.createElement('div');
            thumb.className = 'fabric-thumbnail';
            thumb.style.backgroundColor = fabric.color;

            const name = document.createElement('span');
            name.textContent = fabric.name;

            item.appendChild(thumb);
            item.appendChild(name);

            item.addEventListener('click', () => this.selectFabric(fabric));
            this.container.appendChild(item);
        });
    }

    /* ================= SELECT FABRIC ================= */

    async selectFabric(fabric) {
        if (this.isLoading) return;

        try {
            this.isLoading = true;
            console.log('🎨 Applying fabric:', fabric.name);

            // Highlight UI
            document.querySelectorAll('.fabric-item')
                .forEach(el => el.classList.remove('selected'));

           const el = document.querySelector(`[data-fabric-id="${fabric.id}"]`);

            if (el) el.classList.add('selected');

            // Apply material ONLY
            const success = await materialsManager.applyFabric(fabric);

            if (success) {
                this.selectedFabric = fabric;
                console.log('✅ Fabric applied — tracking continues normally');
            } else {
                Utils.showError('Could not apply fabric');
            }

        } catch (err) {
            console.error(err);
            Utils.showError('Fabric apply failed');
        } finally {
            this.isLoading = false;
        }
    }

    /* ================= EVENTS ================= */

    setupEventListeners() {
        if (!this.scanBtn) return;

        this.scanBtn.addEventListener('click', () => {
            if (!this.backendAvailable && !CONFIG.OFFLINE_MODE.ENABLED) {
                Utils.showError('Backend not connected');
                return;
            }
            this.openScanModal();
        });

        const closeBtn = document.getElementById('fabric-scan-close');
        if (closeBtn) closeBtn.onclick = () => this.closeScanModal();
    }

    openScanModal() {
        if (this.scanModal) this.scanModal.classList.add('active');
    }

    closeScanModal() {
        if (this.scanModal) this.scanModal.classList.remove('active');
    }

    /* ================= HELPERS ================= */

    getSelectedFabric() {
        return this.selectedFabric;
    }
}

const fabricSelector = new FabricSelector();
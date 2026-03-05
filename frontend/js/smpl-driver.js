// smpl-driver.js
// =============================================================================
// Connects to the backend /ws/pose WebSocket, streams camera frames at ~12 fps,
// receives 24 SMPL joint quaternions, and applies them to the loaded GLB jacket
// skeleton with per-bone smoothing.
//
// SMPL 24-joint index → CONFIG bone name mapping
// (only joints relevant to jacket; legs are ignored)
//
//  0  pelvis        →  pelvis / hips
//  3  spine1        →  spine_01
//  6  spine2        →  spine_02
//  9  spine3        →  spine_03
// 12  neck          →  neck_01
// 13  left_collar   →  clavicle_l
// 14  right_collar  →  clavicle_r
// 15  head          →  head
// 16  left_shoulder →  upperarm_l
// 17  right_shoulder→  upperarm_r
// 18  left_elbow    →  lowerarm_l
// 19  right_elbow   →  lowerarm_r
// 20  left_wrist    →  hand_l
// 21  right_wrist   →  hand_r
// =============================================================================

class SMPLDriver {

    // ── Static config ─────────────────────────────────────────────────────────
    //  jointIdx → array of bone-name candidates (first match wins)
    static JOINT_BONE_MAP = {
         0: ['pelvis', 'hips', 'root'],
         3: ['spine_01', 'spine.001', 'spine1', 'spine'],
         6: ['spine_02', 'spine.002', 'spine2'],
         9: ['spine_03', 'spine.003', 'spine3'],
        12: ['neck_01',  'neck.001',  'neck'],
        13: ['clavicle_l',  'l_clavicle', 'leftshoulder',  'collar_l'],
        14: ['clavicle_r',  'r_clavicle', 'rightshoulder', 'collar_r'],
        15: ['head'],
        16: ['upperarm_l',  'l_upperarm', 'upper arm.l'],
        17: ['upperarm_r',  'r_upperarm', 'upper arm.r'],
        18: ['lowerarm_l',  'l_forearm',  'forearm.l'],
        19: ['lowerarm_r',  'r_forearm',  'forearm.r'],
        20: ['hand_l', 'l_hand'],
        21: ['hand_r', 'r_hand'],
    };

    // Joints where we flip the X axis because SMPL and the GLB have opposite
    // handedness conventions for that limb segment.
    // Right-side joints need a sign correction on quaternion x/z components.
    static RIGHT_SIDE_JOINTS = new Set([14, 17, 19, 21]);

    constructor() {
        // WebSocket
        this.ws          = null;
        this.isConnected = false;
        this.isEnabled   = false;

        // Backend URL — reads CONFIG if defined, otherwise localhost
        this.wsUrl = (typeof CONFIG !== 'undefined' && CONFIG.API && CONFIG.API.WS_POSE_URL)
            ? CONFIG.API.WS_POSE_URL
            : 'ws://localhost:5000/ws/pose';

        // Per-bone state
        this.boneMap   = {};   // jointIdx (int) → THREE.Bone
        this.restQuats = {};   // jointIdx (int) → THREE.Quaternion  (bind pose)
        this.smoothQ   = {};   // jointIdx (int) → THREE.Quaternion  (current smoothed)

        // Frame-sending canvas (downscaled for bandwidth)
        this._canvas = document.createElement('canvas');
        this._ctx    = this._canvas.getContext('2d');
        this._canvas.width  = 320;
        this._canvas.height = 240;

        // Timing
        this._sendInterval  = null;
        this.SEND_INTERVAL  = 80;          // ms between frames (~12.5 fps)
        this._lastSendTime  = 0;
        this._pendingFrame  = false;       // prevent queue build-up

        // Smoothing factor (0 = frozen, 1 = instant)
        this.ALPHA = 0.25;

        // Stats
        this.latencyMs   = 0;
        this.framesIn    = 0;
        this.framesOut   = 0;
        this._lastLogTime = 0;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Call after the GLB jacket model is fully loaded.
     * Builds the bone map, caches rest quaternions, and opens the WebSocket.
     * Returns true if backend connection succeeded.
     */
    async init() {
        if (!modelLoader.isModelLoaded()) {
            console.warn('⚠️ SMPLDriver.init(): jacket model not loaded yet');
            return false;
        }

        this._buildBoneMap();
        this._cacheRestQuats();

        try {
            await this._connect();
            this.isEnabled = true;
            console.log(`✅ SMPLDriver ready — ${Object.keys(this.boneMap).length} bones mapped`);
            return true;
        } catch (e) {
            console.warn(`⚠️ SMPLDriver: backend unreachable (${e.message}) — 3-D-only mode`);
            return false;
        }
    }

    /** Permanently stop sending frames and close the socket. */
    stop() {
        this.isEnabled = false;
        this._stopSending();
        if (this.ws) {
            try { this.ws.close(); } catch (_) {}
            this.ws = null;
        }
        this.isConnected = false;
        console.log('⏹️ SMPLDriver stopped');
    }

    isActive()     { return this.isConnected && this.isEnabled; }
    getLatency()   { return this.latencyMs; }

    // ══════════════════════════════════════════════════════════════════════════
    // BONE MAP
    // ══════════════════════════════════════════════════════════════════════════

    _buildBoneMap() {
        const skeleton = modelLoader.getSkeleton();
        if (!skeleton) {
            console.warn('⚠️ SMPLDriver: no skeleton on loaded model');
            return;
        }

        // Build lowercase-name → bone lookup
        const byName = {};
        skeleton.bones.forEach(b => { byName[b.name.toLowerCase()] = b; });

        let found = 0;

        for (const [idxStr, candidates] of Object.entries(SMPLDriver.JOINT_BONE_MAP)) {
            const idx  = parseInt(idxStr);
            let   bone = null;

            for (const name of candidates) {
                // Exact lowercase match
                if (byName[name.toLowerCase()]) {
                    bone = byName[name.toLowerCase()];
                    break;
                }
                // Partial match
                const partial = skeleton.bones.find(
                    b => b.name.toLowerCase().includes(name.toLowerCase())
                );
                if (partial) { bone = partial; break; }
            }

            if (bone) {
                this.boneMap[idx] = bone;
                found++;
                if (CONFIG.DEBUG && CONFIG.DEBUG.VERBOSE) {
                    console.log(`  SMPL[${idx}] → "${bone.name}"`);
                }
            } else {
                console.warn(`  SMPL[${idx}] — no bone match for [${candidates.join(', ')}]`);
            }
        }

        console.log(`🦴 SMPLDriver: ${found}/${Object.keys(SMPLDriver.JOINT_BONE_MAP).length} joints mapped`);
    }

    _cacheRestQuats() {
        for (const [idx, bone] of Object.entries(this.boneMap)) {
            this.restQuats[idx] = bone.quaternion.clone();
            this.smoothQ[idx]   = bone.quaternion.clone();
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // WEBSOCKET
    // ══════════════════════════════════════════════════════════════════════════

    _connect() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error('connection timeout')), 5000
            );

            try {
                this.ws = new WebSocket(this.wsUrl);
            } catch (e) {
                clearTimeout(timeout);
                return reject(e);
            }

            this.ws.onopen = () => {
                clearTimeout(timeout);
                this.isConnected = true;
                console.log('🔌 SMPLDriver WebSocket connected →', this.wsUrl);
                this._startSending();
                resolve();
            };

            this.ws.onmessage = (ev) => this._onMessage(ev.data);

            this.ws.onerror = () => {
                clearTimeout(timeout);
                this.isConnected = false;
                reject(new Error('WebSocket error'));
            };

            this.ws.onclose = (ev) => {
                this.isConnected = false;
                this._stopSending();
                if (this.isEnabled && ev.code !== 1000) {
                    // Abnormal close — try reconnecting
                    console.log('🔄 SMPLDriver: reconnecting in 3 s…');
                    setTimeout(() => this._reconnect(), 3000);
                }
            };
        });
    }

    async _reconnect() {
        if (!this.isEnabled) return;
        try {
            await this._connect();
        } catch (e) {
            console.warn('SMPLDriver reconnect failed:', e.message);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FRAME SENDING
    // ══════════════════════════════════════════════════════════════════════════

    _startSending() {
        this._stopSending();
        this._sendInterval = setInterval(() => this._sendFrame(), this.SEND_INTERVAL);
    }

    _stopSending() {
        if (this._sendInterval) {
            clearInterval(this._sendInterval);
            this._sendInterval = null;
        }
    }

    _sendFrame() {
        if (!this.isConnected || this._pendingFrame) return;

        const video = cameraManager.video;
        if (!video || video.readyState < 2) return;

        // Downscale to 320×240 for fast transfer
        this._ctx.drawImage(video, 0, 0, 320, 240);
        const dataUrl = this._canvas.toDataURL('image/jpeg', 0.55);

        this._lastSendTime  = performance.now();
        this._pendingFrame  = true;

        try {
            this.ws.send(JSON.stringify({
                type:      'pose_frame',
                image:     dataUrl,
                timestamp: this._lastSendTime,
            }));
            this.framesOut++;
        } catch (e) {
            this._pendingFrame = false;
            console.warn('SMPLDriver send error:', e);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // RECEIVE + APPLY
    // ══════════════════════════════════════════════════════════════════════════

    _onMessage(raw) {
        this._pendingFrame = false;

        let msg;
        try { msg = JSON.parse(raw); }
        catch (_) { return; }

        if (msg.type !== 'pose_result') return;

        this.latencyMs = performance.now() - (msg.timestamp || this._lastSendTime);
        this.framesIn++;

        if (!msg.pose || msg.pose.length !== 96) return;

        this._applyPose(msg.pose);

        // Optional: log stats every 5 s
        const now = performance.now();
        if (now - this._lastLogTime > 5000) {
            this._lastLogTime = now;
            console.log(
                `SMPLDriver stats | latency=${this.latencyMs.toFixed(0)}ms ` +
                `in=${this.framesIn} out=${this.framesOut} mode=${msg.mode}`
            );
        }
    }

    /**
     * Apply 96 floats (24×4 quaternions, xyzw) to the mapped bones.
     *
     * Strategy:
     *   bone.quaternion = slerp(prev, restQuat * smplQuat, ALPHA)
     *
     * Multiplying restQuat first ensures that when smplQuat = identity (T-pose)
     * the bone stays exactly at its bind pose.  This makes the retargeting
     * independent of the GLB rest-pose orientation.
     */
   _applyPose(poseFlat) {
    const _smplWorldQ   = new THREE.Quaternion();
    const _parentWorldQ = new THREE.Quaternion();

    // Jacket is rotated Math.PI on Y — pre-compute that correction
    const _yFlip = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));

    for (const [idxStr, bone] of Object.entries(this.boneMap)) {
        const idx    = parseInt(idxStr);
        const offset = idx * 4;

        let qx = poseFlat[offset];
        let qy = poseFlat[offset + 1];
        let qz = poseFlat[offset + 2];
        let qw = poseFlat[offset + 3];

        if (SMPLDriver.RIGHT_SIDE_JOINTS.has(idx)) { qx = -qx; qz = -qz; }

        // MediaPipe world → Three.js world (jacket is π-rotated, so flip X/Z)
        _smplWorldQ.set(-qx, qy, -qz, qw).normalize();

        // World-space → bone local-space
        let localQ = _smplWorldQ.clone();
        if (bone.parent) {
            bone.parent.getWorldQuaternion(_parentWorldQ);
            localQ.premultiply(_parentWorldQ.clone().invert());
        }

        const smooth = this.smoothQ[idx] ?? this.smoothQ[idxStr];
        if (smooth) {
            smooth.slerp(localQ, this.ALPHA);
            bone.quaternion.copy(smooth);
        }
    }

    const skel = modelLoader.getSkeleton();
    if (skel) skel.update();
}
    // ══════════════════════════════════════════════════════════════════════════
    // SMOOTHING CONFIG
    // ══════════════════════════════════════════════════════════════════════════

    /** 0 = frozen, 1 = instant snap. Default 0.25 gives ~4-frame easing at 30 fps. */
    setSmoothing(alpha) {
        this.ALPHA = Math.max(0.01, Math.min(1.0, alpha));
    }

    /** Frame-send interval in ms (lower = more responsive but more bandwidth). */
    setSendInterval(ms) {
        this.SEND_INTERVAL = Math.max(33, ms);  // minimum ~30 fps cap
        if (this._sendInterval) {
            this._startSending();  // restart with new interval
        }
    }
}

// ─── Global singleton ────────────────────────────────────────────────────────
const smplDriver = new SMPLDriver();

// Export for Node/test environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SMPLDriver;
}
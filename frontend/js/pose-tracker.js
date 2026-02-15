// pose-tracker.js - Handles MediaPipe Pose detection
import { Pose } from '@mediapipe/pose';
import { CONFIG } from './config.js';

export class PoseTracker {
    constructor() {
        this.pose = null;
        this.isInitialized = false;
        this.lastPoseLandmarks = null;
        this.onPoseDetected = null;
        this.detectionCount = 0;
        this.lastLogTime = Date.now();
        
        console.log('🎯 PoseTracker created');
    }

    /**
     * Initialize MediaPipe Pose
     */
    async initialize() {
        try {
            console.log('🎯 Initializing MediaPipe Pose...');
            
            this.pose = new Pose({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
                }
            });

            this.pose.setOptions({
                modelComplexity: CONFIG.POSE.MODEL_COMPLEXITY,
                smoothLandmarks: CONFIG.POSE.SMOOTH_LANDMARKS,
                minDetectionConfidence: CONFIG.POSE.MIN_DETECTION_CONFIDENCE,
                minTrackingConfidence: CONFIG.POSE.MIN_TRACKING_CONFIDENCE,
            });

            this.pose.onResults((results) => this.handlePoseResults(results));
            
            this.isInitialized = true;
            console.log('✅ MediaPipe Pose initialized');
            
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize MediaPipe Pose:', error);
            return false;
        }
    }

    /**
     * Process video frame for pose detection
     */
    async processFrame(videoElement) {
        if (!this.isInitialized || !this.pose) {
            console.warn('⚠️ Pose tracker not initialized');
            return;
        }

        try {
            await this.pose.send({ image: videoElement });
        } catch (error) {
            console.error('❌ Error processing pose frame:', error);
        }
    }

    /**
     * Handle pose detection results
     */
    handlePoseResults(results) {
        const now = Date.now();
        
        if (results.poseLandmarks && results.poseLandmarks.length > 0) {
            this.lastPoseLandmarks = results.poseLandmarks;
            this.detectionCount++;
            
            // Log successful detection occasionally
            if (this.detectionCount % 30 === 0) {
                console.log(`✅ Pose detected! (${results.poseLandmarks.length} landmarks)`);
            }
            
            if (this.onPoseDetected) {
                this.onPoseDetected(results.poseLandmarks);
            }
        } else {
            // Log when no pose is detected (every 5 seconds)
            if (now - this.lastLogTime > 5000) {
                console.log('⚠️ No pose detected in last 5 seconds');
                this.lastLogTime = now;
            }
            
            // Still call the callback with null to trigger center positioning
            if (this.onPoseDetected) {
                this.onPoseDetected(null);
            }
        }
    }

    /**
     * Get the last detected pose landmarks
     */
    getLastPose() {
        return this.lastPoseLandmarks;
    }

    /**
     * Check if pose tracker is ready
     */
    isReady() {
        return this.isInitialized;
    }

    /**
     * Get detection count for debugging
     */
    getDetectionCount() {
        return this.detectionCount;
    }

    /**
     * Set callback for pose detection
     */
    setPoseCallback(callback) {
        this.onPoseDetected = callback;
    }
}
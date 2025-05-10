// Base class for all animation effects
class BaseAnimation {
    constructor() {
        this.isActive = false;
        this.animationId = null;
    }

    // Initialize the animation - called when the effect is first loaded
    initialize() {
        console.log(`${this.constructor.name} initialized`);
    }

    // Setup any UI controls needed for this animation
    setupControls() {
        console.log(`${this.constructor.name} controls setup`);
    }

    // Start the animation
    start() {
        if (this.isActive) return;
        this.isActive = true;
        console.log(`${this.constructor.name} started`);
    }

    // Stop the animation
    stop() {
        if (!this.isActive) return;
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log(`${this.constructor.name} stopped`);
    }

    // Clean up any resources when the animation is removed
    cleanup() {
        this.stop();
        console.log(`${this.constructor.name} cleaned up`);
    }

    // Get the animation's current state
    getState() {
        return {
            isActive: this.isActive,
            name: this.constructor.name
        };
    }
}

// Export the base class
window.BaseAnimation = BaseAnimation; 
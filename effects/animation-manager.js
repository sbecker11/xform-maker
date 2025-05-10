// Animation Manager to handle all animation effects
class AnimationManager {
    constructor() {
        this.animations = new Map();
        this.activeAnimations = new Set();
    }

    // Register a new animation effect
    registerAnimation(name, animationClass) {
        if (this.animations.has(name)) {
            console.warn(`Animation ${name} is already registered`);
            return false;
        }
        this.animations.set(name, animationClass);
        console.log(`Animation ${name} registered`);
        return true;
    }

    // Initialize an animation
    initializeAnimation(name) {
        const animationClass = this.animations.get(name);
        if (!animationClass) {
            console.warn(`Animation ${name} not found`);
            return null;
        }

        const animation = new animationClass();
        animation.initialize();
        return animation;
    }

    // Enable an animation
    enableAnimation(name) {
        if (this.activeAnimations.has(name)) {
            console.warn(`Animation ${name} is already active`);
            return false;
        }

        const animation = this.initializeAnimation(name);
        if (!animation) return false;

        this.activeAnimations.add(name);
        animation.start();
        return true;
    }

    // Disable an animation
    disableAnimation(name) {
        if (!this.activeAnimations.has(name)) {
            console.warn(`Animation ${name} is not active`);
            return false;
        }

        const animation = this.initializeAnimation(name);
        if (!animation) return false;

        animation.stop();
        animation.cleanup();
        this.activeAnimations.delete(name);
        return true;
    }

    // Get all registered animations
    getRegisteredAnimations() {
        return Array.from(this.animations.keys());
    }

    // Get all active animations
    getActiveAnimations() {
        return Array.from(this.activeAnimations);
    }

    // Get the state of all animations
    getAnimationStates() {
        const states = {};
        this.activeAnimations.forEach(name => {
            const animation = this.initializeAnimation(name);
            if (animation) {
                states[name] = animation.getState();
            }
        });
        return states;
    }
}

// Create and export a singleton instance
window.animationManager = new AnimationManager(); 
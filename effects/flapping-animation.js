// Flapping animation effect
class FlappingAnimation extends BaseAnimation {
    constructor() {
        super('flapping');
        this.frequency = 18; // Set default to 18Hz as requested
        this.isApplied = false;
        this.cycleCount = 0;
        this.lastCycleTime = 0;
        this.cyclesPerSecond = 0;
        this.lastFoldProgress = 0;
        console.log('FlappingAnimation initialized with frequency:', this.frequency, 'Hz');
    }

    initialize() {
        this.setupControls();
        this.setupEventListeners();
    }

    setupControls() {
        const container = document.getElementById('flapping-container');
        if (!container) return;

        // Create control panel
        const controlPanel = document.createElement('div');
        controlPanel.className = 'animation-controls';

        // Add control group for frequency
        const controlGroup = document.createElement('div');
        controlGroup.className = 'control-group';

        const label = document.createElement('label');
        label.textContent = 'Flap Rate';
        controlGroup.appendChild(label);

        const input = document.createElement('input');
        input.type = 'range';
        input.id = 'flapFrequency';
        input.min = 1;
        input.max = 40;
        input.value = this.frequency; // Set initial value to 18
        input.step = 0.5;
        controlGroup.appendChild(input);

        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'value-display';
        valueDisplay.textContent = this.frequency + ' Hz';
        controlGroup.appendChild(valueDisplay);

        controlPanel.appendChild(controlGroup);
        container.appendChild(controlPanel);

        // Set up the event listener immediately
        input.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            valueDisplay.textContent = value + ' Hz';
            this.frequency = value; // Update the frequency immediately
            console.log('Flutter rate changed to:', value, 'Hz');
        });

        // Also update on change event to ensure it's captured
        input.addEventListener('change', (e) => {
            const value = parseFloat(e.target.value);
            this.frequency = value;
            console.log('Flutter rate finalized to:', value, 'Hz');
        });
    }

    setupEventListeners() {
        const input = document.getElementById('flapFrequency');
        if (input) {
            input.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                const display = e.target.nextElementSibling;
                if (display) {
                    display.textContent = value + ' Hz';
                }
                this.frequency = value;
                console.log('Flutter rate changed to:', value, 'Hz');
            });
        }
    }

    // This method will be called by the main animation sequence
    getFlapTransform(progress) {
        const duration = (window.durationInput?.value || 5000) / 1000;
        
        // Calculate the current time in seconds
        const currentTime = progress * duration;
        
        // Calculate fold progress using sine wave
        // Multiply by 2π to get radians, then by frequency to get the correct number of cycles
        const foldProgress = Math.sin(currentTime * this.frequency * 2 * Math.PI);
        
        // Count cycles by detecting zero crossings
        if (this.lastCycleTime === 0) {
            this.lastCycleTime = performance.now();
            console.log('Starting flutter cycle counting at:', new Date().toISOString());
            console.log('Current frequency setting:', this.frequency, 'Hz');
            console.log('Animation duration:', duration, 'seconds');
        }
        
        // Detect cycle completion (when foldProgress crosses from negative to positive)
        if (foldProgress > 0 && this.lastFoldProgress <= 0) {
            this.cycleCount++;
            const timeDiff = performance.now() - this.lastCycleTime;
            if (timeDiff >= 1000) { // Update every second
                this.cyclesPerSecond = this.cycleCount;
                console.log('=== Flutter Rate Update ===');
                console.log('Target rate:', this.frequency, 'Hz');
                console.log('Actual rate:', this.cyclesPerSecond, 'Hz');
                console.log('Time elapsed:', (timeDiff/1000).toFixed(1), 'seconds');
                console.log('========================');
                this.cycleCount = 0;
                this.lastCycleTime = performance.now();
            }
        }
        this.lastFoldProgress = foldProgress;
        
        return `rotateX(${foldProgress * 30}deg)`;
    }

    cleanup() {
        const container = document.getElementById('flapping-container');
        if (container) {
            container.innerHTML = '';
        }
        console.log('FlappingAnimation cleanup - resetting counters');
        this.cycleCount = 0;
        this.lastCycleTime = 0;
        this.cyclesPerSecond = 0;
        this.lastFoldProgress = 0;
    }

    getState() {
        return {
            frequency: this.frequency
        };
    }
}

// Register with animation manager if available
if (window.animationManager) {
    window.animationManager.registerAnimation(new FlappingAnimation());
}

// Export to window
window.FlappingAnimation = FlappingAnimation;

// Global settings
window.flappingSettings = {
    flapFrequency: 2
};

// Create and animate rectangle along path
function animateRectangleAlongPath() {
    console.log('Starting rectangle animation along path');
    
    const startRect = document.getElementById('startRect');
    if (!startRect) {
        console.error('Start rectangle not found');
        return;
    }

    // Create path from waypoints
    const pathData = createPathFromWaypoints(window.intermediatePoints);
    console.log('Created path data:', pathData);

    // Add flapping class to start rectangle
    startRect.classList.add('flapping');

    // Create animation instance
    const flapping = new FlappingAnimation();

    // Set the path and start animation
    flapping.setPath(pathData);
    flapping.start();

    // Get duration from input
    const duration = parseInt(window.durationInput?.value || 500, 10);
    console.log('Animation duration:', duration);

    // Clean up after animation
    setTimeout(() => {
        flapping.stop();
        startRect.classList.remove('flapping');
        console.log('Flapping animation completed');
    }, duration);
}

// Initialize flapping controls
document.addEventListener('DOMContentLoaded', () => {
    setupFlappingAnimation();
}); 
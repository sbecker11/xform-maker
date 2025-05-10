// Butterfly effect animation
class ButterflyEffect {
    static globalSettings = {
        flapAmplitude: 20,
        flapFrequency: 1.5,
        hoverAmplitude: 5,
        hoverFrequency: 0.8
    };

    constructor(options) {
        this.element = options.element;
        this.options = {
            flapAmplitude: options.flapAmplitude || ButterflyEffect.globalSettings.flapAmplitude,
            flapFrequency: options.flapFrequency || ButterflyEffect.globalSettings.flapFrequency,
            hoverAmplitude: options.hoverAmplitude || ButterflyEffect.globalSettings.hoverAmplitude,
            hoverFrequency: options.hoverFrequency || ButterflyEffect.globalSettings.hoverFrequency
        };
        this.isAnimating = false;
        this.time = 0;
        this.currentPath = null;
        this.pathProgress = 0;
    }

    start() {
        this.isAnimating = true;
        this.time = 0;
        this.pathProgress = 0;
        this.animate();
    }

    stop() {
        this.isAnimating = false;
    }

    setPath(pathData) {
        this.currentPath = pathData;
        this.pathProgress = 0;
    }

    getPointAt(progress) {
        if (!this.currentPath) return { x: 0, y: 0 };
        
        const points = this.currentPath.split(' ');
        const totalPoints = points.length;
        const index = Math.floor(progress * (totalPoints - 1));
        const nextIndex = Math.min(index + 1, totalPoints - 1);
        
        const currentPoint = points[index].split(',');
        const nextPoint = points[nextIndex].split(',');
        
        const x = parseFloat(currentPoint[0]) + (parseFloat(nextPoint[0]) - parseFloat(currentPoint[0])) * (progress * (totalPoints - 1) - index);
        const y = parseFloat(currentPoint[1]) + (parseFloat(nextPoint[1]) - parseFloat(currentPoint[1])) * (progress * (totalPoints - 1) - index);
        
        return { x, y };
    }

    animate() {
        if (!this.isAnimating) return;

        // Calculate flap angle using sine wave
        const flapAngle = Math.sin(this.time * this.options.flapFrequency * Math.PI) * this.options.flapAmplitude;
        
        // Calculate hover offset using cosine wave
        const hoverOffset = Math.cos(this.time * this.options.hoverFrequency * Math.PI) * this.options.hoverAmplitude;

        // If following a path, update position
        if (this.currentPath) {
            this.pathProgress += 0.001; // Slower path progress
            if (this.pathProgress >= 1) {
                this.pathProgress = 1;
                this.stop();
            }

            // Get current position on path
            const point = this.getPointAt(this.pathProgress);
            
            // Apply transforms with path position
            this.element.style.transform = `
                translate(${point.x}px, ${point.y}px)
                rotate(${flapAngle}deg)
                translateY(${hoverOffset}px)
            `;
        } else {
            // Apply transforms without path following
            this.element.style.transform = `
                rotate(${flapAngle}deg)
                translateY(${hoverOffset}px)
            `;
        }

        // Increment time
        this.time += 0.016; // Approximately 60fps

        // Request next frame
        requestAnimationFrame(() => this.animate());
    }

    static updateGlobalSettings(settings) {
        Object.assign(ButterflyEffect.globalSettings, settings);
    }
}

// Export to window
window.ButterflyEffect = ButterflyEffect; 
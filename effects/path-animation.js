// Path animation effect for Bezier curves
class PathAnimation extends BaseAnimation {
    constructor() {
        super();
        this.pathType = 'passthrough'; // 'passthrough' or 'estimating'
        this.tension = 0.5; // For estimating Bezier
        this.animationSpeed = 1.0;
        this.showControlPoints = true;
        this.controls = null;
    }

    initialize() {
        super.initialize();
        this.setupControls();
    }

    setupControls() {
        // Create controls container if it doesn't exist
        if (!this.controls) {
            const container = document.createElement('div');
            container.className = 'animation-controls path-controls';
            container.innerHTML = `
                <div class="control-group">
                    <label>Path Controls</label>
                    <div class="control-row">
                        <label>Path Type:</label>
                        <select id="pathType">
                            <option value="passthrough">Pass-through</option>
                            <option value="estimating">Estimating</option>
                        </select>
                    </div>
                    <div class="control-row tension-control" style="display: none;">
                        <label>Tension:</label>
                        <input type="range" id="pathTension" min="0" max="1" step="0.1" value="${this.tension}">
                        <span class="value">${this.tension}</span>
                    </div>
                    <div class="control-row">
                        <label>Animation Speed:</label>
                        <input type="range" id="pathSpeed" min="0.1" max="2" step="0.1" value="${this.animationSpeed}">
                        <span class="value">${this.animationSpeed}x</span>
                    </div>
                    <div class="control-row">
                        <label>Show Controls:</label>
                        <input type="checkbox" id="showControls" ${this.showControlPoints ? 'checked' : ''}>
                    </div>
                </div>
            `;

            // Add to the effects panel
            const effectsPanel = document.querySelector('.effects-panel');
            if (effectsPanel) {
                effectsPanel.appendChild(container);
                this.controls = container;

                // Add event listeners
                this.setupEventListeners();
            }
        }
    }

    setupEventListeners() {
        const pathTypeSelect = document.getElementById('pathType');
        const tensionInput = document.getElementById('pathTension');
        const speedInput = document.getElementById('pathSpeed');
        const showControlsInput = document.getElementById('showControls');
        const tensionControl = document.querySelector('.tension-control');

        if (pathTypeSelect) {
            pathTypeSelect.addEventListener('change', (e) => {
                this.pathType = e.target.value;
                tensionControl.style.display = this.pathType === 'estimating' ? 'flex' : 'none';
                this.updatePath();
            });
        }

        if (tensionInput) {
            tensionInput.addEventListener('input', (e) => {
                this.tension = parseFloat(e.target.value);
                e.target.nextElementSibling.textContent = this.tension;
                this.updatePath();
            });
        }

        if (speedInput) {
            speedInput.addEventListener('input', (e) => {
                this.animationSpeed = parseFloat(e.target.value);
                e.target.nextElementSibling.textContent = `${this.animationSpeed}x`;
            });
        }

        if (showControlsInput) {
            showControlsInput.addEventListener('change', (e) => {
                this.showControlPoints = e.target.checked;
                this.updatePath();
            });
        }
    }

    start() {
        super.start();
        this.startTime = performance.now();
        this.animate();
    }

    stop() {
        super.stop();
        // Reset any transformed elements
        const path = document.querySelector('.path-preview');
        if (path) {
            path.style.display = 'none';
        }
    }

    animate() {
        if (!this.isActive) return;

        const currentTime = performance.now();
        const elapsed = (currentTime - this.startTime) / 1000; // Convert to seconds
        const progress = (elapsed * this.animationSpeed) % 1; // Loop between 0 and 1

        // Update path preview
        this.updatePath(progress);

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    updatePath(progress = 0) {
        const path = document.querySelector('.path-preview');
        if (!path) return;

        // Get waypoints
        const waypoints = window.intermediatePoints || [];
        if (waypoints.length < 2) return;

        // Generate path data based on type
        let pathData;
        if (this.pathType === 'passthrough') {
            pathData = this.generatePassThroughPath(waypoints);
        } else {
            pathData = this.generateEstimatingPath(waypoints);
        }

        // Update path
        path.setAttribute('d', pathData);
        path.style.display = 'block';

        // Update control points visibility
        const controlPoints = document.querySelectorAll('.control-point');
        controlPoints.forEach(point => {
            point.style.display = this.showControlPoints ? 'block' : 'none';
        });

        // Animate along path if progress is provided
        if (progress !== undefined) {
            const length = path.getTotalLength();
            const point = path.getPointAtLength(length * progress);
            
            // Update preview rectangle position
            const previewRect = document.querySelector('.preview-rect');
            if (previewRect) {
                previewRect.style.transform = `translate(${point.x}px, ${point.y}px)`;
            }
        }
    }

    generatePassThroughPath(waypoints) {
        if (waypoints.length < 2) return '';

        let pathData = `M ${waypoints[0].x} ${waypoints[0].y}`;
        
        for (let i = 1; i < waypoints.length; i++) {
            const prev = waypoints[i - 1];
            const curr = waypoints[i];
            
            // Calculate control points for smooth curve
            const dx = curr.x - prev.x;
            const dy = curr.y - prev.y;
            
            pathData += ` C ${prev.x + dx/3} ${prev.y + dy/3}, ${curr.x - dx/3} ${curr.y - dy/3}, ${curr.x} ${curr.y}`;
        }
        
        return pathData;
    }

    generateEstimatingPath(waypoints) {
        if (waypoints.length < 2) return '';

        let pathData = `M ${waypoints[0].x} ${waypoints[0].y}`;
        
        for (let i = 1; i < waypoints.length; i++) {
            const prev = waypoints[i - 1];
            const curr = waypoints[i];
            const next = waypoints[i + 1];
            
            // Calculate control points using tension
            const cp1x = prev.x + (curr.x - prev.x) * this.tension;
            const cp1y = prev.y + (curr.y - prev.y) * this.tension;
            
            let cp2x, cp2y;
            if (next) {
                cp2x = curr.x + (next.x - curr.x) * this.tension;
                cp2y = curr.y + (next.y - curr.y) * this.tension;
            } else {
                cp2x = curr.x;
                cp2y = curr.y;
            }
            
            pathData += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
        }
        
        return pathData;
    }

    cleanup() {
        super.cleanup();
        // Remove controls from DOM
        if (this.controls && this.controls.parentNode) {
            this.controls.parentNode.removeChild(this.controls);
        }
        this.controls = null;
    }

    getState() {
        return {
            ...super.getState(),
            pathType: this.pathType,
            tension: this.tension,
            animationSpeed: this.animationSpeed,
            showControlPoints: this.showControlPoints
        };
    }
}

// Register the animation with the manager
if (window.animationManager) {
    window.animationManager.registerAnimation('path', PathAnimation);
}

// Export to window
window.PathAnimation = PathAnimation; 

function getPointOnCubicBezier(p0, cp1, cp2, p1, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    const x = mt3 * p0.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * p1.x;
    const y = mt3 * p0.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * p1.y;
    return { x, y };
}

function generateSplinePath(points, samplesPerSegment = 30) {
    if (points.length < 2) return points;

    const path = [points[0]]; // Start with the first point
    const numSegments = points.length - 1;

    for (let i = 0; i < numSegments; i++) {
        const p0 = points[Math.max(0, i - 1)]; // Previous point (or p0 if i=0)
        const p1 = points[i];                     // Start of segment
        const p2 = points[i + 1];                 // End of segment
        const p3 = points[Math.min(numSegments, i + 2)]; // Next point (or pN if i=N-1)

        const [cp1, cp2] = getControlPoints(p0, p1, p2, p3);

        // Sample points along this cubic Bezier segment
        for (let t = 1; t <= samplesPerSegment; t++) {
            const sampleT = t / samplesPerSegment;
            path.push(getPointOnCubicBezier(p1, cp1, cp2, p2, sampleT));
        }
    }
    return path;
}

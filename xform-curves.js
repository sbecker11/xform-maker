// xform-curves.js
// Central place for all path-interpolation helpers (extracted from xform-controls.js)
// Provides: getBezierPoint, getPointOnQuadraticBezier, getPointOnCatmullRom,
//           getControlPoints, generateSplinePath.
// Everything is exposed on window so existing code calls continue to work.

// --- Bezier / spline math helpers -----------------------------------------
(function(){
  if(window.getBezierPoint) return; // already loaded

  function getBezierPoint(p0,p1,p2,p3,t){
    const mt=1-t, mt2=mt*mt, mt3=mt2*mt, t2=t*t, t3=t2*t;
    return {
      x: mt3*p0.x + 3*mt2*t*p1.x + 3*mt*t2*p2.x + t3*p3.x,
      y: mt3*p0.y + 3*mt2*t*p1.y + 3*mt*t2*p2.y + t3*p3.y
    };
  }

  function getPointOnQuadraticBezier(p0,p1,p2,t){
    const mt=1-t, mt2=mt*mt, t2=t*t;
    return {
      x: mt2*p0.x + 2*mt*t*p1.x + t2*p2.x,
      y: mt2*p0.y + 2*mt*t*p1.y + t2*p2.y
    };
  }

  function getPointOnCatmullRom(p0,p1,p2,p3,t){
    const t2=t*t, t3=t2*t;
    return {
      x: 0.5*((2*p1.x)+(-p0.x+p2.x)*t +(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 +(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
      y: 0.5*((2*p1.y)+(-p0.y+p2.y)*t +(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 +(-p0.y+3*p1.y-3*p2.y+p3.y)*t3)
    };
  }

  function getControlPoints(p0,p1,p2,p3,tension=0.5){
    const d1x=(p2.x-p0.x)*tension, d1y=(p2.y-p0.y)*tension;
    const d2x=(p3.x-p1.x)*tension, d2y=(p3.y-p1.y)*tension;
    return [
      {x:p1.x+d1x/3, y:p1.y+d1y/3},
      {x:p2.x-d2x/3, y:p2.y-d2y/3}
    ];
  }

  function generateSplinePath(points,samplesPerSegment=20){
    if(!points||points.length<2) return Array.from(points);
    const path=[points[0]];
    const n=points.length;
    if(n===2){path.push(points[1]);return path;}
    const mode=window.pathInterpolationMode||'passthrough';
    const segs=n-1;
    for(let i=0;i<segs;i++){
      const i0=Math.max(0,i-1), i1=i, i2=i+1, i3=Math.min(n-1,i+2);
      const p0=points[i0], p1=points[i1], p2=points[i2], p3=points[i3];
      if(mode==='bezier'){
        // Build open-uniform cubic B-spline that uses waypoints as control points
        // We evaluate span i using control points p0..p3 and B-spline basis functions.
        for(let s=1;s<=samplesPerSegment;s++){
          const t=s/samplesPerSegment;
          const t2=t*t, t3=t2*t;
          const B0=(1-3*t+3*t2-t3)/6;
          const B1=(4-6*t2+3*t3)/6;
          const B2=(1+3*t+3*t2-3*t3)/6;
          const B3=t3/6;
          const x=B0*p0.x+B1*p1.x+B2*p2.x+B3*p3.x;
          const y=B0*p0.y+B1*p1.y+B2*p2.y+B3*p3.y;
          path.push({x,y});
        }
      }else{
        for(let s=1;s<=samplesPerSegment;s++) path.push(getPointOnCatmullRom(p0,p1,p2,p3,s/samplesPerSegment));
      }
    }
    path.push(points[n-1]);
    return path;
  }

  // --- expose ---
  Object.assign(window,{
    getBezierPoint,
    getPointOnQuadraticBezier,
    getPointOnCatmullRom,
    getControlPoints,
    generateSplinePath
  });
})(); 
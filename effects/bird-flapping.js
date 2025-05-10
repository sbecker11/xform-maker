https://www.google.com/search?q=how+to+render+a+piece+of+paper+folded+in+half+flapping+like+bird+wings+in+javascript&rlz=1C5MACD_enUS1022US1022&oq=how+to+render+a+piece+of+paper+folded+in+half+flapping+like+bird+wings+in+javascript&gs_lcrp=EgZjaHJvbWUyBggAEEUYOdIBCTU1ODM3ajBqN6gCALACAA&sourceid=chrome&ie=UTF-8


const canvas = document.getElementById('paperCanvas');
const ctx = canvas.getContext('2d');

const paper = {
  width: 100,
  height: 50,
  color: '#f0f0f0',
  flapAmplitude: Math.PI / 6,
  flapFrequency: 2,
  time: 0
};

function drawPaper() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = paper.color;
  ctx.beginPath();
  ctx.translate(canvas.width / 2, canvas.height / 2);

  const angle = Math.sin(paper.time * paper.flapFrequency) * paper.flapAmplitude;

  ctx.rotate(angle);
  ctx.fillRect(-paper.width / 2, 0, paper.width / 2, paper.height);
  ctx.rotate(-angle);

  ctx.rotate(-angle);
  ctx.fillRect(0, 0, paper.width / 2, paper.height);
  ctx.rotate(angle);
  
  ctx.closePath();
  ctx.fill();
  ctx.translate(-canvas.width / 2, -canvas.height / 2);
}

function animate() {
  paper.time += 0.02;
  drawPaper();
  requestAnimationFrame(animate);
}

animate();

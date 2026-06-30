export const EC = {
  H:  { bg:"#FFFFFF", bd:"#999999", tx:"#222222" },
  C:  { bg:"#333333", bd:"#111111", tx:"#FFFFFF" },
  N:  { bg:"#3355CC", bd:"#1133AA", tx:"#FFFFFF" },
  O:  { bg:"#CC2200", bd:"#AA1100", tx:"#FFFFFF" },
  S:  { bg:"#DDCC00", bd:"#BBAA00", tx:"#222222" },
  Cl: { bg:"#22AA22", bd:"#118811", tx:"#FFFFFF" },
  Na: { bg:"#AA44CC", bd:"#882299", tx:"#FFFFFF" },
  Ca: { bg:"#5588AA", bd:"#336688", tx:"#FFFFFF" },
  P:  { bg:"#FF8800", bd:"#CC6600", tx:"#FFFFFF" },
  _:  { bg:"#777777", bd:"#444444", tx:"#FFFFFF" },
};
export function col(sym){ return EC[sym]||EC._; }

// 回転を適用した座標を返す
export function rotatePoint(x, y, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return [x * cos - y * sin, x * sin + y * cos];
}

function getRotatedAtoms(atoms, rotation) {
  if (!rotation) return atoms;
  return atoms.map(a => {
    const [rx, ry] = rotatePoint(a.x, a.y, rotation);
    return { ...a, x: rx, y: ry };
  });
}

function calcTransform(canvas, atoms){
  const W=canvas.width, H=canvas.height;
  const xs=atoms.map(a=>a.x), ys=atoms.map(a=>a.y);
  const mnX=Math.min(...xs), mxX=Math.max(...xs);
  const mnY=Math.min(...ys), mxY=Math.max(...ys);
  const pad=60; // 原子の半径分の余白を確保
  const rX=mxX-mnX||1, rY=mxY-mnY||1;
  const sc=Math.min((W-pad*2)/rX,(H-pad*2)/rY, 50); // 最大スケール制限（小さい分子が拡大しすぎない）
  const ox=(W-rX*sc)/2-mnX*sc;
  const oy=(H-rY*sc)/2-mnY*sc;
  return {sc,ox,oy};
}

export function toScreen(canvas, atoms, ax, ay, rotation=0){
  const rotated = rotation ? rotatePoint(ax, ay, rotation) : [ax, ay];
  const allRotated = getRotatedAtoms(atoms, rotation);
  const {sc,ox,oy}=calcTransform(canvas, allRotated);
  return [rotated[0]*sc+ox, rotated[1]*sc+oy];
}

export function hitTest(canvas, atoms, placedMap, clientX, clientY, rotation=0){
  if(!canvas) return null;
  const rect=canvas.getBoundingClientRect();
  const cx=(clientX-rect.left)*(canvas.width/rect.width);
  const cy=(clientY-rect.top)*(canvas.height/rect.height);
  const rotatedAtoms = getRotatedAtoms(atoms, rotation);
  const {sc,ox,oy}=calcTransform(canvas, rotatedAtoms);
  let best=null, bestD=999;
  rotatedAtoms.forEach((a,idx)=>{
    const origAid = atoms[idx].aid;
    if(placedMap[origAid]) return;
    const sx=a.x*sc+ox, sy=a.y*sc+oy;
    const r=atoms[idx].symbol==="H"?13:17;
    const d=Math.sqrt((cx-sx)**2+(cy-sy)**2);
    if(d<r+12&&d<bestD){bestD=d;best=origAid;}
  });
  return best;
}

export function drawStructure(canvas, atoms, bonds, placedMap, focusAid, wrongAid, rotation=0){
  if(!canvas||!atoms.length) return;
  const ctx=canvas.getContext("2d");
  const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);

  const rotatedAtoms = getRotatedAtoms(atoms, rotation);
  const {sc,ox,oy}=calcTransform(canvas, rotatedAtoms);
  const s=(x,y)=>[x*sc+ox,y*sc+oy];

  // aid -> rotated座標のマップ
  const posByAid = {};
  atoms.forEach((a,idx) => {
    posByAid[a.aid] = rotatedAtoms[idx];
  });

  // 結合線
  bonds.forEach(b=>{
    const p1=posByAid[b.from];
    const p2=posByAid[b.to];
    if(!p1||!p2) return;
    const [x1,y1]=s(p1.x,p1.y),[x2,y2]=s(p2.x,p2.y);
    const ord=b.order||1;
    const dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy)||1;
    const nx=-dy/len,ny=dx/len,gap=4;
    ctx.strokeStyle="#4A7A50";ctx.lineWidth=2;
    for(let i=0;i<ord;i++){
      const off=(i-(ord-1)/2)*gap;
      ctx.beginPath();ctx.moveTo(x1+nx*off,y1+ny*off);ctx.lineTo(x2+nx*off,y2+ny*off);ctx.stroke();
    }
  });

  // 原子
  atoms.forEach((a,idx)=>{
    const rp = rotatedAtoms[idx];
    const [sx,sy]=s(rp.x,rp.y);
    const c=col(a.symbol);
    const r=a.symbol==="H"?13:17;
    const placed=placedMap[a.aid];
    const isFocus=a.aid===focusAid;
    const isWrong=a.aid===wrongAid;

    if(placed){
      ctx.beginPath();ctx.arc(sx,sy,r+5,0,Math.PI*2);
      ctx.fillStyle="rgba(80,255,100,0.15)";ctx.fill();
      ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);
      ctx.fillStyle=c.bg;ctx.fill();
      ctx.strokeStyle=c.bd;ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle=c.tx;
      ctx.font=`bold ${a.symbol.length>1?10:13}px monospace`;
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillText(a.symbol,sx,sy);
    } else if(isWrong){
      ctx.beginPath();ctx.arc(sx,sy,r+6,0,Math.PI*2);
      ctx.fillStyle="rgba(255,60,30,0.35)";ctx.fill();
      ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);
      ctx.fillStyle="#3A0A00";ctx.fill();
      ctx.strokeStyle="#FF4422";ctx.lineWidth=2.5;ctx.stroke();
      ctx.fillStyle="#FF8866";ctx.font="bold 12px monospace";
      ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("✗",sx,sy);
    } else if(isFocus){
      ctx.beginPath();ctx.arc(sx,sy,r+7,0,Math.PI*2);
      ctx.fillStyle="rgba(255,230,50,0.3)";ctx.fill();
      ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);
      ctx.fillStyle="#1E1A00";ctx.fill();
      ctx.strokeStyle="#FFDD33";ctx.lineWidth=2.5;ctx.stroke();
      ctx.fillStyle="#FFEE44";ctx.font="bold 14px monospace";
      ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("?",sx,sy);
    } else {
      ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);
      ctx.fillStyle="#1A2C1A";ctx.fill();
      ctx.strokeStyle="#3A5A3C";ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle="#4A7A4C";ctx.font="bold 13px monospace";
      ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("?",sx,sy);
    }
  });
}

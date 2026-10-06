const $=id=>document.getElementById(id), W=1122, H=1402;
const cv=$('cv'), ctx=cv.getContext('2d');
const bg=new Image(); bg.src="assets/template.jpg";
let photo=null, cut=null, useBg=false, tok=0, cutP=null, mdl=null, lastURL='', zoom=1, pan={x:0,y:0};

/* views */
function view(v){
  $('create').style.display=v==='create'?'block':'none';
  $('result').style.display=v==='result'?'block':'none';
  scrollTo(0,0);
}
$('again').onclick=()=>{$('dlmsg').textContent='';view('create')};

/* photo upload */
const drop=$('drop');
drop.onclick=()=>$('file').click();
['dragover','dragenter'].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>load(e.dataTransfer.files[0]));
$('file').onchange=e=>load(e.target.files[0]);
function load(f){
  if(!f) return;
  if(!/^image\/(png|jpe?g)$/.test(f.type)) return $('err').textContent='Please upload a JPG or PNG image.';
  if(f.size>5*1024*1024) return $('err').textContent='Photo must be under 5MB.';
  const r=new FileReader();
  r.onload=()=>{const im=new Image();im.onload=()=>{photo=im;zoom=1;pan={x:0,y:0};$('zm').value=1;drop.style.display='none';$('editor').hidden=false;$('err').textContent='';cutP=makeCut()};im.src=r.result};
  r.readAsDataURL(f);
}

/* crop / reposition editor */
const ed=$('ed'), ectx=ed.getContext('2d');
function drawTheme(c,x,y,w,h){
  c.save(); c.beginPath(); c.rect(x,y,w,h); c.clip();
  let s=7; const r=()=>(s=(s*16807)%2147483647)/2147483647;
  const g=c.createRadialGradient(x+w/2,y+h*.38,0,x+w/2,y+h*.38,h*.95);
  g.addColorStop(0,'#5b32b8'); g.addColorStop(.45,'#24135e'); g.addColorStop(1,'#060416'); c.fillStyle=g; c.fillRect(x,y,w,h);
  c.lineCap='round';
  for(let i=0;i<9;i++){ // purple energy streaks
    let px=x+r()*w, py=y+h*.9; c.beginPath(); c.moveTo(px,py);
    for(let j=0;j<6;j++){px+=(r()-.5)*w*.18; py-=h*.15; c.lineTo(px,py)}
    c.strokeStyle='rgba(192,132,252,'+(.25+r()*.3)+')'; c.lineWidth=1+r()*2; c.shadowColor='#a855f7'; c.shadowBlur=12; c.stroke();
  }
  c.shadowBlur=0;
  for(let i=0;i<55;i++){c.fillStyle='rgba(255,255,255,'+(.3+r()*.6)+')';c.beginPath();c.arc(x+r()*w,y+r()*h,.8+r()*2.4,0,7);c.fill()}
  const f=c.createLinearGradient(0,y+h*.7,0,y+h); f.addColorStop(0,'rgba(170,210,255,0)'); f.addColorStop(1,'rgba(170,210,255,.28)'); c.fillStyle=f; c.fillRect(x,y,w,h);
  c.restore();
}
function placePhoto(c,x,y,w,h){
  const s=(useBg&&cut)?cut:photo;
  if(s===cut) drawTheme(c,x,y,w,h);
  const k=Math.max(w/s.width,h/s.height)*zoom, iw=s.width*k, ih=s.height*k;
  const mx=(iw-w)/2, my=(ih-h)/2;
  pan.x=Math.max(-mx/w,Math.min(mx/w,pan.x)); pan.y=Math.max(-my/h,Math.min(my/h,pan.y));
  c.drawImage(s,x+(w-iw)/2+pan.x*w,y+(h-ih)/2+pan.y*h,iw,ih);
}
async function getModel(){
  if(mdl) return mdl; await tf.ready();
  mdl=await tf.loadGraphModel('models/rvm.json');
  return mdl;
}
async function makeCut(){
  const my=++tok, st=$('bgst'), cb=$('usebg'); cut=null; st.className='';
  if(!useBg||!photo){st.textContent='';cb.disabled=false;renderEd();return}
  renderEd(); cb.disabled=true; st.className='busy'; st.textContent='Removing background… first time can take a few seconds';
  try{
    const m=await getModel();
    const sc=Math.min(1,768/Math.max(photo.width,photo.height));
    const w=Math.max(64,Math.round(photo.width*sc/16)*16), h=Math.max(64,Math.round(photo.height*sc/16)*16);
    const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(photo,0,0,w,h);
    const src=tf.tidy(()=>tf.browser.fromPixels(c).toFloat().div(255).expandDims(0));
    const ds=tf.scalar(Math.min(1,384/Math.max(w,h)));
    let r=[0,1,2,3].map(()=>tf.zeros([1,1,1,1])), pha=null, fgr=null;
    for(let i=0;i<3;i++){ // a few passes let the matting model settle on a still photo
      const o=await m.executeAsync({src,r1i:r[0],r2i:r[1],r3i:r[2],r4i:r[3],downsample_ratio:ds},['Identity_1:0','Identity:0','Identity_2:0','Identity_3:0','Identity_4:0','Identity_5:0']);
      r.forEach(t=>t.dispose()); if(pha){pha.dispose();fgr.dispose()}
      pha=o[0]; fgr=o[1]; r=o.slice(2);
    }
    const P=await pha.data(), Fg=await fgr.data();
    [src,ds,pha,fgr,...r].forEach(t=>t.dispose());
    const id=x.getImageData(0,0,w,h), d=id.data;
    for(let i=0;i<w*h;i++){
      const a=Math.max(0,Math.min(1,(P[i]-.12)/.78)), k=i*4;
      const wt=Math.max(0,Math.min(1,(a-.85)/.15)), ws=wt*wt*(3-2*wt); // edges use the model's de-fringed colours
      for(let j=0;j<3;j++){const f=Math.max(0,Math.min(1,Fg[i*3+j]))*255; d[k+j]=d[k+j]*ws+f*(1-ws)}
      d[k+3]=a*255;
    }
    x.putImageData(id,0,0);
    if(my!==tok) return; cut=c; st.className=''; st.textContent='Background changed to winter theme ✓';
  }catch(e){ if(my===tok){st.className='';st.textContent='Background change is not available on this device, using your original photo.'} }
  cb.disabled=false; renderEd();
}
$('usebg').onchange=e=>{useBg=e.target.checked; if(useBg&&!cut&&photo) cutP=makeCut(); else {if(!useBg)$('bgst').textContent=''; renderEd()}};
function renderEd(){ectx.fillStyle='#05070d';ectx.fillRect(0,0,ed.width,ed.height);placePhoto(ectx,0,0,ed.width,ed.height)}
function setZoom(z){zoom=Math.max(1,Math.min(4,z));$('zm').value=zoom;renderEd()}
function nudge(dx,dy){pan.x+=dx;pan.y+=dy;renderEd()}
$('zm').oninput=e=>setZoom(+e.target.value);
$('zi').onclick=()=>setZoom(zoom+.15); $('zo').onclick=()=>setZoom(zoom-.15);
$('mu').onclick=()=>nudge(0,-.04); $('md').onclick=()=>nudge(0,.04);
$('ml').onclick=()=>nudge(-.04,0); $('mr').onclick=()=>nudge(.04,0);
$('rst').onclick=()=>{pan={x:0,y:0};setZoom(1)};
$('chg').onclick=()=>$('file').click();
const ptrs=new Map(); let pd=0;
ed.addEventListener('pointerdown',e=>{ed.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});pd=0;ed.style.cursor='grabbing'});
ed.addEventListener('pointermove',e=>{
  const p=ptrs.get(e.pointerId); if(!p||!photo) return;
  const r=ed.getBoundingClientRect();
  if(ptrs.size===2){
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const [a,b]=[...ptrs.values()], d=Math.hypot(a.x-b.x,a.y-b.y);
    if(pd) setZoom(zoom*d/pd); pd=d; return;
  }
  nudge((e.clientX-p.x)/r.width,(e.clientY-p.y)/r.height);
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
});
['pointerup','pointercancel'].forEach(n=>ed.addEventListener(n,e=>{ptrs.delete(e.pointerId);pd=0;ed.style.cursor='grab'}));
ed.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom*(e.deltaY<0?1.08:.93))},{passive:false});

/* drawing */
function fit(text,x,y,maxW,size,font){
  let s=size; do{ctx.font=`700 ${s}px ${font}`;s-=2}while(ctx.measureText(text).width>maxW&&s>16);
  ctx.fillText(text,x,y);
}
function draw(d){
  const F='Rajdhani,"Segoe UI",Arial,sans-serif';
  ctx.clearRect(0,0,W,H); ctx.drawImage(bg,0,0,W,H);
  // photo
  const px=412,py=682,pw=316,ph=312;
  ctx.save(); ctx.beginPath(); ctx.roundRect(px,py,pw,ph,10); ctx.clip();
  ctx.fillStyle='#05070d'; ctx.fillRect(px,py,pw,ph);
  placePhoto(ctx,px,py,pw,ph);
  ctx.restore();
  // fields
  ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillStyle='#fff'; ctx.shadowColor='#a855f7'; ctx.shadowBlur=10;
  fit(d.name,445,1104,420,46,F); fit(d.device,445,1178,420,46,F); fit(d.eid,445,1251,420,46,F);
  ctx.shadowBlur=0;
}
/* generate */
$('gen').onclick=async()=>{
  const d={name:$('name').value.trim(),device:$('device').value.trim(),eid:$('eid').value.trim()};
  if(!photo) return $('err').textContent='Please upload your photo.';
  if(!d.name||!d.device||!d.eid) return $('err').textContent='Please fill in name, device and eFootball ID.';
  $('err').textContent='';
  if(useBg&&!cut&&cutP) await cutP;
  try{await Promise.all([document.fonts.load('700 40px Rajdhani'),bg.decode()])}catch(e){}
  draw(d);
  lastURL=cv.toDataURL('image/png'); $('out').src=lastURL;
  view('result');
};

/* save / share */
function dataToBlob(u){const [h,b]=u.split(','),m=h.match(/:(.*?);/)[1],s=atob(b),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new Blob([a],{type:m})}
$('save').onclick=()=>{
  const url=URL.createObjectURL(dataToBlob(lastURL)), a=document.createElement('a');
  a.href=url; a.download='gen-z-player-card.png'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  $('dlmsg').textContent='Card downloaded ✓ Check your Downloads folder. To save it in your Photos/Gallery, press and hold the card above and choose "Save image".';
};
try{ if(navigator.canShare&&navigator.canShare({files:[new File([new Blob(['x'])],'a.png',{type:'image/png'})]})) $('share').hidden=false }catch(e){}
$('share').onclick=async()=>{
  try{ await navigator.share({files:[new File([dataToBlob(lastURL)],'gen-z-player-card.png',{type:'image/png'})],title:'Gen-Z Gamers Player Card'}) }catch(e){}
};

/* no card history is stored; clear anything saved by earlier versions */
try{localStorage.removeItem('gz_cards')}catch(e){}

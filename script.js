/* ══════════════════════════════════════════════
   AUDIO — Web Audio API approach for guaranteed
   playback after user interaction
══════════════════════════════════════════════ */
let audioCtx = null;
let audioBuffer = null;
let audioSource = null;
let audioUnlocked = false;

// Preload the audio into AudioContext buffer on first interaction
function unlockAudio(){
  if(audioUnlocked) return;
  audioUnlocked = true;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const el = document.getElementById('horror-audio');
    // fetch the base64 src and decode it
    fetch(el.src)
      .then(r => r.arrayBuffer())
      .then(buf => audioCtx.decodeAudioData(buf))
      .then(decoded => { audioBuffer = decoded; })
      .catch(() => {
        // fallback: just use the HTML audio element
        audioBuffer = 'USE_ELEMENT';
      });
  } catch(e){
    audioBuffer = 'USE_ELEMENT';
  }
}

function playHorrorAudio(){
  const el = document.getElementById('horror-audio');
  if(audioBuffer && audioBuffer !== 'USE_ELEMENT' && audioCtx){
    try {
      if(audioCtx.state === 'suspended') audioCtx.resume();
      if(audioSource){ try{audioSource.stop()}catch(e){} }
      audioSource = audioCtx.createBufferSource();
      audioSource.buffer = audioBuffer;
      audioSource.connect(audioCtx.destination);
      audioSource.start(0);
    } catch(e){
      el.currentTime=0; el.volume=1; el.play().catch(()=>{});
    }
  } else {
    // fallback to HTML audio element
    el.currentTime=0; el.volume=1;
    el.play().catch(()=>{});
  }
}

function stopHorrorAudio(){
  if(audioSource){ try{audioSource.stop()}catch(e){} audioSource=null; }
  const el=document.getElementById('horror-audio');
  el.pause(); el.currentTime=0;
}

// Unlock on any first interaction
document.addEventListener('click', unlockAudio, {once:true});
document.addEventListener('touchstart', unlockAudio, {once:true});
document.addEventListener('keydown', unlockAudio, {once:true});

/* ══════════════════════════════════════════════
   QUESTIONS — correct answers verified
   ans index is 0-based into opts array
══════════════════════════════════════════════ */
const QS=[
  // 2+2 = 4 → index 1
  {q:"What is 2 + 2?",
   opts:["3","4","5","6"],
   ans:1},
  // Sky is Blue → index 2
  {q:"What colour is the sky on a clear day?",
   opts:["Green","Red","Blue","Yellow"],
   ans:2},
  // Days in a week = 7 → index 2
  {q:"How many days are there in a week?",
   opts:["5","6","7","8"],
   ans:2},
  // 10×10 = 100 → index 1, DRIFT question
  {q:"What is 10 × 10?",
   opts:["10","100","110","1000"],
   ans:1, drift:true},
  // Closest planet to Sun = Mercury → index 2, GLITCH question
  {q:"Which planet is closest to the Sun?",
   opts:["Earth","Venus","Mercury","Mars"],
   ans:2, glitch:true},
  // Capital of France = Paris → index 3
  {q:"What is the capital of France?",
   opts:["Berlin","London","Rome","Paris"],
   ans:3}
];

/* ══ STATE ══ */
let cur=0, score=0, sel=null, busy=false;
let driftRaf=null, glitchIvs=[], autoPickIv=null;
let userPicked=false, awaitingNext=false;

/* ══════════════════════════════════════════════
   RENDER
══════════════════════════════════════════════ */
function render(){
  const q=QS[cur];
  document.getElementById('pbar').style.width=(cur/QS.length*100)+'%';
  document.getElementById('q-num').textContent=`Question ${cur+1} of ${QS.length}`;
  document.getElementById('q-score').textContent=`Score: ${score}`;
  document.getElementById('q-text').textContent=q.q;

  const opts=document.getElementById('q-opts');
  opts.innerHTML='';
  ['A','B','C','D'].forEach((L,i)=>{
    const b=document.createElement('button');
    b.className='opt-btn';
    b.dataset.idx=i;
    b.innerHTML=`<span class="opt-letter">${L}</span><span class="opt-label">${q.opts[i]}</span><span class="check-icon"></span>`;
    b.onclick=()=>pick(i,true);
    opts.appendChild(b);
  });

  sel=null; busy=false; userPicked=false; awaitingNext=false;
  const nb=document.getElementById('next-btn');
  nb.classList.remove('visible');
  nb.disabled=false;
  nb.textContent='Continue →';

  if(q.drift) setTimeout(startDrift,600);
  if(q.glitch) setTimeout(startSubtleGlitch,500);
}

/* ══════════════════════════════════════════════
   PICK — with correct/wrong feedback
══════════════════════════════════════════════ */
function pick(i, isUser=false){
  if(busy || awaitingNext) return;
  if(isUser) userPicked=true;
  sel=i;

  const btns=document.querySelectorAll('.opt-btn');
  btns.forEach((b,j)=>{
    b.classList.remove('selected','correct','wrong');
    b.querySelector('.check-icon').textContent='';
    if(j===i) b.classList.add('selected');
  });

  // Show feedback immediately when user clicks
  if(isUser){
    const correct=QS[cur].ans;
    // disable all buttons while showing feedback
    btns.forEach(b=>b.disabled=true);
    awaitingNext=true;

    setTimeout(()=>{
      const selBtn=btns[i];
      const corrBtn=btns[correct];

      if(i===correct){
        selBtn.classList.remove('selected');
        selBtn.classList.add('correct');
        selBtn.querySelector('.check-icon').textContent='✓';
      } else {
        selBtn.classList.remove('selected');
        selBtn.classList.add('wrong');
        selBtn.querySelector('.check-icon').textContent='✗';
        corrBtn.classList.add('correct');
        corrBtn.querySelector('.check-icon').textContent='✓';
      }

      // Show continue after feedback
      setTimeout(()=>{
        document.getElementById('next-btn').classList.add('visible');
      }, 600);
    }, 120);
  } else {
    // Auto-pick: just highlight, no feedback
    document.getElementById('next-btn').classList.add('visible');
  }
}

/* ══════════════════════════════════════════════
   NEXT
══════════════════════════════════════════════ */
function handleNext(){
  if(sel===null || busy) return;
  busy=true;
  if(autoPickIv){clearInterval(autoPickIv);autoPickIv=null;}
  document.getElementById('next-btn').disabled=true;
  const q=QS[cur];
  if(sel===q.ans) score++;

  if(q.drift){
    stopDrift();
    setTimeout(()=>document.getElementById('safe-modal').classList.add('on'),450);
    return;
  }

  cur++;
  if(cur>=QS.length){ setTimeout(launchChaos,200); return; }
  crossfade();
}

function crossfade(){
  const card=document.getElementById('quiz-card');
  card.style.transition='opacity .25s,transform .25s';
  card.style.opacity='0'; card.style.transform='translateY(-8px)';
  setTimeout(()=>{
    render();
    card.style.opacity='1'; card.style.transform='translateY(0)';
    setTimeout(()=>{ card.style.transition=''; },280);
  },270);
}

/* ══════════════════════════════════════════════
   Q4 — EXTREME WOBBLE DRIFT
   Three irrational-ratio sine waves + rotation
══════════════════════════════════════════════ */
function startDrift(){
  const card=document.getElementById('quiz-card');
  const rect=card.getBoundingClientRect();
  const vw=window.innerWidth, vh=window.innerHeight;
  const cw=rect.width, ch=rect.height;

  card.style.position='fixed';
  card.style.left=rect.left+'px';
  card.style.top=rect.top+'px';
  card.style.width=cw+'px';
  card.style.margin='0'; card.style.transition='none';

  const cx=rect.left, cy=rect.top;
  const mX=Math.max(40, Math.min((vw-cw)/2-8, vw*0.40));
  const mY=Math.max(28, Math.min((vh-ch)/2-8, vh*0.32));

  let t=0, amp=0;
  function tick(){
    t+=0.014; // fast, chaotic
    amp=Math.min(1, amp+0.0045);
    const ox=amp*(
      mX*0.55*Math.sin(0.41*t)
     +mX*0.30*Math.sin(1.13*t+1.3)
     +mX*0.15*Math.sin(2.71*t+0.7)
    );
    const oy=amp*(
      mY*0.55*Math.sin(0.59*t+1.1)
     +mY*0.30*Math.sin(1.37*t+2.4)
     +mY*0.15*Math.sin(3.07*t+3.1)
    );
    const rot=amp*6*Math.sin(0.7*t+0.5);
    card.style.left=(cx+ox)+'px';
    card.style.top=(cy+oy)+'px';
    card.style.transform=`rotate(${rot}deg)`;
    driftRaf=requestAnimationFrame(tick);
  }
  driftRaf=requestAnimationFrame(tick);
}

function stopDrift(){
  if(driftRaf){cancelAnimationFrame(driftRaf);driftRaf=null;}
  const card=document.getElementById('quiz-card');
  card.style.transition='left .4s ease,top .4s ease,transform .4s ease';
  setTimeout(()=>{
    card.style.position=''; card.style.left=''; card.style.top='';
    card.style.width=''; card.style.margin=''; card.style.transform='';
    card.style.transition='';
  },420);
}

/* ══════════════════════════════════════════════
   SAFE MODE
══════════════════════════════════════════════ */
function enableSafeMode(){
  document.getElementById('safe-modal').classList.remove('on');
  // Brief "stabilising" flash
  document.body.style.filter='brightness(1.35) contrast(.8)';
  setTimeout(()=>{
    document.body.style.filter='';
    // CREEPY TRANSFORMATION
    document.body.classList.add('creepy');
    document.getElementById('scanlines').classList.add('on');
    document.getElementById('vignette').classList.add('on');
    startGlitchIntervals();
    startAutoPick();
    cur++;
    setTimeout(crossfade, 750);
  },600);
}

/* ══ AUTO-PICK ══ */
function startAutoPick(){
  function doAutoPick(){
    if(userPicked||busy||awaitingNext) return;
    const btns=document.querySelectorAll('.opt-btn');
    if(!btns.length) return;
    const rnd=Math.floor(Math.random()*btns.length);
    pick(rnd, false);
  }
  autoPickIv=setInterval(()=>{ if(!busy) doAutoPick(); }, 1400+Math.random()*800);
}

/* ══════════════════════════════════════════════
   GLITCH SYSTEM
══════════════════════════════════════════════ */
function startGlitchIntervals(){
  glitchIvs.push(setInterval(()=>{
    if(Math.random()<.4) glitchLine();
    if(Math.random()<.22) bgFlash();
    if(Math.random()<.18) screenFlashWhite();
    if(Math.random()<.08) screenFlashRed();
  },1200));
}

function startSubtleGlitch(){
  glitchLine();
  glitchIvs.push(setInterval(()=>{
    if(Math.random()<.75) glitchLine();
    if(Math.random()<.4) distortChar();
    if(Math.random()<.25) screenFlashWhite();
    if(Math.random()<.15) screenFlashRed();
    if(Math.random()<.1) rgbGlitch();
  },700));
}

function glitchLine(){
  const el=document.getElementById('gline');
  el.style.top=(3+Math.random()*94)+'%';
  el.style.background=Math.random()>.5?'rgba(0,200,255,.9)':'rgba(255,0,80,.8)';
  el.style.opacity='1';
  el.style.height=Math.random()>.6?'3px':'1px';
  setTimeout(()=>{el.style.opacity='0';},35+Math.random()*70);
}

function bgFlash(){
  document.body.style.backgroundColor='#200000';
  setTimeout(()=>{ document.body.style.backgroundColor=''; },90);
}

function screenFlashWhite(){
  const f=document.getElementById('sflash');
  f.style.transition='none'; f.style.opacity='.7';
  requestAnimationFrame(()=>{ f.style.transition='opacity .15s'; f.style.opacity='0'; });
}

function screenFlashRed(){
  const f=document.getElementById('rflash');
  f.style.transition='none'; f.style.opacity='.5';
  requestAnimationFrame(()=>{ f.style.transition='opacity .12s'; f.style.opacity='0'; });
}

function distortChar(){
  const el=document.getElementById('q-text');
  const orig=QS[cur]?.q; if(!el||!orig) return;
  const glyphs='░▒▓│┼╬╪╫▐▌█▄▀■□▪▫╗╔═╩╦╠╬';
  const arr=orig.split('');
  const count=1+Math.floor(Math.random()*4);
  for(let k=0;k<count;k++){
    arr[Math.floor(Math.random()*arr.length)]=glyphs[Math.floor(Math.random()*glyphs.length)];
  }
  el.textContent=arr.join('');
  el.classList.add('jitter');
  setTimeout(()=>{ el.textContent=orig; el.classList.remove('jitter'); },80);
}

function rgbGlitch(){
  const el=document.getElementById('q-text');
  if(!el) return;
  el.style.animation='rgbGlitch .35s ease';
  setTimeout(()=>{ el.style.animation=''; },380);
}

function killGlitch(){
  glitchIvs.forEach(iv=>clearInterval(iv)); glitchIvs=[];
  if(autoPickIv){clearInterval(autoPickIv);autoPickIv=null;}
  document.getElementById('scanlines').classList.remove('on');
  document.getElementById('vignette').classList.remove('on');
  document.body.classList.remove('creepy');
  document.getElementById('gline').style.opacity='0';
  document.body.style.backgroundColor='';
  document.body.style.filter='';
}

/* ══════════════════════════════════════════════
   HORROR IMAGES
══════════════════════════════════════════════ */
const IMG_SRC='data:image/jpeg;base64,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';

const HORROR_SLOTS=[
  {top:'4%', left:'2%'},    {top:'4%', right:'2%'},
  {top:'3%', left:'36%'},   {bottom:'4%',left:'2%'},
  {bottom:'4%',right:'2%'}, {top:'40%',left:'1%'},
  {top:'40%',right:'1%'},   {bottom:'4%',left:'35%'},
  {top:'22%',left:'18%'},   {top:'18%',right:'15%'},
  {top:'55%',left:'55%'},   {top:'28%',left:'60%'},
];

let horrorRefreshIv=null;

function spawnHorrorImages(){
  const layer=document.getElementById('horror-layer');
  layer.classList.add('on'); layer.innerHTML='';

  let c=0;
  const sp=setInterval(()=>{
    if(c>=12){clearInterval(sp);return;}
    addHorrorImg(layer,c);
    if(c%2===0) screenFlashRed();
    glitchLine();
    c++;
  },150);

  horrorRefreshIv=setInterval(()=>{
    layer.innerHTML='';
    for(let i=0;i<8;i++) setTimeout(()=>{ addHorrorImg(layer,Math.floor(Math.random()*12)); glitchLine(); }, i*170);
    screenFlashRed();
  },1600);
}

function addHorrorImg(layer,idx){
  const slot=HORROR_SLOTS[idx % HORROR_SLOTS.length];
  const rot=(Math.random()*22-11).toFixed(1)+'deg';
  const vw=window.innerWidth;
  const size=Math.max(90, Math.min(Math.floor(Math.random()*180+90), Math.floor(vw*0.27)));
  const img=document.createElement('img');
  img.src=IMG_SRC;
  img.className='horror-img';
  img.style.cssText=`width:${size}px;height:${size}px;--rot:${rot};`;
  Object.entries(slot).forEach(([k,v])=>img.style[k]=v);
  const gc=['#f00','#f0f','#0ff','#f80'][idx%4];
  img.style.boxShadow=`0 0 20px ${gc},0 0 50px rgba(255,0,0,.5)`;
  img.style.animation=`horrorPop ${0.65+Math.random()*.5}s ease ${(idx*0.06).toFixed(2)}s forwards`;
  layer.appendChild(img);
}

function stopHorrorImages(){
  if(horrorRefreshIv){clearInterval(horrorRefreshIv);horrorRefreshIv=null;}
  const layer=document.getElementById('horror-layer');
  layer.classList.remove('on'); layer.innerHTML='';
}

/* ══════════════════════════════════════════════
   CHAOS SEQUENCE
══════════════════════════════════════════════ */
const POPUPS=[
  {icon:'🛡️',title:'Windows Security Alert',
   body:'<strong>Threat: Trojan:Win32/Zpevdo.B</strong>A program is attempting to modify protected system files.',
   btns:['Quarantine','Ignore'],pos:{top:'8%',left:'2%'},delay:0},
  {icon:'📋',title:'Registry Editor',
   body:'<strong>Accessing registry…</strong>HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon',
   btns:['Allow','Deny'],pos:{top:'9%',right:'2%'},delay:320},
  {icon:'🔄',title:'Windows Update',
   body:'<strong>Downloading security patch…</strong>KB5034441 — Critical (104 MB). Do not restart.',
   btns:['OK'],pos:{top:'58%',left:'3%'},delay:580},
  {icon:'🌐',title:'Network Monitor',
   body:'<strong>Suspicious connection blocked</strong>quiz_session.exe → 94.102.49.xx:4444',
   btns:['Block','Details'],pos:{top:'54%',right:'3%'},delay:780},
  {icon:'⚙️',title:'Task Scheduler',
   body:'<strong>Startup task registered</strong>\\Microsoft\\Windows\\QuizSync — runs on login.',
   btns:['View','Dismiss'],pos:{top:'34%',left:'30%'},delay:1000},
];

const CMDS=[
  {pos:{bottom:'3%',left:'2%'},delay:220,lines:[
    {t:0,cls:'cg',v:'Microsoft Windows [Version 10.0.22621.3527]'},
    {t:200,cls:'cy',v:'Initializing user scan…'},
    {t:480,cls:'cr2',v:'[!] Active session found: 1 profile'},
    {t:720,cls:'cy',v:'Accessing HKLM\\SESSION\\tokens…'},
    {t:980,cls:'cr2',v:'[!] Uploading session token [===== 100%]'},
    {t:1250,cls:'cn',v:'[+] Exfil complete.'},
  ]},
  {pos:{top:'2%',left:'33%'},delay:480,lines:[
    {t:0,cls:'cg',v:'Administrator: cmd.exe'},
    {t:200,cls:'cc2',v:'C:\\> sfc /scannow'},
    {t:460,cls:'cy',v:'Verification 22% complete.'},
    {t:780,cls:'cy',v:'Verification 67% complete.'},
    {t:1080,cls:'cr2',v:'[!] quiz_input.dat — INTEGRITY VIOLATION'},
    {t:1320,cls:'cn',v:'Corruption logged.'},
  ]},
  {pos:{bottom:'3%',right:'2%'},delay:740,lines:[
    {t:0,cls:'cm',v:'PS C:\\> Invoke-WebRequest -Uri "cdn.quizsvc.net"'},
    {t:300,cls:'cy',v:'StatusCode: 200 OK'},
    {t:580,cls:'cr2',v:'[!] Writing payload to %APPDATA%…'},
    {t:880,cls:'cn',v:'[+] quiz_helper_v2.3 installed.'},
  ]},
];

function launchChaos(){
  killGlitch();
  screenFlashWhite(); shakeBody();

  spawnHorrorImages();
  playHorrorAudio();

  const layer=document.getElementById('chaos-layer');
  layer.classList.add('on');
  POPUPS.forEach(p=>setTimeout(()=>{spawnPopup(p,layer);shakeBody();},p.delay));
  CMDS.forEach(c=>setTimeout(()=>spawnCMD(c,layer),c.delay));

  let lc=0;
  const lIv=setInterval(()=>{glitchLine();if(lc%3===0)screenFlashRed();if(++lc>28)clearInterval(lIv);},145);

  setTimeout(()=>{
    screenFlashWhite();
    stopHorrorImages();
    stopHorrorAudio();
    layer.querySelectorAll('.cwin,.ccmd').forEach(el=>{
      el.classList.remove('on'); setTimeout(()=>el.remove(),180);
    });
    setTimeout(()=>{ layer.classList.remove('on'); showFakeDownload(); },300);
  },4400);
}

function spawnPopup({icon,title,body,btns,pos},layer){
  const w=document.createElement('div'); w.className='cwin';
  Object.entries(pos).forEach(([k,v])=>w.style[k]=v);
  const bH=btns.map((b,i)=>`<button class="c-btn${i===0?' p':''}" onclick="closeEl(this)">${b}</button>`).join('');
  w.innerHTML=`<div class="cwin-tb"><span>${icon}</span>${title}<span class="cwin-close" onclick="closeEl(this)">✕</span></div><div class="cwin-body">${body}</div><div class="cwin-footer">${bH}</div>`;
  layer.appendChild(w);
  requestAnimationFrame(()=>requestAnimationFrame(()=>w.classList.add('on')));
}

function spawnCMD({pos,lines},layer){
  const id='c'+Math.random().toString(36).slice(2);
  const w=document.createElement('div'); w.className='ccmd';
  Object.entries(pos).forEach(([k,v])=>w.style[k]=v);
  w.innerHTML=`<div class="ccmd-tb"><span class="cd r"></span><span class="cd y"></span><span class="cd g"></span><span class="ccmd-title">Administrator: Windows PowerShell</span></div><div class="ccmd-body" id="${id}"></div>`;
  layer.appendChild(w);
  requestAnimationFrame(()=>requestAnimationFrame(()=>w.classList.add('on')));
  const body=document.getElementById(id);
  lines.forEach(({t,cls,v})=>setTimeout(()=>{
    if(!body.isConnected) return;
    const d=document.createElement('div'); d.className='cl '+(cls||''); d.textContent=v; body.appendChild(d);
  },t));
}

function closeEl(el){
  const p=el.closest('.cwin,.ccmd');
  if(p){p.classList.remove('on');setTimeout(()=>p.remove(),180);}
}

/* ══ FAKE DOWNLOAD (no real file) ══ */
function showFakeDownload(){
  const layer=document.getElementById('dl-layer'); layer.classList.add('on');
  const fill=document.getElementById('dl-fill');
  const pctEl=document.getElementById('dl-pct');
  const spEl=document.getElementById('dl-speed');
  const speeds=['1.8 MB/s','2.4 MB/s','3.2 MB/s','4.1 MB/s','2.9 MB/s','1.6 MB/s'];
  let pct=0;
  const spIv=setInterval(()=>spEl.textContent=speeds[Math.floor(Math.random()*speeds.length)],420);
  const pIv=setInterval(()=>{
    pct=Math.min(100,pct+Math.random()*8+1.8);
    fill.style.width=pct+'%'; pctEl.textContent=Math.round(pct)+'%';
    if(pct>=100){
      clearInterval(pIv); clearInterval(spIv);
      spEl.textContent='Complete'; pctEl.textContent='100%';
      setTimeout(()=>{ layer.classList.remove('on'); showShutdown(); },900);
    }
  },75);
}

/* ══ SHUTDOWN ══ */
function showShutdown(){
  const s=document.getElementById('shutdown');
  const sf=document.getElementById('sd-fill');
  s.classList.add('on');
  requestAnimationFrame(()=>requestAnimationFrame(()=>s.classList.add('vis')));
  let p=0;
  const iv=setInterval(()=>{p=Math.min(100,p+Math.random()*4+1);sf.style.width=p+'%';if(p>=100)clearInterval(iv);},100);
  setTimeout(()=>{ s.classList.remove('vis'); setTimeout(()=>{ s.classList.remove('on'); showReveal(); },650); },3900);
}

/* ══ REVEAL ══ */
function showReveal(){
  const r=document.getElementById('reveal');
  r.classList.add('on');
  requestAnimationFrame(()=>requestAnimationFrame(()=>r.classList.add('vis')));
}

/* ══ UTILITY ══ */
function shakeBody(){
  document.body.style.animation='none'; void document.body.offsetWidth;
  document.body.style.animation='bodyShake .5s ease';
  setTimeout(()=>{ document.body.style.animation=''; },530);
}

/* ══ RESTART ══ */
function restartAll(){
  cur=0;score=0;sel=null;busy=false;userPicked=false;awaitingNext=false;
  killGlitch();stopDrift();stopHorrorImages();stopHorrorAudio();
  ['reveal','shutdown','dl-layer','chaos-layer','safe-modal','horror-layer'].forEach(id=>{
    const el=document.getElementById(id);
    el.classList.remove('on','vis');
    if(id==='chaos-layer'||id==='horror-layer') el.innerHTML='';
  });
  ['sd-fill','dl-fill'].forEach(id=>document.getElementById(id).style.width='0%');
  ['sflash','rflash'].forEach(id=>{const f=document.getElementById(id);f.style.transition='none';f.style.opacity='0';});
  document.getElementById('gline').style.opacity='0';
  const card=document.getElementById('quiz-card');
  card.style.cssText='';
  document.body.style.cssText='';
  setTimeout(()=>{
    render();
    card.style.animation='none';
    requestAnimationFrame(()=>{ card.style.animation='fadeUp .5s ease forwards'; });
  },120);
}

/* ══ INIT ══ */
render();
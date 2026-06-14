// בקשה להארכת גרייס - מזרחי טפחות. מילוי PDF בצד-לקוח בלבד (אין שרת).
// משתמש באותן קואורדינטות שכוילו ב-fields.py. רינדור: pdf-lib + fontkit + bidi-js.
import { PDFDocument, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1';
import bidiFactory from 'https://esm.sh/bidi-js@1.0.3';

const bidi = bidiFactory();
const PAGE_H = 842;

// --- מפת השדות (מראה את fields.py). rect = [x0,y0,x1,y1] בקואורדינטות top-down של PyMuPDF ---
const F = {
  date_top:     { p:0, r:[450,22,532,33],  t:'num', a:'right'  },
  b1_lastname:  { p:0, r:[429,535,548,547], t:'heb', a:'right'  },
  b1_firstname: { p:0, r:[300,535,419,547], t:'heb', a:'right'  },
  b1_id:        { p:0, r:[171,535,289,547], t:'num', a:'right'  },
  b2_lastname:  { p:0, r:[429,547,548,559], t:'heb', a:'right'  },
  b2_firstname: { p:0, r:[300,547,419,559], t:'heb', a:'right'  },
  b2_id:        { p:0, r:[171,547,289,559], t:'num', a:'right'  },
  addr_city:    { p:0, r:[462,593,548,605], t:'heb', a:'right'  },
  addr_street:  { p:0, r:[306,593,451,605], t:'heb', a:'right'  },
  addr_houseno: { p:0, r:[263,593,295,605], t:'num', a:'right'  },
  addr_zip:     { p:0, r:[198,593,252,605], t:'num', a:'right'  },
  addr_phone1:  { p:0, r:[116,593,187,605], t:'num', a:'right'  },
  addr_phone2:  { p:0, r:[41,593,106,605],  t:'num', a:'right'  },
  months:       { p:0, r:[252,648,292,659], t:'num', a:'center' },
  check_full:   { p:0, r:[495,670,506,683], t:'chk', a:'center' },
  check_partial:{ p:0, r:[495,684,506,697], t:'chk', a:'center' },
  reason_l1:    { p:0, r:[80,723,555,734],  t:'heb', a:'right'  },
  reason_l2:    { p:0, r:[80,735,555,746],  t:'heb', a:'right'  },
  reason_l3:    { p:0, r:[80,747,555,758],  t:'heb', a:'right'  },
  date_top_p2:  { p:1, r:[450,22,532,33],   t:'num', a:'right'  },
  billing_day:  { p:1, r:[280,622,358,635], t:'num', a:'right'  },
  account_no:   { p:1, r:[275,641,353,654], t:'num', a:'right'  },
  sig1_name:    { p:1, r:[417,701,554,713], t:'heb', a:'right'  },
  sig1_sign:    { p:1, r:[305,700,406,713], t:'sig', a:'center' },
  sig1_date:    { p:1, r:[176,701,295,713], t:'num', a:'right'  },
  sig2_name:    { p:1, r:[417,712,554,724], t:'heb', a:'right'  },
  sig2_sign:    { p:1, r:[305,712,406,724], t:'sig', a:'center' },
  sig2_date:    { p:1, r:[176,712,295,724], t:'num', a:'right'  },
};

const hasHeb = s => /[֐-׿]/.test(s);

// logical -> visual (כמו get_display בפייתון)
function toVisual(text){
  const lv = bidi.getEmbeddingLevels(text, 'rtl');
  const segs = bidi.getReorderSegments(text, lv);
  const chars = Array.from(text);
  for(const [start,end] of segs){
    const slice = chars.slice(start, end+1).reverse();
    for(let i=start;i<=end;i++) chars[i] = slice[i-start];
  }
  return chars.join('');
}

// גלישת-מילים עברית לפי רוחב (נק')
function wrapHeb(text, maxw, font, size){
  const words = text.split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for(const w of words){
    const trial = (cur ? cur+' '+w : w);
    if(font.widthOfTextAtSize(toVisual(trial), size) <= maxw) cur = trial;
    else { if(cur) lines.push(cur); cur = w; }
  }
  if(cur) lines.push(cur);
  return lines;
}

let masterBytes, fontBytes;
async function loadAssets(){
  if(masterBytes && fontBytes) return;
  const [m,ft] = await Promise.all([
    fetch('assets/master.pdf').then(r=>r.arrayBuffer()),
    fetch('assets/Alef-Regular.ttf').then(r=>r.arrayBuffer()),
  ]);
  masterBytes = m; fontBytes = ft;
}

async function buildPdf(data){
  await loadAssets();
  const pdf = await PDFDocument.load(masterBytes);
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset:true });
  const pages = pdf.getPages();

  const draw = (key, text, sizeArg) => {
    if(text===undefined || text===null) return;
    text = String(text); if(!text.trim()) return;
    const f = F[key]; const page = pages[f.p];
    let size = sizeArg || 10;
    const heb = (f.t==='heb' || hasHeb(text));
    let val = heb ? toVisual(text) : text;
    const [x0,y0,x1,y1] = f.r; const avail = x1-x0;
    let w = font.widthOfTextAtSize(val, size);
    while(w > avail && size > 6){ size -= 0.5; w = font.widthOfTextAtSize(val, size); }
    let x = f.a==='right' ? x1-w : f.a==='center' ? (x0+x1)/2 - w/2 : x0;
    const yTop = y1 - 2.5;
    page.drawText(val, { x, y: PAGE_H - yTop, size, font, color: rgb(0,0,0) });
  };

  // תאריך (שני העמודים)
  draw('date_top', data.date, 8.5);
  draw('date_top_p2', data.date, 8.5);

  // לווים + שורות חתימה
  for(let i=0;i<data.borrowers.length && i<2;i++){
    const b = data.borrowers[i]; const n = i+1;
    draw(`b${n}_lastname`, b.lastname);
    draw(`b${n}_firstname`, b.firstname);
    draw(`b${n}_id`, b.id);
    draw(`sig${n}_name`, [b.firstname,b.lastname].filter(Boolean).join(' '));
    draw(`sig${n}_date`, data.date);
    if(b.sign){
      const png = await pdf.embedPng(b.sign);
      const f = F[`sig${n}_sign`]; const [x0,y0,x1,y1] = f.r;
      const bw = x1-x0, bh = y1-y0;
      const sc = Math.min(bw/png.width, bh/png.height);
      const w = png.width*sc, h = png.height*sc;
      pages[f.p].drawImage(png, { x:(x0+x1)/2 - w/2, y: PAGE_H - y1 + (bh-h)/2, width:w, height:h });
    }
  }

  // כתובת
  draw('addr_city', data.city);
  draw('addr_street', data.street);
  draw('addr_houseno', data.houseno);
  draw('addr_zip', data.zip);
  draw('addr_phone1', data.phone1);
  draw('addr_phone2', data.phone2);

  // חודשים
  draw('months', data.months);

  // תיבת סימון
  draw(data.deferral==='full' ? 'check_full' : 'check_partial', 'X', 9);

  // נימוקים (גלישה ל-3 שורות)
  if(data.reason && data.reason.trim()){
    const fr = F.reason_l1; const maxw = fr.r[2]-fr.r[0]-4;
    const lines = wrapHeb(data.reason.trim(), maxw, font, 10).slice(0,3);
    lines.forEach((ln,idx)=> draw(`reason_l${idx+1}`, ln, 10));
  }

  // סעיף 4
  draw('billing_day', data.billing_day);
  draw('account_no', data.account_no);

  return pdf.save();
}

// ---------- signature pad ----------
function makePad(canvas){
  const ctx = canvas.getContext('2d');
  let drawing=false, dirty=false, last=null;
  function resize(){
    const ratio = window.devicePixelRatio||1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width*ratio; canvas.height = rect.height*ratio;
    ctx.scale(ratio,ratio); ctx.lineWidth=2.2; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle='#0a1f5a';
  }
  function pos(e){
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x:t.clientX-rect.left, y:t.clientY-rect.top };
  }
  function start(e){ e.preventDefault(); drawing=true; dirty=true; last=pos(e); }
  function move(e){ if(!drawing) return; e.preventDefault(); const p=pos(e);
    ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last=p; }
  function end(){ drawing=false; }
  canvas.addEventListener('mousedown',start); canvas.addEventListener('mousemove',move);
  window.addEventListener('mouseup',end);
  canvas.addEventListener('touchstart',start,{passive:false}); canvas.addEventListener('touchmove',move,{passive:false});
  canvas.addEventListener('touchend',end);
  resize(); window.addEventListener('resize',()=>{ const d=dirty; resize(); dirty=d; });
  return {
    clear(){ ctx.clearRect(0,0,canvas.width,canvas.height); dirty=false; },
    isEmpty(){ return !dirty; },
    async pngBytes(){ if(!dirty) return null;
      const blob = await new Promise(res=> canvas.toBlob(res,'image/png'));
      return new Uint8Array(await blob.arrayBuffer()); }
  };
}

// ---------- UI wiring ----------
const $ = id => document.getElementById(id);
const pad1 = makePad($('sig1'));
let pad2 = null;

$('addB2').onclick = ()=>{ $('b2wrap').classList.remove('hide'); $('sig2wrap').classList.remove('hide');
  $('addB2').classList.add('hide'); $('rmB2').classList.remove('hide');
  if(!pad2) pad2 = makePad($('sig2')); };
$('rmB2').onclick = ()=>{ $('b2wrap').classList.add('hide'); $('sig2wrap').classList.add('hide');
  $('addB2').classList.remove('hide'); $('rmB2').classList.add('hide'); };
document.querySelectorAll('[data-clear]').forEach(btn=> btn.onclick = ()=>{
  (btn.dataset.clear==='sig1'?pad1:pad2)?.clear(); });

function todayStr(){ const d=new Date();
  const p=n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`; }

function val(id){ return ($(id).value||'').trim(); }

let lastBytes=null;
function download(bytes){
  const blob = new Blob([bytes], {type:'application/pdf'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download='בקשה להארכת גרייס - מזרחי טפחות.pdf';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}

$('f').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const err = $('err'); err.textContent='';
  const b2on = !$('b2wrap').classList.contains('hide');

  // ולידציה
  const need = [['b1_lastname','שם משפחה'],['b1_firstname','שם פרטי'],['b1_id','ת.ז'],
    ['city','יישוב'],['street','רחוב'],['phone1','טלפון'],['reason','נימוקים'],
    ['billing_day','יום חיוב'],['account_no','מספר חשבון']];
  for(const [id,label] of need){ if(!val(id)){ err.textContent=`חסר: ${label}`; $(id).focus(); return; } }
  if(b2on && (!val('b2_lastname')||!val('b2_firstname')||!val('b2_id'))){ err.textContent='מלאו את כל פרטי לווה 2 (או הסירו אותו)'; return; }
  if(pad1.isEmpty()){ err.textContent='חסרה חתימת לווה 1'; return; }
  if(b2on && pad2 && pad2.isEmpty()){ err.textContent='חסרה חתימת לווה 2'; return; }

  $('genBtn').disabled=true; $('genBtn').textContent='מייצר...';
  try{
    const borrowers = [{ lastname:val('b1_lastname'), firstname:val('b1_firstname'), id:val('b1_id'), sign:await pad1.pngBytes() }];
    if(b2on) borrowers.push({ lastname:val('b2_lastname'), firstname:val('b2_firstname'), id:val('b2_id'), sign:await pad2.pngBytes() });
    const data = {
      date: todayStr(), borrowers,
      city:val('city'), street:val('street'), houseno:val('houseno'), zip:val('zip'),
      phone1:val('phone1'), phone2:val('phone2'),
      months:val('months')||'12',
      deferral: document.querySelector('input[name=deferral]:checked').value,
      reason: val('reason'),
      billing_day: val('billing_day'), account_no: val('account_no'),
    };
    lastBytes = await buildPdf(data);
    download(lastBytes);
    $('f').style.display='none'; $('done').classList.add('show');
    window.scrollTo({top:0,behavior:'smooth'});
  }catch(ex){
    console.error(ex); err.textContent='שגיאה ביצירת הטופס: '+ex.message;
  }finally{
    $('genBtn').disabled=false; $('genBtn').textContent='צור את הטופס להורדה';
  }
});

$('dl2').onclick = ()=>{ if(lastBytes) download(lastBytes); };
$('again').onclick = ()=>{ location.reload(); };

// ---------- העתקת כתובת המייל של הבנק ללוח ----------
async function copyText(text){
  try{
    if(navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(text); return true; }
  }catch(e){ /* נופלים ל-fallback */ }
  try{
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly','');
    ta.style.position='fixed'; ta.style.top='-1000px'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }catch(e){ return false; }
}
const copyBtn = $('copyEmail');
if(copyBtn){
  copyBtn.onclick = async ()=>{
    const email = ($('emailText').textContent||'').trim();
    const msg = $('copied');
    const ok = await copyText(email);
    if(ok){ msg.textContent = '✓ הכתובת הועתקה - הדביקו בשדה "אל" של המייל'; msg.style.color='var(--ok)'; }
    else  { msg.textContent = 'העתיקו ידנית: ' + email; msg.style.color='#b3261e'; }
    msg.classList.add('show');
  };
}

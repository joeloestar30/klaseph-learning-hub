/* ELLNA transcription and print templates reconstructed from the supplied photo. */
(() => {
  const fields = [
    ['Learner details', [['last_name','Last name'],['first_name','First name'],['middle_initial','Middle initial'],['lrn','Learner Reference Number'],['birth_date','Birth date','date'],['gender','Gender','select','Boy|Girl']]],
    ['School details', [['region','Region'],['division','Division'],['school_id_g4','School ID (Grade 4)'],['school_id_g3','School ID (Grade 3)'],['school_type','School type (Grade 4)','select','Central / Pilot Elementary School|Non-Central Elementary School|Private School|Multigrade School|State College/University']]],
    ['Grade 3 information', [['class_size','Grade 3 class size','number'],['english','English final grade','number'],['filipino','Filipino final grade','number'],['mother_tongue','Mother Tongue final grade','number'],['math','Mathematics final grade','number'],['completed_g3','Completed Grade 3 in the preceding school year?','select',"Yes|No|I don’t know"]]],
    ['Additional information', [['special_class','Special class membership','select','None|Special Science Class|Special Education Class|Class Under MISOSA|Class in BRAC|ALIVE/Madrasah|Other'],['four_ps','Family recipient of 4Ps?','select',"Yes|No|I don’t know"]]]
  ];
  let current = {}, saved = [], owner = null;
  const e = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function years() {
    const y = new Date().getFullYear();
    return [...new Set([current.school_year, state.settings.schoolYear,...Array.from({length:12},(_,i)=>`${y-6+i}-${y-5+i}`)].filter(Boolean))].sort();
  }
  const all = fields.flatMap(x=>x[1]);
  function valueForm() { return {...current,...Object.fromEntries(new FormData(document.querySelector('#ellnaForm')))}; }
  function input([key,label,type='text',options]) {
    const v=current[key] || '';
    return `<label>${e(label)}${type==='select' ? `<select name="${key}"><option value="">Choose…</option>${options.split('|').map(o=>`<option ${o===v?'selected':''}>${e(o)}</option>`).join('')}</select>` : `<input name="${key}" type="${type}" value="${e(v)}" ${type==='number'?'min="0" max="'+(key==='class_size'?'99':'100')+'" step="1"':''} ${key==='lrn'?'inputmode="numeric" pattern="[0-9]{12}" maxlength="12"':key.startsWith('school_id')?'inputmode="numeric" pattern="[0-9]{6}" maxlength="6"':''} ${key==='middle_initial'?'maxlength="2"':''} ${['last_name','first_name'].includes(key)?'required':''}>`}</label>`;
  }
  window.ellnaView = () => {
    if(owner!==user().id) {owner=user().id;current={};saved=[];}
    return `<section class="card ellna"><h2>ELLNA Forms</h2><p>Enter once, then print a readable record or a reconstructed bubble sheet.</p><div class="ellna-tools"><button class="ghost" id="ellnaLoad">Load saved forms</button><select id="ellnaSaved" aria-label="Saved forms"><option value="">Choose a saved form…</option>${saved.map((r,i)=>`<option value="${i}">${e(r.payload.last_name)}, ${e(r.payload.first_name)} · ${e(r.school_year)}</option>`).join('')}</select><button class="ghost" id="ellnaNew">New form</button></div><form id="ellnaForm"><fieldset><legend>Assessment</legend><div class="form-grid"><label>School year<select name="school_year">${years().map(y=>`<option ${y===(current.school_year||state.settings.schoolYear)?'selected':''}>${e(y)}</option>`).join('')}</select></label><label>Assessment date<input type="date" name="assessment_date" value="${e(current.assessment_date||'')}" required></label></div><p>Grade 3 completion refers to the school year immediately before the selected year.</p></fieldset>${fields.map(([title,items])=>`<fieldset><legend>${title}</legend><div class="form-grid">${items.map(input).join('')}</div></fieldset>`).join('')}<div class="ellna-tools"><button class="button" type="submit">Save draft</button><button class="ghost" type="button" data-ellna-print="clean">Print clean form / PDF</button><button class="ghost" type="button" data-ellna-print="bubble">Print bubble sheet / PDF</button></div><p id="ellnaMessage" role="status"></p><p class="muted">Bubble sheet recreated from a photograph. Scanner compatibility is not certified. Print at 100% scale.</p></form></section>`;
  };
  async function loadSaved() {
    if(cloudMode) {
      const {data,error}=await sb.from('ellna_forms').select('*').order('updated_at',{ascending:false});
      if(error) throw error;
      saved=data;
    } else saved=JSON.parse(localStorage.getItem('ellna-demo-'+owner)||'[]');
  }
  function age(data) {
    if(!data.birth_date||!data.assessment_date) return '';
    const b=new Date(data.birth_date+'T00:00:00Z'),a=new Date(data.assessment_date+'T00:00:00Z');
    return a.getUTCFullYear()-b.getUTCFullYear()-(a.toISOString().slice(5,10)<b.toISOString().slice(5,10)?1:0);
  }
  function bubbles(label,value,count,alphabet='0123456789') {
    const chars=Array.from(String(value||'').toUpperCase());
    return `<div class="bubble-block"><b>${e(label)}</b><div class="bubble-columns">${Array.from({length:count},(_,i)=>`<div class="bubble-column"><div class="letter">${e(chars[i]||'')}</div>${Array.from(alphabet).map(c=>`<span class="bubble ${chars[i]===c?'filled':''}">${e(c)}</span>`).join('')}</div>`).join('')}</div></div>`;
  }
  function printable(d,mode) {
    const start=Number(d.school_year.split('-')[0]), prior=`${start-1}-${start}`;
    const header=`<h1>EARLY LANGUAGE LITERACY AND NUMERACY ASSESSMENT</h1><h2>Learner information · SY ${e(d.school_year)}</h2><p>Assessment date: ${e(d.assessment_date)} · Grade 3 completion year: ${prior} · Age on assessment date: ${age(d)}</p>`;
    const details=fields.map(([title,items])=>`<section><h3>${e(title)}</h3><dl>${items.map(([k,label])=>`<div><dt>${e(label)}</dt><dd>${e(d[k]||'—')}</dd></div>`).join('')}</dl></section>`).join('');
    const alpha='ABCDEFGHIJKLMNÑOPQRSTUVWXYZ -';
    const sheet=mode==='bubble'?`<div class="names">${bubbles('LAST NAME',d.last_name,Math.max(15,Array.from(d.last_name).length),alpha)}${bubbles('FIRST NAME',d.first_name,Math.max(20,Array.from(d.first_name).length),alpha)}${bubbles('MI',d.middle_initial,2,alpha)}</div><div class="number-groups">${bubbles('School ID (G4)',d.school_id_g4,6)}${bubbles('School ID (G3)',d.school_id_g3,6)}${bubbles('LRN',d.lrn,12)}${bubbles('Age',age(d),2)}${bubbles('Class size',d.class_size,2)}</div><div class="number-groups">${bubbles('Birth date YYYYMMDD',(d.birth_date||'').replaceAll('-',''),8)}${['english','filipino','mother_tongue','math'].map(k=>bubbles(k.replace('_',' '),d[k],3)).join('')}</div><div class="choices">${all.filter(x=>x[2]==='select').map(([k,l,,opts])=>`<section><b>${e(l)}</b>${opts.split('|').map(o=>`<div><span class="bubble ${d[k]===o?'filled':''}">${d[k]===o?'●':' '}</span> ${e(o)}</div>`).join('')}</section>`).join('')}</div><p>Region: ${e(d.region)} · Division: ${e(d.division)}</p>`:details;
    return `<!doctype html><html><head><meta charset="utf-8"><title>ELLNA ${e(d.last_name)} ${e(d.school_year)}</title><style>@page{size:A4 portrait;margin:10mm}body{font:11px Arial;color:#000}h1{font-size:15px;text-align:center}h2{font-size:13px;text-align:center}h3{font-size:12px;background:#eee;padding:5px}section{break-inside:avoid}dl{display:grid;grid-template-columns:1fr 1fr;gap:8px}dl div{border-bottom:1px solid #bbb;padding:5px}dt{font-size:10px}dd{margin:3px 0;font-weight:bold}.names,.number-groups{display:flex;gap:5px;margin:8px 0;justify-content:space-between}.bubble-block{border:1px solid;padding:3px;min-width:0}.bubble-block b{font-size:9px}.bubble-columns{display:flex}.bubble-column{display:flex;flex-direction:column;align-items:center;gap:1px;flex:1}.letter{border:1px solid;width:12px;height:14px;text-align:center}.bubble{display:inline-flex;border:1px solid;border-radius:50%;height:11px;width:11px;align-items:center;justify-content:center;font-size:8px;flex:none}.filled{background:#000!important;color:white!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}.choices{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.choices section{border:1px solid;padding:4px}.choices div{margin-top:3px}footer{margin-top:12px;font-size:9px}.print{margin:12px}@media print{.print{display:none}}</style></head><body><button class="print" onclick="window.print()">Print / Save as PDF</button>${header}${sheet}<footer>KlasePH digital reconstruction · ${mode==='bubble'?'Not certified for official optical scanning.':''} Form version 1 · School year ${e(d.school_year)}</footer></body></html>`;
  }
  window.bindEllna = () => {
    if(state.view!=='ellna') return;
    const message=s=>document.querySelector('#ellnaMessage').textContent=s;
    document.querySelector('#ellnaNew').onclick=()=>{current={};render();};
    document.querySelector('#ellnaLoad').onclick=async()=>{try{current=valueForm();await loadSaved();render();}catch(err){message('Unable to load: '+err.message);}};
    document.querySelector('#ellnaSaved').onchange=event=>{const r=saved[event.target.value];if(r){current={...r.payload,id:r.id,school_year:r.school_year};render();}};
    document.querySelector('#ellnaForm').onsubmit=async event=>{
      event.preventDefault();const button=event.submitter;button.disabled=true;
      try {
        const d=valueForm();if(age(d)<0) throw new Error('Birth date must be before the assessment date.');
        const id=d.id||crypto.randomUUID();const row={id,owner_id:owner,school_year:d.school_year,payload:d,updated_at:new Date().toISOString()};
        if(cloudMode){const {error}=await sb.from('ellna_forms').upsert(row);if(error)throw error;}
        else {await loadSaved();saved=saved.filter(r=>r.id!==id);saved.push(row);localStorage.setItem('ellna-demo-'+owner,JSON.stringify(saved));}
        current={...d,id};message('Draft saved.');
      }catch(err){message('Not saved: '+err.message);}finally{button.disabled=false;}
    };
    document.querySelectorAll('[data-ellna-print]').forEach(button=>button.onclick=()=>{
      const form=document.querySelector('#ellnaForm');if(!form.reportValidity())return;
      current=valueForm();if(age(current)<0)return message('Check the birth and assessment dates.');
      const win=window.open('','_blank');if(!win)return message('Allow pop-ups to open the printable form.');
      win.document.write(printable(current,button.dataset.ellnaPrint));win.document.close();
    });
  };
})();


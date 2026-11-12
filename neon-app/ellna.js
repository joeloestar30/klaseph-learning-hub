/* ELLNA transcription and print templates reconstructed from the supplied photo. */
(() => {
  const fields = [
    ['Learner details', [['last_name','Last name'],['first_name','First name'],['middle_initial','Middle initial'],['lrn','Learner Reference Number'],['birth_date','Birth date','date'],['gender','Gender','select','Boy|Girl']]],
    ['School details', [['region','Region'],['division','Division'],['school_id_g4','School ID (Grade 4)'],['school_id_g3','School ID (Grade 3)'],['school_type','School type (Grade 4)','select','Central / Pilot Elementary School|Non-Central Elementary School|Private School|Multigrade School|State College/University']]],
    ['Grade 3 information', [['class_size','Grade 3 class size','number'],['english','English final grade','number'],['filipino','Filipino final grade','number'],['mother_tongue','Mother Tongue final grade','number'],['math','Mathematics final grade','number'],['completed_g3','Completed Grade 3 in the preceding school year?','select',"Yes|No|I don’t know"]]],
    ['Additional information', [['special_class','Special class membership','select','None|Special Science Class|Special Education Class|Class Under MISOSA|Class in BRAC|ALIVE/Madrasah|Other'],['four_ps','Family recipient of 4Ps?','select',"Yes|No|I don’t know"]]]
  ];
  let current = {}, saved = [], owner = null;
  const isStudent = () => role() === 'student';
  const e = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function years() {
    const y = new Date().getFullYear();
    return [...new Set([current.school_year, state.settings.schoolYear,...Array.from({length:12},(_,i)=>`${y-6+i}-${y-5+i}`)].filter(Boolean))].sort();
  }
  const all = fields.flatMap(x=>x[1]);
  function valueForm() { return {...current,...Object.fromEntries(new FormData(document.querySelector('#ellnaForm')))}; }
  const statusOf = value => value.status || value._status || 'draft';
  const rpc = (name,args) => window.KLASEPH_MONITOR?.rpc(sb,name,args) || sb.rpc(name,args);
  const recordToCurrent = row => ({...row.payload,id:row.id,school_year:row.school_year,class_id:row.class_id,
    student_id:row.student_id,status:row.status,submitted_at:row.submitted_at,resubmitted_at:row.resubmitted_at,
    reviewed_at:row.reviewed_at,correction_note:row.correction_note,retention_until:row.retention_until,revision:row.revision});
  function availableClasses() { return isStudent() ? studentClasses() : teacherClasses(); }
  function contextFields(readOnly) {
    const classes=availableClasses(),classId=current.class_id||classes[0]?.id||'';
    const learnerIds=new Set(state.memberships.filter(m=>m.classId===classId).map(m=>m.userId));
    const learners=state.users.filter(item=>item.role==='student'&&learnerIds.has(item.id));
    return `<fieldset ${readOnly?'disabled':''}><legend>School workflow</legend><div class="form-grid"><label>Class<select name="class_id" id="ellnaClass" required><option value="">Choose…</option>${classes.map(item=>`<option value="${item.id}" ${item.id===classId?'selected':''}>${e(item.name)} · ${e(item.subject)}</option>`).join('')}</select></label>${isStudent()?'':`<label>Learner<select name="student_id" required><option value="">Choose…</option>${learners.map(item=>`<option value="${item.id}" ${item.id===current.student_id?'selected':''}>${e(item.name)}</option>`).join('')}</select></label>`}</div></fieldset>`;
  }
  function input([key,label,type='text',options]) {
    const v=current[key] || '';
    return `<label>${e(label)}${type==='select' ? `<select name="${key}"><option value="">Choose…</option>${options.split('|').map(o=>`<option ${o===v?'selected':''}>${e(o)}</option>`).join('')}</select>` : `<input name="${key}" type="${type}" value="${e(v)}" ${type==='number'?'min="0" max="'+(key==='class_size'?'99':'100')+'" step="1"':''} ${key==='lrn'?'inputmode="numeric" pattern="[0-9]{12}" maxlength="12"':key.startsWith('school_id')?'inputmode="numeric" pattern="[0-9]{6}" maxlength="6"':''} ${key==='middle_initial'?'maxlength="2"':''} ${['last_name','first_name'].includes(key)?'required':''}>`}</label>`;
  }
  window.ellnaView = () => {
    if(owner!==user().id) {owner=user().id;current={};saved=[];}
    const status=statusOf(current),readOnly=['submitted','reviewed','deletion_requested','deleted'].includes(status);
    const banner=status==='needs_correction'?`<div class="submission-banner">Correction requested: ${e(current.correction_note||'Review the form and resubmit it.')}</div>`:status!=='draft'?`<div class="submission-banner">Status: ${e(status.replaceAll('_',' '))}${current.retention_until?` · Retained until ${e(current.retention_until)}`:''}</div>`:'';
    const workflowButtons=!current.id?'':`${status==='submitted'&&!isStudent()?'<button class="button" type="button" data-ellna-review="review">Mark reviewed</button><button class="ghost" type="button" data-ellna-review="request_correction">Request correction</button>':''}<button class="ghost" type="button" id="ellnaExport">Export JSON</button>${status!=='deletion_requested'&&status!=='deleted'?'<button class="ghost" type="button" id="ellnaDelete">Request deletion</button>':''}`;
    return `<section class="card ellna ${isStudent()?'student-ellna':''}"><h2>${isStudent()?'Student ELLNA Form':'ELLNA Forms'}</h2><p>${isStudent()?'Save a draft, submit it to the assigned class, and respond if a correction is requested.':'Review only submissions linked to your classes, request corrections when necessary, and record completion.'}</p><div class="ellna-tools"><button class="ghost" id="ellnaLoad">Load saved forms</button><select id="ellnaSaved" aria-label="Saved forms"><option value="">Choose a saved form…</option>${saved.map((r,i)=>`<option value="${i}">${e(r.payload.last_name)}, ${e(r.payload.first_name)} · ${e(r.school_year)} · ${e(statusOf(r).replaceAll('_',' '))}</option>`).join('')}</select><button class="ghost" id="ellnaNew">New form</button></div>${banner}<form id="ellnaForm">${contextFields(readOnly)}<fieldset ${readOnly?'disabled':''}><legend>Assessment</legend><div class="form-grid"><label>School year<select name="school_year">${years().map(y=>`<option ${y===(current.school_year||state.settings.schoolYear)?'selected':''}>${e(y)}</option>`).join('')}</select></label><label>Assessment date<input type="date" name="assessment_date" value="${e(current.assessment_date||'')}" required></label></div><p>Grade 3 completion refers to the school year immediately before the selected year.</p></fieldset>${fields.map(([title,items])=>`<fieldset ${readOnly?'disabled':''}><legend>${title}</legend><div class="form-grid">${items.map(input).join('')}</div></fieldset>`).join('')}<div class="ellna-tools">${readOnly?'':`<button class="ghost" type="submit" name="intent" value="draft">Save draft</button><button class="button" type="submit" name="intent" value="submit">Submit to school</button>`}${workflowButtons}${!isStudent()?'<button class="ghost" type="button" data-ellna-print="clean">Print clean form / PDF</button><button class="ghost" type="button" data-ellna-print="bubble">Print bubble sheet / PDF</button>':''}</div><p id="ellnaMessage" role="status"></p><p class="muted">Form version: photo-reconstruction-v1. This is not a BEA-certified optical form.${!isStudent()?' Print at 100% scale.':''}</p></form></section>`;
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
  function photoNameGrid(d) {
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const columns=[
      ...Array.from({length:15},(_,i)=>({group:'LAST NAME',char:Array.from(String(d.last_name||'').toUpperCase())[i]||''})),
      ...Array.from({length:20},(_,i)=>({group:'FIRST NAME',char:Array.from(String(d.first_name||'').toUpperCase())[i]||''})),
      ...Array.from({length:2},(_,i)=>({group:'MI',char:Array.from(String(d.middle_initial||'').toUpperCase())[i]||''}))
    ];
    const groupHeader=`<div class="photo-groups"><b style="grid-column:span 15">LAST NAME</b><b style="grid-column:span 20">FIRST NAME</b><b style="grid-column:span 2">MI</b></div>`;
    const boxes=`<div class="photo-row photo-boxes">${columns.map(c=>`<i>${e(c.char)}</i>`).join('')}</div>`;
    const rows=Array.from(alphabet,letter=>`<div class="photo-row">${columns.map(c=>`<span class="photo-bubble ${c.char===letter?'filled':''}">${letter}</span>`).join('')}</div>`).join('');
    return `<section class="photo-names">${groupHeader}${boxes}${rows}</section>`;
  }
  function optionPanel(title,items,value) {
    return `<section class="photo-panel"><b class="panel-title">${e(title)}</b>${items.map(item=>`<div class="choice-line"><span class="choice-bubble ${value===item?'filled':''}"></span>${e(item)}</div>`).join('')}</section>`;
  }
  function birthDatePanel(value) {
    const [year='',month='',day='']=String(value||'').split('-');
    const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `<section class="birth-panel"><b class="panel-title">BIRTH DATE</b><div class="birth-head"><span>MONTH</span><span>DAY</span><span>YEAR</span></div><div class="birth-body"><div class="month-list">${months.map((name,i)=>`<div><span class="choice-bubble ${Number(month)===i+1?'filled':''}"></span>${name}</div>`).join('')}</div>${bubbles('',day,2)}${bubbles('',year,4)}</div></section>`;
  }
  function photoBubbleSheet(d,prior) {
    return `<main class="photo-sheet">
      <header class="photo-header"><b>BUREAU OF EDUCATION ASSESSMENT</b><strong>EARLY LANGUAGE LITERACY AND NUMERACY ASSESSMENT (ELLNA)</strong><span>School Year ${e(d.school_year)}</span></header>
      <div class="written-name"><b>LAST NAME:</b><span>${e(d.last_name)}</span><b>FIRST NAME:</b><span>${e(d.first_name)}</span><b>MI:</b><span>${e(d.middle_initial)}</span></div>
      ${photoNameGrid(d)}
      <div class="photo-lower">
        <div class="lower-left">
          <div class="birth-age-row">${birthDatePanel(d.birth_date)}${bubbles('AGE',age(d),2)}</div>
          ${optionPanel('GENDER',['Boy','Girl'],d.gender)}
          ${optionPanel('SPECIAL CLASS',['None','Special Science Class','Special Education Class','Class Under MISOSA','Class in BRAC','ALIVE/Madrasah','Other'],d.special_class)}
        </div>
        <div class="lower-middle">
          <div class="mini-row">${bubbles('REGION',d.region,2)}${bubbles('DIVISION',d.division,3)}</div>
          <div class="mini-row">${bubbles('SCHOOL ID (G4)',d.school_id_g4,6)}${bubbles('SCHOOL ID (G3)',d.school_id_g3,6)}</div>
          ${optionPanel('SCHOOL TYPE (GRADE 4)',['Central / Pilot Elementary School','Non-Central Elementary School','Private School','Multigrade School','State College/University'],d.school_type)}
        </div>
        <div class="lower-right">
          <div class="mini-row">${bubbles('GRADE 3 CLASS',d.class_size,2)}${bubbles('ENGLISH',d.english,3)}${bubbles('FILIPINO',d.filipino,3)}${bubbles('MOTHER TONGUE',d.mother_tongue,3)}${bubbles('MATH',d.math,3)}</div>
          ${bubbles('LEARNER REFERENCE NUMBER (LRN)',d.lrn,12)}
          <div class="mini-row">${optionPanel(`COMPLETED GRADE 3 IN SY ${prior}`,['Yes','No','I don’t know'],d.completed_g3)}${optionPanel('4Ps FAMILY',['Yes','No','I don’t know'],d.four_ps)}</div>
        </div>
      </div>
      <footer>Digital reconstruction for A4 printing · Print at Actual size / 100% · Optical-scanner compatibility is not certified.</footer>
    </main>`;
  }
  function printable(d,mode) {
    const start=Number(d.school_year.split('-')[0]), prior=`${start-1}-${start}`;
    const header=`<h1>EARLY LANGUAGE LITERACY AND NUMERACY ASSESSMENT</h1><h2>Learner information · SY ${e(d.school_year)}</h2><p>Assessment date: ${e(d.assessment_date)} · Grade 3 completion year: ${prior} · Age on assessment date: ${age(d)}</p>`;
    const details=fields.map(([title,items])=>`<section><h3>${e(title)}</h3><dl>${items.map(([k,label])=>`<div><dt>${e(label)}</dt><dd>${e(d[k]||'—')}</dd></div>`).join('')}</dl></section>`).join('');
    const alpha='ABCDEFGHIJKLMNÑOPQRSTUVWXYZ -';
    const sheet=mode==='bubble'?photoBubbleSheet(d,prior):details;
    return `<!doctype html><html><head><meta charset="utf-8"><title>ELLNA ${e(d.last_name)} ${e(d.school_year)}</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;font:10px Arial;color:#000}.clean{font-size:11px}h1{font-size:15px;text-align:center}h2{font-size:13px;text-align:center}h3{font-size:12px;background:#eee;padding:5px}section{break-inside:avoid}dl{display:grid;grid-template-columns:1fr 1fr;gap:8px}dl div{border-bottom:1px solid #bbb;padding:5px}dt{font-size:10px}dd{margin:3px 0;font-weight:bold}.print{position:fixed;right:12px;top:12px;z-index:5}.photo-sheet{width:190mm;height:277mm;border:1px solid #000;padding:2mm;overflow:hidden;display:flex;flex-direction:column}.photo-header{text-align:center;border:1px solid;display:grid;padding:1mm;font-size:8px}.photo-header strong{font-size:11px}.written-name{display:grid;grid-template-columns:auto 1fr auto 1fr auto 12mm;border:1px solid;border-top:0;min-height:10mm;align-items:center;gap:1mm;padding:1mm;font-size:7px}.written-name span{font-size:10px;font-weight:bold;border-bottom:1px solid;min-height:4mm}.photo-names{border:1px solid;border-top:0;height:151mm;padding:.6mm;overflow:hidden}.photo-groups,.photo-row{display:grid;grid-template-columns:repeat(37,1fr);gap:.35mm}.photo-groups b{border:1px solid;text-align:left;padding:.5mm;font-size:6px}.photo-row{height:5.25mm;align-items:center}.photo-boxes{height:5.5mm}.photo-boxes i{height:4.5mm;border:1px solid;text-align:center;font-style:normal;font-size:7px;padding-top:.5mm}.photo-bubble{width:3.2mm;height:3.2mm;border:.25mm solid;border-radius:50%;font-size:5.3px;display:flex;align-items:center;justify-content:center;margin:auto}.filled{background:#000!important;color:#fff!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}.photo-lower{height:89mm;display:grid;grid-template-columns:29% 34% 37%;border:1px solid;border-top:0}.photo-lower>div{padding:1mm;border-right:1px solid;overflow:hidden}.photo-lower>div:last-child{border:0}.mini-row,.birth-age-row{display:flex;gap:1mm;align-items:flex-start}.mini-row>*{flex:1}.birth-age-row>.birth-panel{flex:1 1 auto}.birth-age-row>.bubble-block{flex:0 0 15mm}.bubble-block,.photo-panel,.birth-panel{border:1px solid;padding:.7mm;margin-bottom:1mm;min-width:0}.bubble-block>b,.panel-title{display:block;text-align:center;font-size:5.5px}.bubble-columns{display:flex;justify-content:center}.bubble-column{display:flex;flex-direction:column;align-items:center;gap:.15mm}.letter{border:1px solid;width:3.4mm;height:3.4mm;text-align:center;font-size:5px}.bubble{display:flex;border:.2mm solid;border-radius:50%;height:2.6mm;width:2.6mm;align-items:center;justify-content:center;font-size:4.5px}.birth-head{display:grid;grid-template-columns:1fr 8mm 15mm;text-align:center;font-size:4.5px;margin-top:.5mm}.birth-body{display:grid;grid-template-columns:1fr 8mm 15mm;align-items:start;gap:.4mm}.birth-body .bubble-block{border:0;padding:0;margin:0}.birth-body .letter{width:3mm;height:3mm}.birth-body .bubble{width:2.3mm;height:2.3mm;font-size:4px}.month-list div{display:flex;align-items:center;gap:.5mm;font-size:4.3px;height:3mm}.month-list .choice-bubble{width:2.3mm;height:2.3mm}.choice-line{display:flex;gap:1mm;align-items:center;font-size:5.5px;margin-top:.5mm}.choice-bubble{width:2.8mm;height:2.8mm;border:.2mm solid;border-radius:50%;flex:none}.photo-sheet footer{font-size:5.5px;text-align:center;margin-top:auto}.clean footer{margin-top:12px;font-size:9px}@media print{.print{display:none}body{width:190mm;height:277mm}}@media screen{body{padding:10mm;background:#ddd}.photo-sheet,.clean{background:#fff;margin:auto}}</style></head><body><button class="print" id="printEllna">Print / Save as PDF</button>${mode==='bubble'?sheet:`<main class="clean">${header}${sheet}<footer>KlasePH digital record · Form version 1 · School year ${e(d.school_year)}</footer></main>`}</body></html>`;
  }
  window.bindEllna = () => {
    if(state.view!=='ellna') return;
    const message=s=>document.querySelector('#ellnaMessage').textContent=s;
    document.querySelector('#ellnaNew').onclick=()=>{current={};render();};
    document.querySelector('#ellnaLoad').onclick=async()=>{try{current=valueForm();await loadSaved();render();}catch(err){message('Unable to load: '+err.message);}};
    document.querySelector('#ellnaSaved').onchange=event=>{const r=saved[event.target.value];if(r){current=recordToCurrent(r);render();}};
    document.querySelector('#ellnaClass')?.addEventListener('change',event=>{current={...valueForm(),class_id:event.target.value,student_id:''};render();});
    document.querySelector('#ellnaForm').onsubmit=async event=>{
      event.preventDefault();const button=event.submitter;button.disabled=true;
      try {
        const d=valueForm();if(age(d)<0) throw new Error('Birth date must be before the assessment date.');
        const submitting=event.submitter?.value==='submit';
        const payloadKeys=['assessment_date',...all.map(item=>item[0])];
        const payload=Object.fromEntries(payloadKeys.map(key=>[key,d[key]??'']));
        let id=d.id||null;
        if(cloudMode){
          const {data,error}=await rpc('save_ellna_form',{form_id_input:id,class_id_input:d.class_id,
            student_id_input:isStudent()?null:d.student_id||null,school_year_input:d.school_year,
            payload_input:payload,intent_input:submitting?'submit':'draft'});
          if(error)throw error;id=data;await loadSaved();current=recordToCurrent(saved.find(row=>row.id===id));
        } else {
          id=id||crypto.randomUUID();const status=submitting?'submitted':statusOf(current);
          const row={id,owner_id:owner,student_id:owner,class_id:d.class_id,school_year:d.school_year,payload,status,
            submitted_at:submitting?(current.submitted_at||new Date().toISOString()):null,updated_at:new Date().toISOString()};
          await loadSaved();saved=saved.filter(r=>r.id!==id);saved.push(row);localStorage.setItem('ellna-demo-'+owner,JSON.stringify(saved));current=recordToCurrent(row);
        }
        render();toast(submitting?'Form submitted to your school.':'Draft saved.');
      }catch(err){message('Not saved: '+err.message);}finally{button.disabled=false;}
    };
    document.querySelectorAll('[data-ellna-review]').forEach(button=>button.onclick=async()=>{
      const action=button.dataset.ellnaReview;
      const note=action==='request_correction'?prompt('Describe the correction required:',''):null;
      if(action==='request_correction'&&!note)return;
      if(!cloudMode){current.status=action==='review'?'reviewed':'needs_correction';current.correction_note=note;render();return;}
      const {error}=await rpc('review_ellna_form',{form_id_input:current.id,action_input:action,note_input:note});
      if(error)return message('Review not saved: '+error.message);
      await loadSaved();current=recordToCurrent(saved.find(row=>row.id===current.id));render();toast(action==='review'?'ELLNA form reviewed.':'Correction requested.');
    });
    document.querySelector('#ellnaExport')?.addEventListener('click',async()=>{
      try {
        const result=cloudMode?await rpc('export_ellna_form',{form_id_input:current.id}):{data:current,error:null};
        if(result.error)throw result.error;
        const url=URL.createObjectURL(new Blob([JSON.stringify(result.data,null,2)],{type:'application/json'}));
        const link=document.createElement('a');link.href=url;link.download=`ellna-${current.id}.json`;link.click();URL.revokeObjectURL(url);
        message('Export prepared and recorded in the audit log.');
      }catch(err){message('Export failed: '+err.message);}
    });
    document.querySelector('#ellnaDelete')?.addEventListener('click',async()=>{
      const reason=prompt('Why should this ELLNA record be deleted?','');if(!reason)return;
      if(!cloudMode){saved=saved.filter(row=>row.id!==current.id);localStorage.setItem('ellna-demo-'+owner,JSON.stringify(saved));current={};render();return;}
      const {data,error}=await rpc('request_ellna_deletion',{form_id_input:current.id,reason_input:reason});
      if(error)return message('Deletion request failed: '+error.message);
      await loadSaved();const row=saved.find(item=>item.id===current.id);current=row?recordToCurrent(row):{};render();toast(data==='deleted'?'Draft deleted.':'Deletion request recorded.');
    });
    document.querySelectorAll('[data-ellna-print]').forEach(button=>button.onclick=()=>{
      const form=document.querySelector('#ellnaForm');if(!form.reportValidity())return;
      current=valueForm();if(age(current)<0)return message('Check the birth and assessment dates.');
      const win=window.open('','_blank');if(!win)return message('Allow pop-ups to open the printable form.');
      win.document.write(printable(current,button.dataset.ellnaPrint));win.document.close();
      win.document.querySelector('#printEllna').addEventListener('click',()=>win.print());
    });
  };
})();


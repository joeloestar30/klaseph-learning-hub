(() => {
  const teacherClassIds=()=>new Set(teacherClasses().map(item=>item.id));
  let enrollmentCandidates=[];
  const reviewPanel=()=>{
    if(!canTeach()||!cloudMode)return '';
    const attempts=(state.attemptReviews||[]).filter(item=>teacherClassIds().has(item.class_id));
    return `<div class="panel span-12"><div class="panel-title"><h3>Assessment review</h3><span class="muted">Server-backed scoring and feedback</span></div><div class="list">${attempts.map(attempt=>{
      const answers=(state.attemptAnswers||[]).filter(item=>item.attempt_id===attempt.attempt_id);
      return `<form class="item review-attempt" data-attempt-id="${attempt.attempt_id}"><div class="item-head"><h4>${esc(attempt.student_name)} · ${esc(attempt.exam_title)}</h4><span class="chip">${esc(attempt.status)}</span></div>${answers.map(answer=>`<label>${answer.item_no}. ${esc(answer.prompt)}<span class="muted">${esc(answer.answer_text||'No answer')}</span><input type="number" name="${answer.answer_id}" min="0" max="${answer.points}" step="0.25" value="${answer.awarded_points??''}" aria-label="Points for item ${answer.item_no}"></label>`).join('')}<label>Feedback<textarea name="feedback" maxlength="2000">${esc(attempt.feedback||'')}</textarea></label><button class="button">Save score</button></form>`;
    }).join('')||empty()}</div></div>`;
  };
  const analyticsPanel=()=>{
    if(!canTeach()||!cloudMode)return '';
    const items=state.itemAnalysis||[],competencies=state.competencyPerformance||[];
    return `<div class="panel span-7"><div class="panel-title"><h3>Item analysis</h3></div><div class="table-wrap"><table><thead><tr><th>Exam</th><th>Item</th><th>Responses</th><th>Correct</th><th>Avg points</th></tr></thead><tbody>${items.map(item=>`<tr><td>${esc(item.title)}</td><td>${item.item_no}</td><td>${item.responses}</td><td>${item.correct_responses}</td><td>${item.average_points??'-'} / ${item.points}</td></tr>`).join('')||'<tr><td colspan="5">No graded attempts yet.</td></tr>'}</tbody></table></div></div><div class="panel span-5"><div class="panel-title"><h3>Competency performance</h3></div><div class="list">${competencies.map(item=>`<article class="item"><h4>${esc(item.competency)}</h4><div class="muted">${esc(item.source_version)} · ${item.attempts} attempts</div><span class="chip ${Number(item.average_percent)<75?'gold':'green'}">${item.average_percent??'-'}%</span></article>`).join('')||empty()}</div></div>`;
  };
  const rosterPanel=()=>canTeach()?`<div class="composer span-12"><div class="panel-title"><h3>Class roster</h3><span class="muted">CSV columns: email, lrn</span></div><div class="form-grid"><label>Class<select id="rosterClass">${teacherClasses().map(item=>`<option value="${item.id}">${esc(item.name)}</option>`).join('')}</select></label><label>CSV file<input id="rosterFile" type="file" accept=".csv,text/csv"></label><button class="button" type="button" id="importRoster">Import roster</button><button class="ghost" type="button" id="exportRoster">Export roster</button></div><p id="rosterMessage" role="status"></p></div>`:'';
  const enrollmentPanel=()=>{
    if(role()!=='teacher'||state.previewUserId)return '';
    const classes=teacherClasses();
    if(!classes.length)return `<div class="composer span-12"><div class="panel-title"><h3>Add a student to your class</h3></div><p>Create a class first. You can then find and enroll an active student from that class's school.</p></div>`;
    return `<div class="composer span-12"><div class="panel-title"><h3>Add a student to your class</h3><span class="muted">Only active student accounts from the class school are listed.</span></div><div class="form-grid"><label>Class<select id="teacherEnrollClass">${classes.map(item=>`<option value="${item.id}">${esc(item.name)}</option>`).join('')}</select></label><label>Search by student name or email<input id="teacherEnrollSearch" type="search" minlength="2" autocomplete="off" placeholder="Enter at least 2 characters"></label><button class="ghost" type="button" id="teacherFindStudents">Find students</button><label class="full">Matching students<select id="teacherEnrollStudent" disabled><option value="">Search for a student first…</option></select></label><button class="button full" type="button" id="teacherEnrollSubmit" disabled>Enroll selected student</button></div><p id="teacherEnrollMessage" role="status"></p></div>`;
  };
  const attendancePanel=()=>{
    if(!canTeach())return '';
    const first=teacherClasses()[0],members=state.memberships.filter(item=>item.classId===first?.id);
    return `<div class="composer span-12"><div class="panel-title"><h3>Dated attendance</h3></div><form id="attendanceBatch" class="form-grid"><label>Class<select name="class_id" id="attendanceClass">${teacherClasses().map(item=>`<option value="${item.id}">${esc(item.name)}</option>`).join('')}</select></label><label>Date<input name="attendance_date" type="date" max="${new Date().toISOString().slice(0,10)}" value="${new Date().toISOString().slice(0,10)}" required></label><div class="full" id="attendanceLearners">${members.map(member=>`<label>${esc(state.users.find(user=>user.id===member.userId)?.name||'Learner')}<select name="student:${member.userId}"><option>present</option><option>absent</option><option>late</option><option>excused</option></select></label>`).join('')}</div><button class="button full">Save attendance</button></form></div>`;
  };
  function parseCsv(text){
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean),headers=(lines.shift()||'').split(',').map(x=>x.trim().toLowerCase());
    return lines.map(line=>{const values=line.split(',').map(x=>x.trim().replace(/^"|"$/g,''));return Object.fromEntries(headers.map((key,index)=>[key,values[index]||'']));});
  }
  function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
  function attendanceRows(classId){return state.memberships.filter(item=>item.classId===classId).map(member=>`<label>${esc(state.users.find(user=>user.id===member.userId)?.name||'Learner')}<select name="student:${member.userId}"><option>present</option><option>absent</option><option>late</option><option>excused</option></select></label>`).join('');}
  function bind(){
    document.querySelector('#teacherFindStudents')?.addEventListener('click',async()=>{
      const classId=document.querySelector('#teacherEnrollClass').value,term=document.querySelector('#teacherEnrollSearch').value.trim(),message=document.querySelector('#teacherEnrollMessage'),select=document.querySelector('#teacherEnrollStudent'),button=document.querySelector('#teacherFindStudents');
      enrollmentCandidates=[];select.innerHTML='<option value="">Searching…</option>';select.disabled=true;document.querySelector('#teacherEnrollSubmit').disabled=true;
      if(term.length<2){message.textContent='Enter at least 2 characters to search.';select.innerHTML='<option value="">Search for a student first…</option>';return;}
      button.disabled=true;
      try{
        if(cloudMode){
          const result=await callRpc('teacher_search_enrollable_students',{class_id_input:classId,search_input:term});
          if(result.error)throw result.error;
          enrollmentCandidates=result.data||[];
        }else{
          const classItem=teacherClasses().find(item=>item.id===classId),school=classItem?.schoolId||user().schoolId||null,schoolName=classItem?.school||user().school||'';
          const enrolled=new Set(state.memberships.filter(item=>item.classId===classId).map(item=>item.userId));
          enrollmentCandidates=state.users.filter(item=>item.role==='student'&&item.status!=='archived'&&!enrolled.has(item.id)&&((school&&item.schoolId===school)||(!school&&schoolName&&item.school===schoolName))&&`${item.name} ${item.email}`.toLowerCase().includes(term.toLowerCase())).map(item=>({student_id:item.id,full_name:item.name,email:item.email,school_name:item.school}));
        }
        select.innerHTML='<option value="">Choose the correct student…</option>'+enrollmentCandidates.map((item,index)=>`<option value="${index}">${esc(item.full_name)} · ${esc(item.email)} · ${esc(item.school_name||'School not listed')}</option>`).join('');
        select.disabled=!enrollmentCandidates.length;message.textContent=enrollmentCandidates.length?`${enrollmentCandidates.length} eligible student(s) found. Confirm the name, email, and school before enrolling.`:'No eligible students matched that search. Check the name and class school.';
      }catch(error){select.innerHTML='<option value="">Search failed</option>';message.textContent=`Unable to search students: ${error.message}`;}
      finally{button.disabled=false;}
    });
    document.querySelector('#teacherEnrollStudent')?.addEventListener('change',event=>{document.querySelector('#teacherEnrollSubmit').disabled=event.target.value==='';});
    document.querySelector('#teacherEnrollClass')?.addEventListener('change',()=>{enrollmentCandidates=[];document.querySelector('#teacherEnrollStudent').innerHTML='<option value="">Search for a student first…</option>';document.querySelector('#teacherEnrollStudent').disabled=true;document.querySelector('#teacherEnrollSubmit').disabled=true;document.querySelector('#teacherEnrollMessage').textContent='';});
    document.querySelector('#teacherEnrollSearch')?.addEventListener('input',()=>{enrollmentCandidates=[];document.querySelector('#teacherEnrollStudent').innerHTML='<option value="">Search again to refresh matches…</option>';document.querySelector('#teacherEnrollStudent').disabled=true;document.querySelector('#teacherEnrollSubmit').disabled=true;});
    document.querySelector('#teacherEnrollSubmit')?.addEventListener('click',async()=>{
      const classId=document.querySelector('#teacherEnrollClass').value,index=Number(document.querySelector('#teacherEnrollStudent').value),student=enrollmentCandidates[index],classItem=teacherClasses().find(item=>item.id===classId),message=document.querySelector('#teacherEnrollMessage'),button=document.querySelector('#teacherEnrollSubmit');
      if(!student||!classItem)return;
      if(!confirm(`Enroll ${student.full_name} (${student.email}) in ${classItem.name}?`))return;
      button.disabled=true;
      try{
        if(cloudMode){const result=await callRpc('teacher_enroll_student',{class_id_input:classId,student_id_input:student.student_id});if(result.error)throw result.error;}
        else state.memberships.push({classId,userId:student.student_id,attendance:'present'});
        enrollmentCandidates=[];
        if(cloudMode)await refreshCloudTables(['class_members','profiles','audit_logs']);
        render();toast(`${student.full_name} enrolled in ${classItem.name}.`);
      }catch(error){message(`Enrollment failed: ${error.message}`);button.disabled=false;}
    });
    document.querySelectorAll('.review-attempt').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(form),feedback=data.get('feedback');data.delete('feedback');const awards=Object.fromEntries(data);const result=await callRpc('grade_exam_attempt',{attempt_id_input:form.dataset.attemptId,awards_input:awards,feedback_input:feedback});if(result.error)return reportCloudError(result.error,'grade attempt');await refreshCloudTables(['teacher_attempt_reviews','teacher_attempt_answers','teacher_item_analysis','teacher_competency_performance','submissions']);render();toast(`Score saved: ${result.data}`);}));
    document.querySelector('#importRoster')?.addEventListener('click',async()=>{const file=document.querySelector('#rosterFile').files[0],classId=document.querySelector('#rosterClass').value,node=document.querySelector('#rosterMessage');if(!file)return node.textContent='Choose a CSV file.';const rows=parseCsv(await file.text());const result=await callRpc('import_class_roster',{class_id_input:classId,rows_input:rows});if(result.error)return node.textContent=result.error.message;await refreshCloudTables(['class_members','profiles']);render();toast(`Matched ${result.data.matched}; unmatched ${result.data.unmatched.length}.`);});
    document.querySelector('#exportRoster')?.addEventListener('click',()=>{const classId=document.querySelector('#rosterClass').value,rows=[['name','email','attendance']];state.memberships.filter(item=>item.classId===classId).forEach(member=>{const learner=state.users.find(user=>user.id===member.userId);rows.push([learner?.name||'',learner?.email||'',member.attendance]);});download('class-roster.csv',rows.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(',')).join('\n'));});
    document.querySelector('#attendanceClass')?.addEventListener('change',event=>{document.querySelector('#attendanceLearners').innerHTML=attendanceRows(event.target.value);});
    document.querySelector('#attendanceBatch')?.addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(event.target),entries=[];for(const [key,value] of data)if(key.startsWith('student:'))entries.push({student_id:key.slice(8),status:value});const result=await callRpc('record_class_attendance',{class_id_input:data.get('class_id'),attendance_date_input:data.get('attendance_date'),entries_input:entries});if(result.error)return reportCloudError(result.error,'record attendance');await refreshCloudTables(['attendance','class_members']);render();toast(`${result.data} attendance records saved.`);});
  }
  window.KLASEPH_CLASSROOM={reviewPanel,analyticsPanel,rosterPanel,enrollmentPanel,attendancePanel,bind};
})();

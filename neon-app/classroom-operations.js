(() => {
  let selectedClassId = null;
  let enrollmentCandidates = null;
  let lastSearchTerm = '';
  let isSearching = false;

  const teacherClassIds = () => new Set(teacherClasses().map(item => item.id));

  function classMemberships() {
    return (typeof previewMembershipSource === 'function' ? previewMembershipSource() : state.memberships) || [];
  }

  function resolveStudent(userId) {
    if (typeof previewPerson === 'function') {
      const p = previewPerson(userId);
      if (p) return p;
    }
    return (state.users || []).find(u => u.id === userId) ||
           (state.directoryUsers || []).find(u => u.id === userId) ||
           { id: userId, name: 'Learner', email: '' };
  }

  function getActiveClasses() {
    return teacherClasses();
  }

  function getSelectedClass() {
    const classes = getActiveClasses();
    if (!classes.length) return null;
    if (!selectedClassId || !classes.some(c => c.id === selectedClassId)) {
      selectedClassId = classes[0].id;
    }
    return classes.find(c => c.id === selectedClassId) || classes[0];
  }

  function getLocalCandidates(classId, term = '') {
    const classItem = getActiveClasses().find(c => c.id === classId);
    const enrolledIds = new Set(classMemberships().filter(m => m.classId === classId).map(m => m.userId));
    const school = classItem?.schoolId || user()?.schoolId || null;
    const schoolName = classItem?.school || user()?.school || '';
    const search = term.toLowerCase().trim();

    const allUsers = [...(state.users || []), ...(state.directoryUsers || [])];
    const uniqueUsers = Array.from(new Map(allUsers.map(u => [u.id, u])).values());

    return uniqueUsers
      .filter(u => {
        if (u.role !== 'student' || u.status === 'archived') return false;
        if (enrolledIds.has(u.id)) return false;
        if (school && u.schoolId && u.schoolId !== school) return false;
        if (schoolName && u.school && u.school.toLowerCase() !== schoolName.toLowerCase()) return false;
        if (search) {
          const text = `${u.name || ''} ${u.email || ''}`.toLowerCase();
          if (!text.includes(search)) return false;
        }
        return true;
      })
      .map(u => ({
        student_id: u.id,
        full_name: u.name,
        email: u.email,
        school_name: u.school || schoolName || 'School unassigned'
      }));
  }

  const reviewPanel = () => {
    if (!canTeach() || !cloudMode) return '';
    const attempts = (state.attemptReviews || []).filter(item => teacherClassIds().has(item.class_id));
    return `<div class="panel span-12"><div class="panel-title"><h3>Assessment review</h3><span class="muted">Server-backed scoring and feedback</span></div><div class="list">${attempts.map(attempt => {
      const answers = (state.attemptAnswers || []).filter(item => item.attempt_id === attempt.attempt_id);
      return `<form class="item review-attempt" data-attempt-id="${attempt.attempt_id}"><div class="item-head"><h4>${esc(attempt.student_name)} · ${esc(attempt.exam_title)}</h4><span class="chip">${esc(attempt.status)}</span></div>${answers.map(answer => `<label>${answer.item_no}. ${esc(answer.prompt)}<span class="muted">${esc(answer.answer_text || 'No answer')}</span><input type="number" name="${answer.answer_id}" min="0" max="${answer.points}" step="0.25" value="${answer.awarded_points ?? ''}" aria-label="Points for item ${answer.item_no}"></label>`).join('')}<label>Feedback<textarea name="feedback" maxlength="2000">${esc(attempt.feedback || '')}</textarea></label><button class="button">Save score</button></form>`;
    }).join('') || empty()}</div></div>`;
  };

  const analyticsPanel = () => {
    if (!canTeach() || !cloudMode) return '';
    const items = state.itemAnalysis || [], competencies = state.competencyPerformance || [];
    return `<div class="panel span-7"><div class="panel-title"><h3>Item analysis</h3></div><div class="table-wrap"><table><thead><tr><th>Exam</th><th>Item</th><th>Responses</th><th>Correct</th><th>Avg points</th></tr></thead><tbody>${items.map(item => `<tr><td>${esc(item.title)}</td><td>${item.item_no}</td><td>${item.responses}</td><td>${item.correct_responses}</td><td>${item.average_points ?? '-'} / ${item.points}</td></tr>`).join('') || '<tr><td colspan="5">No graded attempts yet.</td></tr>'}</tbody></table></div></div><div class="panel span-5"><div class="panel-title"><h3>Competency performance</h3></div><div class="list">${competencies.map(item => `<article class="item"><h4>${esc(item.competency)}</h4><div class="muted">${esc(item.source_version)} · ${item.attempts} attempts</div><span class="chip ${Number(item.average_percent) < 75 ? 'gold' : 'green'}">${item.average_percent ?? '-'}%</span></article>`).join('') || empty()}</div></div>`;
  };

  const rosterPanel = () => canTeach() ? `
    <div class="composer span-12">
      <div class="panel-title"><h3>Batch roster CSV</h3><span class="muted">Upload or download roster for bulk updates (columns: email, lrn)</span></div>
      <div class="form-grid">
        <label>Class<select id="rosterClass">${teacherClasses().map(item => `<option value="${item.id}" ${item.id === selectedClassId ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
        <label>CSV file<input id="rosterFile" type="file" accept=".csv,text/csv"></label>
        <button class="button" type="button" id="importRoster">Import roster</button>
        <button class="ghost" type="button" id="exportRoster">Export roster</button>
      </div>
      <p id="rosterMessage" role="status"></p>
    </div>` : '';

  const enrollmentPanel = () => {
    if (!canTeach()) return '';
    const classes = getActiveClasses();
    if (!classes.length) {
      return `<div class="composer span-12"><div class="panel-title"><h3>Class Roster & Student Directory</h3></div><p class="muted">Create a class first. You can then manage your enrolled learners and add students from your school directory.</p></div>`;
    }

    const currentClass = getSelectedClass();
    const members = classMemberships().filter(m => m.classId === currentClass.id);

    // Candidates: in demo mode auto-resolve if null; in cloud mode keep user-triggered or resolved
    const candidates = enrollmentCandidates !== null
      ? enrollmentCandidates
      : (!cloudMode ? getLocalCandidates(currentClass.id, lastSearchTerm) : null);

    return `
      <div class="panel span-12">
        <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h3>Class Roster & Student Enrollment</h3>
            <span class="muted">Manage enrolled learners, view school directory, or share join code</span>
          </div>
          <label style="margin:0; display:flex; align-items:center; gap:8px;">
            <span style="font-weight:600;">Active Class:</span>
            <select id="teacherEnrollClass">
              ${classes.map(c => `<option value="${c.id}" ${c.id === currentClass.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select>
          </label>
        </div>

        <!-- Join Code & Class Summary Banner -->
        <div class="standard-box full" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <div style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.5px; opacity:0.75; font-weight:600;">Class Join Code</div>
            <div style="display:flex; align-items:center; gap:10px; margin-top:4px;">
              <span class="chip" style="font-size:1.2rem; font-weight:700; letter-spacing:2px; padding:6px 14px;">${esc(currentClass.code || 'NO-CODE')}</span>
              <button class="ghost" type="button" id="copyClassCode" data-code="${esc(currentClass.code || '')}">Copy Code</button>
            </div>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span class="chip green">${members.length} enrolled</span>
            <span class="chip">${esc(currentClass.subject || 'Subject')}</span>
            ${currentClass.schedule ? `<span class="chip">${esc(currentClass.schedule)}</span>` : ''}
          </div>
        </div>

        <!-- Section 1: Enrolled Learners -->
        <div style="margin-bottom:24px;">
          <h4 style="margin:0 0 8px 0; display:flex; justify-content:space-between; align-items:center;">
            <span>Enrolled Learners (${members.length})</span>
          </h4>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Learner Name</th>
                  <th>Email</th>
                  <th>Attendance Status</th>
                  <th style="text-align:right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${members.length ? members.map(m => {
                  const s = resolveStudent(m.userId);
                  return `<tr>
                    <td><strong>${esc(s.name || 'Learner')}</strong></td>
                    <td><span class="muted">${esc(s.email || '-')}</span></td>
                    <td><span class="chip">${esc(m.attendance || 'present')}</span></td>
                    <td style="text-align:right;">
                      <button class="danger" type="button" data-remove-student="${esc(m.userId)}" data-class-id="${esc(currentClass.id)}" data-student-name="${esc(s.name || 'Learner')}">Remove</button>
                    </td>
                  </tr>`;
                }).join('') : `<tr><td colspan="4" class="muted" style="text-align:center; padding:18px;">No learners currently enrolled in this class. Share the join code above with your learners or add them from the school directory below.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Section 2: School Directory / Add Students -->
        <div class="composer" style="margin-top:16px;">
          <div class="panel-title">
            <h3>Add Students from School Directory</h3>
            <span class="muted">Search or browse active students registered in your school who are not yet enrolled</span>
          </div>
          <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
            <input id="teacherEnrollSearch" type="search" placeholder="Search by student name or email..." value="${esc(lastSearchTerm)}" style="flex:1; min-width:200px;">
            <button class="button" type="button" id="teacherFindStudents">${isSearching ? 'Searching…' : 'Browse / Search'}</button>
          </div>
          <p id="teacherEnrollMessage" role="status" style="margin-bottom:8px; font-weight:500;"></p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Email</th>
                  <th>School</th>
                  <th style="text-align:right;">Action</th>
                </tr>
              </thead>
              <tbody id="teacherEnrollCandidatesBody">
                ${candidates !== null ? (candidates.length ? candidates.map(c => `
                  <tr>
                    <td><strong>${esc(c.full_name)}</strong></td>
                    <td><span class="muted">${esc(c.email)}</span></td>
                    <td>${esc(c.school_name || 'School')}</td>
                    <td style="text-align:right;">
                      <button class="button" type="button" data-enroll-student="${esc(c.student_id)}" data-class-id="${esc(currentClass.id)}" data-student-name="${esc(c.full_name)}">+ Add to Class</button>
                    </td>
                  </tr>
                `).join('') : `<tr><td colspan="4" class="muted" style="text-align:center; padding:16px;">No eligible students matched. All active students in this school may already be enrolled, or try another search term.</td></tr>`)
                : `<tr><td colspan="4" class="muted" style="text-align:center; padding:16px;">Click <strong>"Browse / Search"</strong> above to view available students from your school directory.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  };

  const attendancePanel = () => {
    if (!canTeach()) return '';
    const first = teacherClasses()[0], members = state.memberships.filter(item => item.classId === first?.id);
    return `<div class="composer span-12"><div class="panel-title"><h3>Dated attendance</h3></div><form id="attendanceBatch" class="form-grid"><label>Class<select name="class_id" id="attendanceClass">${teacherClasses().map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('')}</select></label><label>Date<input name="attendance_date" type="date" max="${new Date().toISOString().slice(0, 10)}" value="${new Date().toISOString().slice(0, 10)}" required></label><div class="full" id="attendanceLearners">${members.map(member => `<label>${esc(state.users.find(user => user.id === member.userId)?.name || 'Learner')}<select name="student:${member.userId}"><option>present</option><option>absent</option><option>late</option><option>excused</option></select></label>`).join('')}</div><button class="button full">Save attendance</button></form></div>`;
  };

  function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean), headers = (lines.shift() || '').split(',').map(x => x.trim().toLowerCase());
    return lines.map(line => { const values = line.split(',').map(x => x.trim().replace(/^"|"$/g, '')); return Object.fromEntries(headers.map((key, index) => [key, values[index] || ''])); });
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })), a = document.createElement('a');
    a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }

  function attendanceRows(classId) {
    return state.memberships.filter(item => item.classId === classId).map(member => `<label>${esc(state.users.find(user => user.id === member.userId)?.name || 'Learner')}<select name="student:${member.userId}"><option>present</option><option>absent</option><option>late</option><option>excused</option></select></label>`).join('');
  }

  async function executeSearch() {
    const classItem = getSelectedClass();
    if (!classItem) return;
    const term = (document.querySelector('#teacherEnrollSearch')?.value || '').trim();
    lastSearchTerm = term;
    isSearching = true;

    try {
      if (cloudMode) {
        const result = await callRpc('teacher_search_enrollable_students', { class_id_input: classItem.id, search_input: term });
        if (result.error) throw result.error;
        enrollmentCandidates = result.data || [];
      } else {
        enrollmentCandidates = getLocalCandidates(classItem.id, term);
      }
    } catch (err) {
      toast(`Search error: ${err.message}`);
      enrollmentCandidates = [];
    } finally {
      isSearching = false;
      render();
    }
  }

  function bind() {
    // Class switcher in enrollment panel
    document.querySelector('#teacherEnrollClass')?.addEventListener('change', event => {
      selectedClassId = event.target.value;
      enrollmentCandidates = null;
      render();
    });

    // Copy Join Code button
    document.querySelector('#copyClassCode')?.addEventListener('click', event => {
      const code = event.currentTarget.dataset.code;
      if (!code) return;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(code).then(() => {
          toast(`Class code ${code} copied to clipboard!`);
        }).catch(() => {
          prompt('Copy class join code:', code);
        });
      } else {
        prompt('Copy class join code:', code);
      }
    });

    // Browse / Search button
    document.querySelector('#teacherFindStudents')?.addEventListener('click', () => {
      executeSearch();
    });

    // Enter key in search box
    document.querySelector('#teacherEnrollSearch')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        executeSearch();
      }
    });

    // Direct Enroll button (+ Add to Class)
    document.querySelectorAll('[data-enroll-student]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const studentId = btn.dataset.enrollStudent;
        const classId = btn.dataset.classId;
        const studentName = btn.dataset.studentName || 'Student';
        btn.disabled = true;

        try {
          if (cloudMode) {
            const result = await callRpc('teacher_enroll_student', { class_id_input: classId, student_id_input: studentId });
            if (result.error) throw result.error;
            await refreshCloudTables(['class_members', 'profiles', 'audit_logs']);
          } else {
            state.memberships.push({ classId, userId: studentId, attendance: 'present' });
          }
          enrollmentCandidates = null;
          render();
          toast(`${studentName} enrolled successfully.`);
        } catch (error) {
          toast(`Enrollment failed: ${error.message}`);
          btn.disabled = false;
        }
      });
    });

    // Remove Student button (Unenroll)
    document.querySelectorAll('[data-remove-student]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const studentId = btn.dataset.removeStudent;
        const classId = btn.dataset.classId;
        const studentName = btn.dataset.studentName || 'Student';
        if (!confirm(`Remove ${studentName} from this class?`)) return;
        btn.disabled = true;

        try {
          if (cloudMode) {
            const result = await callRpc('teacher_remove_student', { class_id_input: classId, student_id_input: studentId });
            if (result.error) throw result.error;
            await refreshCloudTables(['class_members', 'profiles', 'audit_logs']);
          } else {
            state.memberships = state.memberships.filter(m => !(m.classId === classId && m.userId === studentId));
          }
          enrollmentCandidates = null;
          render();
          toast(`${studentName} removed from class.`);
        } catch (error) {
          toast(`Remove failed: ${error.message}`);
          btn.disabled = false;
        }
      });
    });

    // Assessment review submission
    document.querySelectorAll('.review-attempt').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form), feedback = data.get('feedback');
      data.delete('feedback');
      const awards = Object.fromEntries(data);
      const result = await callRpc('grade_exam_attempt', { attempt_id_input: form.dataset.attemptId, awards_input: awards, feedback_input: feedback });
      if (result.error) return reportCloudError(result.error, 'grade attempt');
      await refreshCloudTables(['teacher_attempt_reviews', 'teacher_attempt_answers', 'teacher_item_analysis', 'teacher_competency_performance', 'submissions']);
      render();
      toast(`Score saved: ${result.data}`);
    }));

    // CSV Roster import & export
    document.querySelector('#importRoster')?.addEventListener('click', async () => {
      const file = document.querySelector('#rosterFile').files[0], classId = document.querySelector('#rosterClass').value, node = document.querySelector('#rosterMessage');
      if (!file) return node.textContent = 'Choose a CSV file.';
      const rows = parseCsv(await file.text());
      const result = await callRpc('import_class_roster', { class_id_input: classId, rows_input: rows });
      if (result.error) return node.textContent = result.error.message;
      await refreshCloudTables(['class_members', 'profiles']);
      render();
      toast(`Matched ${result.data.matched}; unmatched ${result.data.unmatched.length}.`);
    });

    document.querySelector('#exportRoster')?.addEventListener('click', () => {
      const classId = document.querySelector('#rosterClass').value, rows = [['name', 'email', 'attendance']];
      state.memberships.filter(item => item.classId === classId).forEach(member => {
        const learner = state.users.find(user => user.id === member.userId);
        rows.push([learner?.name || '', learner?.email || '', member.attendance]);
      });
      download('class-roster.csv', rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n'));
    });

    // Attendance batch
    document.querySelector('#attendanceClass')?.addEventListener('change', event => {
      document.querySelector('#attendanceLearners').innerHTML = attendanceRows(event.target.value);
    });

    document.querySelector('#attendanceBatch')?.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.target), entries = [];
      for (const [key, value] of data) if (key.startsWith('student:')) entries.push({ student_id: key.slice(8), status: value });
      const result = await callRpc('record_class_attendance', { class_id_input: data.get('class_id'), attendance_date_input: data.get('attendance_date'), entries_input: entries });
      if (result.error) return reportCloudError(result.error, 'record attendance');
      await refreshCloudTables(['attendance', 'class_members']);
      render();
      toast(`${result.data} attendance records saved.`);
    });
  }

  window.KLASEPH_CLASSROOM = { reviewPanel, analyticsPanel, rosterPanel, enrollmentPanel, attendancePanel, bind };
})();

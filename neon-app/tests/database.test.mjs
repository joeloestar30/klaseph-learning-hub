import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('Neon schema: onboarding, classroom isolation, role escalation and suspension', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create schema auth; create schema neon_auth;
      create function auth.user_id() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'') $$;
      grant usage on schema auth to authenticated;
      create table neon_auth."user"(id text primary key,email text,"emailVerified" boolean);
    `);
    await db.exec(await readFile('database/schema.sql','utf8'));
    await db.exec(await readFile('database/ellna.sql','utf8'));
    await db.exec(await readFile('database/secure-assessments.sql','utf8'));
    await db.exec(await readFile('database/ellna-workflow.sql','utf8'));
    await db.exec(await readFile('database/canonical-assessments.sql','utf8'));
    await db.exec(await readFile('database/classroom-operations.sql','utf8'));
    await db.exec(await readFile('database/access-control.sql','utf8'));
    await db.exec(await readFile('database/permission-enforcement.sql','utf8'));
    const teacher='00000000-0000-4000-8000-000000000001';
    const student='00000000-0000-4000-8000-000000000002';
    const stranger='00000000-0000-4000-8000-000000000003';
    const unverified='00000000-0000-4000-8000-000000000004';
    for (const [id,email,verified] of [[teacher,'teacher@example.test',true],[student,'student@example.test',true],[stranger,'stranger@example.test',true],[unverified,'unverified@example.test',false]]) {
      await db.query('insert into neon_auth."user" values($1,$2,$3)',[id,email,verified]);
    }
    async function asUser(id,sql,params=[]) {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
      try { return await db.query(sql,params); } finally { await db.exec('reset role'); }
    }
    await assert.rejects(asUser(unverified,'select public.complete_onboarding($1)',[{full_name:'Unverified',role:'student'}]),/Verify your email/);
    await assert.rejects(asUser(student,'select public.complete_onboarding($1)',[{full_name:'Escalation',role:'super_admin'}]),/Choose teacher or student/);
    for (const [id,role] of [[teacher,'teacher'],[student,'student'],[stranger,'teacher']]) {
      await asUser(id,'select public.complete_onboarding($1)',[{full_name:role,role,school_name:'Local School'}]);
    }
    await assert.rejects(asUser(student,"update public.profiles set role='super_admin' where id=$1",[student]),/permission denied/);
    await asUser(student,'select public.complete_onboarding($1)',[{full_name:'Changed',role:'super_admin'}]);
    assert.equal((await db.query('select role from profiles where id=$1',[student])).rows[0].role,'student');
    const classroom=(await asUser(teacher,"insert into public.classes(teacher_id,name,subject,join_code) values($1,'Test class','Science','TEST42') returning id",[teacher])).rows[0].id;
    assert.equal((await asUser(student,'select * from public.classes')).rows.length,0);
    await assert.rejects(asUser(student,'insert into public.class_members(class_id,user_id) values($1,$2)',[classroom,student]),/row-level security/);
    await assert.rejects(asUser(student,"select public.join_class_by_code('INVALID')"),/Class code not found/);
    await asUser(student,"select public.join_class_by_code('TEST42')");
    assert.equal((await asUser(student,'select * from public.classes')).rows.length,1);
    assert.equal((await asUser(stranger,'select * from public.classes')).rows.length,0);
    const ellnaPayload={last_name:'Learner',first_name:'One',assessment_date:'2026-11-12'};
    const ellnaId=(await asUser(student,"select public.save_ellna_form(null,$1,null,'2026-2027',$2,'draft') as id",[classroom,ellnaPayload])).rows[0].id;
    await assert.rejects(asUser(student,"update public.ellna_forms set payload='{}' where id=$1",[ellnaId]),/permission denied/);
    await asUser(student,"select public.save_ellna_form($1,$2,null,'2026-2027',$3,'submit')",[ellnaId,classroom,ellnaPayload]);
    const firstSubmission=(await db.query('select submitted_at,status,class_id,student_id from ellna_forms where id=$1',[ellnaId])).rows[0];
    assert.equal(firstSubmission.status,'submitted');
    assert.equal(firstSubmission.class_id,classroom);
    assert.equal(firstSubmission.student_id,student);
    assert.equal((await asUser(teacher,'select * from ellna_forms where id=$1',[ellnaId])).rows.length,1);
    assert.equal((await asUser(stranger,'select * from ellna_forms where id=$1',[ellnaId])).rows.length,0);
    await asUser(teacher,"select public.review_ellna_form($1,'request_correction','Confirm the learner reference number')",[ellnaId]);
    assert.equal((await asUser(student,'select status from ellna_forms where id=$1',[ellnaId])).rows[0].status,'needs_correction');
    await asUser(student,"select public.save_ellna_form($1,$2,null,'2026-2027',$3,'submit')",[ellnaId,classroom,{...ellnaPayload,lrn:'123456789012'}]);
    const resubmitted=(await db.query('select submitted_at,resubmitted_at,status from ellna_forms where id=$1',[ellnaId])).rows[0];
    assert.equal(resubmitted.submitted_at.toISOString(),firstSubmission.submitted_at.toISOString());
    assert.ok(resubmitted.resubmitted_at);
    await asUser(teacher,"select public.review_ellna_form($1,'review',null)",[ellnaId]);
    const exported=(await asUser(student,'select public.export_ellna_form($1) as data',[ellnaId])).rows[0].data;
    assert.equal(exported.status,'reviewed');
    assert.equal(exported.payload.lrn,'123456789012');
    await assert.rejects(asUser(stranger,'select public.export_ellna_form($1)',[ellnaId]),/Not authorized/);
    assert.equal((await asUser(student,"select public.request_ellna_deletion($1,'Learner requested removal') as result",[ellnaId])).rows[0].result,'requested');
    await assert.rejects(asUser(student,"select public.finalize_ellna_deletion($1,'Approved privacy request',true)",[ellnaId]),/Super administrator/);
    const draftToDelete=(await asUser(student,"select public.save_ellna_form(null,$1,null,'2026-2027',$2,'draft') as id",[classroom,ellnaPayload])).rows[0].id;
    assert.equal((await asUser(student,"select public.request_ellna_deletion($1,'Discard duplicate draft') as result",[draftToDelete])).rows[0].result,'deleted');
    assert.equal((await db.query('select * from ellna_forms where id=$1',[draftToDelete])).rows.length,0);
    const questionId='00000000-0000-4000-8000-000000000020';
    const examPayload={
      activity_id:'00000000-0000-4000-8000-000000000021',class_id:classroom,title:'Secure science check',
      assessment_component:'Written Work',due_date:'2099-12-31',max_attempts:1,
      instructions:'Choose the correct answer.',standard:{grade:'7',subject:'Science',quarter:'Q1',topic:'Matter'},
      questions:[{id:questionId,type:'mcq',difficulty:'Easy',prompt:'Water freezes at?',answer:'0 C',points:2,choices:['0 C','100 C']}]
    };
    const activityId=(await asUser(teacher,'select public.publish_exam($1) as id',[examPayload])).rows[0].id;
    const safeActivity=(await asUser(student,'select questions from public.activities where id=$1',[activityId])).rows[0];
    assert.deepEqual(safeActivity.questions,[]);
    const safeQuestion=(await asUser(student,'select * from public.student_questions')).rows[0];
    assert.equal(safeQuestion.prompt,'Water freezes at?');
    assert.equal(safeQuestion.answer_key,undefined);
    const safeChoice=(await asUser(student,'select * from public.student_question_choices order by choice_label')).rows[0];
    assert.equal(safeChoice.is_correct,undefined);
    await assert.rejects(asUser(student,'select answer_key from public.questions'),/permission denied/);
    await assert.rejects(asUser(student,'select public.publish_exam($1)',[examPayload]),/Only the class teacher/);
    const grade=(await asUser(student,'select public.submit_exam($1,$2) as result',[activityId,{[questionId]:'0 C'}])).rows[0].result;
    assert.equal(Number(grade.score),2);
    assert.equal(Number(grade.max_score),2);
    const review=(await asUser(teacher,'select * from public.teacher_attempt_reviews')).rows[0];
    const reviewAnswer=(await asUser(teacher,'select * from public.teacher_attempt_answers where attempt_id=$1',[review.attempt_id])).rows[0];
    assert.equal(Number(await asUser(teacher,'select public.grade_exam_attempt($1,$2,$3) as score',[review.attempt_id,{[reviewAnswer.answer_id]:1},'Good work']).then(result=>result.rows[0].score)),1);
    assert.equal((await asUser(teacher,'select * from public.teacher_item_analysis')).rows[0].responses,1);
    const rosterResult=(await asUser(teacher,'select public.import_class_roster($1,$2) as result',[classroom,[{email:'student@example.test'},{email:'missing@example.test'}]])).rows[0].result;
    assert.equal(rosterResult.matched,1);
    assert.equal(rosterResult.unmatched.length,1);
    assert.equal(Number((await asUser(teacher,"select public.record_class_attendance($1,'2026-11-12',$2) as saved",[classroom,[{student_id:student,status:'present'}]])).rows[0].saved),1);
    assert.equal((await asUser(student,"select status from public.attendance where class_id=$1 and attendance_date='2026-11-12'",[classroom])).rows[0].status,'present');
    await assert.rejects(asUser(student,"update public.submissions set score=999 where activity_id=$1",[activityId]),/permission denied/);
    await assert.rejects(asUser(student,'select public.submit_exam($1,$2)',[activityId,{[questionId]:'0 C'}]),/No attempts remaining/);
    assert.equal((await asUser(stranger,'select * from public.student_questions')).rows.length,0);
    const lateQuestionId='00000000-0000-4000-8000-000000000023';
    const latePayload={...examPayload,activity_id:'00000000-0000-4000-8000-000000000022',title:'Closed deadline',due_date:'2020-01-01',
      questions:[{...examPayload.questions[0],id:lateQuestionId}]};
    const lateActivity=(await asUser(teacher,'select public.publish_exam($1) as id',[latePayload])).rows[0].id;
    await assert.rejects(asUser(student,'select public.submit_exam($1,$2)',[lateActivity,{[lateQuestionId]:'0 C'}]),/deadline has passed/);
    assert.equal((await asUser(stranger,'select * from public.profiles')).rows.length,1);
    await assert.rejects(asUser(student,"select public.admin_update_profile($1,'super_admin','active',null)",[student]),/approved scoped access request/);
    await db.query("update public.profiles set status='suspended' where id=$1",[student]);
    assert.equal((await asUser(student,'select * from public.classes')).rows.length,0);
    await assert.rejects(asUser(student,"select public.join_class_by_code('TEST42')"),/active student account/);
    const oldProfile='00000000-0000-4000-8000-000000000010';
    const newIdentity='00000000-0000-4000-8000-000000000011';
    await db.query("insert into profiles(id,email,full_name,role) values($1,'returning@example.test','Returning admin','super_admin')",[oldProfile]);
    await db.query("insert into access_assignments(user_id,role_id,scope_type,scope_key,granted_by,reason) values($1,'super_admin','platform','*',$1,'Test bootstrap')",[oldProfile]);
    await db.query("insert into private.legacy_accounts values($1,'returning@example.test',true)",[oldProfile]);
    await db.query("insert into neon_auth.\"user\" values($1,'returning@example.test',false)",[newIdentity]);
    assert.equal((await asUser(newIdentity,'select public.claim_existing_profile() as id')).rows[0].id,null);
    await db.query('update neon_auth."user" set "emailVerified"=true where id=$1',[newIdentity]);
    assert.equal((await asUser(newIdentity,'select public.claim_existing_profile() as id')).rows[0].id,oldProfile);
    assert.equal((await asUser(newIdentity,'select role from profiles where id=$1',[oldProfile])).rows[0].role,'super_admin');
    const schoolId=(await db.query('select school_id from profiles where id=$1',[teacher])).rows[0].school_id;
    const schoolAdminRequest=(await asUser(newIdentity,"select public.request_access($1,'school_admin','school',$2,'School leadership assignment') as id",[stranger,schoolId])).rows[0].id;
    assert.equal((await asUser(newIdentity,"select public.approve_access_request($1,'approve','Approved for assigned school') as result",[schoolAdminRequest])).rows[0].result,'approved');
    const schoolAdminAssignment=(await db.query("select id from access_assignments where user_id=$1 and role_id='school_admin' and revoked_at is null",[stranger])).rows[0].id;
    assert.equal((await asUser(stranger,"select private.has_access_role('school_admin','school',$1) as allowed",[schoolId])).rows[0].allowed,true);
    await asUser(newIdentity,"select public.revoke_access($1,'Leadership assignment ended')",[schoolAdminAssignment]);
    assert.equal((await db.query('select role from profiles where id=$1',[stranger])).rows[0].role,'teacher');
    const secondAdmin='00000000-0000-4000-8000-000000000012';
    await db.query("insert into neon_auth.\"user\" values($1,'second-admin@example.test',true)",[secondAdmin]);
    await db.query("insert into profiles(id,email,full_name,role) values($1,'second-admin@example.test','Second approver','teacher')",[secondAdmin]);
    await db.query('insert into private.identity_links(neon_user_id,profile_id) values($1,$2)',[secondAdmin,secondAdmin]);
    await db.query("insert into access_assignments(user_id,role_id,scope_type,scope_key,granted_by,reason) values($1,'super_admin','platform','*',$2,'Test second approver')",[secondAdmin,oldProfile]);
    const superRequest=(await asUser(newIdentity,"select public.request_access($1,'super_admin','platform','*','Emergency platform coverage') as id",[stranger])).rows[0].id;
    assert.equal((await asUser(newIdentity,"select public.approve_access_request($1,'approve','First independent approval') as result",[superRequest])).rows[0].result,'awaiting_second_approval');
    assert.equal((await asUser(secondAdmin,"select public.approve_access_request($1,'approve','Second independent approval') as result",[superRequest])).rows[0].result,'approved');
    const grantedSuperAssignment=(await db.query("select id from access_assignments where user_id=$1 and role_id='super_admin' and revoked_at is null",[stranger])).rows[0].id;
    await asUser(newIdentity,"select public.revoke_access($1,'Emergency coverage ended')",[grantedSuperAssignment]);
    const secondAdminAssignment=(await db.query("select id from access_assignments where user_id=$1 and role_id='super_admin' and revoked_at is null",[secondAdmin])).rows[0].id;
    await asUser(newIdentity,"select public.revoke_access($1,'Test approver retired')",[secondAdminAssignment]);
    const finalSuperAssignment=(await db.query("select id from access_assignments where user_id=$1 and role_id='super_admin' and revoked_at is null",[oldProfile])).rows[0].id;
    await assert.rejects(asUser(newIdentity,"select public.revoke_access($1,'Must retain one administrator')",[finalSuperAssignment]),/final active super administrator/);
    await asUser(newIdentity,'select complete_onboarding($1)',[{full_name:'Wrong',role:'student'}]);
    assert.equal((await db.query('select role from profiles where id=$1',[oldProfile])).rows[0].role,'super_admin');
    await assert.rejects(asUser(student,"select public.import_official_competencies('[]','https://www.deped.gov.ph/source','MATATAG 2026')"),/Super administrator/);
    const official=[{grade_level:'Grade 4',subject:'Science',quarter:'Quarter 1',learning_area:'Science',competency_code:'S4-Q1-TEST',competency_text:'Test sourced competency'}];
    assert.equal(Number((await asUser(newIdentity,"select public.import_official_competencies($1,'https://www.deped.gov.ph/matatagcurriculumk147/','MATATAG Phase 1') as saved",[official])).rows[0].saved),1);
    assert.equal((await db.query("select is_official,source_version from competencies where competency_code='S4-Q1-TEST'")).rows[0].is_official,true);
    await assert.rejects(asUser(newIdentity,"select public.finalize_ellna_deletion($1,'Approved privacy request',false)",[ellnaId]),/Retention period/);
    await asUser(newIdentity,"select public.finalize_ellna_deletion($1,'Approved privacy request with documented override',true)",[ellnaId]);
    const deletedEllna=(await db.query('select status,payload,deleted_at from ellna_forms where id=$1',[ellnaId])).rows[0];
    assert.equal(deletedEllna.status,'deleted');
    assert.deepEqual(deletedEllna.payload,{});
    assert.ok(deletedEllna.deleted_at);
  } finally { await db.close(); }
});

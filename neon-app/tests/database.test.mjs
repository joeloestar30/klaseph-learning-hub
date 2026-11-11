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
    await asUser(teacher,"insert into ellna_forms(owner_id,school_year,payload) values($1,'2026-2027','{}')",[teacher]);
    assert.equal((await asUser(stranger,'select * from ellna_forms')).rows.length,0);
    await assert.rejects(asUser(student,"insert into ellna_forms(owner_id,school_year,payload) values($1,'2026-2027','{}')",[student]),/row-level security/);
    await assert.rejects(asUser(teacher,"insert into ellna_forms(owner_id,school_year,payload) values($1,'2026-2028','{}')",[teacher]),/check constraint/);
    await asUser(student,'select public.complete_onboarding($1)',[{full_name:'Changed',role:'super_admin'}]);
    assert.equal((await db.query('select role from profiles where id=$1',[student])).rows[0].role,'student');
    const classroom=(await asUser(teacher,"insert into public.classes(teacher_id,name,subject,join_code) values($1,'Test class','Science','TEST42') returning id",[teacher])).rows[0].id;
    assert.equal((await asUser(student,'select * from public.classes')).rows.length,0);
    await assert.rejects(asUser(student,'insert into public.class_members(class_id,user_id) values($1,$2)',[classroom,student]),/row-level security/);
    await assert.rejects(asUser(student,"select public.join_class_by_code('INVALID')"),/Class code not found/);
    await asUser(student,"select public.join_class_by_code('TEST42')");
    assert.equal((await asUser(student,'select * from public.classes')).rows.length,1);
    assert.equal((await asUser(stranger,'select * from public.classes')).rows.length,0);
    assert.equal((await asUser(stranger,'select * from public.profiles')).rows.length,1);
    await assert.rejects(asUser(student,"select public.admin_update_profile($1,'super_admin','active',null)",[student]),/Only super_admin/);
    await db.query("update public.profiles set status='suspended' where id=$1",[student]);
    assert.equal((await asUser(student,'select * from public.classes')).rows.length,0);
    await assert.rejects(asUser(student,"select public.join_class_by_code('TEST42')"),/active student account/);
    const oldProfile='00000000-0000-4000-8000-000000000010';
    const newIdentity='00000000-0000-4000-8000-000000000011';
    await db.query("insert into profiles(id,email,full_name,role) values($1,'returning@example.test','Returning admin','super_admin')",[oldProfile]);
    await db.query("insert into private.legacy_accounts values($1,'returning@example.test',true)",[oldProfile]);
    await db.query("insert into neon_auth.\"user\" values($1,'returning@example.test',false)",[newIdentity]);
    assert.equal((await asUser(newIdentity,'select public.claim_existing_profile() as id')).rows[0].id,null);
    await db.query('update neon_auth."user" set "emailVerified"=true where id=$1',[newIdentity]);
    assert.equal((await asUser(newIdentity,'select public.claim_existing_profile() as id')).rows[0].id,oldProfile);
    assert.equal((await asUser(newIdentity,'select role from profiles where id=$1',[oldProfile])).rows[0].role,'super_admin');
    await asUser(newIdentity,'select complete_onboarding($1)',[{full_name:'Wrong',role:'student'}]);
    assert.equal((await db.query('select role from profiles where id=$1',[oldProfile])).rows[0].role,'super_admin');
  } finally { await db.close(); }
});

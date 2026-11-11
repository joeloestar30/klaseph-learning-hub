import {readFile,writeFile} from 'node:fs/promises';
const snapshot = JSON.parse(await readFile('.migration/supabase-snapshot.json','utf8'));
const order=['schools','profiles','classes','class_members','activities','submissions','announcements','competencies','exams','questions','question_choices','exam_attempts','submission_answers','scores','attendance','interventions','admin_invites','audit_logs','system_settings','profile_onboarding'];
const literal = value => value === null ? 'null' : typeof value === 'boolean' || typeof value === 'number' ? String(value) : "'"+(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'","''")+"'";
let sql='begin;\n-- Fresh target only; abort if records are already present.\ndo $$ begin if exists(select 1 from public.profiles) or exists(select 1 from public.classes) then raise exception \'Target already contains records\'; end if; end $$;\n';
sql += 'alter table public.schools alter constraint schools_created_by_fkey deferrable initially deferred;\n';
sql += 'set constraints all deferred;\n';
for(const table of order) {
  for(const original of snapshot.tables[table] || []) {
    const row={...original};
    if(table==='profiles') delete row.lrn;
    const cols=Object.keys(row);
    sql+=`insert into public.${table} (${cols.map(c=>'"'+c+'"').join(',')}) values (${cols.map(c=>literal(row[c])).join(',')})`;
    // Only default seed rows can collide with this fresh target.
    if(table==='schools') sql+=' on conflict(name) do update set id=excluded.id';
    if(table==='system_settings') sql+=' on conflict(id) do update set '+cols.filter(c=>c!=='id').map(c=>`"${c}"=excluded."${c}"`).join(',');
    sql+=';\n';
  }
}
for (const profile of snapshot.tables.profiles) {
  const account=snapshot.accounts.find(a=>a.id===profile.id);
  if (!account || account.email.toLowerCase() !== profile.email.toLowerCase()) throw new Error('Source identity mismatch');
  sql+=`insert into private.legacy_accounts(profile_id,email,source_verified) values(${literal(profile.id)},${literal(account.email.trim().toLowerCase())},${literal(account.email_verified)});\n`;
  if(profile.lrn) sql+=`insert into public.profile_onboarding(user_id,lrn) values(${literal(profile.id)},${literal(profile.lrn)}) on conflict(user_id) do update set lrn=excluded.lrn;\n`;
}
sql+='commit;\nselect \'profiles\' as entity,count(*) from public.profiles union all select \'classes\',count(*) from public.classes union all select \'legacy_accounts\',count(*) from private.legacy_accounts;\n';
await writeFile('.migration/import.sql',sql);
console.log('Prepared transaction for '+snapshot.tables.profiles.length+' profiles and '+snapshot.tables.classes.length+' classes.');

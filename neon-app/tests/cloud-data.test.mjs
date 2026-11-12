import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

test('cloud data loader parallelizes role-aware datasets and paginates large admin tables', async () => {
  const calls=[];
  const client={from(name){
    const call={name,range:null,order:null};calls.push(call);
    const query={
      select(){return query;},
      order(column){call.order=column;return query;},
      range(from,to){call.range=[from,to];return query;},
      then(resolve){resolve({data:[{table:name}],error:null});}
    };
    return query;
  }};
  const window={KLASEPH_MONITOR:{capture(){throw new Error('unexpected database error');}}};
  runInNewContext(await readFile('cloud-data.js','utf8'),{window});
  const rows=await window.KLASEPH_CLOUD_DATA.load(client,{isAdmin:true,directoryPage:1,auditPage:2});
  assert.ok(rows.classes);
  assert.ok(rows.student_questions);
  assert.ok(rows.schools);
  assert.deepEqual(calls.find(call=>call.name==='profiles').range,[50,99]);
  assert.deepEqual(calls.find(call=>call.name==='audit_logs').range,[50,74]);
  assert.equal(calls.find(call=>call.name==='activities').order,'created_at');
});

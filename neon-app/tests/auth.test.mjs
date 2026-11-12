import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';

test('auth adapter handles sessions, verification, password reset and network errors', async () => {
  const compiled = await build({stdin:{contents:await readFile(new URL('../src/client.js', import.meta.url),'utf8'),resolveDir:fileURLToPath(new URL('..',import.meta.url)),sourcefile:'client.js'},bundle:true,write:false,format:'iife',plugins:[{
    name:'mock-neon',setup(b) {
      b.onResolve({filter:/^@neondatabase\/neon-js$/},()=>({path:'mock',namespace:'test'}));
      b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const createClient = () => window.mockClient;'}));
    }
  }]});
  let resetPayload;
  const identity = {id:'user1',email:'student@example.test',emailVerified:true};
  const native = {
    getSession:async()=>({data:{user:identity,session:{id:'session1'}},error:null}),
    signIn:{email:async()=>({data:{user:identity}})},
    signUp:{email:async()=>({data:{user:{...identity,emailVerified:false}}})},
    resetPassword:async payload=>{resetPayload=payload; return {error:null};},
    signOut:async()=>({error:null})
  };
  const window = {KLASEPH_CONFIG:{NEON_AUTH_URL:'https://auth.example.test',NEON_DATA_API_URL:'https://data.example.test'},mockClient:{auth:native,rpc:async()=>({data:null,error:null})}};
  const location = {search:'?token=reset-token'};
  runInNewContext(compiled.outputFiles[0].text,{window,location,URLSearchParams});
  const api = window.KLASEPH_NEON;
  assert.equal((await api.auth.getSession()).data.session.user.id,'user1');
  assert.equal((await api.auth.signInWithPassword({email:identity.email,password:'test'})).data.session.id,'session1');
  const signup = await api.auth.signUp({email:identity.email,password:'test',options:{data:{role:'student'}}});
  assert.equal(signup.data.session,null);
  assert.equal(api.pendingProfile().role,'student');
  await api.auth.updateUser({password:'new-test-password'});
  assert.equal(resetPayload.token,'reset-token');
  assert.equal(resetPayload.newPassword,'new-test-password');
  location.search='';
  assert.match((await api.auth.updateUser({password:'test'})).error.message,/reset link/);
  native.signIn.email=async()=>{throw new Error('Network offline');};
  assert.equal((await api.auth.signInWithPassword({email:identity.email,password:'test'})).error.message,'Network offline');
  await api.auth.signOut();
  assert.equal(api.pendingProfile(),null);
});

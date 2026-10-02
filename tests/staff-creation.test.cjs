
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
let handler,role='admin',valid=true,duplicate=false,setupFails=false;let operations=[];
const client={auth:{getUser:async()=>({data:{user:valid?{id:'actor'}:null},error:valid?null:{}}),admin:{createUser:async(body)=>{operations.push('create');return duplicate?{data:{},error:{message:'Email already exists'}}:{data:{user:{id:'new-only'}},error:null}},deleteUser:async(id)=>{operations.push('delete:'+id);return {error:null}}}},from(){let update=false;const q={select(){return q},eq(){return q},update(){operations.push('update');update=true;return q},single:async()=>update?{data:setupFails?null:{id:'new-only'},error:setupFails?{}:null}:{data:{role},error:null}};return q}};
const ctx={createClient:()=>client,Deno:{env:{get:()=>''},serve(fn){handler=fn}},Response};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../supabase/functions/create-staff-account/index.ts'),'utf8').replace(/^import .*;\n/m,''),ctx);
const body={email:'staff@example.com',password:'testpassword',full_name:'New Staff',role:'staff',department:'it'};
const req=(auth=true,data=body)=>new Request('https://example.com',{method:'POST',headers:auth?{Authorization:'Bearer token'}:{},body:JSON.stringify(data)});
(async()=>{
assert.equal((await handler(req(false))).status,401);valid=false;assert.equal((await handler(req())).status,401);valid=true;
for(const r of ['student','staff']){role=r;assert.equal((await handler(req())).status,403)}assert.equal(operations.length,0);role='admin';assert.equal((await handler(req(true,null))).status,400);assert.equal((await handler(req(true,{...body,role:'student'}))).status,400);
assert.equal((await handler(req())).status,201);assert.deepEqual(operations,['create','update']);operations=[];duplicate=true;assert.equal((await handler(req())).status,400);assert.deepEqual(operations,['create']);duplicate=false;operations=[];setupFails=true;assert.equal((await handler(req())).status,500);assert.deepEqual(operations,['create','update','delete:new-only']);console.log('PASS: server authentication, admin authorization, valid new staff, rejection of existing emails, malformed inputs, and new-account-only rollback.');
})().catch(e=>{console.error(e);process.exitCode=1});

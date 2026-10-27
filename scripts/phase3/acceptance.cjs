'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const e=require('./environment.cjs'),m=require('./migrations.cjs');
const {inventory}=require('./inventory.cjs');
const {migrate,MIGRATION_LOCK}=require(path.join(e.service,'src/database/migrate'));
const {withTransaction}=require(path.join(e.service,'src/database/transaction'));
const {graph,fixture,seed}=require(path.join(e.service,'test/helpers/phase3-fixtures'));
const s=e.load(),run=process.argv[2]||'development',stamp=new Date().toISOString().replace(/[:.]/g,'-'),prefix=`${run}-${stamp}`;
assert.match(run,/^[a-z]+$/);
const records=[];let db,p,g;
function save(name,data){e.evidence(s,`${prefix}/${name}.json`,data);}
async function check(name,purpose,work){const start=Date.now();try{const value=await work();records.push({name,purpose,command:`node scripts/phase3/acceptance.cjs ${run}`,status:'PASS',exitCode:0,startedAt:new Date(start).toISOString(),durationMs:Date.now()-start,evidencePath:`${s.evidence}/${prefix}/${name}.json`});save(name,{status:'PASS',...value});console.log(`${name}: PASS`);}catch(error){const failure={code:error.code||error.name,message:error.message};records.push({name,purpose,status:'FAIL',exitCode:1,startedAt:new Date(start).toISOString(),durationMs:Date.now()-start,error:failure});save(name,{status:'FAIL',error:failure});console.log(`${name}: FAIL ${failure.code}: ${failure.message}`);}save('test-results',records);}
async function locks(pool){return (await pool.query("SELECT a.pid,a.application_name,a.state,a.wait_event_type,a.wait_event,l.locktype,l.mode,l.granted,l.relation::regclass::text AS relation,l.classid,l.objid,EXTRACT(EPOCH FROM(clock_timestamp()-a.xact_start))*1000 AS transaction_ms,EXTRACT(EPOCH FROM(clock_timestamp()-a.query_start))*1000 AS query_ms FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.datname=current_database() AND a.pid<>pg_backend_pid() ORDER BY a.pid,l.locktype,l.mode")).rows;}
async function gatedRace(inputs,sql,params,label){
 const holder=await p.connect(),workers=inputs.map(x=>m.launch(s,db,x)),all=Promise.all(workers.map(w=>w.done));all.catch(()=>{});
 try{await holder.query('BEGIN');await holder.query(sql,params);await Promise.all(workers.map(w=>w.ready));workers.forEach(w=>w.start());let sample;
  await m.waitFor(async()=>{sample=await locks(p);return new Set(sample.filter(x=>!x.granted).map(x=>x.pid)).size===inputs.length;});save(label,{observedAt:new Date().toISOString(),rows:sample,independentBlockedBackends:inputs.length});await holder.query('COMMIT');return await all;
 }finally{await holder.query('ROLLBACK').catch(()=>{});holder.release();workers.forEach(w=>{if(!w.ended)w.child.kill();});await Promise.allSettled(workers.map(w=>w.done));}
}
async function migrationChecks(){
 await check('migration-chain','Fresh complete supported migration procedure and exact schema history',async()=>{
  db=await e.database(s,`${run}_${Date.now()}`);p=e.pool(s,db);await e.assertDatabase(s,p,db);
  const worker=m.launch(s,db,{action:'migrate'});await worker.ready;worker.start();const result=await worker.done;assert.equal(result.exitCode,0,JSON.stringify(result.error));
  const schema=await m.schema(p);assert.deepEqual(schema.tracking.map(x=>x.name),inventory.map(x=>x.filename));assert.deepEqual(schema.tracking.map(x=>x.checksum),inventory.map(x=>x.sha256));assert.ok(schema.constraints.every(x=>x.convalidated));
  const logs=result.stdout.trim().split('\n').filter(Boolean).map(JSON.parse);assert.deepEqual(logs.map(x=>x.migration),inventory.map(x=>x.filename));
  const isolation=(await p.query('SHOW default_transaction_isolation')).rows[0];g=graph(p,e.secrets(s).auditKey,e.secrets(s).encryptionKey);return {database:db,result,schema,isolation};
 });
 assert.ok(g,'Fresh migration prerequisite failed');
 await check('migration-rerun','Checksum-verified no-op and unchanged schema',async()=>{const before=await m.schema(p);const workers=await m.race(s,db,[{action:'migrate'}]);assert.equal(workers[0].exitCode,0);assert.equal(workers[0].stdout.trim(),'');const after=await m.schema(p);assert.deepEqual(before,after);return {workers,tracking:after.tracking};});
 await check('migration-order-checksum','Invalid dependency order and modified tracking checksum fail closed',async()=>{
  const isolated=await e.database(s,`order_${Date.now()}`),q=e.pool(s,isolated);let error;
  try{await assert.rejects(migrate({connect:async()=>{const c=await q.connect();return {release:c.release.bind(c),query:(sql,values)=>{if(sql.startsWith('SELECT checksum'))return Promise.resolve({rowCount:1,rows:[{checksum:'invalid'}]});return c.query(sql,values);}};}}),/Applied migration was modified/);
   const client=await q.connect();try{await assert.rejects(client.query(inventory[14].sourceSql),err=>{error={code:err.code,message:err.message};return err.code==='42P01';});await client.query('ROLLBACK');assert.equal((await client.query("SELECT to_regclass('public.preview_policies') AS table")).rows[0].table,null);}finally{client.release();}
  }finally{await q.end();}return {orderFailure:error,checksumRejected:true,sqlFilesUnchanged:true};
 });
 await check('migration-atomicity','A failure between DDL and history rolls both back, then supported rerun succeeds',async()=>{
  const isolated=await e.database(s,`atomic_${Date.now()}`),q=e.pool(s,isolated);
  try{const proxy={connect:async()=>{const c=await q.connect();return {release:c.release.bind(c),query:(sql,values)=>sql.startsWith('INSERT INTO schema_migrations')?Promise.reject(Object.assign(Error('controlled tracking failure'),{code:'PHASE3_INJECTED'})):c.query(sql,values)};}};
   await assert.rejects(migrate(proxy),{code:'PHASE3_INJECTED'});const absent=(await q.query("SELECT to_regclass('public.organizations') AS table")).rows[0];assert.equal(absent.table,null);assert.equal((await q.query('SELECT * FROM schema_migrations')).rowCount,0);
   await migrate(q);assert.equal((await q.query('SELECT * FROM schema_migrations')).rowCount,17);return {schemaRolledBack:true,historyRolledBack:true,rerunRows:17};
  }finally{await q.end();}
 });
 await check('migration-concurrency','Independent processes serialize from empty; sample advisory and DDL locks',async()=>{
  const isolated=await e.database(s,`race_${Date.now()}`),q=e.pool(s,isolated),holder=await q.connect();const workers=[m.launch(s,isolated,{action:'migrate'},{pauseMigration:'015'}),m.launch(s,isolated,{action:'migrate'},{pauseMigration:'015'})];const all=Promise.all(workers.map(w=>w.done));all.catch(()=>{});
  const observations=[];
  try{await holder.query('SELECT pg_advisory_lock($1::int,$2::int)',MIGRATION_LOCK);await Promise.all(workers.map(w=>w.ready));workers.forEach(w=>w.start());
   await m.waitFor(async()=>{const rows=await locks(q);observations.push({at:new Date().toISOString(),rows});return rows.filter(r=>r.locktype==='advisory'&&!r.granted).length===2;});
   await holder.query('SELECT pg_advisory_unlock($1::int,$2::int)',MIGRATION_LOCK);
   await m.waitFor(()=>workers.some(w=>w.barriers.some(b=>b.barrier==='ddl-locks')),60000);
   const ddl=await locks(q);observations.push({at:new Date().toISOString(),rows:ddl});assert.ok(ddl.some(x=>x.mode==='AccessExclusiveLock'&&x.granted));workers.forEach(w=>{if(w.barriers.length)w.release('ddl-locks');});
   const results=await all;save('migration-locks',{status:'PASS',observations,controlledPause:'015 before tracking INSERT; pause is test observation only'});
   const final=await m.schema(q);save('migration-concurrency-raw',{results,final,observations});assert.ok(results.every(x=>x.exitCode===0),JSON.stringify(results.map(x=>x.error)));
   assert.equal(new Set(results.map(x=>x.pid)).size,2);assert.equal(new Set(results.map(x=>x.backendPid)).size,2);
   assert.ok(Math.max(...results.map(x=>Date.parse(x.startedAt)))<Math.min(...results.map(x=>Date.parse(x.endedAt))));
   assert.deepEqual(final,await m.schema(p));return {database:isolated,results,final,observations};
  }finally{await holder.query('SELECT pg_advisory_unlock_all()').catch(()=>{});holder.release();workers.forEach(w=>{if(!w.ended)w.child.kill();});await Promise.allSettled(workers.map(w=>w.done));await q.end();}
 });
}
async function races(){
 await check('approval-race','Approve/approve and approve/reject commit only a valid winner and one audit effect',async()=>{
  const f=await fixture(p,g),out=[];await g.approvals.setPolicy(f.actor,f.org,{action:'deployment.production',eligibleRoles:['approver']});
  for(const decisions of [['approve','approve'],['approve','reject']]){
   const {approval}=await g.approvals.request(f.actor,f.org,{action:'deployment.production',resourceType:'deployment'},{fixture:true},randomUUID());
   const results=await gatedRace(decisions.map(decision=>({action:'decide',actor:f.approver,org:f.org,id:approval.id,decision:{decision,reason:'Valid controlled rejection'}})),'SELECT id FROM approval_requests WHERE id=$1 FOR UPDATE',[approval.id],`approval-${decisions.join('-')}-overlap`);
   assert.equal(results.filter(x=>!x.error).length,1);assert.ok(results.filter(x=>x.error).every(x=>['VERSION_CONFLICT','APPROVAL_NOT_PENDING'].includes(x.error.code)));
   const final=await g.approvals.get(f.actor,f.org,approval.id),winner=results.find(x=>!x.error).result;assert.equal(final.state,winner.state);assert.ok(['approved','rejected'].includes(final.state));
   const votes=(await p.query('SELECT * FROM approval_decisions WHERE approval_request_id=$1',[approval.id])).rows;assert.equal(votes.length,1);assert.equal(votes[0].decision,final.state);
   await assert.rejects(g.approvals.decide(f.approver,f.org,approval.id,{decision:'approve'}),{code:'APPROVAL_NOT_PENDING'});
   const audit=(await p.query("SELECT id,event_payload->>'action' AS action FROM enterprise_audit_events WHERE organization_id=$1 AND event_payload->>'resourceId'=$2 AND event_payload->>'action' IN ('approval.approved','approval.rejected')",[f.org,approval.id])).rows;assert.equal(audit.length,1);assert.equal((await g.audit.verify(f.actor,f.org)).valid,true);out.push({decisions,results,final,votes,audit});
  }return {cases:out,contract:'First committed compare-and-set wins; winner identity is scheduling-dependent, final state equals its valid decision; no automatic retry.'};
 });
 await check('quota-usage-race','2/5/10 processes compete for quota=1; usage and audit commit atomically',async()=>{
  const cases=[];
  for(const count of [2,5,10]){const f=await fixture(p,g);await g.quota.setLimit(f.org,'builds',1);const inputs=Array.from({length:count},(_,i)=>({action:'quota',reservation:{organizationId:f.org,resourceType:'builds',quantity:1,ownerOperation:`consume-${i}`,idempotencyKey:`consume-${i}`},usage:{organizationId:f.org,meterId:'deployment_count',quantity:1,sourceResourceId:`consume-${i}`,idempotencyKey:`consume-${i}`}}));
   const results=await gatedRace(inputs,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`quota:${f.org}:builds`],`quota-${count}-overlap`);save(`quota-${count}-raw`,{results});assert.equal(results.filter(x=>!x.error).length,1);assert.equal(results.filter(x=>x.error?.code==='QUOTA_EXCEEDED').length,count-1);
   const winner=results.findIndex(x=>!x.error),retry=await m.race(s,db,[inputs[winner]]);assert.equal(retry[0].exitCode,0);assert.equal(retry[0].result.duplicate,true);assert.equal(retry[0].result.reservationId,results[winner].result.reservationId);
   const used=(await p.query("SELECT SUM(quantity)::int AS used,COUNT(*)::int AS rows FROM quota_reservations WHERE organization_id=$1 AND status='consumed'",[f.org])).rows[0];assert.deepEqual(used,{used:1,rows:1});assert.deepEqual(await g.usage.aggregate(f.org),{'deployment_count:v1':1});assert.equal((await g.audit.verify(f.actor,f.org)).valid,true);cases.push({count,results,retry,used,remaining:0});
  }return {cases};
 });
 await check('usage-ledger-race','Independent writers with same database idempotency key create one event',async()=>{const f=await fixture(p,g),usage={organizationId:f.org,meterId:'deployment_count',quantity:1,sourceResourceId:'same',idempotencyKey:'same'};const results=await m.race(s,db,Array.from({length:5},()=>({action:'usage',usage})));assert.ok(results.every(r=>r.exitCode===0));assert.equal(results.filter(r=>!r.result.duplicate).length,1);assert.equal((await p.query('SELECT * FROM usage_events WHERE organization_id=$1',[f.org])).rowCount,1);return {results,aggregate:await g.usage.aggregate(f.org)};});
 await check('repository-concurrency','Independent preview-store writers deduplicate durable records only; no preview deployment',async()=>{const f=await fixture(p,g),input={projectId:f.project,serviceId:f.service,repositoryId:f.repositoryId,commitSha:'b'.repeat(40),pullRequestNumber:2};await g.previews.policy(f.actor,f.org,input);const results=await m.race(s,db,[0,1].map(()=>({action:'preview',actor:f.actor,org:f.org,input,key:'same'})));assert.ok(results.every(r=>r.exitCode===0));assert.equal(results.filter(r=>r.result.created).length,1);assert.equal((await p.query('SELECT * FROM preview_revisions WHERE organization_id=$1',[f.org])).rowCount,1);return {results};});
}
async function tenantsAndRollback(){
 await check('tenant-isolation','Concurrent valid and foreign-ID access across all nine durable areas',async()=>{
  const a=await seed(p,g,await fixture(p,g)),b=await seed(p,g,await fixture(p,g,a.actor));const outsider=(await g.repo.upsertUser({subject:randomUUID()})).id;
  const q=e.pool(s,db),other=graph(q,e.secrets(s).auditKey,e.secrets(s).encryptionKey);const results=[];
  try{const jobs=[['preview read',()=>other.previews.get(a.actor,a.org,b.preview)],['preview write',()=>other.previews.setDeploymentResource(a.org,b.preview,{fixture:true})],['BYOC read',()=>other.byoc.connection(a.actor,a.org,b.connection)],['BYOC write',()=>other.byoc.lifecycle(a.actor,a.org,b.connection,'disable',1)],['secret read',()=>other.secrets.get(a.actor,a.org,b.secret)],['secret write',()=>other.secrets.lifecycle(a.actor,a.org,b.secret,'revoke',1)],['approval read',()=>other.approvals.get(a.actor,a.org,b.approval)],['approval write',()=>other.approvals.cancel(a.actor,a.org,b.approval)],['exception read',()=>other.exceptions.get(a.actor,a.org,b.exception)],['exception write',()=>other.exceptions.revoke(a.actor,a.org,b.exception)],['project read',()=>other.repo.getProject(a.actor,a.org,b.project)],['audit foreign ID',async()=>{const event=(await g.audit.search(a.actor,b.org,{})).items[0];return other.audit.get(a.actor,a.org,event.id);}]];
   await Promise.all(jobs.map(async([name,fn])=>{await assert.rejects(fn,e=>{results.push({name,code:e.code,status:e.status});return /NOT_FOUND|SCOPE/.test(e.code);});}));
   const positive=await Promise.all([g.previews.get(a.actor,a.org,a.preview),other.previews.get(b.actor,b.org,b.preview)]);assert.equal(positive[0].organizationId,a.org);assert.equal(positive[1].organizationId,b.org);
   assert.equal((await other.quota.consume(b.reservation,a.org)).consumed,false);assert.equal((await other.quota.release(b.reservation,a.org)).released,false);
   const be=(await g.usage.list(b.org)).items[0];await assert.rejects(other.usage.adjust({organizationId:a.org,originalEventId:be.eventId,quantity:1,reason:'fixture',actorId:a.actor,idempotencyKey:'foreign'}),{code:'USAGE_NOT_FOUND'});
   assert.equal((await g.plans.effective(a.org)).organizationId,a.org);assert.equal((await other.plans.effective(b.org)).organizationId,b.org);
   for(const [name,fn]of [['preview',()=>g.previews.list(outsider,b.org)],['byoc',()=>g.byoc.listConnections(outsider,b.org)],['secret',()=>g.secrets.list(outsider,b.org)],['approval',()=>g.approvals.list(outsider,b.org)],['exception',()=>g.exceptions.list(outsider,b.org)],['audit',()=>g.audit.search(outsider,b.org,{})]]){await assert.rejects(fn,{code:'PERMISSION_DENIED'});results.push({name:`nonmember ${name}`,code:'PERMISSION_DENIED'});}
   assert.equal((await g.secrets.get(b.actor,b.org,b.secret)).status,'draft');assert.equal((await g.approvals.get(b.actor,b.org,b.approval)).state,'pending');return {tenantA:a.org,tenantB:b.org,results,quotaForeignTransition:false,billingContract:'Billing services are internal tenant-scoped services; HTTP authorization is exercised by existing security regressions, not database RLS.'};
  }finally{await q.end();}
 });
 await check('rollback','Injected pre-commit failures leave no quota/usage/audit/approval/project partial state',async()=>{
  const f=await fixture(p,g);await g.quota.setLimit(f.org,'builds',1);const input={action:'quota',injectFailure:true,reservation:{organizationId:f.org,resourceType:'builds',quantity:1,ownerOperation:'rollback',idempotencyKey:'rollback'},usage:{organizationId:f.org,meterId:'deployment_count',quantity:1,sourceResourceId:'rollback',idempotencyKey:'rollback'}};
  const [result]=await m.race(s,db,[input]);assert.equal(result.error.code,'PHASE3_INJECTED');for(const table of ['quota_reservations','usage_events','enterprise_audit_events','audit_outbox'])assert.equal((await p.query(`SELECT * FROM ${table} WHERE organization_id=$1`,[f.org])).rowCount,0,table);
  await g.approvals.setPolicy(f.actor,f.org,{action:'deployment.production',eligibleRoles:['approver']});const {approval}=await g.approvals.request(f.actor,f.org,{action:'deployment.production',resourceType:'deployment'},{test:true},'rollback-approval');
  await assert.rejects(withTransaction(p,async()=>{await g.approvals.decide(f.approver,f.org,approval.id,{decision:'approve'});throw Error('injected approval rollback');}),/injected approval rollback/);assert.equal((await g.approvals.get(f.actor,f.org,approval.id)).state,'pending');assert.equal((await p.query('SELECT * FROM approval_decisions WHERE approval_request_id=$1',[approval.id])).rowCount,0);
  const slug=randomUUID();await assert.rejects(withTransaction(p,async()=>{await g.repo.createProject(f.actor,f.org,{name:'rollback',slug});throw Error('injected project rollback');}),/injected project rollback/);assert.equal((await p.query('SELECT * FROM projects WHERE slug=$1',[slug])).rowCount,0);return {result,approvalRolledBack:true,projectAndMembershipRolledBack:true};
 });
}
async function main(){save('run',{run,databaseEnvironment:s.id,startedAt:new Date().toISOString()});await migrationChecks();await races();await tenantsAndRollback();await require('./recovery-plans.cjs').run({s,db,p,g,check,save,locks});save('final',{status:records.every(x=>x.status==='PASS')?'PASS':'FAIL',database:db,records,endedAt:new Date().toISOString()});e.evidence(s,'latest-acceptance.json',{run,prefix,database:db,status:records.every(x=>x.status==='PASS')?'PASS':'FAIL'});process.exitCode=records.some(x=>x.status!=='PASS')?1:0;}
main().catch(err=>{save('fatal',{code:err.code||err.name,message:err.message});console.error(JSON.stringify({status:'FAIL',error:err.message}));process.exitCode=1;}).finally(async()=>{if(p)await p.end();});

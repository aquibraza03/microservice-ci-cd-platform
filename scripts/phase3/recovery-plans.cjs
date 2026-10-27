'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const e=require('./environment.cjs'),m=require('./migrations.cjs');
const {graph,fixture,seed}=require(path.join(e.service,'test/helpers/phase3-fixtures'));
const {withTransaction}=require(path.join(e.service,'src/database/transaction'));
const {checkDatabase}=require(path.join(e.service,'src/database/pool'));
exports.run=async({s,db,p,g,check,save,locks})=>{
 await check('postgres-restart','Committed records in nine stores survive owned PostgreSQL stop/start; open transaction rolls back; unavailable operations reject',async()=>{
  const f=await seed(p,g,await fixture(p,g));
  async function state(){return {project:await g.repo.getProject(f.actor,f.org,f.project),preview:await g.previews.get(f.actor,f.org,f.preview),byoc:await g.byoc.connection(f.actor,f.org,f.connection),secret:await g.secrets.get(f.actor,f.org,f.secret),approval:await g.approvals.get(f.actor,f.org,f.approval),exception:await g.exceptions.get(f.actor,f.org,f.exception),plan:await g.plans.effective(f.org),quota:(await p.query('SELECT * FROM quota_reservations WHERE organization_id=$1',[f.org])).rows,usage:await g.usage.list(f.org),audit:await g.audit.verify(f.actor,f.org)};}
  // Do not persist BYOC views: they may contain security-sensitive configuration.
  const durableState=async()=>{const value=await state();delete value.audit.verifiedAt;return JSON.stringify(value);};
  const before=await durableState(),client=await p.connect();client.on('error',()=>{});let stopped=false;const rejected=[];
  try{await client.query('BEGIN');await client.query("UPDATE projects SET name='uncommitted-restart' WHERE id=$1",[f.project]);await e.assertDatabase(s,p,db);e.assertOwned(s);e.docker(['stop','--time','10',s.containerId]);stopped=true;
   const jobs=[['database health',()=>checkDatabase(p)],['project',()=>g.repo.getProject(f.actor,f.org,f.project)],['preview',()=>g.previews.get(f.actor,f.org,f.preview)],['BYOC',()=>g.byoc.connection(f.actor,f.org,f.connection)],['secret',()=>g.secrets.get(f.actor,f.org,f.secret)],['approval',()=>g.approvals.get(f.actor,f.org,f.approval)],['exception',()=>g.exceptions.get(f.actor,f.org,f.exception)],['plan',()=>g.plans.effective(f.org)],['quota write',()=>g.quota.reserve({organizationId:f.org,resourceType:'builds',quantity:1,ownerOperation:'offline',idempotencyKey:'offline'})],['usage write',()=>g.usage.append({organizationId:f.org,meterId:'deployment_count',quantity:1,sourceResourceId:'offline',idempotencyKey:'offline'})],['audit',()=>g.audit.verify(f.actor,f.org)],['uncommitted COMMIT',()=>client.query('COMMIT')]];
   for(const [name,fn]of jobs)await assert.rejects(fn,error=>{rejected.push({name,code:error.code||error.name});return true;});
  }finally{client.release(true);if(stopped){e.assertOwned(s);e.docker(['start',s.containerId]);await e.ready(s);}}
  assert.equal(await durableState(),before);assert.equal((await g.repo.getProject(f.actor,f.org,f.project)).name,'Phase 3 project');assert.equal((await checkDatabase(p)).ok,true);assert.equal((await p.query("SELECT * FROM usage_events WHERE organization_id=$1 AND idempotency_key='offline'",[f.org])).rowCount,0);
  return {containerId:s.containerId,database:db,volume:s.volume,committedNineAreasIdentical:true,uncommittedUpdateAbsent:true,rejected,healthRecovered:true,scope:'PostgreSQL restart on the same volume; not backup restoration or disaster recovery'};
 });
 await check('deadlock','Reverse real quota lock order causes one PostgreSQL deadlock victim; no implicit retry; explicit bounded idempotent retry succeeds',async()=>{
  const a=await fixture(p,g),b=await fixture(p,g);for(const f of[a,b])await g.quota.setLimit(f.org,'builds',10);
  const q1=e.pool(s,db,'phase3-deadlock-a'),q2=e.pool(s,db,'phase3-deadlock-b'),keys=e.secrets(s);const graphs=[graph(q1,keys.auditKey,keys.encryptionKey),graph(q2,keys.auditKey,keys.encryptionKey)];let arrivals=0,release;const gate=new Promise(r=>release=r);const observed=[];
  const input=(org,i)=>({organizationId:org,resourceType:'builds',quantity:1,ownerOperation:`deadlock-${i}`,idempotencyKey:`deadlock-${i}`});
  async function work(pool,store,order,i,barrier){return withTransaction(pool,async c=>{await store.quota.reserveInTransaction(c,input(order[0].org,i));if(barrier){arrivals++;if(arrivals===2)release();await gate;}await store.quota.reserveInTransaction(c,input(order[1].org,i));return {committed:true};});}
  try{const pending=[work(q1,graphs[0],[a,b],0,true),work(q2,graphs[1],[b,a],1,true)];const all=Promise.allSettled(pending);await m.waitFor(()=>arrivals===2);observed.push(...await locks(p));const outcomes=await all;assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);const loser=outcomes.findIndex(x=>x.status==='rejected');assert.equal(outcomes[loser].reason.code,'40P01');assert.equal((await p.query('SELECT * FROM quota_reservations WHERE organization_id=ANY($1::uuid[])',[[a.org,b.org]])).rowCount,2);
   await work([q1,q2][loser],graphs[loser],loser?[b,a]:[a,b],loser,false);await work([q1,q2][loser],graphs[loser],loser?[b,a]:[a,b],loser,false);assert.equal((await p.query('SELECT * FROM quota_reservations WHERE organization_id=ANY($1::uuid[])',[[a.org,b.org]])).rowCount,4);for(const f of[a,b])assert.equal((await g.audit.verify(f.actor,f.org)).valid,true);
   return {outcomes:outcomes.map(x=>x.status==='fulfilled'?{status:x.status,value:x.value}:{status:x.status,code:x.reason.code}),observed,automaticRetries:0,explicitRetryLimit:1,duplicateReplayAddedRows:0};
  }finally{release();await Promise.all([q1.end(),q2.end()]);}
 });
 await check('query-plans','Controlled selective tenant fixture, EXPLAIN ANALYZE and actual index validity',async()=>{
  const f=await seed(p,g,await fixture(p,g));
  // Scale unrelated tenants for meaningful selectivity without changing application records.
  await p.query("INSERT INTO organizations(id,name,display_name,slug) SELECT gen_random_uuid(),'plan fixture','plan fixture','plan-'||gen_random_uuid()::text FROM generate_series(1,2000)");
  await p.query("INSERT INTO projects(id,organization_id,name,slug) SELECT gen_random_uuid(),id,'plan fixture',gen_random_uuid()::text FROM organizations WHERE name='plan fixture'");
  await p.query("INSERT INTO quota_reservations(id,organization_id,resource_type,quantity,status,owner_operation,idempotency_key,expires_at) SELECT gen_random_uuid(),id,'builds',1,'active','plans','plans',NOW()+INTERVAL '1 hour' FROM organizations WHERE name='plan fixture'");
  await p.query('ANALYZE');
  const queries=[['project','SELECT * FROM projects WHERE organization_id=$1',[f.org]],['preview','SELECT * FROM preview_revisions WHERE organization_id=$1',[f.org]],['approval','SELECT * FROM approval_requests WHERE id=$1 AND organization_id=$2',[f.approval,f.org]],['quota',"SELECT COALESCE(SUM(quantity),0) AS quantity FROM quota_reservations WHERE organization_id=$1 AND resource_type=$2 AND (status='consumed' OR (status='active' AND expires_at>NOW()))",[f.org,'builds']],['usage','SELECT * FROM usage_events WHERE organization_id=$1 AND ($2::text IS NULL OR meter_id=$2) ORDER BY received_at,event_id LIMIT $3 OFFSET $4',[f.org,null,51,0]],['audit','SELECT e.*,h.last_sequence,h.last_hash FROM audit_chain_heads h LEFT JOIN enterprise_audit_events e ON e.organization_id=h.organization_id WHERE h.organization_id=$1 ORDER BY e.sequence',[f.org]]];
  const plans=[];for(const[name,sql,params]of queries)plans.push({name,sql,plan:(await p.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,params)).rows[0]['QUERY PLAN']});
  const indexes=(await p.query('SELECT t.relname AS table_name,i.relname AS index_name,x.indisvalid,x.indisready,pg_get_indexdef(i.oid) AS definition FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=\'public\' ORDER BY t.relname,i.relname')).rows;assert.ok(indexes.every(x=>x.indisvalid&&x.indisready));
  for(const name of ['project','quota'])assert.match(JSON.stringify(plans.find(x=>x.name===name)),/Index/);
  return {fixtureUnrelatedTenants:2000,plans,indexes,indexChangeRequired:false,limitations:'Small preview/approval/usage tables may rationally use sequential scans. Audit loads the complete scoped chain before in-memory filtering/verification; indexes do not bound per-tenant memory. Not a production capacity benchmark.'};
 });
};


'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fork}=require('node:child_process');
const e=require('./environment.cjs');
function launch(s,db,input,{baseline=false,pauseMigration=''}={}){
 const started=Date.now(),child=fork(path.join(e.service,'test/helpers/phase3-process.js'),[],{cwd:e.service,env:{...e.childEnv(s,db),PHASE3_ACTION:input.action,PHASE3_BASELINE_BARRIER:baseline?'1':'0',PHASE3_PAUSE_MIGRATION:pauseMigration},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 let stdout='',stderr='',message,exitCode;const barriers=[];
 child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 let doneResolve,doneReject;const done=new Promise((r,j)=>{doneResolve=r;doneReject=j;});
 const timer=setTimeout(()=>{child.kill();doneReject(Error('Independent process exceeded 120000 ms'));},120000);
 const ready=new Promise((resolve,reject)=>{child.on('message',m=>{if(m.ready)resolve(m);if(m.barrier)barriers.push(m);if(m.finished)message=m;});child.once('error',reject);child.once('error',doneReject);child.once('exit',(code)=>{exitCode=code;clearTimeout(timer);if(!message)doneReject(Error(`Process exited without result: ${code}`));else doneResolve({...message,exitCode,stdout,stderr,processStartedAt:new Date(started).toISOString()});});});
 return {child,ready,done,barriers,start:()=>child.send(input),release:key=>child.send({release:key}),get ended(){return exitCode!==undefined;}};
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,ms=15000){const start=Date.now();while(Date.now()-start<ms){if(await fn())return;await delay(50);}throw Error('Bounded observation condition not reached');}
async function race(s,db,inputs,options={}){const workers=inputs.map(input=>launch(s,db,input,options));const completion=Promise.all(workers.map(w=>w.done));completion.catch(()=>{});try{await Promise.all(workers.map(w=>w.ready));workers.forEach(w=>w.start());if(options.baseline){await waitFor(()=>workers.every(w=>w.barriers.length||w.ended));workers.forEach(w=>{if(!w.ended)w.release('unapplied-001');});}return await completion;}catch(error){workers.forEach(w=>{if(!w.ended)w.child.kill();});await Promise.allSettled(workers.map(w=>w.done));throw error;}}
async function schema(p){return {tracking:(await p.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows,tables:(await p.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows,indexes:(await p.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname")).rows,constraints:(await p.query("SELECT conrelid::regclass::text AS relation,conname,contype,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2")).rows};}
async function main(){const s=e.load(),mode=process.argv[2];const db=await e.database(s,'migration_'+mode.replaceAll('-','_')+'_'+Date.now());const p=e.pool(s,db);
 try{
  if(mode==='atomic-baseline'){
   const {migrate}=require(path.join(e.service,'src/database/migrate'));
   let failure;
   try{await migrate({query:(sql,values)=>/^INSERT INTO schema_migrations/.test(sql)?Promise.reject(Object.assign(Error('injected tracking failure'),{code:'PHASE3_INJECTED'})):p.query(sql,values)});}catch(err){failure={code:err.code,message:err.message};}
   const observed={failure,table:(await p.query("SELECT to_regclass('public.organizations') AS name")).rows[0],tracking:(await p.query('SELECT * FROM schema_migrations')).rows};
   e.evidence(s,'migration-atomic-baseline.json',{database:db,status:observed.table.name&&observed.tracking.length===0?'FAIL':'NOT VERIFIED',...observed});console.log(JSON.stringify(observed));return;
  }
  // Empty tracking table avoids the unrelated concurrent catalog-create race,
  // so the baseline deterministically probes the runner's check/apply/record gap.
  if(mode==='baseline')await p.query('CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,checksum CHAR(64) NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const results=await race(s,db,[{action:'migrate'},{action:'migrate'}],{baseline:mode==='baseline'});
  const final=await schema(p);e.evidence(s,`migration-${mode}.json`,{database:db,mode,results,final,status:results.every(r=>r.exitCode===0)?'PASS':'FAIL'});console.log(JSON.stringify({evidence:s.evidence,mode,results:results.map(r=>({pid:r.pid,exit:r.exitCode,error:r.error})),tracking:final.tracking.length}));
 }finally{await p.end();}
}
module.exports={launch,race,waitFor,delay,schema};
if(require.main===module)main().catch(err=>{console.error(JSON.stringify({status:'FAIL',code:err.code||err.name,message:err.message}));process.exitCode=1;});

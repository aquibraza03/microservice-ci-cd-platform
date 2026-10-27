'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),service=path.join(root,'services/control-plane-api');
const {Pool}=require(path.join(service,'node_modules/pg'));
const local=path.join(root,'.local/phase3'),pointer=path.join(local,'active.json');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});}
function load(){const s=JSON.parse(fs.readFileSync(pointer));assert.match(s.id,/^[a-f0-9-]{36}$/);assert.equal(s.marker,'phase3-disposable');return s;}
function secrets(s){return JSON.parse(fs.readFileSync(path.join(local,s.id,'credentials.json')));}
function evidence(s,name,data){write(path.join(root,s.evidence,name),data);}
function command(command,args,options={}){
 const start=Date.now(),r=spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:options.timeout||30000,maxBuffer:16*1024*1024,...options});
 return {command,args,startedAt:new Date(start).toISOString(),endedAt:new Date().toISOString(),durationMs:Date.now()-start,exitCode:r.status,errorCode:r.error?.code,stdout:r.stdout||'',stderr:r.stderr||''};
}
function docker(args,options={}){const r=command('docker',args,options);assert.equal(r.exitCode,0,`Docker ${args.slice(0,2).join(' ')} failed: ${r.errorCode||r.stderr}`);return r.stdout.trim();}
function snapshot(){
 const context=docker(['context','show']);assert.equal(context,'desktop-linux');
 const endpoint=JSON.parse(docker(['context','inspect','desktop-linux','--format','{{json .Endpoints.docker.Host}}']));assert.equal(endpoint,'npipe:////./pipe/dockerDesktopLinuxEngine');assert.ok(!process.env.DOCKER_HOST||process.env.DOCKER_HOST===endpoint);
 const daemon=JSON.parse(docker(['info','--format','{"id":{{json .ID}},"name":{{json .Name}},"os":{{json .OSType}}}']));assert.equal(daemon.name,'docker-desktop');assert.equal(daemon.os,'linux');
 const ids=docker(['ps','-aq','--no-trunc']).split(/\s+/).filter(Boolean);
 const format='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{.State.Running}},"status":{{json .State.Status}},"startedAt":{{json .State.StartedAt}},"finishedAt":{{json .State.FinishedAt}},"restartCount":{{.RestartCount}},"mounts":{{json .Mounts}},"networks":{{json .NetworkSettings.Networks}},"labels":{{json .Config.Labels}}}';
 const containers=ids.length?docker(['inspect','--format',format,...ids]).split(/\r?\n/).map(JSON.parse):[];
 const networks=docker(['network','ls','--no-trunc','--format','{{.ID}} {{.Name}}']).split(/\r?\n/).sort();
 const volumes=docker(['volume','ls','--format','{{.Name}}']).split(/\r?\n/).sort();
 return {timestamp:new Date().toISOString(),context,endpoint,daemon,containers,networks,volumes};
}
function sourceHashes(){const entries={};for(const base of ['services/control-plane-api/src','services/control-plane-api/migrations','services/control-plane-api/test','scripts/staging','deploy/staging','docs']){const walk=d=>{for(const x of fs.readdirSync(path.join(root,d),{withFileTypes:true})){const f=`${d}/${x.name}`;if(x.isDirectory())walk(f);else entries[f]=sha(fs.readFileSync(path.join(root,f)));}};walk(base);}for(const f of ['services/control-plane-api/package.json','services/control-plane-api/package-lock.json'])entries[f]=sha(fs.readFileSync(path.join(root,f)));return entries;}
function assertOwned(s){
 assert.equal(docker(['info','--format','{{.ID}}']),s.daemonId);
 const node=JSON.parse(docker(['inspect',s.containerId,'--format','{"id":{{json .Id}},"name":{{json .Name}},"labels":{{json .Config.Labels}},"mounts":{{json .Mounts}},"ports":{{json .HostConfig.PortBindings}},"networks":{{json .NetworkSettings.Networks}}}']));
 assert.equal(node.id,s.containerId);assert.equal(node.name,'/'+s.container);assert.equal(node.labels['phase3.run'],s.id);assert.equal(node.labels['phase3.environment'],s.marker);
 assert.deepEqual(node.mounts.filter(m=>m.Type==='volume').map(m=>m.Name),[s.volume]);
 assert.deepEqual(Object.keys(node.networks),[s.network]);
 for(const binds of Object.values(node.ports))for(const b of binds)assert.equal(b.HostIp,'127.0.0.1');
 const vol=JSON.parse(docker(['volume','inspect',s.volume]))[0];assert.equal(vol.Labels['phase3.run'],s.id);
 return node;
}
function pool(s,database=s.database,application='phase3-suite'){
 assert.ok(database===s.database||s.databases.includes(database),'Unregistered disposable database');
 const c=secrets(s),p=new Pool({host:'127.0.0.1',port:s.port,user:s.user,password:c.password,database,application_name:application,connectionTimeoutMillis:5000,statement_timeout:30000,max:12});p.on('error',()=>{});return p;
}
async function assertDatabase(s,p,name){assertOwned(s);const r=(await p.query("SELECT current_database() AS name,current_user AS username,current_setting('phase3.run_id') AS marker")).rows[0];assert.equal(r.name,name);assert.equal(r.username,s.user);assert.equal(r.marker,s.id);}
async function ready(s){const start=Date.now();let last;while(Date.now()-start<60000){const p=pool(s);try{await assertDatabase(s,p,s.database);await p.end();return;}catch(e){last=e;await p.end();await new Promise(r=>setTimeout(r,500));}}throw new Error(`Disposable PostgreSQL readiness failed: ${last?.code||last?.name}`);}
async function database(s,suffix){assert.match(suffix,/^[a-z0-9_]+$/);const name=`p3_${s.id.replaceAll('-','').slice(0,12)}_${suffix}`;assert.ok(!s.databases.includes(name));const p=pool(s);try{await assertDatabase(s,p,s.database);assert.equal((await p.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0);await p.query(`CREATE DATABASE "${name}"`);s.databases.push(name);write(pointer,s);}finally{await p.end();}return name;}
function childEnv(s,database){const c=secrets(s);return {...process.env,NODE_ENV:'test',DATABASE_URL:`postgres://${s.user}:${c.password}@127.0.0.1:${s.port}/${database}`,PHASE3_RUN_ID:s.id,PHASE3_DATABASE:database,PHASE3_AUDIT_KEY:c.auditKey,PHASE3_ENCRYPTION_KEY:c.encryptionKey};}
async function init(){
 assert.ok(!fs.existsSync(pointer),'Existing Phase 3 environment must be reviewed, not replaced');
 const id=crypto.randomUUID(),stamp=new Date().toISOString().replace(/[:.]/g,'-'),tag=id.slice(0,12),s={id,marker:'phase3-disposable',container:`phase3-pg-${tag}`,network:`phase3-net-${tag}`,volume:`phase3-data-${tag}`,database:`p3_${id.replaceAll('-','').slice(0,12)}`,user:`p3_${id.replaceAll('-','').slice(0,12)}`,databases:[],evidence:`artifacts/phase3/${stamp}`,createdAt:new Date().toISOString()};
 evidence(s,'source-before.json',sourceHashes());evidence(s,'git-state.json',['status --short','branch --show-current','rev-parse HEAD','log -5 --oneline'].map(x=>command('git',x.split(' '))));
 const before=snapshot();s.daemonId=before.daemon.id;evidence(s,'protected-before.json',before);
 assert.ok(!before.containers.some(x=>x.name==='/'+s.container));assert.ok(!before.volumes.includes(s.volume));assert.ok(!before.networks.some(x=>x.endsWith(' '+s.network)));
 const image=JSON.parse(docker(['image','inspect','postgres:16-alpine','--format','{"id":{{json .Id}},"digests":{{json .RepoDigests}}}']));s.image=image;
 const credentials={password:crypto.randomBytes(32).toString('hex'),auditKey:crypto.randomBytes(32).toString('base64'),encryptionKey:crypto.randomBytes(32).toString('base64')};write(path.join(local,id,'credentials.json'),credentials);write(pointer,s);
 docker(['volume','create','--label',`phase3.run=${id}`,'--label','phase3.environment=phase3-disposable',s.volume]);
 s.networkId=docker(['network','create','--label',`phase3.run=${id}`,s.network]);write(pointer,s);
 s.containerId=docker(['run','-d','--name',s.container,'--label',`phase3.run=${id}`,'--label','phase3.environment=phase3-disposable','--network',s.network,'--publish','127.0.0.1::5432','--mount',`type=volume,source=${s.volume},target=/var/lib/postgresql/data`,'--env','POSTGRES_PASSWORD','--env',`POSTGRES_USER=${s.user}`,'--env',`POSTGRES_DB=${s.database}`,image.id,'postgres','-c',`phase3.run_id=${id}`],{env:{...process.env,POSTGRES_PASSWORD:credentials.password},timeout:60000});
 write(pointer,s);s.port=Number(JSON.parse(docker(['inspect',s.containerId,'--format','{{json .NetworkSettings.Ports}}']))['5432/tcp'][0].HostPort);write(pointer,s);
 await ready(s);evidence(s,'environment.json',{...s,password:'REDACTED',credentialsLocation:'Ignored local runtime file; never included in evidence'});console.log(JSON.stringify({environment:s.marker,evidence:s.evidence,container:s.container,database:s.database,port:s.port}));
}
async function repairInitialNetwork(){
 const s=load();assert.equal(s.port,undefined);assert.equal(s.databases.length,0);assert.equal(docker(['info','--format','{{.ID}}']),s.daemonId);
 const node=JSON.parse(docker(['inspect',s.container,'--format','{"id":{{json .Id}},"labels":{{json .Config.Labels}},"mounts":{{json .Mounts}},"networks":{{json .NetworkSettings.Networks}}}']));
 assert.equal(node.labels['phase3.run'],s.id);assert.equal(node.labels['phase3.environment'],s.marker);assert.deepEqual(node.mounts.filter(x=>x.Type==='volume').map(x=>x.Name),[s.volume]);assert.deepEqual(Object.keys(node.networks),[s.network]);
 const network=JSON.parse(docker(['network','inspect',s.networkId]))[0];assert.equal(network.Name,s.network);assert.equal(network.Labels['phase3.run'],s.id);assert.equal(network.Internal,true);assert.deepEqual(Object.keys(network.Containers),[node.id]);
 s.containerId=node.id;write(pointer,s);evidence(s,'environment-initial-port-failure.json',{status:'FAIL',reason:'Internal Docker network returned no published HostPort',node,network,correction:'Replace only exact owned container/network, preserve owned volume; dedicated bridge and loopback binding'});
 docker(['stop',node.id]);docker(['rm',node.id]);docker(['network','rm',network.Id]);
 s.networkId=docker(['network','create','--label',`phase3.run=${s.id}`,s.network]);write(pointer,s);
 s.containerId=docker(['run','-d','--name',s.container,'--label',`phase3.run=${s.id}`,'--label','phase3.environment=phase3-disposable','--network',s.network,'--publish','127.0.0.1::5432','--mount',`type=volume,source=${s.volume},target=/var/lib/postgresql/data`,'--env','POSTGRES_PASSWORD','--env',`POSTGRES_USER=${s.user}`,'--env',`POSTGRES_DB=${s.database}`,s.image.id,'postgres','-c',`phase3.run_id=${s.id}`],{env:{...process.env,POSTGRES_PASSWORD:secrets(s).password},timeout:60000});write(pointer,s);
 s.port=Number(JSON.parse(docker(['inspect',s.containerId,'--format','{{json .NetworkSettings.Ports}}']))['5432/tcp'][0].HostPort);write(pointer,s);await ready(s);evidence(s,'environment.json',{...s,credentials:'Generated; private local runtime file; not evidence'});console.log(JSON.stringify({status:'PASS',evidence:s.evidence,port:s.port}));
}
async function pinPort(){
 const s=load();assertOwned(s);const ports=JSON.parse(docker(['inspect',s.containerId,'--format','{{json .NetworkSettings.Ports}}']));
 const old={containerId:s.containerId,configuredPort:s.port,publishedPort:Number(ports['5432/tcp'][0].HostPort)};
 s.port=old.publishedPort;const p=pool(s);try{await assertDatabase(s,p,s.database);}finally{await p.end();}
 evidence(s,'restart-port-harness-failure.json',{status:'FAIL',old,reason:'Random Docker HostPort changes across stop/start',correction:'Recreate exact owned container with explicit loopback port and same owned volume/network'});
 assertOwned(s);docker(['stop',s.containerId]);docker(['rm',s.containerId]);
 s.containerId=docker(['run','-d','--name',s.container,'--label',`phase3.run=${s.id}`,'--label','phase3.environment=phase3-disposable','--network',s.network,'--publish',`127.0.0.1:${s.port}:5432`,'--mount',`type=volume,source=${s.volume},target=/var/lib/postgresql/data`,s.image.id,'postgres','-c',`phase3.run_id=${s.id}`],{timeout:60000});write(pointer,s);await ready(s);evidence(s,'environment-pinned.json',{...s,credentials:'Private ignored local runtime file'});console.log('Owned container port pinned; original owned volume retained');
}
function compare(s){const before=JSON.parse(fs.readFileSync(path.join(root,s.evidence,'protected-before.json'))),after=snapshot();evidence(s,'protected-after.json',after);const differences=[];for(const c of before.containers){const n=after.containers.find(x=>x.id===c.id);if(JSON.stringify(c)!==JSON.stringify(n))differences.push(c.name);}for(const k of ['networks','volumes'])for(const v of before[k])if(!after[k].includes(v))differences.push(v);assert.deepEqual(before.daemon,after.daemon);evidence(s,'protected-comparison.json',{status:differences.length?'FAIL':'PASS',differences});assert.deepEqual(differences,[]);return after;}
module.exports={root,service,local,pointer,sha,write,load,secrets,evidence,command,docker,snapshot,sourceHashes,assertOwned,pool,assertDatabase,ready,database,childEnv,compare};
if(require.main===module)(async()=>{if(process.argv[2]==='init')await init();else if(process.argv[2]==='repair-initial-network')await repairInitialNetwork();else if(process.argv[2]==='pin-port')await pinPort();else if(process.argv[2]==='compare')compare(load());else throw Error('init|compare required');})().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',code:e.code||e.name,message:e.message}));process.exitCode=1;});

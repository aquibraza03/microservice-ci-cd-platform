'use strict';
// Read-only diagnostics; writes only evidence and a local qualification pointer.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const {hash,expected,validateTarget}=require('./staging/safety.cjs');
const root=path.resolve(__dirname,'..'),local=path.join(root,'.local/phase2-staging');
const phase=process.argv[2];assert.ok(['before','during','after'].includes(phase));validateTarget(expected);
const pointer=path.join(local,'qualification.json');fs.mkdirSync(local,{recursive:true});
const id=phase==='before'?new Date().toISOString().replace(/[:.]/g,'-'):JSON.parse(fs.readFileSync(pointer)).id;
assert.match(id,/^[0-9TZ-]+$/);
const relative=`artifacts/staging/qualification/${id}`,dir=path.join(root,relative);fs.mkdirSync(dir,{recursive:true});
const output={id,phase,startedAt:new Date().toISOString(),records:[]};
const save=()=>fs.writeFileSync(path.join(dir,`${phase}.json`),JSON.stringify(output,null,2)+'\n');
function decode(buffer){if(!buffer)return '';return (buffer.filter(x=>x===0).length>buffer.length/8?buffer.toString('utf16le'):buffer.toString('utf8')).trim();}
function run(name,command,args) {
  const start=Date.now(),r=spawnSync(command,args,{cwd:root,windowsHide:true,timeout:45000,maxBuffer:8*1024*1024});
  const item={name,command,args,startedAt:new Date(start).toISOString(),endedAt:new Date().toISOString(),elapsedMs:Date.now()-start,exitCode:r.status,errorCode:r.error?.code,stdout:decode(r.stdout),stderr:decode(r.stderr)};
  output.records.push(item);save();console.log(`${name}: ${r.status===0?'captured':'unavailable'} (${item.elapsedMs}ms)`);return item;
}
const shell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const ps=(name,code)=>run(name,shell,['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop'; ${code} | ConvertTo-Json -Depth 6 -Compress`]);
const parse=r=>{assert.equal(r.exitCode,0,`${r.name} unavailable`);return JSON.parse(r.stdout);};
const context=run('docker-context','docker',['context','show']);assert.equal(context.stdout,'desktop-linux');
const endpoint=parse(run('docker-endpoint','docker',['context','inspect','desktop-linux','--format','{{json .Endpoints.docker.Host}}']));
assert.equal(endpoint,'npipe:////./pipe/dockerDesktopLinuxEngine');
assert.ok(!process.env.DOCKER_HOST || process.env.DOCKER_HOST===endpoint);
output.docker=parse(run('docker-resources','docker',['info','--format','{"id":{{json .ID}},"name":{{json .Name}},"os":{{json .OSType}},"version":{{json .ServerVersion}},"cpus":{{.NCPU}},"memoryBytes":{{.MemTotal}},"driver":{{json .Driver}},"driverStatus":{{json .DriverStatus}},"kernel":{{json .KernelVersion}},"root":{{json .DockerRootDir}},"cgroupDriver":{{json .CgroupDriver}},"cgroupVersion":{{json .CgroupVersion}}}']));
assert.equal(output.docker.name,'docker-desktop');assert.equal(output.docker.os,'linux');
run('docker-version','docker',['version','--format','{{json .}}']);
run('docker-desktop-version','docker',['desktop','version']);
const ids=run('container-ids','docker',['ps','-aq','--no-trunc']);assert.equal(ids.exitCode,0);
const containers=run('container-state','docker',['inspect','--format','{"id":{{json .Id}},"name":{{json .Name}},"running":{{.State.Running}},"status":{{json .State.Status}},"startedAt":{{json .State.StartedAt}},"finishedAt":{{json .State.FinishedAt}},"restartCount":{{.RestartCount}}}',...ids.stdout.split(/\s+/).filter(Boolean)]);
assert.equal(containers.exitCode,0);output.containers=containers.stdout.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));
const networks=run('networks','docker',['network','ls','--no-trunc','--format','{{.ID}} {{.Name}}']);assert.equal(networks.exitCode,0);output.networks=networks.stdout.split(/\r?\n/).filter(Boolean).sort();
const volumes=run('volumes','docker',['volume','ls','--format','{{.Name}}']);assert.equal(volumes.exitCode,0);output.volumes=volumes.stdout.split(/\r?\n/).filter(Boolean).sort();
run('docker-disk-usage','docker',['system','df','--format','{{json .}}']);
run('docker-load','docker',['stats','--no-stream','--format','{{.Name}} {{.CPUPerc}} {{.MemUsage}} {{.BlockIO}}']);
ps('windows-cpu','Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,LoadPercentage');
ps('windows-memory','Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory,TotalVirtualMemorySize,FreeVirtualMemory,LastBootUpTime');
ps('windows-commit','Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory | Select-Object AvailableMBytes,CommittedBytes,CommitLimit,PercentCommittedBytesInUse,PagesInputPersec,PagesOutputPersec,PageReadsPersec,PageWritesPersec');
ps('windows-pagefile','Get-CimInstance Win32_PageFileUsage | Select-Object Name,AllocatedBaseSize,CurrentUsage,PeakUsage');
ps('windows-disk-space','Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,FileSystem,Size,FreeSpace,Status');
ps('windows-physical-disks','Get-PhysicalDisk | Select-Object FriendlyName,MediaType,BusType,HealthStatus,OperationalStatus,Size');
ps('windows-performance-samples',"Get-Counter -Counter '\\Memory\\Available MBytes','\\Memory\\Committed Bytes','\\Memory\\Pages Input/sec','\\Memory\\Pages Output/sec','\\PhysicalDisk(_Total)\\Avg. Disk sec/Transfer','\\PhysicalDisk(_Total)\\Current Disk Queue Length','\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 3 | ForEach-Object { $_.CounterSamples | Select-Object Timestamp,Path,CookedValue,Status }");
run('wsl-version','wsl',['--version']);
const distros=run('wsl-distros','wsl',['--list','--verbose']);
if(distros.exitCode===0 && /docker-desktop\s+Running/.test(distros.stdout)) run('wsl-runtime','wsl',['-d','docker-desktop','--exec','sh','-c','uname -a; getconf _NPROCESSORS_ONLN; cat /proc/meminfo /proc/swaps /proc/loadavg /proc/pressure/cpu /proc/pressure/memory /proc/pressure/io; df -T; cat /proc/diskstats']);
else output.wslRuntimeUnavailable='Running Docker Desktop distro not confirmed; no distro started by this collector';
output.settingsHashes={};
for(const file of [path.join(os.homedir(),'.wslconfig'),path.join(process.env.APPDATA,'Docker/settings-store.json'),path.join(process.env.APPDATA,'Docker/settings.json')]) output.settingsHashes[file]=fs.existsSync(file)?hash(fs.readFileSync(file).toString()):null;
output.protectedFileHashes={};
for(const file of ['deploy/staging/target.json','scripts/staging/manifests.cjs','scripts/staging/foundation.cjs','scripts/staging/safety.cjs','services/control-plane-api/src/config.js','services/control-plane-api/src/environment-security.js','services/control-plane-api/src/worker/readiness.js']) output.protectedFileHashes[file]=hash(fs.readFileSync(path.join(root,file)).toString());
output.endedAt=new Date().toISOString();save();
if(phase==='before') {
  assert.ok(!output.containers.some(c=>c.name.includes(expected.cluster)),'Staging container already exists');
  assert.ok(!output.networks.some(n=>n.endsWith(` ${expected.network}`)),'Staging network already exists');
  fs.writeFileSync(pointer,JSON.stringify({id,relative},null,2)+'\n');
} else if(phase==='after') {
  const before=JSON.parse(fs.readFileSync(path.join(dir,'before.json')));
  const check={timestamp:new Date().toISOString(),result:'BLOCKED',differences:[]};
  for(const key of ['id','name','os','cpus','memoryBytes','driver','cgroupDriver','cgroupVersion']) if(output.docker[key]!==before.docker[key]) check.differences.push(`Docker ${key} changed`);
  for(const key of ['settingsHashes','protectedFileHashes']) if(JSON.stringify(output[key])!==JSON.stringify(before[key])) check.differences.push(`${key} changed`);
  for(const c of before.containers) {const now=output.containers.find(n=>n.id===c.id);if(!now || JSON.stringify(now)!==JSON.stringify(c))check.differences.push(`Container state changed: ${c.name}`);}
  for(const key of ['networks','volumes']) for(const item of before[key]) if(!output[key].includes(item))check.differences.push(`Missing ${key}: ${item}`);
  check.stagingEmpty=!output.containers.some(c=>c.name.includes(expected.cluster))&&!output.networks.some(n=>n.endsWith(` ${expected.network}`));
  if(!check.stagingEmpty)check.differences.push('Staging resources remain');
  check.result=check.differences.length?'BLOCKED':'PASS';fs.writeFileSync(path.join(dir,'safety.json'),JSON.stringify(check,null,2)+'\n');
  assert.equal(check.result,'PASS',JSON.stringify(check.differences));
}
console.log(`Evidence: ${relative}/${phase}.json`);

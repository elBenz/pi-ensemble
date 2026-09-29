// Offline preservation/repricing only; no runtime, credentials or provider calls.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {receiptAccounting} from '../../../benchmarks/gpt6-comparison/accounting.mjs';
const source=path.resolve(process.argv[2]);
const destination=path.dirname(fileURLToPath(import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const hashFile=file=>sha(fs.readFileSync(file));
const save=(name,bytes)=>fs.writeFileSync(path.join(destination,name),bytes,{flag:'wx',mode:0o444});
const manifest=read(path.join(source,'manifest.json'));
if(hashFile(path.join(source,'manifest.json'))!==read(path.join(source,'manifest-seal.json')).sha256)throw new Error('Manifest changed');
const ledger=read(path.join(path.dirname(source),'run-ledger.json'));
if(ledger.entries.length!==55||ledger.remaining.length||ledger.blocked||ledger.measuredTotal===null)throw new Error('Expected complete priceable experiment');
const files={},publicInputs={};
function retain(relative){files[relative]=fs.readFileSync(path.join(source,relative)).toString('base64');}
for(const name of ['manifest.json','manifest-seal.json',...Object.keys(manifest.caseHashes)])retain(name);
let newSpend=0;
for(const entry of manifest.entries){
 const dir=path.join(source,entry.id),seal=read(path.join(dir,'complete.json'));
 if(hashFile(path.join(dir,'complete.json'))!==read(path.join(source,'completions',`${entry.id}.json`)).sha256)throw new Error('Completion anchor changed');
 for(const [file,hash]of Object.entries(seal.hashes))if(hashFile(path.join(dir,file))!==hash)throw new Error('Attempt changed');
 const receipt=read(path.join(dir,'run/receipt.json')),result=read(path.join(dir,'run/result.json'));
 newSpend+=receiptAccounting(receipt,result).amount;
 for(const file of ['launch.json','complete.json','run/receipt.json','run/result.json'])retain(`${entry.id}/${file}`);
 retain(`launches/${entry.id}.json`);retain(`completions/${entry.id}.json`);
 for(const [relative,hash]of Object.entries(receipt.workspace.after)){
  if(hash==='directory')continue;
  const file=path.resolve(dir,'run/workspace',relative);
  if(!file.startsWith(path.join(dir,'run/workspace')+path.sep)||!fs.lstatSync(file).isFile()||hashFile(file)!==hash)throw new Error('Delivered workspace changed');
  retain(`${entry.id}/run/workspace/${relative}`);
 }
}
if(Math.abs(manifest.prior.knownSpend+newSpend-ledger.knownSpend)>1e-12)throw new Error('Raw cumulative accounting mismatch');
for(const [file,hash]of Object.entries(manifest.frozen)){
 if(hashFile(file)!==hash)throw new Error(`Frozen source changed: ${file}`);
 publicInputs[file]=fs.readFileSync(file).toString('base64');
}
for(const name of ['settings.json','models.json','models-store.json']){const file=path.join(manifest.gates.agentDir,name);publicInputs[file]=fs.readFileSync(file).toString('base64');}
publicInputs[manifest.gates.catalogListing.path]=fs.readFileSync(manifest.gates.catalogListing.path).toString('base64');
// auth.json, candidate session stores and unrelated user files deliberately excluded.
const archive=gzipSync(JSON.stringify({schemaVersion:1,encoding:'base64',files,publicInputs}));
save('artifacts.json.gz',archive);
save('ledger.json',JSON.stringify(ledger,null,2)+'\n');
const summary={schemaVersion:1,source,observedAt:'2026-09-28',tasks:6,arms:3,repetitions:3,workerAttempts:54,newProbes:1,priorMeasuredCost:manifest.prior.knownSpend,newMeasuredCost:newSpend,cumulativeBenchmarkCost:ledger.knownSpend,budgetCharge:ledger.budgetCharge,remainingBudget:ledger.remainingBudget,groups:ledger.groups,artifactSha256:sha(archive),ledgerSha256:hashFile(path.join(destination,'ledger.json'))};
save('summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({destination,attempts:manifest.entries.length,newMeasuredCost:newSpend,cumulativeBenchmarkCost:ledger.knownSpend,archiveBytes:archive.length},null,2));

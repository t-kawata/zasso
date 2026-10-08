
const fs=require('fs');
const D='/Users/kawata/shyme/gaia/crates/conformance/gaia-conformance/docs/';
const P=D+'sequence-steps.jsonl';
const steps=fs.readFileSync(P,'utf8').split('\n').filter(Boolean).map(JSON.parse);

// Steps removed after the readers ran, and before some batches were built. Their verdicts must be
// shifted down; a verdict for a step that no longer exists is dropped.
const DROPPED={ 'A-5672':[6], 'H-8181':[3], 'H-7304':[2], 'H-6902':[6], 'H-6243':[2] };
// Batches built before each deletion. A-5672's deletion happened before batch 13 was built, so only
// batches 01..12 need its shift.
const files=fs.readdirSync('/tmp/seqwork').filter(f=>/^out-D-\d+\.jsonl$/.test(f)).sort();
const verdicts=new Map();
const conflicts=[];
for (const f of files) {
  const batch=+f.match(/-(\d+)\.jsonl/)[1];
  fs.readFileSync('/tmp/seqwork/'+f,'utf8').split('\n').filter(Boolean).forEach(l=>{
    let r; try{ r=JSON.parse(l); }catch(e){ return; }
    (r.verdicts||[]).forEach(v=>{
      let n=v.step;
      const drops=DROPPED[r.seq]||[];
      // a batch built before the deletion sees the old numbering
      const beforeDeletion = !(r.seq==='A-5672') ? batch<=13 : batch<=12;
      if(beforeDeletion){
        if(drops.includes(n)) return;                       // that step is gone
        n -= drops.filter(d=>d<n).length;                   // shift down past the removals
      }
      const key=r.seq+'#'+n;
      if(verdicts.has(key)){ conflicts.push(key+' ('+f+')'); }
      verdicts.set(key,{verdict:v.verdict, note:String(v.reason||'').slice(0,400)});
    });
  });
}
console.log('verdicts:',verdicts.size,'of',steps.length,'steps;  conflicts:',conflicts.length, conflicts.slice(0,5).join(', '));

// attach the grounding verdict
let attached=0;
steps.forEach(s=>{ const v=verdicts.get(s.seq+'#'+s.step); if(v){ s.grounding={verdict:v.verdict}; if(v.verdict!=='stated'&&v.note) s.grounding.note=v.note; attached++; } });
console.log('steps given a verdict:',attached,' without one:',steps.length-attached);
const tally={}; steps.filter(s=>s.grounding).forEach(s=>tally[s.grounding.verdict]=(tally[s.grounding.verdict]||0)+1);
console.log('verdicts:',JSON.stringify(tally));

// ---------------------------------------------------------------- adjudication of the duplicates
//
// A duplicate step that binds nothing is pure redundancy: it restates a step and asserts no new
// act, so it is removed. A duplicate step that BINDS an operation is not the same thing. Fourteen
// such steps were read, and they fall into three classes that a single verdict had flattened:
//
//   - the cited line is an inventory bullet, so the step is an inventory citation (four steps on
//     the authority_pubkey definition at 195);
//   - the line states ONE act and the sequence bound TWO registry rows to it, which is a finding
//     about the registry rather than about the step;
//   - the reader lumped two acts that the line does state, and the verdict is overturned.
const OVERRULE={
  'S-soul-transfer#16':{verdict:'stated',note:'overturned on reading: line 6791 states two means of pre-finalization cancellation - mutual signature, and authorized dispute resolution - so CancelSoulTransfer and ResolveSoulTransfer are two acts of one line, not one act twice.'},
  'S-complete-procedures#51':{verdict:'stated',note:'overturned on reading: line 8824 states that the Payment-Service issues the receipt only after the Stripe webhook signature and the API re-query pass, so verifying the callback and accepting the receipt are two acts of one line, not one act twice.'},
  'S-soul-transfer#4':{verdict:'elsewhere',note:'the cited line 6549 states the SoulTransferAgreement being signed and its fields fixed; it does not state a separate act of creating the transfer.'},
};
const INVENTORY=['A-195#3','A-195#4','A-195#5','A-195#6'];
const TWO_NAMES={
  'R-4584#4':'line 4586 states one request act that fixes both ServiceOrder and PaymentReceipt, and the registry carries CreateServiceOrder and IssuePaymentReceipt as two rows for it.',
  'R-4594#5':'line 4597 states one request act that fixes both ServiceOrder and PaymentReceipt, as at 4586.',
  'A-166#3':'line 166 states one append act carrying four objects (new credential, revocation state, transfer agreement, transfer finalization) and the sequence bound four registry rows to it.',
  'A-166#4':'same append act at line 166.',
  'A-166#5':'same append act at line 166.',
  'A-6791#2':'line 6789 states one append act carrying SoulTransferDispute and SoulTransferResolution, and the registry carries SubmitSoulTransferDispute and SubmitTransferDispute as two rows for it.',
  'A-5670#3':'line 5670 states one freeze-ordering requirement for a forum root transfer, bound here to ForumRootSuccession as well as to FreezeForumRootTransfer.',
};
steps.forEach(s=>{
  const g=s.grounding; if(!g||g.verdict!=='duplicate') return;
  const k=s.seq+'#'+s.step;
  if(OVERRULE[k]){ g.verdict=OVERRULE[k].verdict; g.note=OVERRULE[k].note; return; }
  if(INVENTORY.includes(k)){ g.verdict='inventory'; g.note='the cited line is the authority_pubkey definition bullet at 195, which states what a key field is; four steps were bound to it. The reader recorded this as a duplicate of step 2 because step 2 cites the same line.'; return; }
  if(TWO_NAMES[k]){ g.verdict='duplicate_operation'; g.note=TWO_NAMES[k]; return; }
});
const dups=steps.filter(s=>s.grounding?.verdict==='duplicate');
const boundDups=dups.filter(s=>s.operation);
console.log('duplicates remaining to remove:',dups.length,' binding an operation:',boundDups.length, boundDups.map(s=>s.seq+'#'+s.step).join(', '));
if(process.argv[2]==='--write'){
  const kept=steps.filter(s=>s.grounding?.verdict!=='duplicate');
  const bySeq={}; kept.forEach(s=>{(bySeq[s.seq]??=[]).push(s)});
  const out=[]; for(const [seq,arr] of Object.entries(bySeq)){ arr.sort((a,b)=>a.step-b.step).forEach((s,i)=>{s.step=i+1;out.push(s);}); }
  fs.writeFileSync(P, out.map(s=>JSON.stringify(s)).join('\n')+'\n');
  console.log('WROTE', out.length, 'steps (removed', steps.length-out.length, ')');
}

/**
 * check-rfc-placeholders.js — RFC-TREE.json の finalTree から期待ファイル名を導出し、
 * 未記入 \`<!-- ??? -->\` マーカーを検出する。
 *
 * Usage: node check-rfc-placeholders.js <RFC_TREE_PATH>
 */
const fs=require("fs"),path=require("path");
function childDir(cb,c){return cb+"-"+c.childId+"-"+(c.slug||c.directoryName||c.childId);}
function gcDir(cb,pid,gc){return cb+"-"+pid+"-"+gc.grandchildId+"-"+(gc.slug||gc.directoryName||gc.grandchildId);}
function main(){
  const p=process.argv[2];
  if(!p){console.log(JSON.stringify({success:false,error:"Usage: node check-rfc-placeholders.js <RFC_TREE_PATH>"}));process.exit(1);}
  const fp=path.resolve(p);
  if(!fs.existsSync(fp)){console.log(JSON.stringify({success:false,error:"Not found: "+fp}));process.exit(1);}
  let data;
  try{data=JSON.parse(fs.readFileSync(fp,"utf8"));}catch(e){console.log(JSON.stringify({success:false,error:"Invalid JSON"}));process.exit(1);}
  const cb=path.basename(data.canonicalRfcPath,".md");
  const bd=path.dirname(data.canonicalRfcPath);
  const tree=data.finalTree;
  if(!Array.isArray(tree)||tree.length===0){console.log(JSON.stringify({success:true,totalFiles:0,remaining:0,placeholders:[]}));return;}
  const expected=[];
  for(const child of tree){
    const dn=childDir(cb,child);expected.push(path.join(bd,dn,dn+".md"));
    if(child.children) for(const gc of child.children){
      const dg=gcDir(cb,child.childId,gc);expected.push(path.join(bd,dn,dg,dg+".md"));
    }
  }
  const ph=[];
  for(const f of expected){
    if(!fs.existsSync(f)) continue;
    const lines=fs.readFileSync(f,"utf8").split("\n");
    for(let i=0;i<lines.length;i++){if(lines[i].includes("<!-- ??? -->")) ph.push({file:f,line:i+1,text:lines[i].trim()});}
  }
  console.log(JSON.stringify({success:true,totalFiles:expected.length,existingFiles:expected.filter(f=>fs.existsSync(f)).length,remaining:ph.length,placeholders:ph.slice(0,300)}));
}
if(require.main===module) main();

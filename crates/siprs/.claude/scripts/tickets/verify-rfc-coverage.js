/**
 * verify-rfc-coverage.js — ディレクトリ構造が finalTree と一致するか検証
 */
const fs=require("fs"),path=require("path");
function childDir(cb,c){return cb+"-"+c.childId+"-"+(c.slug||c.directoryName||c.childId);}
function gcDir(cb,pid,gc){return cb+"-"+pid+"-"+gc.grandchildId+"-"+(gc.slug||gc.directoryName||gc.grandchildId);}
function main(){
  const treePathArg=process.argv[2];
  if(!treePathArg){console.log(JSON.stringify({success:false,error:"Usage: node verify-rfc-coverage.js <RFC_TREE_PATH>"}));process.exit(1);}
  const fp=path.resolve(treePathArg);const data=JSON.parse(fs.readFileSync(fp,"utf8"));
  const tree=data.finalTree;const bd=path.dirname(data.canonicalRfcPath);
  const cb=path.basename(data.canonicalRfcPath,".md");
  if(!tree||!Array.isArray(tree)){console.log(JSON.stringify({success:false,error:"finalTree not found"}));process.exit(1);}
  const issues=[];
  for(const child of tree){
    const dn=childDir(cb,child);const cd=path.join(bd,dn);
    if(!fs.existsSync(cd)){issues.push("Missing child dir: "+dn);continue;}
    if(!fs.existsSync(path.join(cd,dn+".md"))) issues.push("Missing child file: "+dn+".md");
    if(data.language==="rust"&&!fs.existsSync(path.join(cd,"Cargo.toml"))) issues.push("Missing Cargo.toml: "+dn);
    if(data.language==="go"&&!fs.existsSync(path.join(cd,"go.mod"))) issues.push("Missing go.mod: "+dn);
    if(data.language==="typescript"&&!fs.existsSync(path.join(cd,"package.json"))) issues.push("Missing package.json: "+dn);
    if(child.children) for(const gc of child.children){
      const dnGC=gcDir(cb,child.childId,gc);const gd=path.join(cd,dnGC);
      if(!fs.existsSync(gd)){issues.push("Missing grandchild dir: "+dn+"/"+dnGC);continue;}
      if(!fs.existsSync(path.join(gd,dnGC+".md"))) issues.push("Missing grandchild file: "+dnGC+".md");
    }
  }
  if(issues.length===0) console.log(JSON.stringify({success:true,valid:true,message:"Coverage OK"}));
  else {console.log(JSON.stringify({success:true,valid:false,count:issues.length,issues}));process.exit(1);}
}
if(require.main===module) main();

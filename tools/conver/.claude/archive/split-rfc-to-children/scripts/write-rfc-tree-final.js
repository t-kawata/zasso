const fs=require("fs"),path=require("path"),{validateRfcTree}=require("./validate-rfc-tree");
function main(){
  const p=process.argv[2];if(!p){console.log(JSON.stringify({success:false,error:"Usage: node write-rfc-tree-final.js <RFC_TREE_PATH>"}));process.exit(1);}
  const fp=path.resolve(p);const data=JSON.parse(fs.readFileSync(fp,"utf8"));
  if(!data.draftTree||!Array.isArray(data.draftTree)||data.draftTree.length===0){console.log(JSON.stringify({success:false,error:"draftTree empty"}));process.exit(1);}
  data.finalTree=JSON.parse(JSON.stringify(data.draftTree));
  const vr=validateRfcTree(data);
  if(!vr.valid){console.log(JSON.stringify({success:false,error:"Validation failed",errors:vr.errors}));process.exit(1);}
  fs.writeFileSync(fp,JSON.stringify(data,null,2)+"\n");console.log(JSON.stringify({success:true,count:data.finalTree.length}));
}
if(require.main===module) main();

const fs=require("fs"),path=require("path"),{validateRfcTree}=require("./validate-rfc-tree");
function main(){
  const p=process.argv[2];if(!p){console.log(JSON.stringify({success:false,error:"Usage: node write-rfc-tree-draft.js <RFC_TREE_PATH> (stdin: tree array)"}));process.exit(1);}
  const fp=path.resolve(p);const data=JSON.parse(fs.readFileSync(fp,"utf8"));let buf="";
  process.stdin.on("data",c=>buf+=c);process.stdin.on("end",()=>{
    const tree=JSON.parse(buf);
    if(!Array.isArray(tree)){console.log(JSON.stringify({success:false,error:"stdin must be a JSON array of childNode objects. Received: "+typeof tree}));process.exit(1);}
    // 空の children 配列を自動除去
    tree.forEach(function(n) {
      if (n.children && Array.isArray(n.children) && n.children.length === 0) {
        delete n.children;
      }
    });
    data.draftTree=tree;
    const vr=validateRfcTree(data);
    if(!vr.valid){console.log(JSON.stringify({success:false,error:"Validation of draftTree failed. See 'errors' array for details.",errors:vr.errors}));process.exit(1);}
    fs.writeFileSync(fp,JSON.stringify(data,null,2)+"\n");console.log(JSON.stringify({success:true,count:tree.length}));
  });
}
if(require.main===module) main();

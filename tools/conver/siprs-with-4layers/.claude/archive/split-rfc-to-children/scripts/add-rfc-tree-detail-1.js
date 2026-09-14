const fs=require("fs"),path=require("path"),{validateRfcTree}=require("./validate-rfc-tree");
function main(){
  const p=process.argv[2];if(!p){console.log(JSON.stringify({success:false,error:"Usage: ..."}));process.exit(1);}
  const fp=path.resolve(p);const data=JSON.parse(fs.readFileSync(fp,"utf8"));let buf="";
  process.stdin.on("data",c=>buf+=c);process.stdin.on("end",()=>{
    const u=JSON.parse(buf);
    if(u.typeDefinitions!==undefined) data.rfcUnderstanding.typeDefinitions=u.typeDefinitions;
    if(u.apiSignatures!==undefined) data.rfcUnderstanding.apiSignatures=u.apiSignatures;
    if(u.dependencyGraph!==undefined) data.rfcUnderstanding.dependencyGraph=u.dependencyGraph;
    if(u.externalDependencies!==undefined) data.rfcUnderstanding.externalDependencies=u.externalDependencies;
    const vr=validateRfcTree(data);
    if(!vr.valid){console.log(JSON.stringify({success:false,error:"Validation failed",errors:vr.errors}));process.exit(1);}
    fs.writeFileSync(fp,JSON.stringify(data,null,2)+"\n");console.log(JSON.stringify({success:true}));
  });
}
if(require.main===module) main();

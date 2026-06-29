const fs = require("fs"), path = require("path"), {validateRfcTree} = require("./validate-rfc-tree");
function main(){
  const p=process.argv[2];
  if(!p){console.log(JSON.stringify({success:false,error:"Usage: ..."}));process.exit(1);}
  const fp=path.resolve(p);
  const data=JSON.parse(fs.readFileSync(fp,"utf8"));
  let buf="";
  process.stdin.on("data",c=>buf+=c);
  process.stdin.on("end",()=>{
    const u=JSON.parse(buf);
    if(u.purpose!==undefined) data.rfcUnderstanding.purpose=u.purpose;
    if(u.goals!==undefined) data.rfcUnderstanding.goals=u.goals;
    if(u.successCriteria!==undefined) data.rfcUnderstanding.successCriteria=u.successCriteria;
    if(u.nonScope!==undefined) data.rfcUnderstanding.nonScope=u.nonScope;
    const vr=validateRfcTree(data);
    if(!vr.valid){console.log(JSON.stringify({success:false,error:"Validation failed",errors:vr.errors}));process.exit(1);}
    fs.writeFileSync(fp,JSON.stringify(data,null,2)+"\n");
    console.log(JSON.stringify({success:true}));
  });
}
if(require.main===module) main();

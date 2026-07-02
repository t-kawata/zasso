/**
 * generate-child-rfcs.js — finalTree から子・孫RFCのディレクトリ構造を機械的に生成
 * 命名規則: 子={canonicalBase}-{childId}-{slug}/, 孫={canonicalBase}-{childId}-{grandchildId}-{slug}/
 */
const fs=require("fs"),path=require("path");

function fm(node,level,cPath,ev,pe){
  const l=["---"];
  l.push("tree:");l.push("  level: "+level);
  if(level==="child"){l.push('  childId: "'+node.childId+'"');l.push("  childName: "+(node.name||""));}
  l.push("slug: "+(node.slug||node.directoryName||""));
  if(level==="grandchild") l.push('  grandchildId: "'+node.grandchildId+'"');
  l.push("canonicalRfcPath: "+cPath);l.push('canonicalRfcSection: "'+(ev||"")+'"');
  l.push('ioSchema: "'+(node.ioSchema||"TBD")+'"');
  l.push('decouplingMethod: "'+(node.decouplingMethod||"TBD")+'"');
  if(node.dependencyOn) l.push("dependencyOn: ["+node.dependencyOn.join(",")+"]");
  if(pe) l.push('parentEvidence: "'+pe+'"');
  l.push("---");
  return l.join("\n");
}
function md(node,level,cPath,ev,pe){
  return fm(node,level,cPath,ev,pe)+'\n\n# RFC: '+(node.name||"")+'\n\n## 責務\n\n<!-- ??? -->\n\n## I/O境界\n\n<!-- ??? -->\n\n## 親との関係\n\n根拠: '+(ev||"(TBD)")+'\n\n<!-- ??? -->\n\n## 依存関係\n\n<!-- ??? -->\n';
}
function write(p,c){const d=path.dirname(p);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(p,c,"utf8");}
function childDir(cb,c){return cb+"-"+c.childId+"-"+(c.slug||c.directoryName||c.childId);}
function gcDir(cb,pid,gc){return cb+"-"+pid+"-"+gc.grandchildId+"-"+(gc.slug||gc.directoryName||gc.grandchildId);}

function main(){
  const rp=process.argv[2];
  if(!rp){console.log(JSON.stringify({success:false,error:"Usage: node generate-child-rfcs.js <RFC_TREE_PATH>"}));process.exit(1);}
  const fp=path.resolve(rp);const data=JSON.parse(fs.readFileSync(fp,"utf8"));const tree=data.finalTree;
  if(!tree||!Array.isArray(tree)||tree.length===0){console.log(JSON.stringify({success:false,error:"finalTree empty"}));process.exit(1);}
  const bd=path.dirname(data.canonicalRfcPath);const cb=path.basename(data.canonicalRfcPath,".md");
  const rel="../"+path.basename(data.canonicalRfcPath);const lang=data.language;
  for(const c of tree){
    const dn=childDir(cb,c);const cd=path.join(bd,dn);
    write(path.join(cd,dn+".md"),md(c,"child",rel,c.rfcEvidence||"",null));
    const td=path.join(cd,"tickets");fs.mkdirSync(td,{recursive:true});fs.writeFileSync(path.join(td,".gitkeep"),"");
    if(lang==="rust"){
      let ct='[package]\nname = "'+dn+'"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n';
      if(c.dependencyOn) for(const d of c.dependencyOn) ct+='child-'+d+' = { path = "../'+cb+'-'+d+'-<slug>" }\n';
      write(path.join(cd,"Cargo.toml"),ct);
      const sd=path.join(cd,"src");fs.mkdirSync(sd,{recursive:true});let lc="// [::STUB::] Generated\n";
      if(c.children) for(const gc of c.children) lc+="pub mod "+gcDir(cb,c.childId,gc)+";\n";
      lc+='\nfn main() {}\n';write(path.join(sd,"lib.rs"),lc);
    } else if(lang==="go"){
      write(path.join(cd,"go.mod"),'module github.com/user/project/'+dn+'\n\ngo 1.22\n');
    } else if(lang==="typescript"){
      write(path.join(cd,"package.json"),JSON.stringify({name:"@project/"+dn,version:"0.1.0",type:"module"},null,2)+"\n");
      write(path.join(cd,"tsconfig.json"),JSON.stringify({compilerOptions:{composite:true,outDir:"./dist",rootDir:"./src"},include:["src"]},null,2)+"\n");
    }
    if(c.children) for(const gc of c.children){
      const dnGC=gcDir(cb,c.childId,gc);const gd=path.join(cd,dnGC);
      write(path.join(gd,dnGC+".md"),md(gc,"grandchild",rel,gc.rfcEvidence||"",gc.parentEvidence||""));
      const gtd=path.join(gd,"tickets");fs.mkdirSync(gtd,{recursive:true});fs.writeFileSync(path.join(gtd,".gitkeep"),"");
    }
  }
  console.log(JSON.stringify({success:true,canonicalBase:cb}));
}
if(require.main===module) main();

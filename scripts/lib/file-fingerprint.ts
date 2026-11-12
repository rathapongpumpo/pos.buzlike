import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
export async function fileFingerprint(root: string) {
  const result:Record<string,{bytes:number;sha256:string}>={};
  async function walk(directory:string) {
    let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw error;}
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error("Backup does not follow symbolic links");if(entry.isDirectory())await walk(file);else if(entry.isFile()){const data=await readFile(file);result[path.relative(root,file).replaceAll("\\","/")]={bytes:data.length,sha256:createHash("sha256").update(data).digest("hex")};}}
  }
  await walk(root);return result;
}

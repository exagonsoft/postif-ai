const fs = require("fs");
const ts = require("typescript");
const entries = JSON.parse(fs.readFileSync(".customer-i18n-entries.json","utf8"));
const rows = new Map(fs.readFileSync(".customer-i18n-data.txt","utf8").trimEnd().split(/\r?\n/).map(line => {const [id,...values]=line.split("|");return [+id,values];}));
const fragmentPath = "C:\\Users\\Alvaro Martin\\.copilot\\session-state\\255494fd-3a35-4ec7-aae5-719bbaf5ebd0\\files\\i18n-customer.json";
const dictionary = {en:{},es:{},de:{},"pt-BR":{}};
const keys = new Map();
const decode = text => text.replace(/&apos;/g,"'").replace(/&ldquo;/g,"“").replace(/&rdquo;/g,"”").replace(/&mdash;/g,"—").replace(/&amp;/g,"&");
for (const [id,values] of rows) {
 const english=decode(entries[id].value);
 if (!keys.has(english)) {
  const key="customer.text."+id;
  keys.set(english,key);
  ["en","es","de","pt-BR"].forEach((locale,i)=>dictionary[locale][key]= i===0 ? english : values[i-1]);
 }
}
const call = english => `t(${JSON.stringify(keys.get(decode(english)))})`;
// Preset identifiers must remain unchanged in state and request payloads.
const displayOnly = new Set([66,67,68,69,70,148,149,150,151,152,153,158,159,160,161,162,163,405,406,407,408,409,410,411,415,416,417,418,419,421,422,423,424,425,427,428,429]);
for (const file of [...new Set(entries.map(e=>e.file))]) {
 let text=fs.readFileSync(file,"utf8");
 const ast=ts.createSourceFile(file,text,99,true,4);
 const client=text.includes('"use client"');
 const edits=[];
 for (let id=0;id<entries.length;id++) {
  const e=entries[id]; if(e.file!==file || !rows.has(id) || displayOnly.has(id) || [15,108].includes(id)) continue;
  const expression=call(e.value);
  if(e.kind==="jsx") {
   const original=text.slice(e.start,e.end);
   const match=original.match(/^(\s*)[\s\S]*?(\s*)$/);
   const before=match[1],after=match[2];
   edits.push({start:e.start,end:e.end,value:before+(before && !before.includes("\n")?'{" "}':"")+`{${expression}}`+(after && !after.includes("\n")?'{" "}':"")+after});
  } else {
   let node;
   function find(n){if(n.getStart(ast)===e.start&&n.end===e.end) node=n; else ts.forEachChild(n,find);}
   find(ast);
   edits.push({start:e.start,end:e.end,value: node && ts.isJsxAttribute(node.parent) ? `{${expression}}` : expression});
  }
 }
 // Insert the translator inside each rendering function, not in event handlers.
 for(const statement of ast.statements) {
  if(ts.isFunctionDeclaration(statement) && statement.body && statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)) {
   const name=statement.name?.text;
   if(name) edits.push({start:statement.body.getStart(ast)+1,end:statement.body.getStart(ast)+1,value:`\n  const { t, locale, formatDate, formatNumber } = ${client ? "useAppLanguage()" : "await getServerI18n()"};\n`});
  }
 }
 text=edits.sort((a,b)=>b.start-a.start).reduce((s,e)=>s.slice(0,e.start)+e.value+s.slice(e.end),text);
 text = text.replace(/(^import )/m, `import { ${client ? "useAppLanguage" : "getServerI18n"} } from "@/i18n/${client ? "provider" : "server"}";\n$1`);
 // STEPS contains presentation only. Keep it in the component's translator scope.
 if(file.endsWith("OnboardingWizard.tsx")) {
  const start=text.indexOf("const STEPS = ["),end=text.indexOf("];",start)+2;
  const steps=text.slice(start,end);
  text=text.slice(0,start)+text.slice(end);
  text=text.replace("  const router = useRouter();",steps+"\n  const router = useRouter();");
 }
 if([ "src\\app\\app\\layout.tsx","src\\app\\onboarding\\page.tsx"].includes(file)){
  const original=file.includes("onboarding")?"Set Up Your Workspace":"Workspace";
  text=text.replace(`export const metadata = privatePageMetadata("${original}");`,`export async function generateMetadata() {\n  const { t } = await getServerI18n();\n  return privatePageMetadata(${call(original)});\n}`);
 }
 const localEntries=entries.filter((e,id)=>e.file===file && displayOnly.has(id));
 if(localEntries.length){
  const labels=[...new Set(localEntries.map(e=>e.value))].map(english=>`${JSON.stringify(english)}: ${call(english)}`).join(",\n    ");
  text=text.replace("  const router = useRouter();",`  const displayLabel = (value: string) => ({\n    ${labels}\n  } as Record<string, string>)[value] ?? value;\n  const router = useRouter();`);
  if(file.includes("repurpose")) text=text.replace("{type}","{displayLabel(type)}");
  if(file.includes("OnboardingWizard")) text=text.replace("{ind}","{displayLabel(ind)}").replace("{t}","{displayLabel(t)}");
  if(file.includes("ContentStudioClient")) {
   text=text.replace(/\{(ct|t|l)\}/g,"{displayLabel($1)}");
  }
 }
 fs.writeFileSync(file,text);
}
fs.writeFileSync(fragmentPath,JSON.stringify(dictionary,null,2)+"\n");
fs.writeFileSync(".customer-i18n-keys.json",JSON.stringify(Object.fromEntries(keys),null,2));
console.log(`Localized ${keys.size} unique strings across ${new Set(entries.map(e=>e.file)).size} files.`);

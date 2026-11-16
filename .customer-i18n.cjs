const fs = require("fs");
const ts = require("typescript");
const path = require("path");
const components = ["AgentWorkspaceClient", "AnalyticsClient", "AutomaticMediaSettings", "CalendarClient", "CampaignsClient", "ContentStudioClient", "MediaLibraryUploads", "NotificationSettings", "OverviewInteractive", "PostMediaPicker", "PostsManagerClient", "ProviderAnalyticsSync", "SocialAccountsClient", "WorkspacesClient"];
const files = [
  ...["page", "layout", ...["agent", "analytics", "calendar", "campaigns", "media", "posts", "repurpose", "settings", "social", "studio", "workspaces"].map(x => x + "\\page")].map(x => "src\\app\\app\\" + x + ".tsx"),
  "src\\app\\onboarding\\page.tsx", "src\\app\\onboarding\\OnboardingWizard.tsx",
  ...components.map(x => "src\\components\\" + x + ".tsx"),
];
const entries = [];
for (const file of files) {
 const text = fs.readFileSync(file, "utf8");
 const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
 function visit(n) {
  let value, kind;
  if (ts.isJsxText(n)) { value = n.text.replace(/\s+/g," ").trim(); kind="jsx"; }
  else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
   value = n.text; kind="string";
   const p=n.parent;
   if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p)) return;
   if (ts.isJsxAttribute(p) && !["placeholder","title","alt","aria-label","label"].includes(p.name.text)) return;
   if (ts.isPropertyAssignment(p) && ["className","id","value","action","method","type","href","url","color","bg","text","border","gradient","key","icon","mode","status","platform","contentType","role","scope","size","name"].includes(p.name.getText(ast))) return;
   if (/^(?:bg-|text-|border-|rounded-|flex|grid|space-|mt-|mb-|px-|py-|h-|w-|\/|@|https?:|#[0-9a-f]|application\/|Content-Type|POST$|GET$|PATCH$|DELETE$|PUT$|force-dynamic$|use client$)/.test(value)) return;
  }
  if (value && /[A-Za-z]/.test(value) && (kind==="jsx" || /[\sA-Z]/.test(value))) {
   entries.push({file, start:n.getStart(ast), end:n.end, value, kind, line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1});
  }
  ts.forEachChild(n,visit);
 }
 visit(ast);
}
fs.writeFileSync(".customer-i18n-entries.json", JSON.stringify(entries,null,2));
for (const file of files) {
 console.log("\n### "+file);
 for (let i=0;i<entries.length;i++) if(entries[i].file===file) console.log(`${i} ${entries[i].line} ${entries[i].kind} ${JSON.stringify(entries[i].value)}`);
}

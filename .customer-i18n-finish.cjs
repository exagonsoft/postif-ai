const fs = require("fs"),ts=require("typescript");
const fragmentPath="C:\\Users\\Alvaro Martin\\.copilot\\session-state\\255494fd-3a35-4ec7-aae5-719bbaf5ebd0\\files\\i18n-customer.json";
const dictionary=JSON.parse(fs.readFileSync(fragmentPath,"utf8"));
const rows=fs.readFileSync(".customer-i18n-extra.txt","utf8").trimEnd().split(/\r?\n/).map(x=>x.split("|"));
for(const [key,...values] of rows) ["en","es","de","pt-BR"].forEach((locale,i)=>dictionary[locale]["customer."+key]=values[i]);
const statusNames=rows.filter(([key])=>key.startsWith("status.")).map(([key])=>key.slice(7));
const statusHelper=`\n  const displayStatus = (value: string) => ${JSON.stringify(statusNames)}.includes(value) ? t(\`customer.status.\${value}\`) : value;\n`;
const K=(key,params)=>`t("customer.${key}"${params?", "+params:""})`;
const files=[...new Set(JSON.parse(fs.readFileSync(".customer-i18n-entries.json","utf8")).map(x=>x.file))];
const replacements={
 "src\\app\\app\\page.tsx":[
  ['`${Math.round((completedJobs / finishedJobs) * 100)}%`','formatNumber(completedJobs / finishedJobs, { style: "percent", maximumFractionDigits: 0 })'],
  ['`${connectedChannels} / ${plan.maxChannels}`','`${formatNumber(connectedChannels)} / ${formatNumber(plan.maxChannels)}`'],
  ['`${totalAudience.toLocaleString()} combined followers`',K("followers","{ count: formatNumber(totalAudience) }")],
  ['`${usage.used} / ${plan.maxPostsPerMonth}`','`${formatNumber(usage.used)} / ${formatNumber(plan.maxPostsPerMonth)}`'],
  ['`${successRate} job publishing success rate`',K("successRate","{ rate: successRate }")],
  ['`${scheduledCount} queued • ${pendingApprovals} review`',K("queuedReview","{ queued: formatNumber(scheduledCount), review: formatNumber(pendingApprovals) }")],
  ['`${ctx.workspace.aiCreditsBalance} credits`',K("credits","{ count: formatNumber(ctx.workspace.aiCreditsBalance) }")],
  ['`${plan.name} (${ctx.workspace.billingCycle})`','`${plan.name} (${displayStatus(ctx.workspace.billingCycle)})`'],
 ],
 "src\\app\\app\\repurpose\\page.tsx":[
  ['`Generated ${Object.keys(data.variants).length} distinct channel adaptations.`',K("generatedAdaptations","{ count: formatNumber(Object.keys(data.variants).length) }")],
  ['`Repurposed ${sourceType}: ${sourceText.slice(0, 42)}...`',K("repurposedTitle","{ type: displayLabel(sourceType), text: sourceText.slice(0, 42) }")],
  ['`Repurposed ${sourceType}`',K("repurposedTopic","{ type: displayLabel(sourceType) }")],
 ],
 "src\\app\\onboarding\\OnboardingWizard.tsx":[
  ['`Generated suggestions from your brief (${data.meta?.executionSource}). Review and verify them below.`',K("discoverySuggestions",'{ source: data.meta?.executionSource ?? "" }')],
  ['`${brandName} is ready in your POSTIF-AI Command Center.`',K("brandReady","{ name: brandName }")],
  ['{t("customer.text.129")}{" "} {step + 1} {t("customer.text.130")}{" "} {STEPS.length}: {STEPS[step]}',`{${K("stepOf","{ step: formatNumber(step + 1), total: formatNumber(STEPS.length), title: STEPS[step] }")}}`],
  ['1. {createWorkspace ? t("customer.text.132") : t("customer.text.133")} {t("customer.text.134")}',`{createWorkspace ? ${K("createWorkspace")} : ${K("configureWorkspace")}}`],
 ],
 "src\\components\\AgentWorkspaceClient.tsx":[
  ['`Operating in ${targetMode.toUpperCase()} mode with updated guardrails.`',K("agentOperating","{ mode: displayStatus(targetMode).toLocaleUpperCase(locale) }")],
  ['`${mode} Mode Active`',K("modeActive","{ mode: displayStatus(mode) }")],
  ['{t("customer.text.215")}{" "} {maxPostsPerWeek} {t("customer.text.216")}{" "} {allowedPlatforms.length} {t("customer.text.217")}',`{${K("agentLimits","{ posts: formatNumber(maxPostsPerWeek), channels: formatNumber(allowedPlatforms.length) }")}}`],
  ['{slot.day}','{displayStatus(slot.day)}'],
  ['{slot.status}','{displayStatus(slot.status)}'],
  ['{a.status}','{displayStatus(a.status)}'],
 ],
 "src\\components\\AnalyticsClient.tsx":[
  ['`Downloaded ${filtered.length} analytics rows.`',K("downloadedRows","{ count: formatNumber(filtered.length) }")],
  ['` compared to ${rankedTypes[1].rate.toFixed(2)}% for ${rankedTypes[1].type}`',K("comparedTo","{ rate: formatNumber(rankedTypes[1].rate, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), type: displayPostType(rankedTypes[1].type) }")],
  ['`${row.dateLabel} (${row.platform}): ${row.impressions} impressions`',K("chartImpressions","{ date: displayDate(row.dateLabel), platform: row.platform, count: formatNumber(row.impressions) }")],
  ['{rankedTypes[0].type}','{displayPostType(rankedTypes[0].type)}'],
  ['{r.postType}','{displayPostType(r.postType)}'],
  ['{r.dateLabel}','{displayDate(r.dateLabel)}'],
 ],
 "src\\components\\CalendarClient.tsx":[
  ["`'${editTitle}' updated in calendar & job queue.`",K("updatedCalendar","{ title: editTitle }")],
  ['`Moved post to ${targetDate.toLocaleDateString()} at 10:00 AM (${timezone}).`',K("movedPost",'{ date: formatDate(targetDate, { dateStyle: "medium" }), time: formatDate(targetDate, { hour: "numeric", minute: "2-digit" }), timezone }')],
  ['`Publishing job #${jobId} will be checked by the worker.`',K("retryJob","{ id: jobId }")],
  ['`Processed ${data.processed} due publishing job(s).`',K("processedJobs","{ count: formatNumber(data.processed) }")],
  ['{mode} {t("customer.text.301")}','{displayStatus(mode)} {t("customer.text.301")}'],
  ['{viewMode} {t("customer.text.315")}','{displayStatus(viewMode)} {t("customer.text.315")}'],
  ['{job.status}','{displayStatus(job.status)}'],
 ],
 "src\\components\\CampaignsClient.tsx":[
  ['`Generated strategy themes and ${bp.samplePosts?.length || 0} starter draft posts.`',K("generatedCampaign","{ count: formatNumber(bp.samplePosts?.length || 0) }")],
  ['`Status set to ${status}.`',K("statusSet","{ status: displayStatus(status) }")],
  ['{camp.status}','{displayStatus(camp.status)}'],
 ],
 "src\\components\\ContentStudioClient.tsx":[
  ['`${data.meta.executionSource} • ${data.meta.model} (${data.meta.creditsCharged} credits)`',K("executionBadge","{ source: data.meta.executionSource, model: data.meta.model, count: formatNumber(data.meta.creditsCharged) }")],
  ['`Created tailored copy for ${selectedPlatforms.length} channel(s).`',K("tailoredCopy","{ count: formatNumber(selectedPlatforms.length) }")],
  ["`Applied '${action}' to ${activeTab.toUpperCase()}`",K("appliedAction","{ action: displayAction(action), platform: activeTab.toUpperCase() }")],
 ],
 "src\\components\\OverviewInteractive.tsx":[
  ['`${agentMode} Mode`',K("agentMode","{ mode: displayStatus(agentMode) }")],
  ['{act.status}','{displayStatus(act.status)}'],
  ['{p.status.replace(/_/g, " ")}','{displayStatus(p.status)}'],
  ['{m.dateLabel.replace("Apr ", "4/")}','{displayDate(m.dateLabel)}'],
 ],
 "src\\components\\PostMediaPicker.tsx":[
  ['`Generation ${asset.generationStatus}…`',K("generationStatus","{ status: displayStatus(asset.generationStatus) }")],
  ['`Delete "${asset.title}" from the media library and storage?`',K("deleteMedia","{ title: asset.title }")],
  ['{t("customer.text.558")}{" "} {kind}',`{${K("generateKind","{ kind: displayStatus(kind) }")}}`],
  ['}, [onAssets]);','}, [onAssets, t]);'],
 ],
 "src\\components\\PostsManagerClient.tsx":[
  ['status.replaceAll("_", " ")','displayStatus(status)'],
  ['{post.automaticMedia.kind}','{displayStatus(post.automaticMedia.kind)}'],
  ['{post.automaticMediaStatus || t("customer.text.583")}','{post.automaticMediaStatus ? displayStatus(post.automaticMediaStatus) : t("customer.text.583")}'],
 ],
 "src\\components\\ProviderAnalyticsSync.tsx":[
  ['`${result.processed} accounts synchronized; ${result.skipped} skipped.`',K("syncResult","{ processed: formatNumber(result.processed), skipped: formatNumber(result.skipped) }")],
 ],
 "src\\components\\SocialAccountsClient.tsx":[
  ['SOCIAL_LIFECYCLE_CAPABILITIES[platform].renewal',K('provider.${platform}.renewal').replace('"customer.provider.${platform}.renewal"','`customer.provider.${platform}.renewal`')],
  ['SOCIAL_LIFECYCLE_CAPABILITIES[platform].analytics',K('provider.${platform}.analytics').replace('"customer.provider.${platform}.analytics"','`customer.provider.${platform}.analytics`')],
  ['`Register this exact callback in your app: ${callbackOrigin}/api/social/oauth/${platform}/callback.`',K("registerCallback","{ url: `${callbackOrigin}/api/social/oauth/${platform}/callback` }")],
  ['{value.replaceAll("_", " ")}','{displayStatus(value)}'],
  ['{spec.apiNotes}','{t(`customer.provider.${platform}.notes`)}'],
  ['{account.status.replaceAll("_", " ")}','{displayStatus(account.status)}'],
  ['{account.renewalStatus?.replaceAll("_", " ") || t("customer.text.664")}','{account.renewalStatus ? displayStatus(account.renewalStatus) : t("customer.text.664")}'],
  ['{account.analyticsStatus || t("customer.text.666")}','{account.analyticsStatus ? displayStatus(account.analyticsStatus) : t("customer.text.666")}'],
 ],
 "src\\components\\WorkspacesClient.tsx":[
  ['`${data.brand.name} added to this workspace.`',K("brandAdded","{ name: data.brand.name }")],
  ['`Ask ${inviteEmail} to sign in and open Workspaces to accept. No email has been sent.`',K("inviteInstructions","{ email: inviteEmail }")],
  ['`Member role changed to ${role.toUpperCase()}.`',K("roleChanged","{ role: displayStatus(role).toLocaleUpperCase(locale) }")],
  ['{currentRole.toUpperCase()}','{displayStatus(currentRole).toLocaleUpperCase(locale)}'],
  ['{m.status}','{displayStatus(m.status)}'],
  ['{invitation.role}','{displayStatus(invitation.role)}'],
 ],
 "src\\app\\app\\settings\\page.tsx":[
  ['name: "MongoDB Persistence"','name: '+K("environment.mongo")],
  ['name: "Managed OpenAI API Key (OPENAI_API_KEY)"','name: '+K("environment.openai")],
  ['name: "Paid Checkout"','name: '+K("environment.checkout")],
  ['name: "Social Platform Credentials"','name: '+K("environment.social")],
  ['status: "Not available"','status: '+K("environment.unavailable")],
  ['status: "Customer-owned; configure per account"','status: '+K("environment.customer")],
  ['{ctx.memberRole}','{displayStatus(ctx.memberRole)}'],
  ['{ctx.user.systemRole}','{displayStatus(ctx.user.systemRole)}'],
 ],
 "src\\app\\app\\analytics\\page.tsx":[
  ['{snapshot.platform} · account #{snapshot.socialAccountId} · captured {snapshot.day}',`{${K("providerCapture",'{ platform: snapshot.platform, id: snapshot.socialAccountId, date: formatDate(`${snapshot.day}T00:00:00Z`, { dateStyle: "medium", timeZone: "UTC" }) }')}}`],
  ['{snapshot.platform} {t("customer.text.31")}{snapshot.socialAccountId} {t("customer.text.32")}{" "} {snapshot.day}',`{${K("providerCapture",'{ platform: snapshot.platform, id: snapshot.socialAccountId, date: formatDate(`${snapshot.day}T00:00:00Z`, { dateStyle: "medium", timeZone: "UTC" }) }')}}`],
  ['{capability.analytics}','{t(`customer.provider.${platform}.analytics`)}'],
 ],
};
for(const file of files) {
 let text=fs.readFileSync(file,"utf8");
 for(const [old,value] of replacements[file]??[]){
  if(!text.includes(old)) console.log("Not found",file,old);
  text=text.split(old).join(value);
 }
 if(text.includes("displayStatus(")) text=text.replace(/(const \{ t, locale, formatDate, formatNumber \} = (?:useAppLanguage\(\)|await getServerI18n\(\));)/g,"$1"+statusHelper);
 if(file.endsWith("AnalyticsClient.tsx")){
  const map={"Educational Post":"262","Product Announcement":"263","Case Study":"264","Carousel":"265","Video Script":"266"};
  text=text.replace("  const { toast } = useToast();",`  const displayPostType = (value: string) => ({${Object.entries(map).map(([v,id])=>JSON.stringify(v)+`: t("customer.text.${id}")`).join(", ")}} as Record<string, string>)[value] ?? value;\n  const { toast } = useToast();`);
 }
 if(file.endsWith("ContentStudioClient.tsx")){
  const map={rewrite:"441",improve:"442",shorten:"443",expand:"444",translate:"445",hashtags:"446",cta:"447"};
  text=text.replace("  const router = useRouter();",`  const displayAction = (value: string) => ({${Object.entries(map).map(([v,id])=>JSON.stringify(v)+`: t("customer.text.${id}")`).join(", ")}} as Record<string, string>)[value] ?? value;\n  const router = useRouter();`);
 }
 if(file.endsWith("AnalyticsClient.tsx")||file.endsWith("OverviewInteractive.tsx")){
  text=text.replace("  const { toast } = useToast();",'  const displayDate = (value: string) => /^\\d{4}-\\d{2}-\\d{2}/.test(value) && !Number.isNaN(Date.parse(value)) ? formatDate(value, { month: "short", day: "numeric", timeZone: "UTC" }) : value;\n  const { toast } = useToast();');
 }
 // Localize existing formatting without changing timestamps or numeric payloads.
 const ast=ts.createSourceFile(file,text,99,true,4),edits=[];
 function visit(n){
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)){
   const method=n.expression.name.text,receiver=n.expression.expression.getText(ast),args=n.arguments.map(a=>a.getText(ast));
   let value;
   if(method==="toLocaleDateString" && !args.length) value=`formatDate(${receiver}, { dateStyle: "medium" })`;
   if(method==="toLocaleString" && !args.length) value=/^new Date\(/.test(receiver)?`formatDate(${receiver})`:`formatNumber(${receiver})`;
   if(method==="toLocaleString" && args[0]==='"default"') value=`formatDate(${receiver}, ${args[1]})`;
   if(method==="toFixed"&&args[0]==="2") value=`formatNumber(${receiver}, { minimumFractionDigits: 2, maximumFractionDigits: 2 })`;
   if(value){ edits.push({start:n.getStart(ast),end:n.end,value});return; }
  }
  ts.forEachChild(n,visit);
 }
 visit(ast);
 text=edits.sort((a,b)=>b.start-a.start).reduce((s,e)=>s.slice(0,e.start)+e.value+s.slice(e.end),text);
 fs.writeFileSync(file,text);
}
fs.writeFileSync(fragmentPath,JSON.stringify(dictionary,null,2)+"\n");
console.log("Dictionary keys:",Object.keys(dictionary.en).length);

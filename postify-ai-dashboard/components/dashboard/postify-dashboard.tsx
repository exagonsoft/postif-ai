"use client";

import { useSearchParams } from "next/navigation";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { DashboardHeader } from "./dashboard-header";
import { platformFromApi } from "./platforms";
import { PostComposer } from "./post-composer";
import { PostList } from "./post-list";
import { SocialAccounts } from "./social-accounts";
import { ApiAccount, ApiPost, ApiProfile, DashboardPost, MediaAttachment, Platform, PostStatus } from "./types";
import { WorkspaceSidebar } from "./workspace-sidebar";

const initialPosts: DashboardPost[] = [
  { id: 1, title: "Behind the scenes: August collection", platforms: ["Instagram", "LinkedIn"], scheduledFor: "Today, 14:30", status: "Scheduled" },
  { id: 2, title: "Summer material notes", platforms: ["Instagram", "Facebook"], scheduledFor: "Aug 28, 2026", status: "Published", metrics: { likes: 842, reach: 12400 } },
  { id: 3, title: "September editorial plan", platforms: ["LinkedIn"], scheduledFor: "Not scheduled", status: "Draft" },
];

const statusFromApi: Record<string, PostStatus> = { draft: "Draft", scheduled: "Scheduled", published: "Published", partially_failed: "Failed", failed: "Failed", stopped: "Draft", canceled: "Draft" };

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const payload = await response.json() as { data?: T; error?: string };
  if (!response.ok || !payload.data) throw new Error(payload.error ?? "The request could not be completed.");
  return payload.data;
}

function postFromApi(post: ApiPost): DashboardPost {
  const platforms = post.destinations.map((destination) => platformFromApi(destination.platform)).filter((platform): platform is Platform => Boolean(platform));
  const likes = post.destinations.reduce((sum, destination) => sum + (destination.metrics?.likes ?? 0), 0);
  const reach = post.destinations.reduce((sum, destination) => sum + (destination.metrics?.reach ?? 0), 0);
  return { id: post._id, title: post.title ?? post.contentText.slice(0, 42), platforms, scheduledFor: post.scheduledFor ? new Date(post.scheduledFor).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not scheduled", status: statusFromApi[post.status] ?? "Draft", metrics: post.status === "published" ? { likes, reach } : undefined };
}

export function PostifyDashboard() {
  const searchParams = useSearchParams();
  const active = searchParams.get("view") ?? "Overview";
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(["Instagram", "LinkedIn"]);
  const [content, setContent] = useState("We are shaping a slower, more tactile kind of summer. A first look at the pieces arriving next week.");
  const [scheduledFor, setScheduledFor] = useState("2026-08-29T14:30");
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaAttachment[]>([]);
  const [posts, setPosts] = useState(initialPosts);
  const [notice, setNotice] = useState("All changes are saved locally in this preview.");
  const [synced, setSynced] = useState("Today, 09:42");
  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [accountIds, setAccountIds] = useState<Partial<Record<Platform, string>>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const profiles = await apiRequest<ApiProfile[]>("/api/profiles");
        const activeProfile = profiles[0];
        if (!activeProfile) {
          setNotice("Demo mode: create a profile and authorize social accounts to save to MongoDB.");
          return;
        }
        const [accounts, storedPosts] = await Promise.all([apiRequest<ApiAccount[]>(`/api/accounts?profileId=${activeProfile._id}`), apiRequest<ApiPost[]>(`/api/posts?profileId=${activeProfile._id}`)]);
        setProfile(activeProfile);
        setAccountIds(Object.fromEntries(accounts.map((account) => [platformFromApi(account.platform), account._id]).filter(([platform]) => Boolean(platform))) as Partial<Record<Platform, string>>);
        setPosts(storedPosts.map(postFromApi));
        setNotice(`Connected to ${activeProfile.name}. Posts are loaded from MongoDB.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown connection error.";
        setNotice(message === "MONGODB_URI is not configured." ? "Demo mode: MongoDB is not configured." : `Demo mode: ${message}`);
      }
    };
    void loadWorkspace();
  }, []);

  const savePost = async (status: PostStatus) => {
    if (!content.trim()) return setNotice("Add post content before saving.");
    if (!selectedPlatforms.length) return setNotice("Select at least one social destination.");
    const localPost: DashboardPost = { id: Date.now(), title: content.slice(0, 42) + (content.length > 42 ? "..." : ""), platforms: selectedPlatforms, scheduledFor: status === "Scheduled" ? new Date(scheduledFor).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Just now", status, metrics: status === "Published" ? { likes: 0, reach: 0 } : undefined };
    if (!profile || !selectedPlatforms.every((platform) => accountIds[platform])) {
      setPosts((current) => [localPost, ...current]);
      setNotice("Saved in demo mode. Configure a profile and destination accounts to persist this post.");
      return;
    }
    try {
      const post = await apiRequest<ApiPost>("/api/posts", { method: "POST", body: JSON.stringify({ profileId: profile._id, title: localPost.title, contentHtml: editorRef.current?.innerHTML ?? content, contentText: content, media, destinations: selectedPlatforms.map((platform) => ({ accountId: accountIds[platform], platform: platform.toLowerCase(), content })), scheduledFor: status === "Scheduled" ? new Date(scheduledFor).toISOString() : undefined, timezone: "America/Santo_Domingo", status: status.toLowerCase() }) });
      setPosts((current) => [postFromApi(post), ...current]);
      setNotice(`${status === "Published" ? "Sent" : status} post saved to MongoDB.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "The post could not be saved."); }
  };

  const uploadMedia = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAttachmentName(file.name);
    if (!profile) return setNotice(`Prepared ${file.name} in demo mode. Configure a profile to store media.`);
    try {
      const formData = new FormData();
      formData.append("profileId", profile._id);
      formData.append("file", file);
      const response = await fetch("/api/media", { method: "POST", body: formData });
      const payload = await response.json() as { data?: MediaAttachment; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Media upload failed.");
      setMedia((current) => [...current, payload.data!]);
      setNotice(`${file.name} saved in the profile media folder.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Media upload failed."); }
  };

  const pausePost = (postId: DashboardPost["id"]) => {
    setPosts((current) => current.map((post) => post.id === postId ? { ...post, status: "Draft", scheduledFor: "Schedule paused" } : post));
    setNotice("Scheduled post moved back to draft.");
  };

  const syncMetrics = () => {
    setSynced("Just now");
    setPosts((current) => current.map((post) => post.metrics ? { ...post, metrics: { likes: post.metrics.likes + 12, reach: post.metrics.reach + 146 } } : post));
    setNotice("Metrics refreshed from simulated provider results.");
  };

  return <main className="dashboard-shell min-h-screen"><div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]">
    <WorkspaceSidebar profileName={profile?.name} activeView={active} onCreatePost={() => document.getElementById("composer")?.scrollIntoView({ behavior: "smooth" })} />
    <section className="min-w-0 px-5 py-7 sm:px-8 lg:px-10"><DashboardHeader active={active} notice={notice} onSync={syncMetrics} /><section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Publishing summary">{[["Scheduled", posts.filter((post) => post.status === "Scheduled").length, "Next: Today, 14:30", "#315fa9"], ["Published", posts.filter((post) => post.status === "Published").length, "Across 4 channels", "#267649"], ["In drafts", posts.filter((post) => post.status === "Draft").length, "Ready to refine", "#736b5d"], ["Engagement", "5.8%", "+0.8% this month", "#be563b"]].map(([label, value, detail, color]) => <article key={label} className="min-h-30 border border-[#dfdcd5] bg-[#fbfaf7] p-4" style={{ borderTop: `3px solid ${color}` }}><p className="text-xs font-semibold text-[#716e66]">{label}</p><p className="mt-2 font-serif text-3xl font-semibold">{value}</p><p className="mt-1 text-xs font-medium" style={{ color: color as string }}>{detail}</p></article>)}</section>
      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]"><PostList posts={posts} onPause={pausePost} /><PostComposer content={content} selectedPlatforms={selectedPlatforms} scheduledFor={scheduledFor} attachmentName={attachmentName} editorRef={editorRef} inputRef={inputRef} onContentChange={setContent} onTogglePlatform={(platform) => setSelectedPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform])} onScheduleChange={setScheduledFor} onUpload={uploadMedia} onGenerateImage={() => { setAttachmentName("ai-concept-image.png"); setNotice("Generated a simulated visual concept for this draft."); }} onGenerateText={() => { const text = "A study in texture, sunlight, and small rituals. Our August edit is almost here.\n\nWhat are you making room for this season?"; setContent(text); if (editorRef.current) editorRef.current.innerText = text; setNotice("Generated a simulated copy variation. Review it before publishing."); }} onRemoveAttachment={() => { setAttachmentName(null); setMedia([]); }} onSave={savePost} /></div>
      <SocialAccounts profileName={profile?.name} /><p className="mt-7 text-xs text-[#888277]">Last metric sync: {synced} · {profile ? "MongoDB-enabled workspace" : "Demo workspace"}</p>
    </section></div></main>;
}

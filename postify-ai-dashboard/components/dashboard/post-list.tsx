import { FileImage, MoreHorizontal } from "lucide-react";
import { PlatformMark, StatusBadge } from "./platforms";
import { DashboardPost } from "./types";

export function PostList({ posts, onPause }: { posts: DashboardPost[]; onPause: (postId: DashboardPost["id"]) => void }) {
  return <section aria-labelledby="recent-posts">
    <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8c877b]">Publishing queue</p><h2 id="recent-posts" className="mt-1 font-serif text-2xl font-semibold">Recent posts</h2></div><button className="text-sm font-bold text-[#bd502f]">View all posts</button></div>
    <div className="mt-4 divide-y divide-[#e2dfd8] border-y border-[#e2dfd8]">
      {posts.slice(0, 4).map((post) => <article key={post.id} className="py-4"><div className="flex gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center bg-[#e7dfd1] text-[#a96343]"><FileImage size={20} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold">{post.title}</h3><StatusBadge status={post.status} /></div><p className="mt-1 text-xs text-[#777269]">{post.scheduledFor}</p><div className="mt-3 flex items-center justify-between"><div className="flex -space-x-1">{post.platforms.map((platform) => <PlatformMark key={platform} platform={platform} />)}</div>{post.metrics ? <span className="text-xs text-[#68645b]">{post.metrics.likes} likes · {post.metrics.reach.toLocaleString()} reach</span> : post.status === "Scheduled" ? <button onClick={() => onPause(post.id)} className="text-xs font-bold text-[#b34b37]">Pause schedule</button> : <button className="text-xs font-bold text-[#4f6e68]">Edit draft</button>}</div></div><button className="h-8 w-8 rounded-md text-[#777269]" aria-label={`More actions for ${post.title}`}><MoreHorizontal size={18} /></button></div></article>)}
    </div>
  </section>;
}

type Brand = {
  name: string; industry: string; description: string; productsServices: string;
  targetAudience: string; brandVoice: string; tone: string; colorPrimary: string;
  colorAccent: string; marketingGoals: string[]; contentPillars: string[];
};
export function buildBrandMediaBrief(input: {
  kind: "image" | "video" | "gif"; topic: string; title: string; text: string;
  platforms: string[]; workspaceName: string; brand: Brand;
}) {
  const { brand, kind, platforms } = input;
  const portrait = platforms.some(platform => ["instagram", "tiktok", "pinterest"].includes(platform));
  const aspectRatio = portrait ? "9:16" : kind === "image" && !platforms.includes("youtube") ? "1:1" : "16:9";
  const short = (text: string, max: number) => text.trim().slice(0, max);
  // Provider brief is built exclusively from persisted brand/workspace context and post content.
  const prompt = [
    `Create ${kind === "gif" ? "a seamless looping animation for a GIF" : `a social ${kind}`} about ${short(input.topic || input.title, 120)}.`,
    `Brand: ${short(brand.name, 70)}. Workspace: ${short(input.workspaceName, 60)}. Industry: ${short(brand.industry, 60)}.`,
    `Brand identity: ${short(brand.description, 110)}. Products/services: ${short(brand.productsServices, 100)}.`,
    `Audience: ${short(brand.targetAudience, 100)}. Voice: ${short(brand.brandVoice, 80)}. Tone: ${short(brand.tone, 50)}.`,
    `Use brand colors ${brand.colorPrimary} and ${brand.colorAccent}. Channels: ${platforms.join(", ")}. Format: ${aspectRatio}.`,
    `Goals: ${short(brand.marketingGoals.join(", "), 70)}. Themes: ${short(brand.contentPillars.join(", "), 70)}.`,
    `Post context: ${short(input.text, 200)}.`,
    "Use a clear visual concept aligned with the topic. Avoid invented logos, claims, and tiny text.",
  ].join("\n");
  return { kind, aspectRatio, prompt: prompt.slice(0, 1000) };
}

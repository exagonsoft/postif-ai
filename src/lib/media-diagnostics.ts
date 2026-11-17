export function mediaDiagnostic(stage: string, data: Record<string, string | boolean | number | null>) {
  if (process.env.NODE_ENV === "development") console.info("[Media diagnostic]", { stage, ...data });
}

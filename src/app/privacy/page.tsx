import React from "react";
import { PublicShell } from "@/components/PublicShell";

export const metadata = {
  title: "Privacy Policy — POSTIF-AI by ExagonSoft",
};

export default function PrivacyPage() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl space-y-6 px-4 py-20 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Privacy Policy</h1>
        <p className="text-xs text-[var(--text-muted)]">
          Effective Date: April 2026 • Operated by ExagonSoft
        </p>

        <div className="surface-card space-y-4 rounded-3xl p-8 text-sm leading-relaxed text-[var(--text-secondary)]">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">1. Data Isolation & Ownership</h2>
          <p>
            ExagonSoft operates POSTIF-AI on a strict multi-tenant architecture. All brand profiles,
            drafts, scheduled posts, analytics snapshots, and team rosters are isolated per
            workspace. You retain 100% ownership of all content generated or uploaded within your
            workspace.
          </p>

          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            2. Encryption of Bring Your Own Key (BYOK) Credentials
          </h2>
          <p>
            Customer-provided OpenAI API keys are encrypted server-side using AES-256-GCM before
            storage in MongoDB. Keys are never transmitted back to client browsers, never
            included in application logs, and can be permanently revoked at any time from Billing &
            AI Settings.
          </p>

          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            3. Social Network OAuth Tokens & Permissions
          </h2>
          <p>
            POSTIF-AI requests only the minimum OAuth 2.0 scopes required to publish authorized
            content and retrieve engagement analytics. Disconnecting a channel revokes local access
            immediately.
          </p>

          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            4. Data Export & Account Deletion
          </h2>
          <p>
            Workspace Owners may export all workspace records in structured JSON format or request
            full tenant deletion at any time from Workspace Settings.
          </p>
        </div>
      </article>
    </PublicShell>
  );
}

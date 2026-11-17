export const LEGAL_DOCUMENTS = {
  privacy: {
    path: "/privacy",
    sections: [
      "operator", "data", "accounts", "workspaces", "social", "credentials",
      "content", "analytics", "ai", "ai-modes", "ai-providers", "billing",
      "notifications", "cookies", "providers", "retention", "deletion",
      "security", "transfers", "rights", "children", "changes",
    ],
  },
  terms: {
    path: "/terms",
    sections: [
      "operator", "eligibility", "accounts", "plans", "billing", "cancellation",
      "refunds", "ai-modes", "credits", "ai-content", "ownership", "acceptable-use",
      "social", "automation", "publishing", "suspension", "export-deletion",
      "intellectual-property", "availability", "liability", "changes-law",
    ],
  },
  dataDeletion: {
    path: "/data-deletion",
    sections: [
      "purpose", "disconnect", "revoke", "request", "meta", "account-workspace",
      "categories", "retention", "process", "external",
    ],
  },
} as const;

export type LegalDocumentKind = keyof typeof LEGAL_DOCUMENTS;

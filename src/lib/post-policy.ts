export class WorkflowError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function canApprove(role: string) {
  return ["owner", "admin", "approver"].includes(role);
}

// All entry points use this policy; clients cannot assign a delivery result.
export function resolvePostState(input: {
  requested: string; previous?: string; requiresApproval: boolean;
  approved: boolean; contentChanged: boolean; role: string;
  scheduledAt: Date | null; now: Date;
}) {
  const { requested, previous, requiresApproval, contentChanged, role, now } = input;
  if (!["draft", "pending_approval", "approved", "scheduled", "published", "cancelled"].includes(requested)) {
    throw new WorkflowError("Unsupported post status.");
  }
  if (previous === "published" || previous === "publishing") {
    throw new WorkflowError("Published or currently publishing posts cannot be changed. Duplicate the post instead.", 409);
  }
  let approved = input.approved && !contentChanged;
  let scheduledAt = input.scheduledAt;
  if (scheduledAt && !Number.isFinite(scheduledAt.getTime())) throw new WorkflowError("Invalid schedule date.");
  if (requested === "approved") {
    if (!canApprove(role)) throw new WorkflowError("An owner, admin, or approver must approve this post.", 403);
    if (previous !== "pending_approval") throw new WorkflowError("Only posts awaiting approval can be approved.", 409);
    if (contentChanged) throw new WorkflowError("Save your changes before approving the revised post.", 409);
    approved = true;
    if (scheduledAt && scheduledAt <= now) throw new WorkflowError("The scheduled time has passed. Choose a new time before approving.");
    return { status: scheduledAt ? "scheduled" : "approved", approved, scheduledAt };
  }
  if (requested === "cancelled") return { status: "cancelled", approved: false, scheduledAt };
  if (requested === "draft") return { status: "draft", approved: false, scheduledAt };
  if (requested === "pending_approval") return { status: "pending_approval", approved: false, scheduledAt };
  if (requested === "published") scheduledAt = now;
  if (!scheduledAt) throw new WorkflowError("Choose a date and time before scheduling.");
  if (requested === "scheduled" && scheduledAt <= now) throw new WorkflowError("Choose a future publishing time.");
  if ((requiresApproval && !approved) || (role === "editor" && !approved)) {
    return { status: "pending_approval", approved: false, scheduledAt: requested === "published" ? null : scheduledAt };
  }
  return { status: "scheduled", approved, scheduledAt };
}

export function isPublishable(post: { status: string; requiresApproval: boolean; approvedAt: Date | null }) {
  return ["scheduled", "publishing"].includes(post.status) && (!post.requiresApproval || !!post.approvedAt);
}

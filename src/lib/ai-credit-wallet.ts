import { db } from "@/db";
import { billingCreditLots } from "@/db/billing-schema";
import { workspaces, type WorkspacesDocument } from "@/db/schema";
import { increment } from "@/db/filters";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface CreditAllocation { lotId: number; credits: number }

export async function permanentCredits(tx: Transaction, workspaceId: number) {
  const lots = (await tx.find(billingCreditLots, { workspaceId, revokedAt: null }, { sort: { id: 1 } })).filter(lot => !lot.held);
  let total = 0;
  for (const lot of lots) {
    if (!Number.isSafeInteger(lot.remaining) || lot.remaining < 0 || !Number.isSafeInteger(total + lot.remaining)) throw new Error("Permanent AI credits require reconciliation.");
    total += lot.remaining;
  }
  return { lots, total };
}

export async function reserveCredits(tx: Transaction, workspace: WorkspacesDocument, credits: number): Promise<CreditAllocation[]> {
  const { lots, total } = await permanentCredits(tx, workspace.id);
  if (!Number.isSafeInteger(credits) || credits < 0 || !Number.isSafeInteger(workspace.aiCreditsBalance) || total > workspace.aiCreditsBalance || credits > workspace.aiCreditsBalance) {
    throw new Error("AI credit balance requires reconciliation.");
  }
  let remaining = Math.max(0, credits - (workspace.aiCreditsBalance - total));
  const allocations: CreditAllocation[] = [];
  for (const lot of lots) {
    const used = Math.min(lot.remaining, remaining);
    if (!used) continue;
    await tx.update(billingCreditLots, { id: lot.id, workspaceId: workspace.id, revokedAt: null }, { remaining: increment(-used) });
    allocations.push({ lotId: lot.id, credits: used });
    remaining -= used;
    if (!remaining) break;
  }
  if (remaining) throw new Error("Permanent AI credit allocation requires reconciliation.");
  if (credits) await tx.update(workspaces, { id: workspace.id }, { aiCreditsBalance: increment(-credits) });
  return allocations;
}

export async function restoreCredits(tx: Transaction, workspace: WorkspacesDocument, credits: number, allocations: CreditAllocation[] | undefined, originalEpoch: string, currentEpoch: string) {
  const entries = allocations || [];
  if (!Number.isSafeInteger(credits) || credits < 0 || entries.some(entry => !Number.isSafeInteger(entry.lotId) || !Number.isSafeInteger(entry.credits) || entry.credits <= 0)) throw new Error("AI credit refund requires reconciliation.");
  if (new Set(entries.map(entry => entry.lotId)).size !== entries.length) throw new Error("AI credit refund requires reconciliation.");
  const permanent = entries.reduce((sum, entry) => sum + entry.credits, 0);
  if (!Number.isSafeInteger(permanent) || permanent > credits) throw new Error("AI credit refund requires reconciliation.");
  let restored = 0;
  let held = 0;
  for (const entry of entries) {
    const [lot] = await tx.find(billingCreditLots, { id: entry.lotId, workspaceId: workspace.id });
    if (!lot) throw new Error("AI credit refund requires reconciliation.");
    if (lot.revokedAt) continue;
    if (!Number.isSafeInteger(lot.remaining + entry.credits)) throw new Error("AI credit balance overflow.");
    await tx.update(billingCreditLots, { id: lot.id }, { remaining: increment(entry.credits) });
    restored += entry.credits;
  }
  const temporary = credits - permanent;
  if (originalEpoch === currentEpoch) restored += temporary;
  else if (temporary) {
    const [carried] = await tx.find(billingCreditLots, { workspaceId: workspace.id, carriedEpoch: originalEpoch, revokedAt: null });
    if (carried) {
      if (!Number.isSafeInteger(carried.remaining + temporary)) throw new Error("AI credit balance overflow.");
      await tx.update(billingCreditLots, { id: carried.id }, { remaining: increment(temporary) });
      restored += temporary;
      if (carried.held) held += temporary;
    }
  }
  if (!Number.isSafeInteger(workspace.aiCreditsBalance + restored - held)) throw new Error("AI credit balance overflow.");
  if (restored > held) await tx.update(workspaces, { id: workspace.id }, { aiCreditsBalance: increment(restored - held) });
  return restored;
}

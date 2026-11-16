import type { Document } from "mongodb";
export const eq = (field: string, value: unknown): Document => ({
  [field]: value,
});
export const gt = (field: string, value: unknown): Document => ({
  [field]: { $gt: value },
});
export const gte = (field: string, value: unknown): Document => ({
  [field]: { $gte: value },
});
export const lt = (field: string, value: unknown): Document => ({
  [field]: { $lt: value },
});
export const lte = (field: string, value: unknown): Document => ({
  [field]: { $lte: value },
});
export const inArray = (field: string, value: unknown[]): Document => ({
  [field]: { $in: value },
});
export const isNull = (field: string): Document => ({ [field]: null });
export const and = (...filters: (Document | undefined)[]): Document => ({
  $and: filters.filter(Boolean),
});
export const or = (...filters: Document[]): Document => ({ $or: filters });
export const arrayContains = (field: string, values: unknown[]): Document => ({
  [field]: { $all: values },
});
export class Increment {
  constructor(
    public delta: number,
    public floor?: number,
  ) {}
}
export const increment = (delta: number, floor?: number) =>
  new Increment(delta, floor);

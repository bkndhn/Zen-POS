import { describe, it, expect } from "vitest";
import { mergeBills } from "@/utils/archivedBills";
describe("mergeBills", () => {
  it("does not double count a bill present in both live and archive", () => {
    const r = mergeBills([{ id: "a", total_amount: 100, date: "2026-09-01" }], [{ id: "a", total_amount: 100, date: "2026-09-01" }, { id: "b", total_amount: 50, date: "2026-08-01" }]);
    expect(r.reduce((s, b) => s + b.total_amount, 0)).toBe(150);
  });
});

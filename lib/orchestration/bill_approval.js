import { approveBill as approve, rejectBill as reject } from "@/lib/accounting/bills_server";

// Review-queue bill decisions use the one bill path in lib/accounting/bills_server.js (key `bill:<id>`).
export const approveBill = (admin, args) => approve(admin, { ...args, via: "the Review Queue" });
export const rejectBill = (admin, args) => reject(admin, { ...args, via: "the Review Queue" });

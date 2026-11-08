// One-off CORE-09 backfill: post approved, open bills with no ledger entry to AP (key bill:<id>; re-runs post nothing).
// node --env-file=.env --import ./supabase/seeds/demo_project/generate/loader.mjs supabase/seeds/backfill_bill_ap.mjs [--project <id>] [--apply]
import { adminClient } from "@/lib/supabase/admin";
import { postRefusal } from "@/lib/accounting/bills";
import { billApprovalLimit, postBillToAp } from "@/lib/accounting/bills_server";

const args = process.argv.slice(2);
const project = args.includes("--project") ? args[args.indexOf("--project") + 1] : null;
const apply = args.includes("--apply");
const admin = adminClient({ source: "seed:bill_ap_backfill" });
if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY isn't set.");

let q = admin
  .from("bills")
  .select("*")
  .is("deleted_at", null)
  .is("ledger_entry_id", null)
  .in("status", ["Open", "Partially paid"])
  .in("approval_status", ["Not required", "Approved"])
  .gt("amount", 0);
if (project) q = q.eq("project_id", project);
const { data: bills, error } = await q;
if (error) throw new Error(error.message);

console.log(`${bills.length} approved, open bill(s) not in AP${apply ? "" : " (dry run; pass --apply to post)"}`);
let posted = 0;
for (const bill of bills) {
  if (!apply) {
    console.log(`  would post ${bill.id} ${bill.name} ${bill.amount}`);
    continue;
  }
  try {
    const refusal = postRefusal(bill, await billApprovalLimit(admin, bill.project_id));
    if (refusal) {
      console.log(`  skipped ${bill.id} ${bill.name}: ${refusal}`);
      continue;
    }
    const res = await postBillToAp(admin, bill, null);
    if (res.posted) posted += 1;
    console.log(`  ${res.posted ? "posted" : "skipped"} ${bill.id} ${bill.name}`);
  } catch (e) {
    console.log(`  failed ${bill.id} ${bill.name}: ${e.message}`);
  }
}
if (apply) console.log(`Posted ${posted} bill(s).`);

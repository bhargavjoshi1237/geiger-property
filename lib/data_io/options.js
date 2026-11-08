import { isIsoDate, nextMonthStart } from "@/lib/ledger/conversion";
import { isUuid } from "@/lib/files/refs";
import { isBalanceEntity } from "./import_spec";
import { DEDUPE } from "./validate";

// A job's options, normalized (PLAT-03): duplicates skip | update, create missing parents, a lease import's billing start
// (default the 1st of next month), a balance import's cutover, mode, target batch and whether to post when it ties out.
export function normalizeOptions(entity, o = {}, today = new Date().toISOString().slice(0, 10)) {
  const out = { dedupe: DEDUPE.includes(o.dedupe) ? o.dedupe : "skip", createMissing: Boolean(o.createMissing) };
  if (entity === "leases") out.billingStartsOn = isIsoDate(o.billingStartsOn) ? o.billingStartsOn : nextMonthStart(today);
  if (isBalanceEntity(entity)) {
    out.cutoverDate = isIsoDate(o.cutoverDate) ? o.cutoverDate : "";
    out.balanceMode = o.balanceMode === "itemized" ? "itemized" : "forward";
    out.batchId = isUuid(o.batchId) ? o.batchId : "";
    out.post = o.post !== false;
  }
  return out;
}

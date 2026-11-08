import { buildGenericCsv } from "./generic_csv";
import { buildIif } from "./iif";
import { buildQboCsv } from "./qbo_csv";
import { buildXeroCsv } from "./xero_csv";

// Export formats: label, file type, the account text each tool expects by default, and the builder.
const nameAndNumber = (a) => [a.number, a.name].filter(Boolean).join(" ");

export const FORMATS = {
  qbo_csv: { value: "qbo_csv", label: "QuickBooks Online (CSV)", ext: "csv", mime: "text/csv;charset=utf-8", dateFormat: "mdy", accountHint: "Account name, as in the QuickBooks chart", defaultName: nameAndNumber, build: buildQboCsv },
  xero_csv: { value: "xero_csv", label: "Xero manual journals (CSV)", ext: "csv", mime: "text/csv;charset=utf-8", dateFormat: "dmy", accountHint: "Account code, as in the Xero chart", defaultName: (a) => a.number || a.name, build: buildXeroCsv },
  iif: { value: "iif", label: "QuickBooks Desktop (IIF)", ext: "iif", mime: "text/plain;charset=utf-8", dateFormat: "mdy", accountHint: "Account name, as in the QuickBooks chart", defaultName: nameAndNumber, build: buildIif },
  csv: { value: "csv", label: "Generic journal (CSV)", ext: "csv", mime: "text/csv;charset=utf-8", dateFormat: "ymd", accountHint: "Account name or code", defaultName: nameAndNumber, build: buildGenericCsv },
};

export const FORMAT_LIST = Object.values(FORMATS);

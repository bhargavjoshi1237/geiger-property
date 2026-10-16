import { makeEntityData } from "./entity_factory";

// Data-access layer for Notices & Violations — notices served to tenants (owns `property.notices`).
export const noticesLayer = makeEntityData({
  table: "notices",
  tag: "notices",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "noticeType", col: "notice_type", type: "text" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "tenantName", col: "tenant_name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "servedDate", col: "served_date", type: "date" },
    { key: "cureBy", col: "cure_by", type: "date" },
    { key: "deliveryMethod", col: "delivery_method", type: "text" },
    { key: "status", col: "status", type: "text", default: "Draft" },
  ],
});

export const noticesData = noticesLayer.data;

"use client";

import { makeEntityData } from "./entity_factory";

// Data-access layer for daily briefings (owns reads of `property.briefings`; rows are written once per
// member per day by the briefings job, lib/signals/briefing.js).
export const briefingsLayer = makeEntityData({
  table: "briefings",
  tag: "briefings",
  order: { col: "date", ascending: false },
  fields: [
    { key: "memberId", col: "member_id", type: "uuid" },
    { key: "userId", col: "user_id", type: "uuid" },
    { key: "email", col: "email", type: "text" },
    { key: "roleKey", col: "role_key", type: "text" },
    { key: "date", col: "date", type: "date" },
    { key: "summary", col: "summary", type: "text" },
    { key: "sentAt", col: "sent_at", type: "date" },
    { key: "emailStatus", col: "email_status", type: "text" },
  ],
});

// A member's recent briefings, newest first.
export const listMemberBriefings = (memberId) => (memberId ? briefingsLayer.list({ memberId }) : Promise.resolve([]));

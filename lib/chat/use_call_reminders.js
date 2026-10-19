"use client";

import { useEffect } from "react";
import { ME } from "./people_store";
import { notify } from "./browser_notifications";
import { claimReminder, listDueReminders } from "@/lib/supabase/chat_calls";
import { notifyPeople } from "@/lib/supabase/chat_notifications";

// While Communications is open, checks every minute for my scheduled calls
// starting within 15 minutes and drops one reminder per call into my Inbox (and
// on the desktop). The claim RPC makes sure two open tabs never both remind.

const POLL_MS = 60 * 1000;

export function useCallReminders(projectId, meId) {
  useEffect(() => {
    if (!projectId || !meId) return undefined;
    let cancelled = false;

    const tick = async () => {
      const due = await listDueReminders(projectId, meId);
      for (const call of due) {
        if (cancelled || !(await claimReminder(call.id, meId))) continue;
        const mins = Math.max(0, Math.round((new Date(call.scheduledAt).getTime() - Date.now()) / 60000));
        const title = `Upcoming call: ${call.title}`;
        const body = mins <= 1 ? "Starting now." : `Starts in ${mins} minutes.`;
        await notifyPeople([meId], {
          projectId,
          type: "call_reminder",
          title,
          body,
          conversationId: call.conversationId,
          meta: { scheduledCallId: call.id, scheduledAt: call.scheduledAt, kind: call.kind },
        });
        if (!ME.doNotDisturb) notify({ title, body, tag: `property-chat-reminder-${call.id}` });
      }
    };

    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId, meId]);
}

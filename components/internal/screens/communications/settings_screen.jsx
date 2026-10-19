"use client";

import React, { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Bell, Hash, Loader2, MessageSquare, MinusCircle, Monitor, AtSign } from "lucide-react";
import { Button, Input, Switch } from "@geiger/ui";
import { Field, ScreenHeader, SectionCard, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import { useChat } from "@/lib/chat/chat_context";
import {
  getServerSnapshot,
  getSnapshot,
  requestPermission,
  setEnabled,
  subscribe,
} from "@/lib/chat/browser_notifications";
import { setPresence, updateProfile, updateProfilePrefs } from "@/lib/supabase/chat_profiles";
import { ChatPage } from "./parts/chat_page";
import { UserAvatar } from "./parts/user_avatar";

function ProfileCard() {
  const { me, updateMe } = useChat();
  const [name, setName] = useState(me.name);
  const [role, setRole] = useState(me.role);
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== me.name || role.trim() !== me.role;

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const saved = await updateProfile(me.id, { name, role });
    setSaving(false);
    if (!saved) {
      toast.error("Couldn't save your profile.");
      return;
    }
    updateMe({ name: saved.name, firstName: saved.firstName, role: saved.role });
    toast.success("Profile saved");
  };

  return (
    <SectionCard title="Profile" description="How you appear to teammates in chat and calls.">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <UserAvatar person={{ ...me, name: name || me.name }} size="xl" />
        <div className="grid flex-1 gap-4">
          <Field label="Display name" htmlFor="chat-display-name">
            <Input id="chat-display-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Role" htmlFor="chat-role" hint="e.g. Property manager, Leasing agent, Maintenance lead">
            <Input id="chat-role" value={role} onChange={(e) => setRole(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty || !name.trim() || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save profile
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function NotificationsCard() {
  const { me, updateMe } = useChat();
  const desktop = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const desktopOn = desktop.enabled && desktop.permission === "granted";

  const toggleDesktop = async (want) => {
    if (!want) {
      setEnabled(false);
      return;
    }
    const result = await requestPermission();
    if (result !== "granted") {
      toast.error(result === "denied" ? "Your browser is blocking notifications for this site." : "Notifications weren't enabled.");
      return;
    }
    setEnabled(true);
    toast.success("Desktop notifications on");
  };

  const setPref = async (key, value) => {
    const notify = { ...me.notify, [key]: value };
    updateMe({ notify });
    if (!(await updateProfilePrefs(me.id, { notify }))) {
      updateMe({ notify: me.notify });
      toast.error("Couldn't save the preference.");
    }
  };

  const desktopHint = !desktop.supported
    ? "This browser doesn't support desktop notifications."
    : desktop.permission === "denied"
      ? "Blocked by the browser — allow notifications in site settings."
      : "Alert me on this device when something arrives while I'm elsewhere.";

  return (
    <SectionCard title="Notifications" description="Muted conversations never notify. Your Inbox always records mentions, invites and missed calls.">
      <SettingsList>
        <SettingRow
          icon={Monitor}
          title="Desktop notifications"
          description={desktopHint}
          control={<Switch checked={desktopOn} disabled={!desktop.supported || desktop.permission === "denied"} onCheckedChange={toggleDesktop} />}
        />
        <SettingRow icon={MessageSquare} title="Direct messages" description="Every new direct message." checked={me.notify.dms} onCheckedChange={(v) => setPref("dms", v)} />
        <SettingRow icon={AtSign} title="Mentions" description="When someone @mentions you in a channel." checked={me.notify.mentions} onCheckedChange={(v) => setPref("mentions", v)} />
        <SettingRow icon={Hash} title="All channel messages" description="Every message in channels you're in." checked={me.notify.channels} onCheckedChange={(v) => setPref("channels", v)} />
      </SettingsList>
    </SectionCard>
  );
}

function StatusCard() {
  const { me, updateMe } = useChat();
  const toggle = async (on) => {
    updateMe({ doNotDisturb: on, presence: on ? "dnd" : "online" });
    const ok = await updateProfilePrefs(me.id, { doNotDisturb: on });
    if (!ok) {
      updateMe({ doNotDisturb: !on, presence: on ? "online" : "dnd" });
      toast.error("Couldn't update your status.");
      return;
    }
    setPresence(me.id, on ? "dnd" : "online");
    toast.success(on ? "Do not disturb is on" : "Do not disturb is off");
  };
  return (
    <SectionCard title="Status">
      <SettingsList>
        <SettingRow
          icon={me.doNotDisturb ? MinusCircle : Bell}
          title="Do not disturb"
          description="Pause desktop notifications and turn away incoming calls. Teammates see you as busy."
          checked={me.doNotDisturb}
          onCheckedChange={toggle}
        />
      </SettingsList>
    </SectionCard>
  );
}

// My chat profile, notification preferences and status.
export function SettingsScreen() {
  return (
    <ChatPage secondary>
      <ScreenHeader title="Chat settings" description="Your profile, notifications and availability for this workspace's chat." />
      <ProfileCard />
      <NotificationsCard />
      <StatusCard />
    </ChatPage>
  );
}

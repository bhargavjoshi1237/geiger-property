"use client";

// Re-export the shared @geiger/ui sidebar so the whole app shares ONE sidebar
// context. This is what lets the shared @geiger/ui Topbar (its mobile
// SidebarTrigger) resolve against the same SidebarProvider the app mounts.
// (The previous local copy was byte-identical to @geiger/ui's sidebar.)
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@geiger/ui";

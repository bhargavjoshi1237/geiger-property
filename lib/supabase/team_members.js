import { makeEntityData } from "./entity_factory";

// Data-access layer for Team & Members — workspace members and their roles (owns `property.team_members`).
export const teamMembersLayer = makeEntityData({
  table: "team_members",
  tag: "teamMembers",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "email", col: "email", type: "text" },
    { key: "role", col: "role", type: "text" },
    { key: "status", col: "status", type: "text", default: "Invited" },
  ],
});

export const teamMembersData = teamMembersLayer.data;

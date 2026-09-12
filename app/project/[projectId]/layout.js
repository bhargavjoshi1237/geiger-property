// Server entry for the project workspace. Holds nothing but the segment config:
// the workspace chrome is a client component, and route segment config cannot be
// exported from one.
//
// force-static: nothing in this subtree reads the request, so Next prerenders the
// workspace shell and the CDN serves it on every project URL. The project, the
// session and every screen's data resolve client-side, after the shell has painted.

export const dynamic = "force-static";

export default function ProjectSegmentLayout({ children }) {
  return children;
}

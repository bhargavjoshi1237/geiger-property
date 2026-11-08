// Keeps the nav entries (and sub-entries) a viewer may open; a section left with no sub-items is dropped.
export function filterNavByAccess(nav, canOpen) {
  return (nav || [])
    .filter((item) => canOpen(item.title, true))
    .map((item) => (item.subItems ? { ...item, subItems: item.subItems.filter((sub) => canOpen(sub.title, false)) } : item))
    .filter((item) => !item.subItems || item.subItems.length);
}

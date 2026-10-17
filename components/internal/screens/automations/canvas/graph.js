// Workflow ↔ canvas graph. The canonical workflow stays metadata.conditionRules + metadata.steps (what the runner
// executes); the canvas adds node positions (metadata.canvas.positions) and reads order from the connector chain.

export const NODE_W = 300;
const ROW_H = 150;
export const TRIGGER_ID = "trigger";

export const CANVAS_FIT_VIEW = { padding: 0.35, maxZoom: 0.85 };
export const SNAP_SIZES = [8, 16, 24];

const chainEdge = (source, target) => ({ id: `e-${source}-${target}`, source, target, type: "smoothstep" });

// Rules and steps get stable ids so their node positions survive a reload.
const withId = (obj, fallback) => ({ ...obj, id: obj.id || fallback });

export function workflowToGraph(wf, canvas) {
  const positions = canvas?.positions || {};
  const items = [
    { id: TRIGGER_ID, type: "trigger", data: { kind: "trigger" }, deletable: false },
    ...wf.conditionRules.map((rule, i) => {
      const r = withId(rule, `rule-${i + 1}`);
      return { id: r.id, type: "condition", data: { kind: "condition", rule: r } };
    }),
    ...wf.steps.map((step, i) => {
      const s = withId(step, `step-${i + 1}`);
      return { id: s.id, type: "action", data: { kind: "action", step: s } };
    }),
  ];
  const nodes = items.map((n, i) => ({ ...n, position: positions[n.id] || { x: 0, y: i * ROW_H }, width: NODE_W }));
  const edges = items.slice(1).map((n, i) => chainEdge(items[i].id, n.id));
  return { nodes, edges };
}

// Walk the chain from the trigger; anything unconnected follows in node order. Conditions are gates the runner
// checks before any step, so they're collected separately wherever they sit on the chain.
export function graphToWorkflow(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map();
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source).push(e.target);
  }
  const ordered = [];
  const seen = new Set();
  let cursor = byId.get(TRIGGER_ID) || nodes[0];
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    ordered.push(cursor);
    cursor = (outgoing.get(cursor.id) || []).map((id) => byId.get(id)).find((n) => n && !seen.has(n.id));
  }
  for (const n of nodes) if (!seen.has(n.id)) ordered.push(n);

  return {
    conditionRules: ordered.filter((n) => n.data?.kind === "condition").map((n) => n.data.rule),
    steps: ordered.filter((n) => n.data?.kind === "action").map((n) => n.data.step),
    positions: Object.fromEntries(nodes.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }])),
  };
}

// The last node on the chain from the trigger, so a newly added node can be wired on after it.
export function chainTail(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set();
  let cursor = byId.get(TRIGGER_ID);
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    const next = edges.filter((e) => e.source === cursor.id).map((e) => byId.get(e.target)).find((n) => n && !seen.has(n.id));
    if (!next) return cursor;
    cursor = next;
  }
  return cursor || null;
}

export { chainEdge };

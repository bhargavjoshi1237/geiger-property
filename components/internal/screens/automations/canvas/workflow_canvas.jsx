"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  getConnectedEdges,
  getIncomers,
  getOutgoers,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { Check, Filter, GripVertical, Loader2, MousePointerClick, TriangleAlert, Zap } from "lucide-react";

import { CONDITION_FIELDS, STEP_TYPES, stepDefaults } from "@/lib/automations/catalog";
import { STEP_ICONS, describeTrigger, workflowOf } from "../sections";
import { nodeTypes } from "./workflow_nodes";
import { ZoomControls } from "./zoom_controls";
import { CANVAS_FIT_VIEW, NODE_W, SNAP_SIZES, chainEdge, chainTail, graphToWorkflow, workflowToGraph } from "./graph";

// Canvas section of the workflow editor (ported from geiger-events' builder canvas): the trigger, conditions and
// steps as connected cards. Dragging from the palette adds a node after the last one, deleting a node re-joins its
// neighbours, and every change auto-saves into metadata.conditionRules / steps / canvas.positions.

const DND_MIME = "application/geiger-workflow";
// Round dots for a switched-on workflow's edges; the dash pattern sums to 5 so it loops on React Flow's dashdraw.
const LIVE_EDGE_STYLE = { strokeDasharray: "2 3", strokeLinecap: "round", strokeWidth: 1.5 };
const SAVE_DELAY_MS = 600;
const SECTION_FOR_KIND = { trigger: "trigger", condition: "conditions", action: "steps" };

// Draggable palette of conditions (the trigger record's fields) and step types.
function Palette({ recordType }) {
  const fields = CONDITION_FIELDS[recordType] || [];
  const groups = [
    ...(fields.length ? [{ group: "Conditions", kind: "condition", items: fields.map((f) => ({ key: f.key, label: f.label, icon: Filter })) }] : []),
    { group: "Steps", kind: "action", items: STEP_TYPES.map((t) => ({ key: t.key, label: t.label, icon: STEP_ICONS[t.key] || Zap })) },
  ];
  const onDragStart = (kind, key) => (event) => {
    event.dataTransfer.setData(DND_MIME, JSON.stringify({ kind, key }));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <Panel position="top-right">
      <div className="w-52 rounded-xl border border-border bg-surface-card/90 p-2 shadow-xl backdrop-blur-md">
        <div className="max-h-[52vh] space-y-2 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.group}>
              <p className="px-1 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">{group.group}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.key}
                    draggable
                    onDragStart={onDragStart(group.kind, item.key)}
                    className="group flex cursor-grab items-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-text-tertiary transition-colors group-hover:text-text-secondary" />
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

const SAVE_STATES = {
  saved: { icon: Check, label: "All changes saved" },
  saving: { icon: Loader2, label: "Saving…", spin: true },
  error: { icon: TriangleAlert, label: "Couldn't save — try again" },
};

function CanvasInner({ item, onCommitMeta, onNavigate }) {
  const { resolvedTheme } = useTheme();
  const { screenToFlowPosition } = useReactFlow();
  const wf = workflowOf(item);
  const recordType = wf.recordType;
  const active = Boolean(item.enabled);

  // View-only prefs, not saved with the workflow.
  const [snap, setSnap] = useState(false);
  const [snapSize, setSnapSize] = useState(SNAP_SIZES[1]);
  const [locked, setLocked] = useState(false);
  const [saveState, setSaveState] = useState("saved");

  // Seed once per mount; the section remounts when you come back to it, so it always starts from the saved workflow.
  const seeded = useMemo(() => {
    const graph = workflowToGraph(wf, item.metadata?.canvas);
    return {
      edges: graph.edges,
      nodes: graph.nodes.map((n) =>
        n.type === "trigger"
          ? { ...n, data: { ...n.data, triggerEvent: wf.triggerEvent, summary: describeTrigger(wf) } }
          : n.type === "condition"
            ? { ...n, data: { ...n.data, recordType } }
            : n,
      ),
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState(seeded.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(seeded.edges);

  // Auto-save: debounce, and only write when the workflow or a node position actually changed (not on selection).
  const lastSaved = useRef(JSON.stringify(graphToWorkflow(seeded.nodes, seeded.edges)));
  const commitRef = useRef(onCommitMeta);
  useEffect(() => {
    commitRef.current = onCommitMeta;
  }, [onCommitMeta]);
  useEffect(() => {
    const next = graphToWorkflow(nodes, edges);
    const signature = JSON.stringify(next);
    if (signature === lastSaved.current) return undefined;
    const timer = setTimeout(async () => {
      setSaveState("saving");
      const ok = await commitRef.current({
        conditionRules: next.conditionRules,
        steps: next.steps,
        canvas: { positions: next.positions },
      });
      if (ok !== false) lastSaved.current = signature;
      setSaveState(ok === false ? "error" : "saved");
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  // A switched-on workflow shows its path as marching dots; derived at render so it never lands in the saved graph.
  const renderedEdges = useMemo(
    () => (active ? edges.map((e) => ({ ...e, animated: true, style: LIVE_EDGE_STYLE })) : edges),
    [edges, active],
  );

  const onConnect = useCallback((connection) => setEdges((eds) => addEdge({ ...connection, type: "smoothstep" }, eds)), [setEdges]);

  // Deleting a node joins its neighbours so the chain (and the run order) stays intact.
  const onNodesDelete = useCallback(
    (deleted) =>
      setEdges((current) =>
        deleted.reduce((acc, node) => {
          const incomers = getIncomers(node, nodes, acc);
          const outgoers = getOutgoers(node, nodes, acc);
          const connected = new Set(getConnectedEdges([node], acc).map((e) => e.id));
          const rejoined = incomers.flatMap(({ id: source }) => outgoers.map(({ id: target }) => chainEdge(source, target)));
          return [...acc.filter((e) => !connected.has(e.id)), ...rejoined];
        }, current),
      ),
    [nodes, setEdges],
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // A dropped node lands where it was released and is wired on after the current last node.
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      let payload;
      try {
        payload = JSON.parse(event.dataTransfer.getData(DND_MIME) || "null");
      } catch {
        return;
      }
      if (!payload) return;
      const drop = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const position = { x: drop.x - NODE_W / 2, y: drop.y - 30 };
      const id = crypto.randomUUID();
      const node =
        payload.kind === "condition"
          ? { id, type: "condition", position, data: { kind: "condition", recordType, rule: { id, field: payload.key, op: "equals", value: "" } } }
          : { id, type: "action", position, data: { kind: "action", step: { id, type: payload.key, config: stepDefaults(payload.key) } } };
      const tail = chainTail(nodes, edges);
      setNodes((nds) => nds.concat({ ...node, width: NODE_W }));
      if (tail) setEdges((eds) => eds.concat(chainEdge(tail.id, id)));
    },
    [screenToFlowPosition, recordType, nodes, edges, setNodes, setEdges],
  );

  const status = SAVE_STATES[saveState];
  const StatusIcon = status.icon;

  return (
    <ReactFlow
      nodes={nodes}
      edges={renderedEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodesDelete={onNodesDelete}
      onConnect={onConnect}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onNodeDoubleClick={(_, node) => onNavigate?.(SECTION_FOR_KIND[node.type])}
      nodeTypes={nodeTypes}
      colorMode={resolvedTheme === "light" ? "light" : "dark"}
      proOptions={{ hideAttribution: true }}
      snapToGrid={snap}
      snapGrid={[snapSize, snapSize]}
      nodesDraggable={!locked}
      nodesConnectable={!locked}
      elementsSelectable={!locked}
      zoomOnDoubleClick={false}
      minZoom={0.2}
      maxZoom={2}
      fitView
      fitViewOptions={CANVAS_FIT_VIEW}
      deleteKeyCode={["Backspace", "Delete"]}
      className="bg-background"
    >
      {/* Dots follow the snap grid so the snapping step is visible */}
      <Background color="var(--canvas-dots)" gap={snap ? snapSize : 12} size={1} variant="dots" />
      <Panel position="top-left">
        <div className="flex flex-col gap-1.5">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-surface-card/90 px-2 py-1 text-xs text-text-secondary shadow-sm backdrop-blur-md">
            <StatusIcon className={`h-3.5 w-3.5 ${status.spin ? "animate-spin" : ""} ${saveState === "error" ? "text-red-600 dark:text-red-400" : ""}`} />
            {status.label}
          </span>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-surface-card/90 px-2 py-1 text-xs text-text-tertiary shadow-sm backdrop-blur-md">
            <MousePointerClick className="h-3.5 w-3.5" /> Double-click a card to edit it
          </span>
        </div>
      </Panel>
      <ZoomControls snap={snap} onSnapChange={setSnap} snapSize={snapSize} onSnapSizeChange={setSnapSize} locked={locked} onLockedChange={setLocked} />
      <Palette recordType={recordType} />
    </ReactFlow>
  );
}

// The editor section; remounts per workflow so the canvas re-seeds when you switch between workflows.
export function CanvasSection({ item, onCommitMeta, onNavigate }) {
  return (
    <div className="space-y-3">
      <div className="h-[70vh] min-h-[480px] w-full overflow-hidden rounded-xl border border-border bg-background">
        <ReactFlowProvider key={item.id}>
          <CanvasInner item={item} onCommitMeta={onCommitMeta} onNavigate={onNavigate} />
        </ReactFlowProvider>
      </div>
      <p className="text-xs text-text-tertiary">
        Steps run in the order they&apos;re connected from the trigger. Conditions are checked before any step runs, wherever they sit on the canvas.
      </p>
    </div>
  );
}

export default CanvasSection;

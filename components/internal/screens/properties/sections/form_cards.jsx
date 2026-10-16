"use client";

import { useState } from "react";

import { SectionCard } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";

// Card-grouped editor forms for the Properties / Buildings / Portfolios editors.
// A card's fields persist per control: columns via onCommit, `meta: true` keys
// via onCommitMeta, or — with `metaKey` — as one structured object under
// metadata[metaKey] (each tab owns its own key, so tabs never clobber each other).

// Relation picks always go through onCommit; send metadata-backed ones to onCommitMeta.
function routedCommit(fields, onCommit, onCommitMeta) {
  const metaKeys = new Set(fields.filter((f) => f.meta).map((f) => f.key));
  return (partial) =>
    onCommitMeta && Object.keys(partial).some((k) => metaKeys.has(k)) ? onCommitMeta(partial) : onCommit(partial);
}

// Fields stored together as one object at metadata[metaKey].
export function NestedFieldsForm({ item, metaKey, fields, onCommitMeta, columns = 2 }) {
  const stored = item?.metadata?.[metaKey] ?? item?.[metaKey];
  const base = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  const [typing, setTyping] = useState({});
  const values = { ...base, ...typing };
  const relationKeys = fields.filter((f) => f.type === "relation").map((f) => f.key);

  const commit = (partial) => {
    setTyping((t) => {
      const next = { ...t };
      for (const k of Object.keys(partial)) delete next[k];
      return next;
    });
    return onCommitMeta({ [metaKey]: { ...base, ...partial } });
  };
  // Flat-mode relation picks arrive through onPatch; persist those immediately.
  const patch = (partial) =>
    Object.keys(partial).some((k) => relationKeys.includes(k))
      ? commit(partial)
      : setTyping((t) => ({ ...t, ...partial }));

  return <FieldsForm item={values} fields={fields} onPatch={patch} onCommit={commit} flat columns={columns} />;
}

export function CardForm({ card, item, onPatch, onCommit, onCommitMeta }) {
  if (card.metaKey) {
    return (
      <NestedFieldsForm
        item={item}
        metaKey={card.metaKey}
        fields={card.fields}
        onCommitMeta={onCommitMeta}
        columns={card.columns}
      />
    );
  }
  return (
    <FieldsForm
      item={item}
      fields={card.fields}
      onPatch={onPatch}
      onCommit={routedCommit(card.fields, onCommit, onCommitMeta)}
      onCommitMeta={onCommitMeta}
      columns={card.columns}
    />
  );
}

// cards: [{ title, description?, fields?, metaKey?, columns?, showIf?(item), action?(item), render?(props) }]
export function makeCardsSection(cards) {
  function CardsSection(props) {
    const { item } = props;
    return (
      <div className="space-y-5">
        {cards
          .filter((c) => (c.showIf ? c.showIf(item) : true))
          .map((c, i) => (
            <SectionCard
              key={c.title || i}
              title={c.title}
              description={c.description}
              action={c.action ? c.action(item) : null}
            >
              {c.render ? c.render(props) : <CardForm card={c} {...props} />}
            </SectionCard>
          ))}
      </div>
    );
  }
  return CardsSection;
}

// Free-form internal notes kept in metadata.internalNotes.
export const makeInternalNotesSection = (placeholder) =>
  makeCardsSection([
    {
      fields: [
        {
          key: "internalNotes",
          label: "Internal notes",
          type: "textarea",
          meta: true,
          rows: 12,
          placeholder: placeholder || "Notes only your team can see…",
          hint: "Visible to your team only. Saves when you click away.",
        },
      ],
    },
  ]);

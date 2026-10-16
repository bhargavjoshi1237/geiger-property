import { makeEntityData } from "./entity_factory";

// Data-access layer for amenity bookings (owns `property.amenity_reservations`).
// startsAt/endsAt are ISO timestamps; status requested|approved|declined|cancelled.
export const amenityReservationsLayer = makeEntityData({
  table: "amenity_reservations",
  tag: "amenityReservations",
  order: { col: "starts_at", ascending: true },
  fields: [
    { key: "amenityId", col: "amenity_id", type: "uuid" },
    { key: "amenityName", col: "amenity_name", type: "text" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "tenantName", col: "tenant_name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "startsAt", col: "starts_at", type: "date" },
    { key: "endsAt", col: "ends_at", type: "date" },
    { key: "guests", col: "guests", type: "number" },
    { key: "status", col: "status", type: "text", default: "requested" },
    { key: "fee", col: "fee", type: "number" },
    { key: "deposit", col: "deposit", type: "number" },
  ],
});

export const amenityReservationsData = amenityReservationsLayer.data;

// Reservations for one amenity, soonest first.
export const listAmenityReservations = (amenityId) =>
  amenityReservationsLayer.list({ amenityId });

// Every reservation in the project (community calendar).
export const listAllAmenityReservations = () => amenityReservationsLayer.list();

// Approve / decline / cancel — a single-column status write.
export const setReservationStatus = (id, status) =>
  amenityReservationsLayer.update(id, { status });

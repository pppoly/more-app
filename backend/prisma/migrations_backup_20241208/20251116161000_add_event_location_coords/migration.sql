-- Add lat/lng columns to event table for precise map navigation
ALTER TABLE "Event"
    ADD COLUMN "locationLat" DOUBLE PRECISION,
    ADD COLUMN "locationLng" DOUBLE PRECISION;

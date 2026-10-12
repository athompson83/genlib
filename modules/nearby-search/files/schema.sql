-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL table for nearby-search (sql-store.ts). No PostGIS or extension required: searches prefilter on the
-- (tenant_id, lat, lng) B-tree index with a bounding box, then check the exact haversine distance.
-- lat/lng hold the SHARED location (the snapped cell centre for approximate places); exact_lat/exact_lng are
-- returned only to the owner. Rename the table by passing { table } to createSqlNearbyStore.
-- Scaling note: for millions of rows in dense areas, add PostGIS (geography column + GiST index, ST_DWithin) or the
-- contrib earthdistance extension (CREATE EXTENSION cube; CREATE EXTENSION earthdistance; a GiST index on
-- ll_to_earth(lat, lng) queried with earth_box(...) @> ll_to_earth(lat, lng)) and keep the same result contract.
CREATE TABLE IF NOT EXISTS nearby_places (
  tenant_id    text NOT NULL,
  id           text NOT NULL,
  owner_id     text NOT NULL,
  visibility   text NOT NULL CHECK (visibility IN ('public', 'approximate', 'private')),
  lat          double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng          double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  exact_lat    double precision NOT NULL CHECK (exact_lat BETWEEN -90 AND 90),
  exact_lng    double precision NOT NULL CHECK (exact_lng BETWEEN -180 AND 180),
  precision_m  double precision,
  label        text,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS nearby_places_tenant_lat_lng ON nearby_places (tenant_id, lat, lng);

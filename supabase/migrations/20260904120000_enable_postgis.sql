-- PostGIS backs every distance and interpolation calculation in this app.
-- Supabase convention is to keep extensions out of the public schema.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

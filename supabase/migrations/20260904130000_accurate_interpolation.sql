-- Fix positional drift of up to 279 km along the route.
--
-- The previous implementation used ST_LineInterpolatePoint, which walks a
-- fraction of the line's length measured in *degrees*. Cumulative distances
-- are real metres, and the two are not proportional: a degree of longitude is
-- 111 km at the equator but 57 km at Stockholm. Over a segment spanning many
-- latitudes the mismatch put the marker hundreds of kilometres from where the
-- distance said it should be.
--
-- These versions walk the segment vertex by vertex accumulating true geographic
-- distance, then interpolate only within the single short vertex pair that
-- brackets the target. Degree space is a fine approximation across ~200 m; it
-- is not across 4,000 km.

create or replace function public.route_point_at(
  p_route_id uuid,
  p_offset_m double precision
)
returns geography
language sql
stable
set search_path = public, extensions
as $$
  with seg as (
    select s.geom, s.cum_start_m, s.cum_end_m
    from public.route_segments s
    where s.route_id = p_route_id
      and p_offset_m >= s.cum_start_m
    order by s.cum_start_m desc
    limit 1
  ),
  pts as (
    select (dp).path[1] as i, (dp).geom as pt
    from seg, st_dumppoints(seg.geom::geometry) as dp
  ),
  steps as (
    select
      i,
      pt,
      lag(pt) over (order by i) as prev_pt,
      coalesce(
        st_distance((lag(pt) over (order by i))::geography, pt::geography),
        0
      ) as step
    from pts
  ),
  walked as (
    select i, pt, prev_pt, step, sum(step) over (order by i) as d
    from steps
  ),
  target as (
    -- Simplification leaves the drawn line slightly shorter than the true road
    -- distance it represents, so scale the request into the geometry's own
    -- length before walking it. Clamped so an offset at or past the segment
    -- end still resolves to the final vertex.
    select least(
      (select max(d) from walked),
      (p_offset_m - seg.cum_start_m)
        / nullif(seg.cum_end_m - seg.cum_start_m, 0)
        * (select max(d) from walked)
    ) as t
    from seg
  )
  select st_lineinterpolatepoint(
           st_makeline(w.prev_pt, w.pt),
           case
             when w.step > 0
               then least(1, greatest(0, (t.t - (w.d - w.step)) / w.step))
             else 0
           end
         )::geography
  from walked w, target t
  where w.prev_pt is not null
    and w.d >= t.t
  order by w.d
  limit 1;
$$;

-- Snapping a start point had the same flaw. Locating the nearest vertex and
-- taking its accumulated distance avoids fraction-of-degrees entirely; vertex
-- spacing is ~200 m, which bounds the error well below anything visible.
create or replace function public.route_offset_of(
  p_route_id uuid,
  p_point geography
)
returns double precision
language sql
stable
set search_path = public, extensions
as $$
  with seg as (
    select s.geom, s.cum_start_m, s.cum_end_m
    from public.route_segments s
    where s.route_id = p_route_id
    order by s.geom <-> p_point
    limit 1
  ),
  pts as (
    select (dp).path[1] as i, (dp).geom as pt
    from seg, st_dumppoints(seg.geom::geometry) as dp
  ),
  steps as (
    select
      i,
      pt,
      coalesce(
        st_distance((lag(pt) over (order by i))::geography, pt::geography),
        0
      ) as step
    from pts
  ),
  walked as (
    select i, pt, sum(step) over (order by i) as d, sum(step) over () as total
    from steps
  )
  select seg.cum_start_m
       + (w.d / nullif(w.total, 0)) * (seg.cum_end_m - seg.cum_start_m)
  from walked w, seg
  order by w.pt::geography <-> p_point
  limit 1;
$$;

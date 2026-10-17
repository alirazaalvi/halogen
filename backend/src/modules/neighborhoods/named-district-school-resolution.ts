export type NamedDistrictSchoolResolutionTier =
  | "geometry_match"
  | "geometry_buffer"
  | "district_scoped_ingestion"
  | "deso_fallback"
  | "none";

export type NamedDistrictSchoolResolutionCounts = {
  geometryMatchCount: number;
  geometryBufferCount: number;
  districtScopedCount: number;
  districtPlaceholderCount: number;
  desoFallbackCount: number;
};

export type NamedDistrictSchoolQueryOptions = {
  districtId: string;
  legacyDistrictId: string | null;
  geometryBufferMeters?: number;
  districtRadiusMeters?: number;
  limit?: number;
};

export function selectNamedDistrictSchoolResolutionTier(
  counts: NamedDistrictSchoolResolutionCounts,
): NamedDistrictSchoolResolutionTier {
  if (counts.geometryMatchCount > 0) {
    return "geometry_match";
  }
  if (counts.geometryBufferCount > 0) {
    return "geometry_buffer";
  }
  if (counts.districtScopedCount > 0 || counts.districtPlaceholderCount > 0) {
    return "district_scoped_ingestion";
  }
  if (counts.desoFallbackCount > 0) {
    return "deso_fallback";
  }
  return "none";
}

export function buildNamedDistrictSchoolResolutionQuery(options: NamedDistrictSchoolQueryOptions): {
  text: string;
  values: Array<string | number | null>;
} {
  const geometryBufferMeters = Math.max(
    0,
    Math.min(1000, Number(options.geometryBufferMeters ?? 150)),
  );
  const districtRadiusMeters = Math.max(
    500,
    Math.min(15000, Number(options.districtRadiusMeters ?? 4000)),
  );
  const geometryBufferDegrees = geometryBufferMeters / 111_320;
  const limit = Math.max(1, Math.min(50, Number(options.limit ?? 8)));

  return {
    text: `WITH district_context AS (
             SELECT
               nd.id,
               nd.geometry,
               nd.centroid,
               nd.legacy_district_id
             FROM named_districts nd
             WHERE nd.id = $1
             LIMIT 1
           ),
           geometry_match_schools AS (
             SELECT DISTINCT ON (
               COALESCE(
                 NULLIF(sp.school_unit_code, ''),
                 LOWER(sp.name) || '|' || LOWER(COALESCE(sp.address, ''))
               )
             )
               sp.name,
               COALESCE(sp.address, '') AS address,
               sp.student_count AS student_count,
               sp.performance AS performance,
               ST_Y(sp.coordinates) AS lat,
               ST_X(sp.coordinates) AS lng,
               COALESCE(sp.source_links, '[]'::jsonb) AS source_links,
               ST_Distance(sp.coordinates::geography, dc.centroid::geography) AS distance_meters,
               'geometry_match'::text AS resolution_source,
               1 AS source_priority,
               COALESCE(
                 NULLIF(sp.school_unit_code, ''),
                 LOWER(sp.name) || '|' || LOWER(COALESCE(sp.address, ''))
               ) AS school_identity
             FROM (SELECT * FROM schools WHERE quality IN ('measured', 'derived')) sp
             JOIN district_context dc ON dc.geometry IS NOT NULL
             WHERE sp.coordinates IS NOT NULL
               AND ST_Covers(dc.geometry, sp.coordinates)
             ORDER BY
               school_identity,
               distance_meters ASC,
               performance DESC NULLS LAST,
               student_count DESC NULLS LAST
           ),
           geometry_buffer_schools AS (
             SELECT DISTINCT ON (
               COALESCE(
                 NULLIF(sp.school_unit_code, ''),
                 LOWER(sp.name) || '|' || LOWER(COALESCE(sp.address, ''))
               )
             )
               sp.name,
               COALESCE(sp.address, '') AS address,
               sp.student_count AS student_count,
               sp.performance AS performance,
               ST_Y(sp.coordinates) AS lat,
               ST_X(sp.coordinates) AS lng,
               COALESCE(sp.source_links, '[]'::jsonb) AS source_links,
               ST_Distance(sp.coordinates::geography, dc.centroid::geography) AS distance_meters,
               'geometry_buffer'::text AS resolution_source,
               2 AS source_priority,
               COALESCE(
                 NULLIF(sp.school_unit_code, ''),
                 LOWER(sp.name) || '|' || LOWER(COALESCE(sp.address, ''))
               ) AS school_identity
             FROM (SELECT * FROM schools WHERE quality IN ('measured', 'derived')) sp
             JOIN district_context dc ON dc.geometry IS NOT NULL
             WHERE sp.coordinates IS NOT NULL
               AND sp.coordinates && ST_Expand(dc.geometry, $2)
               AND NOT ST_Covers(dc.geometry, sp.coordinates)
               AND ST_DWithin(sp.coordinates, dc.geometry, $2)
             ORDER BY
               school_identity,
               distance_meters ASC,
               performance DESC NULLS LAST,
               student_count DESC NULLS LAST
           ),
           district_geo_schools AS (
             SELECT DISTINCT ON (
               COALESCE(
                 NULLIF(sp.school_unit_code, ''),
                 LOWER(sp.name) || '|' || LOWER(COALESCE(sp.address, ''))
               )
             )
               sp.name,
               COALESCE(sp.address, '') AS address,
               sp.student_count AS student_count,
               sp.performance AS performance,
               ST_Y(sp.coordinates) AS lat,
               ST_X(sp.coordinates) AS lng,
               COALESCE(sp.source_links, '[]'::jsonb) AS source_links,
               ST_Distance(sp.coordinates::geography, dc.centroid::geography) AS distance_meters,
               'district_scoped_ingestion'::text AS resolution_source,
               3 AS source_priority,
               COALESCE(
                 NULLIF(sp.school_unit_code, ''),
                 LOWER(sp.name) || '|' || LOWER(COALESCE(sp.address, ''))
               ) AS school_identity
             FROM (SELECT * FROM schools WHERE quality IN ('measured', 'derived')) sp
             JOIN district_context dc ON TRUE
             WHERE $3::varchar IS NOT NULL
               AND sp.district_id = $3
               AND sp.coordinates IS NOT NULL
               AND ST_DWithin(sp.coordinates::geography, dc.centroid::geography, $4)
             ORDER BY
               school_identity,
               distance_meters ASC,
               performance DESC NULLS LAST,
               student_count DESC NULLS LAST
           ),
           district_placeholders AS (
             SELECT DISTINCT ON (
               COALESCE(
                 NULLIF(sp.school_unit_code, ''),
                 LOWER(sp.name) || '|' || LOWER(COALESCE(sp.address, ''))
               )
             )
               sp.name,
               COALESCE(sp.address, '') AS address,
               sp.student_count AS student_count,
               sp.performance AS performance,
               NULL::double precision AS lat,
               NULL::double precision AS lng,
               COALESCE(sp.source_links, '[]'::jsonb) AS source_links,
               NULL::double precision AS distance_meters,
               'district_scoped_ingestion'::text AS resolution_source,
               3 AS source_priority,
               COALESCE(
                 NULLIF(sp.school_unit_code, ''),
                 LOWER(sp.name) || '|' || LOWER(COALESCE(sp.address, ''))
               ) AS school_identity
             FROM (SELECT * FROM schools WHERE quality IN ('measured', 'derived')) sp
             WHERE $3::varchar IS NOT NULL
               AND sp.district_id = $3
               AND sp.coordinates IS NULL
             ORDER BY
               school_identity,
               performance DESC NULLS LAST,
               student_count DESC NULLS LAST
           ),
           deso_fallback_schools AS (
             SELECT DISTINCT ON (
               COALESCE(
                 NULLIF(sp.school_unit_code, ''),
                 LOWER(sp.name) || '|' || LOWER(COALESCE(sp.address, ''))
               )
             )
               sp.name,
               COALESCE(sp.address, '') AS address,
               sp.student_count AS student_count,
               sp.performance AS performance,
               ST_Y(sp.coordinates) AS lat,
               ST_X(sp.coordinates) AS lng,
               COALESCE(sp.source_links, '[]'::jsonb) AS source_links,
               ST_Distance(sp.coordinates::geography, dc.centroid::geography) AS distance_meters,
               'deso_fallback'::text AS resolution_source,
               4 AS source_priority,
               COALESCE(
                 NULLIF(sp.school_unit_code, ''),
                 LOWER(sp.name) || '|' || LOWER(COALESCE(sp.address, ''))
               ) AS school_identity
             FROM (SELECT * FROM schools WHERE quality IN ('measured', 'derived')) sp
             JOIN district_context dc ON TRUE
             JOIN named_district_deso_map ndm
               ON ndm.district_id = dc.id
              AND ndm.deso_id = sp.deso_id
             WHERE sp.coordinates IS NOT NULL
             ORDER BY
               school_identity,
               distance_meters ASC,
               performance DESC NULLS LAST,
               student_count DESC NULLS LAST
           ),
           ranked_schools AS (
             SELECT * FROM geometry_match_schools
             UNION ALL
             SELECT * FROM geometry_buffer_schools
             UNION ALL
             SELECT * FROM district_geo_schools
             UNION ALL
             SELECT * FROM district_placeholders
             UNION ALL
             SELECT * FROM deso_fallback_schools
           ),
           deduped_schools AS (
             SELECT DISTINCT ON (school_identity)
               name,
               address,
               student_count,
               performance,
               lat,
               lng,
               source_links,
               distance_meters,
               resolution_source,
               source_priority,
               school_identity
             FROM ranked_schools
             ORDER BY
               school_identity,
               source_priority ASC,
               (distance_meters IS NULL) ASC,
               distance_meters ASC NULLS LAST,
               performance DESC NULLS LAST,
               student_count DESC NULLS LAST
           )
           SELECT
             name,
             address,
             student_count,
             performance,
             lat,
             lng,
             source_links,
             distance_meters,
             resolution_source
           FROM deduped_schools
           ORDER BY
             source_priority ASC,
             (distance_meters IS NULL) ASC,
             distance_meters ASC NULLS LAST,
             performance DESC NULLS LAST,
             student_count DESC NULLS LAST
           LIMIT $5`,
    values: [
      options.districtId,
      geometryBufferDegrees,
      options.legacyDistrictId,
      districtRadiusMeters,
      limit,
    ],
  };
}

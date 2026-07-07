import {
  boolean,
  customType,
  decimal,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

const geometry = customType<{ data: unknown }>({
  dataType() {
    return "geometry";
  },
});

export const municipalities = pgTable("municipalities", {
  id: integer("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
});

export const desoAreas = pgTable("deso_areas", {
  id: varchar("id", { length: 10 }).primaryKey(),
  municipalityId: integer("municipality_id"),
  name: varchar("name", { length: 200 }),
  population: integer("population"),
  centroid: geometry("centroid"),
});

export const districts = pgTable("districts", {
  id: varchar("id", { length: 20 }).primaryKey(),
  desoId: varchar("deso_id", { length: 10 }),
  municipalityId: integer("municipality_id"),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }),
  population: integer("population"),
  areaKm2: numeric("area_km2"),
  geometry: geometry("geometry"),
  centroid: geometry("centroid"),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const districtAliases = pgTable("district_aliases", {
  id: serial("id").primaryKey(),
  districtId: varchar("district_id", { length: 20 }).notNull(),
  aliasName: varchar("alias_name", { length: 200 }).notNull(),
  normalizedAlias: varchar("normalized_alias", { length: 200 }).notNull(),
  aliasKind: varchar("alias_kind", { length: 30 }).notNull(),
  source: varchar("source", { length: 50 }).notNull(),
  priority: integer("priority").notNull(),
  isDisplay: boolean("is_display").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const namedDistricts = pgTable("named_districts", {
  id: varchar("id", { length: 80 }).primaryKey(),
  municipalityId: integer("municipality_id"),
  sourceMunicipalityCode: varchar("source_municipality_code", { length: 4 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  normalizedName: varchar("normalized_name", { length: 200 }).notNull(),
  sourceType: varchar("source_type", { length: 40 }).notNull(),
  sourceId: varchar("source_id", { length: 120 }),
  legacyDistrictId: varchar("legacy_district_id", { length: 20 }),
  geometry: geometry("geometry"),
  centroid: geometry("centroid"),
  description: varchar("description", { length: 500 }),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const namedDistrictDesoMap = pgTable("named_district_deso_map", {
  districtId: varchar("district_id", { length: 80 }).notNull(),
  desoId: varchar("deso_id", { length: 10 }).notNull(),
  mappingMethod: varchar("mapping_method", { length: 40 }).notNull(),
  overlapRatio: numeric("overlap_ratio"),
  priorityWeight: numeric("priority_weight"),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const neighborhoodScores = pgTable("neighborhood_scores", {
  desoId: varchar("deso_id", { length: 10 }).primaryKey(),
  overallScore: numeric("overall_score"),
  demographicsScore: numeric("demographics_score"),
  housingMarketScore: numeric("housing_market_score"),
  transportScore: numeric("transport_score"),
  schoolsScore: numeric("schools_score"),
  safetyScore: numeric("safety_score"),
  greenAreasScore: numeric("green_areas_score"),
  futureGrowthScore: numeric("future_growth_score"),
});

export const districtScores = pgTable("district_scores", {
  districtId: varchar("district_id", { length: 20 }).primaryKey(),
  overallScore: numeric("overall_score"),
  demographicsScore: numeric("demographics_score"),
  housingMarketScore: numeric("housing_market_score"),
  transportScore: numeric("transport_score"),
  schoolsScore: numeric("schools_score"),
  safetyScore: numeric("safety_score"),
  greenAreasScore: numeric("green_areas_score"),
  futureGrowthScore: numeric("future_growth_score"),
});

export const demographics = pgTable("demographics", {
  desoId: varchar("deso_id", { length: 10 }),
  medianIncome: integer("median_income"),
});

export const lantmaterietProperties = pgTable("lantmateriet_properties", {
  propertyId: varchar("property_id", { length: 50 }).primaryKey(),
  desoId: varchar("deso_id", { length: 10 }),
  addressString: varchar("address_string", { length: 200 }).notNull(),
  coordinates: geometry("coordinates"),
  buildingYear: integer("building_year"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const smhiObservations = pgTable("smhi_observations", {
  id: serial("id").primaryKey(),
  desoId: varchar("deso_id", { length: 10 }),
  year: integer("year").notNull(),
  sourceStation: varchar("source_station", { length: 50 }).notNull(),
  floodRisk: decimal("flood_risk", { precision: 6, scale: 2 }),
  greenSpaceRatio: decimal("green_space_ratio", { precision: 6, scale: 2 }),
  airQualityIndex: decimal("air_quality_index", { precision: 6, scale: 2 }),
  temperatureAvg: decimal("temperature_avg", { precision: 6, scale: 2 }),
  rainfallMm: decimal("rainfall_mm", { precision: 8, scale: 2 }),
  windExposureIndex: decimal("wind_exposure_index", { precision: 6, scale: 2 }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const municipalProjects = pgTable("municipal_projects", {
  id: serial("id").primaryKey(),
  externalId: varchar("external_id", { length: 100 }).notNull(),
  desoId: varchar("deso_id", { length: 10 }),
  sourceMunicipality: varchar("source_municipality", { length: 100 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  projectType: varchar("project_type", { length: 50 }),
  coordinates: geometry("coordinates"),
  status: varchar("status", { length: 30 }),
  confidence: decimal("confidence", { precision: 6, scale: 2 }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const schema = {
  municipalities,
  desoAreas,
  districts,
  districtAliases,
  namedDistricts,
  namedDistrictDesoMap,
  neighborhoodScores,
  districtScores,
  demographics,
  lantmaterietProperties,
  smhiObservations,
  municipalProjects,
};

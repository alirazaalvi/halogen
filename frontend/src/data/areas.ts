/** Types and labels for area reports. All values come from the backend API; none are bundled. */

export type ScoreKey =
  | "schools"
  | "transport"
  | "green"
  | "growth"
  | "safety"
  | "housing"
  | "demographics";

export interface SourceLink {
  label: string;
  url: string;
}

export interface School {
  name: string;
  address?: string;
  distance: string;
  walkMin: number | null;
  students: number | null;
  performance: number | null;
  lat: number | null;
  lng: number | null;
  inspection: "Approved" | "Excellent" | "Needs review" | null;
  sourceLinks?: SourceLink[];
}

export interface Amenity {
  label: string;
  icon: string;
  count: number;
  nearest: string;
  sourceLinks?: SourceLink[];
}

export interface FutureProject {
  year: number;
  title: string;
  type: "School" | "Transport" | "Housing" | "Park" | "Road";
  confidence: number | null;
  sourceLinks?: SourceLink[];
}

export interface Demographics {
  population: number | null;
  year: number | null;
  growth: number | null;
  medianIncome: number | null;
  familiesPct: number | null;
  higherEduPct: number | null;
  foreignBornPct: number | null;
  sourceLinks: SourceLink[];
}

export interface GrowthPrediction {
  level: "High" | "Medium" | "Low";
  confidence: number;
  rationale: string;
}

export interface Area {
  id: string;
  slug: string;
  name: string;
  region: string;
  coords: [number, number] | null;
  overall: number | null;
  scores: Record<ScoreKey, number | null>;
  /** Share of scoring weights backed by data, 0..1. */
  coverage: number | null;
  missingScores: string[];
  demographics: Demographics | null;
  schools: School[];
  amenities: Amenity[];
  future: FutureProject[];
  crimeStats: { year: number; incidents: number | null; trend: "up" | "down" | "stable" | null }[];
  growthPrediction: GrowthPrediction | null;
}

export const scoreLabels: Record<ScoreKey, { label: string; icon: string }> = {
  schools: { label: "Schools", icon: "🏫" },
  transport: { label: "Transport", icon: "🚆" },
  green: { label: "Green Areas", icon: "🌳" },
  growth: { label: "Future Growth", icon: "📈" },
  safety: { label: "Safety", icon: "🛡️" },
  housing: { label: "Housing stock", icon: "🏠" },
  demographics: { label: "Demographics", icon: "👨‍👩‍👧" },
};

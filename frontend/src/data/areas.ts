export type ScoreKey =
  | "schools"
  | "commute"
  | "green"
  | "kids"
  | "amenities"
  | "community"
  | "growth"
  | "safety"
  | "housing";

export interface SourceLink {
  label: string;
  url: string;
}

export interface School {
  name: string;
  address?: string;
  distance: string;
  walkMin: number;
  students: number;
  performance: number;
  lat?: number;
  lng?: number;
  inspection: "Approved" | "Excellent" | "Needs review";
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
  confidence?: number;
  sourceLinks?: SourceLink[];
}

export interface Area {
  slug: string;
  name: string;
  region: string;
  tagline: string;
  summary: string;
  overall: number;
  coords: [number, number];
  scores: Record<ScoreKey, number>;
  demographics: {
    population: number;
    growth: number;
    medianIncome: number;
    avgAge: number;
    familiesPct: number;
    higherEduPct: number;
    ownershipPct: number;
    sourceLinks?: SourceLink[];
  };
  schools: School[];
  amenities: Amenity[];
  commute: {
    target: string;
    car: number;
    transit: number;
    bike: number;
    walk: number;
  };
  future: FutureProject[];
  monthlyEstimate: number;
  safety?: number;
  housing?: number;
  crimeStats?: { year: number; incidents: number; trend: "up" | "down" | "stable" }[];
}

export const areas: Area[] = [
  {
    slug: "rinkeby",
    name: "Rinkeby",
    region: "Stockholm",
    tagline: "Vibrant community with strong local spirit",
    summary:
      "A diverse and lively neighborhood with excellent metro connections, local shops, and Järvafältet green spaces nearby.",
    overall: 72,
    coords: [59.39, 17.92],
    scores: {
      schools: 70,
      commute: 85,
      green: 72,
      kids: 78,
      amenities: 75,
      community: 82,
      growth: 78,
      safety: 58,
      housing: 65,
    },
    demographics: {
      population: 15000,
      growth: 2.5,
      medianIncome: 320000,
      avgAge: 32,
      familiesPct: 45,
      higherEduPct: 35,
      ownershipPct: 28,
    },
    schools: [
      {
        name: "Rinkeby Skola",
        address: "Rinkeby Allé 45, 163 50 Spånga",
        distance: "0.3 km",
        walkMin: 4,
        students: 520,
        performance: 75,
        inspection: "Approved",
      },
      {
        name: "Rinkeby Internationella Skola",
        address: "Rinkeby Allé 80, 163 50 Spånga",
        distance: "0.7 km",
        walkMin: 9,
        students: 380,
        performance: 78,
        inspection: "Approved",
      },
    ],
    amenities: [
      { label: "Playgrounds", icon: "🛝", count: 10, nearest: "140 m" },
      { label: "Libraries", icon: "📚", count: 1, nearest: "250 m" },
      { label: "Swimming Pools", icon: "🏊", count: 1, nearest: "1.3 km" },
      { label: "Football Clubs", icon: "⚽", count: 2, nearest: "500 m" },
      { label: "Healthcare", icon: "🏥", count: 2, nearest: "350 m" },
      { label: "Pharmacies", icon: "💊", count: 2, nearest: "180 m" },
      { label: "Supermarkets", icon: "🛒", count: 5, nearest: "90 m" },
      { label: "Childcare", icon: "🧸", count: 8, nearest: "160 m" },
    ],
    commute: { target: "Stockholm City", car: 18, transit: 20, bike: 25, walk: 65 },
    future: [
      { year: 2026, title: "Rinkeby Center Renewal", type: "Housing", confidence: 82 },
      { year: 2027, title: "New sports facility", type: "Park", confidence: 75 },
    ],
    monthlyEstimate: 24500,
    safety: 58,
    housing: 65,
    crimeStats: [
      { year: 2023, incidents: 350, trend: "stable" },
      { year: 2024, incidents: 320, trend: "stable" },
    ],
  },
  {
    slug: "husby",
    name: "Husby",
    region: "Stockholm",
    tagline: "Calm living with metro access",
    summary:
      "A peaceful neighborhood just north of Rinkeby with good metro links, local services, and proximity to Järvafältet nature reserve.",
    overall: 74,
    coords: [59.40, 17.90],
    scores: {
      schools: 73,
      commute: 83,
      green: 75,
      kids: 80,
      amenities: 72,
      community: 80,
      growth: 82,
      safety: 62,
      housing: 68,
    },
    demographics: {
      population: 12000,
      growth: 2.0,
      medianIncome: 340000,
      avgAge: 35,
      familiesPct: 42,
      higherEduPct: 38,
      ownershipPct: 32,
    },
    schools: [
      {
        name: "Husby Skola",
        address: "Husby Allé 33, 163 42 Spånga",
        distance: "0.4 km",
        walkMin: 5,
        students: 480,
        performance: 78,
        inspection: "Approved",
      },
    ],
    amenities: [
      { label: "Playgrounds", icon: "🛝", count: 8, nearest: "110 m" },
      { label: "Libraries", icon: "📚", count: 1, nearest: "300 m" },
      { label: "Swimming Pools", icon: "🏊", count: 1, nearest: "1.5 km" },
      { label: "Football Clubs", icon: "⚽", count: 2, nearest: "450 m" },
      { label: "Healthcare", icon: "🏥", count: 2, nearest: "400 m" },
      { label: "Pharmacies", icon: "💊", count: 2, nearest: "220 m" },
      { label: "Supermarkets", icon: "🛒", count: 4, nearest: "100 m" },
      { label: "Childcare", icon: "🧸", count: 7, nearest: "150 m" },
    ],
    commute: { target: "Stockholm City", car: 20, transit: 22, bike: 28, walk: 70 },
    future: [
      { year: 2026, title: "Husby Park Development", type: "Park", confidence: 78 },
    ],
    monthlyEstimate: 25200,
    safety: 62,
    housing: 68,
    crimeStats: [
      { year: 2023, incidents: 310, trend: "stable" },
      { year: 2024, incidents: 290, trend: "stable" },
    ],
  },
  {
    slug: "kista",
    name: "Kista",
    region: "Stockholm",
    tagline: "Tech-hub family living with forest at your doorstep",
    summary:
      "Excellent area for families with children. Strong international schools, fast metro links and Järvafältet's vast green spaces right next door.",
    overall: 92,
    coords: [59.4036, 17.9446],
    scores: {
      schools: 88,
      commute: 94,
      green: 91,
      kids: 86,
      amenities: 89,
      community: 84,
      growth: 95,
      safety: 78,
      housing: 82,
    },
    demographics: {
      population: 17890,
      growth: 4.2,
      medianIncome: 412000,
      avgAge: 34,
      familiesPct: 42,
      higherEduPct: 61,
      ownershipPct: 48,
    },
    schools: [
      {
        name: "Kista Grundskola",
        address: "Kista Allé 5, 164 40 Kista",
        distance: "0.4 km",
        walkMin: 5,
        students: 612,
        performance: 88,
        inspection: "Approved",
      },
      {
        name: "Engelska Skolan Kista",
        address: "Kista Science Tower 1, 164 40 Kista",
        distance: "0.8 km",
        walkMin: 10,
        students: 740,
        performance: 92,
        inspection: "Excellent",
      },
      {
        name: "Husby Skola",
        address: "Husby Allé 33, 163 42 Spånga",
        distance: "1.2 km",
        walkMin: 15,
        students: 480,
        performance: 79,
        inspection: "Approved",
      },
    ],
    amenities: [
      { label: "Playgrounds", icon: "🛝", count: 14, nearest: "120 m" },
      { label: "Libraries", icon: "📚", count: 2, nearest: "300 m" },
      { label: "Swimming Pools", icon: "🏊", count: 1, nearest: "1.1 km" },
      { label: "Football Clubs", icon: "⚽", count: 3, nearest: "600 m" },
      { label: "Healthcare", icon: "🏥", count: 4, nearest: "450 m" },
      { label: "Pharmacies", icon: "💊", count: 3, nearest: "200 m" },
      { label: "Supermarkets", icon: "🛒", count: 6, nearest: "80 m" },
      { label: "Childcare", icon: "🧸", count: 9, nearest: "180 m" },
    ],
    commute: { target: "Kista Science City", car: 12, transit: 15, bike: 18, walk: 45 },
    future: [
      { year: 2026, title: "New international primary school", type: "School", confidence: 90 },
      { year: 2027, title: "Tvärbanan extension to Helenelund", type: "Transport", confidence: 85 },
      { year: 2028, title: "Kistahöjden residential project", type: "Housing", confidence: 92 },
      { year: 2029, title: "Järvafältet park renewal", type: "Park", confidence: 75 },
    ],
    monthlyEstimate: 28500,
    safety: 78,
    housing: 82,
    crimeStats: [
      { year: 2023, incidents: 420, trend: "down" },
      { year: 2024, incidents: 380, trend: "down" },
    ],
  },
  {
    slug: "sollentuna",
    name: "Sollentuna",
    region: "Stockholm",
    tagline: "Lakeside calm with top-rated schools",
    summary:
      "A quiet, leafy municipality north of Stockholm with some of the country's highest school ratings and easy commuter trains into the city.",
    overall: 89,
    coords: [59.4283, 17.9509],
    scores: {
      schools: 94,
      commute: 86,
      green: 93,
      kids: 88,
      amenities: 83,
      community: 90,
      growth: 78,
      safety: 85,
      housing: 74,
    },
    demographics: {
      population: 74000,
      growth: 2.1,
      medianIncome: 498000,
      avgAge: 39,
      familiesPct: 48,
      higherEduPct: 58,
      ownershipPct: 72,
    },
    schools: [
      {
        name: "Tegelhagens Skola",
        address: "Tegelhagsvägen 2, 191 39 Sollentuna",
        distance: "0.6 km",
        walkMin: 8,
        students: 510,
        performance: 94,
        inspection: "Excellent",
      },
      {
        name: "Sollentuna International",
        address: "Edsviksvägen 40, 191 47 Sollentuna",
        distance: "1.0 km",
        walkMin: 12,
        students: 380,
        performance: 96,
        inspection: "Excellent",
      },
      {
        name: "Häggviksskolan",
        address: "Häggviks Allé 10, 191 38 Sollentuna",
        distance: "1.5 km",
        walkMin: 18,
        students: 620,
        performance: 87,
        inspection: "Approved",
      },
    ],
    amenities: [
      { label: "Playgrounds", icon: "🛝", count: 22, nearest: "150 m" },
      { label: "Libraries", icon: "📚", count: 3, nearest: "500 m" },
      { label: "Swimming Pools", icon: "🏊", count: 2, nearest: "900 m" },
      { label: "Football Clubs", icon: "⚽", count: 5, nearest: "400 m" },
      { label: "Healthcare", icon: "🏥", count: 6, nearest: "550 m" },
      { label: "Pharmacies", icon: "💊", count: 4, nearest: "300 m" },
      { label: "Supermarkets", icon: "🛒", count: 8, nearest: "200 m" },
      { label: "Childcare", icon: "🧸", count: 14, nearest: "220 m" },
    ],
    commute: { target: "Stockholm City", car: 22, transit: 18, bike: 38, walk: 95 },
    future: [
      { year: 2026, title: "Edsviken school expansion", type: "School", confidence: 95 },
      { year: 2027, title: "Commuter rail upgrade", type: "Transport", confidence: 88 },
      { year: 2028, title: "Väsjön housing district", type: "Housing", confidence: 82 },
    ],
    monthlyEstimate: 31200,
    safety: 85,
    housing: 74,
    crimeStats: [
      { year: 2023, incidents: 280, trend: "stable" },
      { year: 2024, incidents: 265, trend: "down" },
    ],
  },
  {
    slug: "taby",
    name: "Täby",
    region: "Stockholm",
    tagline: "Suburban classic with everything for kids",
    summary:
      "A spacious, family-first municipality with horse trails, a large mall, ice rinks and a calm pace of life. Perfect for kids who want space.",
    overall: 87,
    coords: [59.4441, 18.0686],
    scores: {
      schools: 89,
      commute: 80,
      green: 88,
      kids: 92,
      amenities: 90,
      community: 87,
      growth: 76,
      safety: 91,
      housing: 68,
    },
    demographics: {
      population: 73500,
      growth: 1.8,
      medianIncome: 522000,
      avgAge: 41,
      familiesPct: 51,
      higherEduPct: 56,
      ownershipPct: 78,
    },
    schools: [
      {
        name: "Slottsparkens Skola",
        address: "Slottsparksvägen 12, 187 30 Täby",
        distance: "0.7 km",
        walkMin: 9,
        students: 430,
        performance: 90,
        inspection: "Excellent",
      },
      {
        name: "Näsbypark Skola",
        address: "Näsbyparksvägen 5, 187 64 Täby",
        distance: "1.2 km",
        walkMin: 14,
        students: 560,
        performance: 86,
        inspection: "Approved",
      },
      {
        name: "Täby Friskola",
        address: "Täby Centrum 1, 187 30 Täby",
        distance: "1.4 km",
        walkMin: 17,
        students: 290,
        performance: 91,
        inspection: "Excellent",
      },
    ],
    amenities: [
      { label: "Playgrounds", icon: "🛝", count: 28, nearest: "100 m" },
      { label: "Libraries", icon: "📚", count: 4, nearest: "600 m" },
      { label: "Swimming Pools", icon: "🏊", count: 3, nearest: "800 m" },
      { label: "Football Clubs", icon: "⚽", count: 7, nearest: "350 m" },
      { label: "Healthcare", icon: "🏥", count: 8, nearest: "400 m" },
      { label: "Pharmacies", icon: "💊", count: 5, nearest: "250 m" },
      { label: "Supermarkets", icon: "🛒", count: 12, nearest: "150 m" },
      { label: "Childcare", icon: "🧸", count: 18, nearest: "180 m" },
    ],
    commute: { target: "Stockholm City", car: 28, transit: 32, bike: 50, walk: 120 },
    future: [
      { year: 2026, title: "Roslagsbanan modernisation", type: "Transport", confidence: 90 },
      { year: 2027, title: "New nature reserve trails", type: "Park", confidence: 85 },
      { year: 2028, title: "Täby Park district", type: "Housing", confidence: 75 },
    ],
    monthlyEstimate: 32800,
    safety: 91,
    housing: 68,
    crimeStats: [
      { year: 2023, incidents: 190, trend: "down" },
      { year: 2024, incidents: 175, trend: "down" },
    ],
  },
  {
    slug: "vasastan",
    name: "Vasastan",
    region: "Stockholm",
    tagline: "Café-lined city life with great schools",
    summary:
      "Central, walkable and full of character. Beautiful turn-of-the-century architecture, Vasaparken on your doorstep and an unbeatable selection of schools.",
    overall: 90,
    coords: [59.3438, 18.0496],
    scores: {
      schools: 90,
      commute: 96,
      green: 78,
      kids: 84,
      amenities: 95,
      community: 82,
      growth: 80,
      safety: 65,
      housing: 88,
    },
    demographics: {
      population: 62000,
      growth: 1.4,
      medianIncome: 545000,
      avgAge: 38,
      familiesPct: 37,
      higherEduPct: 71,
      ownershipPct: 64,
    },
    schools: [
      {
        name: "Matteusskolan",
        address: "Sankt Eriksgatan 24, 113 34 Stockholm",
        distance: "0.3 km",
        walkMin: 4,
        students: 690,
        performance: 91,
        inspection: "Excellent",
      },
      {
        name: "Gustav Vasa Skola",
        address: "Odengatan 15, 113 22 Stockholm",
        distance: "0.6 km",
        walkMin: 7,
        students: 540,
        performance: 89,
        inspection: "Approved",
      },
      {
        name: "Adolf Fredriks Musikklasser",
        address: "Kungsholmsgatan 20, 112 27 Stockholm",
        distance: "1.0 km",
        walkMin: 12,
        students: 470,
        performance: 95,
        inspection: "Excellent",
      },
    ],
    amenities: [
      { label: "Playgrounds", icon: "🛝", count: 11, nearest: "90 m" },
      { label: "Libraries", icon: "📚", count: 4, nearest: "250 m" },
      { label: "Swimming Pools", icon: "🏊", count: 2, nearest: "600 m" },
      { label: "Football Clubs", icon: "⚽", count: 3, nearest: "450 m" },
      { label: "Healthcare", icon: "🏥", count: 9, nearest: "200 m" },
      { label: "Pharmacies", icon: "💊", count: 7, nearest: "120 m" },
      { label: "Supermarkets", icon: "🛒", count: 14, nearest: "60 m" },
      { label: "Childcare", icon: "🧸", count: 16, nearest: "130 m" },
    ],
    commute: { target: "Stockholm City", car: 8, transit: 6, bike: 10, walk: 22 },
    future: [
      { year: 2026, title: "Odenplan transit upgrade", type: "Transport", confidence: 95 },
      { year: 2027, title: "Vasaparken renewal", type: "Park", confidence: 80 },
      { year: 2028, title: "Hagastaden expansion", type: "Housing", confidence: 92 },
    ],
    monthlyEstimate: 34500,
    safety: 65,
    housing: 88,
    crimeStats: [
      { year: 2023, incidents: 580, trend: "up" },
      { year: 2024, incidents: 620, trend: "up" },
    ],
  },
];

export const scoreLabels: Record<ScoreKey, { label: string; icon: string }> = {
  schools: { label: "Schools", icon: "🏫" },
  commute: { label: "Commute", icon: "🚆" },
  green: { label: "Green Areas", icon: "🌳" },
  kids: { label: "Kids Activities", icon: "⚽" },
  amenities: { label: "Family Amenities", icon: "🛒" },
  community: { label: "Community", icon: "👨\u200d👩\u200d👧" },
  growth: { label: "Future Growth", icon: "📈" },
  safety: { label: "Safety", icon: "🛡️" },
  housing: { label: "Housing Market", icon: "🏠" },
};

export function getArea(slug: string): Area | undefined {
  return areas.find((a) => a.slug === slug);
}

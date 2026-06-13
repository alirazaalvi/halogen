// Scoring weights configuration
export const SCORING_WEIGHTS = {
  demographics: 0.30,
  housing: 0.20,
  transport: 0.15,
  schools: 0.10,
  safety: 0.10,
  green: 0.05,
  environment: 0.05,
  future: 0.05,
};

export class ScoringEngine {
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  calculateDemographicsScore(data) {
    const growthScore = this.clamp((data.population_growth - 0.5) / 3.5, 0, 1) * 0.4;
    const incomeScore = (data.median_income / data.stockholmAvgIncome) * 0.3;
    const educationScore = (data.higherEduPct / 100) * 0.2;
    const familyScore = this.clamp(data.familiesWithKidsPct / 60, 0, 1) * 0.1;
    return (growthScore + incomeScore + educationScore + familyScore) * 100;
  }

  calculateHousingScore(data) {
    const affordability = this.clamp(1 - (data.pricePerSqm / data.medianIncome * 15), 0, 1);
    const inventoryHealth = this.clamp(data.activeListings / (data.population / 10), 0, 1);
    return (affordability * 0.5 + inventoryHealth * 0.5) * 100;
  }

  calculateTransportScore(data) {
    const busScore = Math.min(100, data.busStops500m * 20) / 100;
    const metroScore = Math.min(100, data.metroStations1km * 50) / 100;
    const commuteScore = Math.max(0, (100 - data.avgCommuteMin * 2)) / 100;
    return (busScore + metroScore + commuteScore) * 100 / 3;
  }

  calculateSchoolsScore(data) {
    const proximityScore = Math.min(100, data.schoolsWithin1km * 25) / 100;
    const performanceScore = data.avgSchoolPerformance / 100;
    return (proximityScore * 0.4 + performanceScore * 0.6) * 100;
  }

  calculateSafetyScore(data) {
    const crimeRate = Math.min(1, data.crimePerCapita / 0.01);
    const trendFactor = data.trendDown ? 0 : data.trendUp ? 0.5 : 0.25;
    return (1 - (crimeRate * 0.7 + trendFactor * 0.3)) * 100;
  }

  calculateGreenScore(environmentalData) {
    return Math.min(100, environmentalData.greenSpaceKm2 / 2);
  }

  calculateOverallScore(scores) {
    const total = Object.entries(SCORING_WEIGHTS).reduce((sum, [key, weight]) => {
      return sum + (scores[key] || 50) * weight;
    }, 0);
    return Math.round(total * 10) / 10;
  }
}
# Python Scoring Engine for Swedish Neighborhood Intelligence
# Run in venv: python -m venv venv && source venv/bin/activate && pip install -r requirements.txt

from dataclasses import dataclass
from typing import Optional
import math

@dataclass
class DemographicsData:
    population_growth: float
    median_income: int
    higher_edu_pct: float
    families_with_kids_pct: float
    stockholm_avg_income: int = 500000

@dataclass
class HousingData:
    price_per_sqm: int
    avg_price_area: int
    median_income: int
    active_listings: int
    population: int

@dataclass
class TransportData:
    bus_stops_500m: int
    metro_stations_1km: int
    avg_commute_min: int

@dataclass
class SchoolData:
    schools_within_1km: int
    avg_school_performance: float

@dataclass
class CrimeData:
    crime_per_capita: float
    trend_up: bool
    trend_down: bool

@dataclass
class EnvironmentalData:
    green_space_km2: float
    flood_risk: float
    air_quality_index: float

@dataclass
class FutureData:
    planned_projects_count: int
    avg_project_confidence: float

class ScoringEngine:
    WEIGHTS = {
        'demographics': 0.30,
        'housing': 0.20,
        'transport': 0.15,
        'schools': 0.10,
        'safety': 0.10,
        'green': 0.05,
        'environment': 0.05,
        'future': 0.05
    }

    @staticmethod
    def clamp(value: float, min_val: float, max_val: float) -> float:
        return max(min_val, min(max_val, value))

    def calculate_demographics_score(self, data: DemographicsData) -> float:
        growth_score = self.clamp((data.population_growth - 0.5) / 3.5, 0, 1) * 0.4
        income_score = (data.median_income / data.stockholm_avg_income) * 0.3
        education_score = (data.higher_edu_pct / 100) * 0.2
        family_score = self.clamp(data.families_with_kids_pct / 60, 0, 1) * 0.1
        return (growth_score + income_score + education_score + family_score) * 100

    def calculate_housing_score(self, data: HousingData) -> float:
        affordability = self.clamp(1 - (data.price_per_sqm / data.median_income * 15), 0, 1)
        inventory_health = self.clamp(data.active_listings / (data.population / 10), 0, 1)
        return (affordability * 0.5 + inventory_health * 0.5) * 100

    def calculate_transport_score(self, data: TransportData) -> float:
        bus_score = min(100, data.bus_stops_500m * 20) / 100
        metro_score = min(100, data.metro_stations_1km * 50) / 100
        commute_score = max(0, (100 - data.avg_commute_min * 2)) / 100
        return (bus_score + metro_score + commute_score) * 100 / 3

    def calculate_schools_score(self, data: SchoolData) -> float:
        proximity_score = min(100, data.schools_within_1km * 25) / 100
        performance_score = data.avg_school_performance / 100
        return (proximity_score * 0.4 + performance_score * 0.6) * 100

    def calculate_safety_score(self, data: CrimeData) -> float:
        crime_rate = min(1, data.crime_per_capita / 0.01)
        trend_factor = 0 if data.trend_down else (0.5 if data.trend_up else 0.25)
        return (1 - (crime_rate * 0.7 + trend_factor * 0.3)) * 100

    def calculate_green_score(self, data: EnvironmentalData) -> float:
        return min(100, data.green_space_km2 / 2)

    def calculate_environment_score(self, data: EnvironmentalData) -> float:
        air_quality = data.air_quality_index / 100
        flood_safety = (1 - data.flood_risk / 100)
        return (air_quality * 0.4 + flood_safety * 0.6) * 100

    def calculate_future_growth_score(self, data: FutureData) -> float:
        project_score = min(100, data.planned_projects_count * 10) / 100
        confidence_score = data.avg_project_confidence / 100
        return (project_score * 0.5 + confidence_score * 0.5) * 100

    def calculate_overall_score(self, scores: dict) -> float:
        total = sum(
            scores.get(key, 50) * weight
            for key, weight in self.WEIGHTS.items()
        )
        return round(total, 1)

    def calculate_all_scores(
        self,
        demographics: DemographicsData,
        housing: HousingData,
        transport: TransportData,
        schools: SchoolData,
        crime: CrimeData,
        environmental: EnvironmentalData,
        future: FutureData
    ) -> dict:
        scores = {
            'demographics': self.calculate_demographics_score(demographics),
            'housing': self.calculate_housing_score(housing),
            'transport': self.calculate_transport_score(transport),
            'schools': self.calculate_schools_score(schools),
            'safety': self.calculate_safety_score(crime),
            'green': self.calculate_green_score(environmental),
            'environment': self.calculate_environment_score(environmental),
            'future': self.calculate_future_growth_score(future)
        }
        scores['overall'] = self.calculate_overall_score(scores)
        return scores
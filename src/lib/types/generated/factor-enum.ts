/**
 * THIS FILE IS GENERATED — DO NOT EDIT BY HAND
 * Generated from: ../../../../static/data/factor.csv
 * Generated at: 2026-05-28T11:50:42.875Z
 */

export enum FactorIDEnum {
	FoodConsumption = 'food_consumption',
	HhFoodSecurity = 'hh_food_security',
	Livelihoods = 'livelihoods',
	HealthServices = 'health_services',
	NutritionServices = 'nutrition_services',
	NutritionStatus = 'nutrition_status',
	HealthStatus = 'health_status',
	LivingConditions = 'living_conditions',
	SanitationHygiene = 'sanitation_hygiene',
	EnvironmentalHygiene = 'environmental_hygiene',
	MarketFunctionality = 'market_functionality',
	Mortality = 'mortality',
	WaterSystemsInfrastructure = 'water_systems_infrastructure',
	HhWaterConsumption = 'hh_water_consumption',
	HhWaterSecurity = 'hh_water_security',
}

// Convenience array of ids
export const FactorIDs = Object.values(FactorIDEnum) as FactorIDEnum[];

export type FactorID = FactorIDEnum;

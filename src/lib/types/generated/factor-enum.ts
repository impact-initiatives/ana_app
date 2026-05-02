/**
 * THIS FILE IS GENERATED — DO NOT EDIT BY HAND
 * Generated from: ../../../../static/data/factor.csv
 * Generated at: 2026-04-29T06:22:00.152Z
 */

export enum FactorIDEnum {
	NutritionStatus = 'nutrition_status',
	HealthStatus = 'health_status',
	Mortality = 'mortality',
	FoodConsumption = 'food_consumption',
	HhFoodSecurity = 'hh_food_security',
	HhWaterConsumption = 'hh_water_consumption',
	HhWaterSecurity = 'hh_water_security',
	LivingConditions = 'living_conditions',
	MarketFunctionality = 'market_functionality',
	WaterSystemsInfrastructure = 'water_systems_infrastructure',
	SanitationHygiene = 'sanitation_hygiene',
	HealthServices = 'health_services',
	NutritionServices = 'nutrition_services',
}

// Convenience array of ids
export const FactorIDs = Object.values(FactorIDEnum) as FactorIDEnum[];

export type FactorID = FactorIDEnum;

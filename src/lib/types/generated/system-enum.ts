/**
 * THIS FILE IS GENERATED — DO NOT EDIT BY HAND
 * Generated from: ../../../../static/data/system.csv
 * Generated at: 2026-05-06T12:04:49.493Z
 */

export enum SystemIDEnum {
	Mortality = 'mortality',
	HealthOutcomes = 'health_outcomes',
	FoodSystems = 'food_systems',
	WaterSystems = 'water_systems',
	LivingConditions = 'living_conditions',
	MarketFunctionality = 'market_functionality',
	HealthNutritionServices = 'health_nutrition_services',
}

// Convenience array of ids
export const SystemIDs = Object.values(SystemIDEnum) as SystemIDEnum[];

export type SystemID = SystemIDEnum;

// Human-readable labels keyed by system id
export const SystemLabels: Record<SystemIDEnum, string> = {
	[SystemIDEnum.Mortality]: 'Mortality outcome',
	[SystemIDEnum.HealthOutcomes]: 'Health Outcomes',
	[SystemIDEnum.FoodSystems]: 'Food Systems',
	[SystemIDEnum.WaterSystems]: 'Water Systems',
	[SystemIDEnum.LivingConditions]: 'Living Conditions',
	[SystemIDEnum.MarketFunctionality]: 'Market Functionality',
	[SystemIDEnum.HealthNutritionServices]: 'Health / Nutrition Services',
};

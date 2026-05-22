/**
 * THIS FILE IS GENERATED — DO NOT EDIT BY HAND
 * Generated from: ../../../../static/data/subfactor.csv
 * Generated at: 2026-05-22T10:46:35.120Z
 */

export enum SubFactorIDEnum {
	Quantity = 'quantity',
	Quality = 'quality',
	Availability = 'availability',
	Access = 'access',
	Utilisation = 'utilisation',
	Consumption = 'consumption',
	Accessibility = 'accessibility',
	Mortality = 'mortality',
	Functionality = 'functionality',
	ExposureToElements = 'exposure_to_elements',
	ProtectionFromVectors = 'protection_from_vectors',
	Overcrowding = 'overcrowding',
	AcuteMalnutrition = 'acute_malnutrition',
	CommonChildhoodIllnesses = 'common_childhood_illnesses',
	InfectiousDiseaseOutbreaks = 'infectious_disease_outbreaks',
	PopulationHealthNeeds = 'population_health_needs',
	AccessToNutrition = 'access_to_nutrition',
	QuantityAndDiversityProxy = 'quantity_and_diversity_proxy',
	QuantityProxy = 'quantity_proxy',
	Diversity = 'diversity',
	QualityAvailability = 'quality_availability',
}

// Convenience array of ids
export const SubFactorIDs = Object.values(SubFactorIDEnum) as SubFactorIDEnum[];

export type SubFactorID = SubFactorIDEnum;

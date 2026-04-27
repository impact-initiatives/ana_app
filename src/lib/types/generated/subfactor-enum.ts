/**
 * THIS FILE IS GENERATED — DO NOT EDIT BY HAND
 * Generated from: ../../../../static/data/subfactor.csv
 * Generated at: 2026-04-27T13:39:16.451Z
 */

export enum SubFactorIDEnum {
	Mortality = 'mortality',
	AcuteMalnutrition = 'acute_malnutrition',
	CommonChildhoodIllnesses = 'common_childhood_illnesses',
	InfectiousDiseaseOutbreaks = 'infectious_disease_outbreaks',
	PopulationHealthNeeds = 'population_health_needs',
	IndividualConsumption = 'individual_consumption',
	HhConsumption = 'hh_consumption',
	Availability = 'availability',
	Accessibility = 'accessibility',
	Utilisation = 'utilisation',
	Consumption = 'consumption',
	Quantity = 'quantity',
	Quality = 'quality',
	Access = 'access',
	ExposureToElements = 'exposure_to_elements',
	ProtectionFromVectors = 'protection_from_vectors',
	Overcrowding = 'overcrowding',
	Functionality = 'functionality',
	AccessToNutrition = 'access_to_nutrition',
}

// Convenience array of ids
export const SubFactorIDs = Object.values(SubFactorIDEnum) as SubFactorIDEnum[];

export type SubFactorID = SubFactorIDEnum;

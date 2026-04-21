import { describe, it, expect } from 'vitest';
import { matchFeaturesToUoas } from '$lib/utils/matchFeatures';
import type { Feature, Polygon } from 'geojson';

function makeFeature(props: Record<string, unknown>): Feature<Polygon, Record<string, unknown>> {
	return {
		type: 'Feature',
		properties: props,
		geometry: {
			type: 'Polygon',
			coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]
		}
	};
}

describe('matchFeaturesToUoas — ADM1', () => {
	const features = [
		makeFeature({ adm1_source_code: 'SO01', name: 'Region 1' }),
		makeFeature({ adm1_source_code: 'SO02', name: 'Region 2' })
	];

	it('returns a Map with matched UOAs', () => {
		const result = matchFeaturesToUoas(features, ['SO01', 'SO02'], 'ADM1');
		expect(result.size).toBe(2);
		expect(result.has('SO01')).toBe(true);
		expect(result.has('SO02')).toBe(true);
	});

	it('omits UOAs with no matching feature', () => {
		const result = matchFeaturesToUoas(features, ['SO01', 'SO99'], 'ADM1');
		expect(result.size).toBe(1);
		expect(result.has('SO99')).toBe(false);
	});

	it('maps each UOA to the correct feature', () => {
		const result = matchFeaturesToUoas(features, ['SO01'], 'ADM1');
		expect(result.get('SO01')!.properties.name).toBe('Region 1');
	});

	it('matches case-insensitively', () => {
		const result = matchFeaturesToUoas(features, ['so01'], 'ADM1');
		expect(result.size).toBe(1);
		expect(result.has('so01')).toBe(true);
	});

	it('returns empty Map when features array is empty', () => {
		const result = matchFeaturesToUoas([], ['SO01'], 'ADM1');
		expect(result.size).toBe(0);
	});

	it('returns empty Map when uoas array is empty', () => {
		const result = matchFeaturesToUoas(features, [], 'ADM1');
		expect(result.size).toBe(0);
	});
});

describe('matchFeaturesToUoas — ADM2', () => {
	const features = [
		makeFeature({ adm2_source_code: 'SO0101', name: 'District 1' }),
		makeFeature({ adm2_source_code: 'SO0102', name: 'District 2' })
	];

	it('uses adm2_source_code field for ADM2 level', () => {
		const result = matchFeaturesToUoas(features, ['SO0101'], 'ADM2');
		expect(result.size).toBe(1);
		expect(result.get('SO0101')!.properties.name).toBe('District 1');
	});

	it('does not match adm1_source_code when level is ADM2', () => {
		const mixed = [makeFeature({ adm1_source_code: 'SO01', adm2_source_code: 'SO0101' })];
		const result = matchFeaturesToUoas(mixed, ['SO01'], 'ADM2');
		expect(result.size).toBe(0);
	});
});

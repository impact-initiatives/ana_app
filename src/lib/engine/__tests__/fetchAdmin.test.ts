import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchAdminsForCountry } from '$lib/engine/fetchAdmin';

// Minimal GeoJSON polygon fixture (a tiny square)
const square = (id: string) => ({
	type: 'Feature' as const,
	properties: { iso3: 'SOM', adm1_pcode: id },
	geometry: {
		type: 'Polygon' as const,
		coordinates: [
			[
				[44, 2],
				[44.1, 2],
				[44.1, 2.1],
				[44, 2.1],
				[44, 2]
			]
		]
	}
});

const featureCollection = (...features: ReturnType<typeof square>[]) => ({
	type: 'FeatureCollection',
	features
});

const emptyFc = { type: 'FeatureCollection', features: [] };

/** Build a mock fetch that returns successive responses in order. */
function mockFetch(...responses: object[]) {
	let call = 0;
	return vi.fn().mockImplementation(() => {
		const body = responses[call] ?? emptyFc;
		call++;
		return Promise.resolve({
			ok: true,
			json: () => Promise.resolve(body)
		});
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('fetchAdminsForCountry — non-pcode input', () => {
	it('returns undefined when pcode does not match pcode pattern', async () => {
		const result = await fetchAdminsForCountry('Somalia', 'ADM1');
		expect(result).toBeUndefined();
	});
});

describe('fetchAdminsForCountry — pcode not found', () => {
	it('throws when both ADM2 and ADM1 exact-match queries return empty', async () => {
		vi.stubGlobal('fetch', mockFetch(emptyFc, emptyFc));
		await expect(fetchAdminsForCountry('SO01', 'ADM1')).rejects.toThrow(/no exact-match/);
	});

	it('throws when matched feature has no iso3 property', async () => {
		const noIso3 = featureCollection({
			...square('S01'),
			properties: { adm1_pcode: 'S01' } // iso3 missing
		});
		vi.stubGlobal('fetch', mockFetch(noIso3));
		await expect(fetchAdminsForCountry('SO0101', 'ADM1')).rejects.toThrow(/iso3 not found/);
	});
});

describe('fetchAdminsForCountry — ADM1 level', () => {
	it('returns adm1 FeatureCollection and empty adm2', async () => {
		// Call order: adm2_source_code match (empty) → adm1_source_code match (hit) → adm1 by iso3
		const matchFc = featureCollection(square('S01'));
		const adm1Fc = featureCollection(square('S01'), square('S02'));
		vi.stubGlobal('fetch', mockFetch(emptyFc, matchFc, adm1Fc));

		const result = await fetchAdminsForCountry('SO01', 'ADM1');
		expect(result).toBeDefined();
		expect(result!.adm1).not.toBeNull();
		expect(result!.adm1.type).toBe('FeatureCollection');
		expect(result!.adm2).toEqual(emptyFc);
	});

	it('simplifies the adm1 result (features remain)', async () => {
		const matchFc = featureCollection(square('S01'));
		const adm1Fc = featureCollection(square('S01'), square('S02'));
		vi.stubGlobal('fetch', mockFetch(emptyFc, matchFc, adm1Fc));

		const result = await fetchAdminsForCountry('SO01', 'ADM1');
		expect(result!.adm1.features.length).toBeGreaterThan(0);
	});

	it('handles fetch error on adm1 query gracefully (returns error object)', async () => {
		const matchFc = featureCollection(square('S01'));
		const failFetch = vi.fn().mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve(emptyFc) }))
			.mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve(matchFc) }))
			.mockImplementationOnce(() => Promise.reject(new Error('network error')));
		vi.stubGlobal('fetch', failFetch);

		const result = await fetchAdminsForCountry('SO01', 'ADM1');
		expect(result!.adm1).toMatchObject({ error: expect.stringContaining('network error') });
	});
});

describe('fetchAdminsForCountry — ADM2 level', () => {
	it('returns adm2 FeatureCollection and adm1 as lines', async () => {
		// Call order: adm2_source_code match (hit) → adm2 by iso3 → adm1 polygons by iso3
		const matchFc = featureCollection(square('S0101'));
		const adm2Fc = featureCollection(square('S0101'), square('S0102'));
		const adm1Fc = featureCollection(square('S01'));
		vi.stubGlobal('fetch', mockFetch(matchFc, adm2Fc, adm1Fc));

		const result = await fetchAdminsForCountry('SO0101', 'ADM2');
		expect(result).toBeDefined();
		expect(result!.adm2).not.toBeNull();
		expect(result!.adm2.type).toBe('FeatureCollection');
		// adm1 is converted to lines
		expect(result!.adm1.type).toBe('FeatureCollection');
		const lineTypes = result!.adm1.features.map((f: any) => f.geometry.type);
		lineTypes.forEach((t: string) => expect(t).toMatch(/Line/));
	});

	it('carries adm1_pcode onto converted line features', async () => {
		const matchFc = featureCollection(square('S0101'));
		const adm2Fc = featureCollection(square('S0101'));
		const adm1Fc = featureCollection(square('S01'));
		vi.stubGlobal('fetch', mockFetch(matchFc, adm2Fc, adm1Fc));

		const result = await fetchAdminsForCountry('SO0101', 'ADM2');
		const lineFeature = result!.adm1.features[0];
		expect(lineFeature.properties?.adm1_pcode).toBe('S01');
	});
});

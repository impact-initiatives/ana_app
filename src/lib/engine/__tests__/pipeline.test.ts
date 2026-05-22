import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ValidationResult } from '$lib/engine/dataValidator';

// ── Mocks (hoisted before imports) ───────────────────────────────────────────

const setFlagResult = vi.fn();
const clearValidatorState = vi.fn();
const setAdminFeatures = vi.fn();
const setAdminFetchState = vi.fn();
const adminFeaturesStore = { cachedKey: null as string | null };

vi.mock('$lib/stores/flagStore.svelte', () => ({ setFlagResult }));
vi.mock('$lib/stores/validatorStore.svelte', () => ({ clearValidatorState }));
vi.mock('$lib/stores/adminFeaturesStore.svelte', () => ({
	adminFeaturesStore,
	setAdminFeatures,
	setAdminFetchState
}));

const mockValidateCsv = vi.fn();
const mockFlagData = vi.fn();
const mockFetchAdmins = vi.fn();

vi.mock('$lib/engine/dataValidator', () => ({ validateCsv: mockValidateCsv }));
vi.mock('$lib/engine/flagger', () => ({ flagData: mockFlagData }));
vi.mock('$lib/engine/fetchAdmin', () => ({ fetchAdminsForCountry: mockFetchAdmins }));

// ── Import under test (after mocks) ──────────────────────────────────────────

const { runPipeline, PipelineError } = await import('$lib/engine/pipeline');

// ── Fixtures ─────────────────────────────────────────────────────────────────

const minimalInput = {
	header: ['uoa', 'MET001'],
	rows: [{ uoa: 'Area_A', MET001: 0.6 }] as Record<string, unknown>[],
	filename: 'test.csv',
	metricMap: {} as any,
	referenceJson: { systems: [] } as any
};

function makeValidationResult(overrides: Partial<ValidationResult> = {}): ValidationResult {
	return {
		ok: true,
		headerErrors: [],
		cellErrors: [],
		warnings: [],
		duplicateUoas: [],
		missingnessMap: [],
		metadataCols: [],
		numericRows: [[0.6]],
		numericObjects: [{ uoa: 'Area_A', MET001: 0.6 }],
		meta: { checkedRows: 1, checkedCols: 2 },
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	adminFeaturesStore.cachedKey = null;
	mockFetchAdmins.mockResolvedValue({ adm1: null, adm2: null });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runPipeline — validation failure', () => {
	it('returns early with null flaggedResult when ok=false', async () => {
		mockValidateCsv.mockReturnValue(makeValidationResult({ ok: false }));

		const result = await runPipeline(minimalInput);

		expect(result.flaggedResult).toBeNull();
		expect(result.adminFetchPromise).toBeNull();
		expect(mockFlagData).not.toHaveBeenCalled();
		expect(setFlagResult).not.toHaveBeenCalled();
	});

	it('returns the validationResult even on early exit', async () => {
		const vr = makeValidationResult({ ok: false });
		mockValidateCsv.mockReturnValue(vr);

		const result = await runPipeline(minimalInput);

		expect(result.validationResult).toBe(vr);
	});

	it('returns early when numericObjects is null', async () => {
		mockValidateCsv.mockReturnValue(makeValidationResult({ ok: true, numericObjects: null }));

		const result = await runPipeline(minimalInput);

		expect(result.flaggedResult).toBeNull();
		expect(mockFlagData).not.toHaveBeenCalled();
	});

	it('returns early when numericObjects is empty', async () => {
		mockValidateCsv.mockReturnValue(makeValidationResult({ ok: true, numericObjects: [] }));

		const result = await runPipeline(minimalInput);

		expect(result.flaggedResult).toBeNull();
		expect(mockFlagData).not.toHaveBeenCalled();
	});
});

describe('runPipeline — missing referenceJson', () => {
	it('throws PipelineError with code reference_not_ready', async () => {
		mockValidateCsv.mockReturnValue(makeValidationResult());

		await expect(
			runPipeline({ ...minimalInput, referenceJson: null })
		).rejects.toThrow(PipelineError);
	});

	it('PipelineError has the correct code', async () => {
		mockValidateCsv.mockReturnValue(makeValidationResult());

		try {
			await runPipeline({ ...minimalInput, referenceJson: null });
		} catch (e) {
			expect(e).toBeInstanceOf(PipelineError);
			expect((e as InstanceType<typeof PipelineError>).code).toBe('reference_not_ready');
		}
	});
});

describe('runPipeline — happy path', () => {
	const flaggedRows = [{ uoa: 'Area_A', MET001: 0.6, prelim_flag: 'ACUTE' }];

	beforeEach(() => {
		mockValidateCsv.mockReturnValue(makeValidationResult());
		mockFlagData.mockReturnValue(flaggedRows);
	});

	it('returns the flagged rows', async () => {
		const result = await runPipeline(minimalInput);
		expect(result.flaggedResult).toEqual(flaggedRows);
	});

	it('calls setFlagResult with flaggedRows and filename', async () => {
		await runPipeline(minimalInput);
		expect(setFlagResult).toHaveBeenCalledWith(flaggedRows, 'test.csv', []);
	});

	it('passes metadataCols from validationResult to setFlagResult', async () => {
		mockValidateCsv.mockReturnValue(makeValidationResult({ metadataCols: ['admin1_name'] }));
		await runPipeline(minimalInput);
		expect(setFlagResult).toHaveBeenCalledWith(flaggedRows, 'test.csv', ['admin1_name']);
	});

	it('calls clearValidatorState', async () => {
		await runPipeline(minimalInput);
		expect(clearValidatorState).toHaveBeenCalledOnce();
	});

	it('calls flagData with numericObjects and referenceJson', async () => {
		const vr = makeValidationResult();
		mockValidateCsv.mockReturnValue(vr);
		await runPipeline(minimalInput);
		expect(mockFlagData).toHaveBeenCalledWith(vr.numericObjects, minimalInput.referenceJson);
	});
});

describe('runPipeline — admin boundary fetch', () => {
	const adm1Rows = [{ uoa: 'SO01', prelim_flag: 'ACUTE' }];
	const adm2Rows = [{ uoa: 'SO0101', prelim_flag: 'ACUTE' }];

	beforeEach(() => {
		mockValidateCsv.mockReturnValue(makeValidationResult());
	});

	it('returns non-null adminFetchPromise when UOAs are ADM1 pcodes', async () => {
		mockFlagData.mockReturnValue(adm1Rows);
		const result = await runPipeline(minimalInput);
		expect(result.adminFetchPromise).not.toBeNull();
	});

	it('calls setAdminFetchState("loading") for ADM1 pcodes', async () => {
		mockFlagData.mockReturnValue(adm1Rows);
		const result = await runPipeline(minimalInput);
		await result.adminFetchPromise;
		expect(setAdminFetchState).toHaveBeenCalledWith('loading');
	});

	it('calls fetchAdminsForCountry with the detected pcode and level', async () => {
		mockFlagData.mockReturnValue(adm1Rows);
		const result = await runPipeline(minimalInput);
		await result.adminFetchPromise;
		expect(mockFetchAdmins).toHaveBeenCalledWith('SO01', 'ADM1');
	});

	it('calls fetchAdminsForCountry with ADM2 level for ADM2 pcodes', async () => {
		mockFlagData.mockReturnValue(adm2Rows);
		const result = await runPipeline(minimalInput);
		await result.adminFetchPromise;
		expect(mockFetchAdmins).toHaveBeenCalledWith('SO0101', 'ADM2');
	});

	it('skips fetch when cachedKey already matches', async () => {
		mockFlagData.mockReturnValue(adm1Rows);
		adminFeaturesStore.cachedKey = 'SO01_ADM1';

		const result = await runPipeline(minimalInput);

		expect(result.adminFetchPromise).toBeNull();
		expect(mockFetchAdmins).not.toHaveBeenCalled();
	});

	it('returns null adminFetchPromise when UOAs are not pcodes', async () => {
		mockFlagData.mockReturnValue([{ uoa: 'Area_A', prelim_flag: 'ACUTE' }]);
		const result = await runPipeline(minimalInput);
		expect(result.adminFetchPromise).toBeNull();
	});

	it('calls setAdminFeatures after successful fetch', async () => {
		const adm1Geo = { type: 'FeatureCollection', features: [] };
		mockFetchAdmins.mockResolvedValue({ adm1: adm1Geo, adm2: null });
		mockFlagData.mockReturnValue(adm1Rows);

		const result = await runPipeline(minimalInput);
		await result.adminFetchPromise;

		expect(setAdminFeatures).toHaveBeenCalledWith(adm1Geo, null, 'SO01_ADM1');
	});

	it('calls setAdminFetchState("error") when fetch rejects', async () => {
		mockFetchAdmins.mockRejectedValue(new Error('network down'));
		mockFlagData.mockReturnValue(adm1Rows);

		const result = await runPipeline(minimalInput);
		await result.adminFetchPromise;

		expect(setAdminFetchState).toHaveBeenCalledWith('error', expect.stringContaining('network down'));
	});
});

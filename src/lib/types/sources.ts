/** Raw row as parsed from the uploaded metric sources CSV. */
export interface MetricSourceRow {
	source: string;
	link: string;
	metric_ids: string;
	uoa: string;
	start_of_data_collection: string;
	end_of_data_collection: string;
}

/** Resolved entry stored in the map and injected into deep-dive XLSX. */
export interface MetricSourceEntry {
	source: string;
	link: string;
	startOfDataCollection: string;
	endOfDataCollection: string;
}

/** Keys: "MET001" (global) or "MET001__AF26" (UoA-specific). */
export type MetricSourcesMap = Record<string, MetricSourceEntry>;

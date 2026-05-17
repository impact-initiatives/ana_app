import { resolve } from '$app/paths';

export type AppRoute = Parameters<typeof resolve>[0];

export type StepDetailSection = {
	label: string;
	body: string;
	route?: AppRoute;
};

export type Step = {
	title: string;
	desc: string;
	detail: {
		sections: StepDetailSection[];
		tip: string | null;
	};
};

export const steps: Step[] = [
	{
		title: 'Upload your CSV',
		desc: 'A \'uoa\' column for units of analysis, plus metric columns (e.g. MET001). Metadata columns are carried through automatically.',
		detail: {
			sections: [
				{
					label: 'uoa column',
					body: 'A column named exactly uoa — a unique identifier per row such as a p-code, district name, or any string that identifies the unit of analysis. If values are valid admin p-codes (e.g. SOM001), a choropleth map is generated automatically.'
				},
				{
					label: 'Metric columns',
					body: 'Named with the metric ID (e.g. MET001, MET002). Unrecognised column names are silently ignored during flagging. Type constraints apply — for example, proportions must be between 0 and 1.'
				},
				{
					label: 'Metadata columns',
					body: 'Extra columns (e.g. region, partner) are carried through and available as filters in results views. If values are p-codes, filter labels are resolved to their admin names automatically.'
				},
				{
					label: 'Values',
					body: 'Must be numeric or empty. No formatted strings, units, or special characters. For missing values, leave the cell empty instead of writing "N/A" or "missing".'
				}
			],
			tip: 'For the full list of metric IDs and type constraints, see the'
		}
	},
	{
		title: 'Automatic flagging',
		desc: 'Values are validated and flagged against thresholds. Results roll up from metrics → subfactors → factors → systems → preliminary flag.',
		detail: {
			sections: [
				{
					label: 'Sanity validation',
					body: 'Each value is checked against per-indicator rules (e.g. rates must be 0–1, counts cannot be negative).If any value fails validation, the validator fails.'
				},
				{
					label: 'Metric flagging',
					body: 'All values are compared against acute needs (AN) thresholds. Exceeding it flags the metric for that UoA.'
				},
				{
					label: 'Roll-up logic',
					body: 'Flags aggregate up: metrics → subfactors → factors → systems. A minimum evidence rule applies at each level — too few valid metrics yields \'Insufficient evidence\' rather than a flag.'
				},
				{
					label: 'Preliminary flag',
					body: 'Each UoA receives one of: EM · RoEM · Acute Needs · No Acute Needs · Insufficient Evidence · No Data — based on the system-level roll-up.'
				}
			],
			tip: null
		}
	},
	{
		title: 'Explore & export',
		desc: 'Browse results by overview, by system, by metric, or look at the coverage. Export as CSV, JSON, XLSX, or per-UoA deep-dive workbooks.',
		detail: {
			sections: [
				{
					label: 'Overview',
					body: 'Preliminary classifications per UoA — donut breakdown and ranked table. Filterable by classification, UoA, or any metadata column.',
					route: '/results#overview'
				},
				{
					label: 'Systems',
					body: 'Interactive heatmap of systems × UoAs with drill-down into factors and metrics. Includes a choropleth map when p-codes are detected.',
					route: '/results#systems'
				},
				{
					label: 'Metrics',
					body: "Per-metric dot strips showing every UoA's value relative to the alert threshold. Filterable by system, factor, and UoA.",
					route: '/results#metrics'
				},
				{
					label: 'Coverage',
					body: 'Circle-packing view of your uploaded data against the full metric framework — shows which systems and factors have data and which are missing.',
					route: '/results#coverage'
				},
				{
					label: 'Export',
					body: 'Download the flagged dataset as CSV, JSON, or XLSX. Or generate one pre-filled deep-dive workbook per UoA — packaged as a single ZIP.',
					route: '/results#export'
				}
			],
			tip: null
		}
	}
];

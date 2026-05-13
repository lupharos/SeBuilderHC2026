export type SoftwareEntry = {
  Version: string | number;
  'General Availability': string | null;
  'End of Sale': string | null;
  'End Of Maintenance': string | null;
  'End Of Support': string | null;
};

export type HardwareEntry = {
  'Model/Version': string;
  'General Availability': string | null;
  'End of Sale': string | null;
  'Last Supported Release': string | number | null;
  'End Of Maintenance': string | null;
  'Last Date for Warranty Extension': string | null;
  'End of Life': string | null;
  'Migration Path': string | number | null;
};

export type VersionDataStore = {
  'Forcepoint Email Security': SoftwareEntry[];
  'Forcepoint Web Security': SoftwareEntry[];
  'Forcepoint Data Security': SoftwareEntry[];
  'DLP + Web Endpoint Agent': SoftwareEntry[];
  'V Series Appliances': HardwareEntry[];
  'NGFW Appliances': HardwareEntry[];
};

export const SOFTWARE_CATEGORIES = [
  'Forcepoint Email Security',
  'Forcepoint Web Security',
  'Forcepoint Data Security',
  'DLP + Web Endpoint Agent',
] as const;

export const HARDWARE_CATEGORIES = [
  'V Series Appliances',
  'NGFW Appliances',
] as const;

export const ALL_CATEGORIES = [...SOFTWARE_CATEGORIES, ...HARDWARE_CATEGORIES] as const;
export type CategoryKey = (typeof ALL_CATEGORIES)[number];

export const SOFTWARE_COLUMNS: (keyof SoftwareEntry)[] = [
  'Version',
  'General Availability',
  'End of Sale',
  'End Of Maintenance',
  'End Of Support',
];

export const HARDWARE_COLUMNS: (keyof HardwareEntry)[] = [
  'Model/Version',
  'General Availability',
  'End of Sale',
  'Last Supported Release',
  'End Of Maintenance',
  'Last Date for Warranty Extension',
  'End of Life',
  'Migration Path',
];

export const INITIAL_VERSION_DATA: VersionDataStore = {
  'Forcepoint Email Security': [
    { Version: '8.5.7', 'General Availability': '2025-12-01', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': null },
    { Version: '8.5.5 - 8.5.6', 'General Availability': '2022-04-29', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2026-12-31' },
    { Version: '8.5.4', 'General Availability': '2020-06-08', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2026-12-31' },
    { Version: '8.5.3', 'General Availability': '2018-12-20', 'End of Sale': null, 'End Of Maintenance': '2022-12-31', 'End Of Support': '2023-12-31' },
    { Version: 8.5, 'General Availability': '2018-02-28', 'End of Sale': null, 'End Of Maintenance': '2021-09-01', 'End Of Support': '2022-09-01' },
    { Version: 8.4, 'General Availability': '2017-08-01', 'End of Sale': null, 'End Of Maintenance': '2021-09-01', 'End Of Support': '2022-09-01' },
  ],
  'Forcepoint Web Security': [
    { Version: '8.5.7', 'General Availability': '2025-07-01', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': null },
    { Version: '8.5.6', 'General Availability': '2024-05-20', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': null },
    { Version: '8.5.5', 'General Availability': '2022-04-29', 'End of Sale': null, 'End Of Maintenance': '2026-03-01', 'End Of Support': '2026-08-01' },
    { Version: '8.5.4', 'General Availability': '2020-06-08', 'End of Sale': null, 'End Of Maintenance': '2024-12-31', 'End Of Support': '2025-04-01' },
    { Version: '8.5.3', 'General Availability': '2018-12-20', 'End of Sale': null, 'End Of Maintenance': '2022-12-31', 'End Of Support': '2023-12-31' },
    { Version: 8.5, 'General Availability': '2018-02-28', 'End of Sale': null, 'End Of Maintenance': '2021-09-01', 'End Of Support': '2022-09-01' },
  ],
  'Forcepoint Data Security': [
    { Version: 10.4, 'General Availability': '2025-11-11', 'End of Sale': null, 'End Of Maintenance': '2027-04-30', 'End Of Support': '2028-04-30' },
    { Version: 10.3, 'General Availability': '2024-12-02', 'End of Sale': null, 'End Of Maintenance': '2026-05-31', 'End Of Support': '2027-05-31' },
    { Version: 10.2, 'General Availability': '2024-02-22', 'End of Sale': null, 'End Of Maintenance': '2025-08-31', 'End Of Support': '2026-08-31' },
    { Version: 10.1, 'General Availability': '2023-07-27', 'End of Sale': null, 'End Of Maintenance': '2025-01-31', 'End Of Support': '2026-01-31' },
    { Version: 10, 'General Availability': '2023-01-26', 'End of Sale': null, 'End Of Maintenance': '2024-08-01', 'End Of Support': '2025-08-01' },
  ],
  'DLP + Web Endpoint Agent': [
    { Version: 26.02, 'General Availability': '2026-02-12', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2027-12-01' },
    { Version: 25.11, 'General Availability': '2025-12-01', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2027-06-01' },
    { Version: 25.09, 'General Availability': '2025-09-30', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2027-06-01' },
    { Version: 25.08, 'General Availability': '2025-08-14', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2027-06-01' },
    { Version: 25.07, 'General Availability': '2025-07-23', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2027-06-01' },
    { Version: 25.06, 'General Availability': '2025-06-26', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2027-06-01' },
    { Version: 25.05, 'General Availability': '2025-05-14', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2026-12-01' },
    { Version: 25.04, 'General Availability': '2025-04-17', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2026-12-01' },
    { Version: 25.03, 'General Availability': '2025-03-11', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2026-12-01' },
    { Version: 25.02, 'General Availability': '2025-02-12', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2026-12-01' },
    { Version: 24.11, 'General Availability': '2024-11-20', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2026-06-01' },
    { Version: 24.07, 'General Availability': '2024-08-07', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2026-06-01' },
    { Version: 24.06, 'General Availability': '2024-06-28', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2026-06-01' },
    { Version: 24.04, 'General Availability': '2024-04-17', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2025-12-01' },
    { Version: 24.03, 'General Availability': '2024-03-28', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2025-12-01' },
    { Version: 23.11, 'General Availability': '2023-10-27', 'End of Sale': null, 'End Of Maintenance': null, 'End Of Support': '2025-06-01' },
  ],
  'V Series Appliances': [
    { 'Model/Version': 'V10000 G4 R2', 'General Availability': '2018-02-28', 'End of Sale': '2024-10-28', 'Last Supported Release': null, 'End Of Maintenance': '2027-10-28', 'Last Date for Warranty Extension': null, 'End of Life': '2029-10-28', 'Migration Path': 'V10000 G5' },
    { 'Model/Version': 'V10000 G5', 'General Availability': '2024-10-28', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'V10000 G3 R2', 'General Availability': '2014-06-30', 'End of Sale': '2015-07-31', 'Last Supported Release': '8.5.3', 'End Of Maintenance': '2018-07-31', 'Last Date for Warranty Extension': '2019-07-31', 'End of Life': '2020-07-31', 'Migration Path': 'V10000 G4 R2' },
    { 'Model/Version': 'V10000 G4', 'General Availability': '2015-07-31', 'End of Sale': '2018-03-31', 'Last Supported Release': null, 'End Of Maintenance': '2021-03-31', 'Last Date for Warranty Extension': '2022-03-31', 'End of Life': '2023-03-31', 'Migration Path': 'V10000 G4 R2' },
    { 'Model/Version': 'V20000 G1', 'General Availability': '2018-06-01', 'End of Sale': '2024-10-28', 'Last Supported Release': null, 'End Of Maintenance': '2027-10-28', 'Last Date for Warranty Extension': null, 'End of Life': '2029-10-28', 'Migration Path': null },
    { 'Model/Version': 'V20000 G5', 'General Availability': '2024-10-28', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'V5000 G5', 'General Availability': '2023-06-15', 'End of Sale': '2026-02-22', 'Last Supported Release': null, 'End Of Maintenance': '2030-02-22', 'Last Date for Warranty Extension': null, 'End of Life': '2031-02-22', 'Migration Path': 'V10000 G5' },
    { 'Model/Version': 'V5000 G4 R2', 'General Availability': '2019-11-15', 'End of Sale': '2023-08-23', 'Last Supported Release': null, 'End Of Maintenance': '2026-08-23', 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': 'V5000 G5' },
    { 'Model/Version': 'V5000 G4', 'General Availability': '2016-10-31', 'End of Sale': '2019-12-31', 'Last Supported Release': null, 'End Of Maintenance': '2022-12-31', 'Last Date for Warranty Extension': '2023-12-31', 'End of Life': '2024-12-31', 'Migration Path': 'V5000 G4 R2' },
  ],
  'NGFW Appliances': [
    { 'Model/Version': 'Forcepoint NGFW 51 Appliance', 'General Availability': '2019-07-08', 'End of Sale': '2021-05-15', 'Last Supported Release': 7.1, 'End Of Maintenance': '2024-05-15', 'Last Date for Warranty Extension': '2025-05-15', 'End of Life': '2026-05-15', 'Migration Path': 'N60' },
    { 'Model/Version': 'Forcepoint NGFW 60 Appliance', 'General Availability': '2021-02-16', 'End of Sale': '2025-08-31', 'Last Supported Release': null, 'End Of Maintenance': '2028-08-31', 'Last Date for Warranty Extension': '2029-08-31', 'End of Life': '2030-08-31', 'Migration Path': 'N61' },
    { 'Model/Version': 'Forcepoint NGFW 60L Appliance', 'General Availability': '2022-12-15', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'Forcepoint NGFW 61 Appliance', 'General Availability': '2025-02-03', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'Forcepoint NGFW 110 Appliance', 'General Availability': '2016-03-15', 'End of Sale': '2019-12-31', 'Last Supported Release': 6.11, 'End Of Maintenance': '2022-10-31', 'Last Date for Warranty Extension': '2023-12-31', 'End of Life': '2024-12-31', 'Migration Path': 'N330, N120' },
    { 'Model/Version': 'Forcepoint NGFW 115 Appliance', 'General Availability': '2016-11-14', 'End of Sale': '2019-12-31', 'Last Supported Release': 6.11, 'End Of Maintenance': '2022-10-31', 'Last Date for Warranty Extension': '2023-12-31', 'End of Life': '2024-12-31', 'Migration Path': 'N330, N120' },
    { 'Model/Version': 'Forcepoint NGFW 120 Appliance', 'General Availability': '2021-12-17', 'End of Sale': '2026-01-01', 'Last Supported Release': null, 'End Of Maintenance': '2029-01-01', 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': 'N130' },
    { 'Model/Version': 'Forcepoint NGFW 120W Appliance', 'General Availability': '2020-07-14', 'End of Sale': '2026-01-01', 'Last Supported Release': null, 'End Of Maintenance': '2029-01-01', 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': 'N130' },
    { 'Model/Version': 'Forcepoint NGFW 120WL (LTE) Appliance', 'General Availability': '2021-05-17', 'End of Sale': '2026-01-01', 'Last Supported Release': null, 'End Of Maintenance': '2029-01-01', 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': 'N125L' },
    { 'Model/Version': 'Forcepoint NGFW 120L (LTE) Appliance', 'General Availability': '2022-08-19', 'End of Sale': '2026-01-01', 'Last Supported Release': null, 'End Of Maintenance': '2029-01-01', 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': 'N125L' },
    { 'Model/Version': 'Forcepoint NGFW 125L Appliance', 'General Availability': '2023-06-01', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'Forcepoint NGFW 130 Appliance', 'General Availability': '2025-10-31', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'Forcepoint NGFW 321 Appliance', 'General Availability': '2014-11-15', 'End of Sale': '2018-12-31', 'Last Supported Release': 6.1, 'End Of Maintenance': '2021-12-31', 'Last Date for Warranty Extension': '2022-12-31', 'End of Life': '2023-12-31', 'Migration Path': 'N330, N120' },
    { 'Model/Version': 'Forcepoint NGFW 325 Appliance', 'General Availability': '2014-11-15', 'End of Sale': '2018-12-31', 'Last Supported Release': 6.1, 'End Of Maintenance': '2021-12-31', 'Last Date for Warranty Extension': '2022-12-31', 'End of Life': '2023-12-31', 'Migration Path': 'N335, N120' },
    { 'Model/Version': 'Forcepoint NGFW 320X Appliance', 'General Availability': '2012-12-10', 'End of Sale': '2018-09-28', 'Last Supported Release': 6.1, 'End Of Maintenance': '2021-09-28', 'Last Date for Warranty Extension': '2022-09-28', 'End of Life': '2023-09-28', 'Migration Path': 'N330 series; note not rugged' },
    { 'Model/Version': 'Forcepoint NGFW 330 Appliance', 'General Availability': '2018-07-01', 'End of Sale': '2023-05-10', 'Last Supported Release': null, 'End Of Maintenance': '2027-05-10', 'Last Date for Warranty Extension': '2027-05-10', 'End of Life': '2028-05-10', 'Migration Path': 'N120' },
    { 'Model/Version': 'Forcepoint NGFW 331 Appliance', 'General Availability': '2018-07-01', 'End of Sale': '2021-05-15', 'Last Supported Release': 7.3, 'End Of Maintenance': '2024-05-15', 'Last Date for Warranty Extension': '2025-05-15', 'End of Life': '2026-05-15', 'Migration Path': 'N335' },
    { 'Model/Version': 'Forcepoint NGFW 335 Appliance', 'General Availability': '2018-07-01', 'End of Sale': '2023-05-10', 'Last Supported Release': null, 'End Of Maintenance': '2027-05-10', 'Last Date for Warranty Extension': '2027-05-10', 'End of Life': '2028-05-10', 'Migration Path': 'N352' },
    { 'Model/Version': 'Forcepoint NGFW 335W Appliance', 'General Availability': '2018-07-01', 'End of Sale': '2021-05-15', 'Last Supported Release': 7.3, 'End Of Maintenance': '2024-05-15', 'Last Date for Warranty Extension': '2025-05-15', 'End of Life': '2026-05-15', 'Migration Path': 'N120W' },
    { 'Model/Version': 'Forcepoint NGFW 352 Appliance', 'General Availability': '2023-02-10', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'Forcepoint NGFW 355 Appliance', 'General Availability': '2023-02-10', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'Forcepoint NGFW 1035 Appliance', 'General Availability': '2013-02-15', 'End of Sale': '2018-12-31', 'Last Supported Release': 6.1, 'End Of Maintenance': '2021-12-31', 'Last Date for Warranty Extension': '2022-12-31', 'End of Life': '2023-12-31', 'Migration Path': 'N1101' },
    { 'Model/Version': 'Forcepoint NGFW 1065 Appliance', 'General Availability': '2013-02-15', 'End of Sale': '2018-12-31', 'Last Supported Release': 6.1, 'End Of Maintenance': '2021-12-31', 'Last Date for Warranty Extension': '2022-12-31', 'End of Life': '2023-12-31', 'Migration Path': 'N1105' },
    { 'Model/Version': 'Forcepoint NGFW 1101 Appliance', 'General Availability': '2017-10-28', 'End of Sale': '2023-05-10', 'Last Supported Release': null, 'End Of Maintenance': '2027-05-10', 'Last Date for Warranty Extension': '2027-05-10', 'End of Life': '2028-05-10', 'Migration Path': 'N355' },
    { 'Model/Version': 'Forcepoint NGFW 1105 Appliance', 'General Availability': '2017-10-28', 'End of Sale': '2023-05-10', 'Last Supported Release': null, 'End Of Maintenance': '2027-05-10', 'Last Date for Warranty Extension': '2027-05-10', 'End of Life': '2028-05-10', 'Migration Path': 'N2201' },
    { 'Model/Version': 'Forcepoint NGFW 1202 Appliance', 'General Availability': '2023-11-28', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'Forcepoint NGFW 1401 Appliance', 'General Availability': null, 'End of Sale': '2017-12-31', 'Last Supported Release': 6.9, 'End Of Maintenance': '2020-12-31', 'Last Date for Warranty Extension': '2021-12-31', 'End of Life': '2022-12-31', 'Migration Path': 'N2101' },
    { 'Model/Version': 'Forcepoint NGFW 1402 Appliance', 'General Availability': '2014-02-15', 'End of Sale': '2018-09-28', 'Last Supported Release': 6.1, 'End Of Maintenance': '2021-09-28', 'Last Date for Warranty Extension': '2022-09-28', 'End of Life': '2023-09-28', 'Migration Path': 'N2105' },
    { 'Model/Version': 'Forcepoint NGFW 2101 Appliance', 'General Availability': '2017-06-27', 'End of Sale': '2023-05-10', 'Last Supported Release': null, 'End Of Maintenance': '2027-05-10', 'Last Date for Warranty Extension': '2027-05-10', 'End of Life': '2028-05-10', 'Migration Path': 'N2205' },
    { 'Model/Version': 'Forcepoint NGFW 2105 Appliance', 'General Availability': '2017-06-27', 'End of Sale': '2023-05-10', 'Last Supported Release': null, 'End Of Maintenance': '2027-05-10', 'Last Date for Warranty Extension': '2027-05-10', 'End of Life': '2028-05-10', 'Migration Path': 'N2210' },
    { 'Model/Version': 'Forcepoint NGFW 2201 Appliance', 'General Availability': '2021-12-17', 'End of Sale': '2026-01-01', 'Last Supported Release': null, 'End Of Maintenance': '2029-01-01', 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': 'N2301' },
    { 'Model/Version': 'Forcepoint NGFW 2205 Appliance', 'General Availability': '2021-12-17', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': 'N2305' },
    { 'Model/Version': 'Forcepoint NGFW 2210 Appliance', 'General Availability': '2021-12-17', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': 'N2310' },
    { 'Model/Version': 'Forcepoint NGFW 2305 Appliance', 'General Availability': '2025-12-01', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'Forcepoint NGFW 2310 Appliance', 'General Availability': '2025-12-01', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'Forcepoint NGFW 3207 Appliance', 'General Availability': null, 'End of Sale': '2017-12-31', 'Last Supported Release': 6.8, 'End Of Maintenance': '2020-12-31', 'Last Date for Warranty Extension': '2021-12-31', 'End of Life': '2022-12-31', 'Migration Path': 'N3405' },
    { 'Model/Version': 'Forcepoint NGFW 3301 Appliance', 'General Availability': '2016-08-28', 'End of Sale': '2021-12-31', 'Last Supported Release': 7.3, 'End Of Maintenance': '2024-12-31', 'Last Date for Warranty Extension': '2025-12-31', 'End of Life': '2026-12-31', 'Migration Path': 'N3401' },
    { 'Model/Version': 'Forcepoint NGFW 3305 Appliance', 'General Availability': '2016-09-23', 'End of Sale': '2021-12-31', 'Last Supported Release': 7.3, 'End Of Maintenance': '2024-12-31', 'Last Date for Warranty Extension': '2025-12-31', 'End of Life': '2026-12-31', 'Migration Path': 'N3405' },
    { 'Model/Version': 'Forcepoint NGFW 3401 Appliance', 'General Availability': '2020-02-29', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'Forcepoint NGFW 3405 Appliance', 'General Availability': '2020-02-29', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': '3505' },
    { 'Model/Version': 'Forcepoint NGFW 3410 Appliance', 'General Availability': '2020-02-29', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': '3505, 3510' },
    { 'Model/Version': 'Forcepoint NGFW 3505 Appliance', 'General Availability': '2025-06-27', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'Forcepoint NGFW 3510 Appliance', 'General Availability': '2024-03-01', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
    { 'Model/Version': 'Forcepoint NGFW 5206 Appliance', 'General Availability': null, 'End of Sale': '2017-03-31', 'Last Supported Release': 6.8, 'End Of Maintenance': '2020-03-31', 'Last Date for Warranty Extension': '2021-03-31', 'End of Life': '2022-03-31', 'Migration Path': 'N3410' },
    { 'Model/Version': 'Forcepoint NGFW 6205 Appliance', 'General Availability': '2017-06-02', 'End of Sale': '2021-12-31', 'Last Supported Release': 7.3, 'End Of Maintenance': '2024-12-31', 'Last Date for Warranty Extension': '2025-12-31', 'End of Life': '2026-12-31', 'Migration Path': 'N3410' },
    { 'Model/Version': 'Forcepoint NGFW SMC 1000 G2 Appliance', 'General Availability': '2017-08-15', 'End of Sale': '2024-12-12', 'Last Supported Release': null, 'End Of Maintenance': '2026-12-12', 'Last Date for Warranty Extension': '2024-12-12', 'End of Life': '2027-12-12', 'Migration Path': 'SMCAPG5' },
    { 'Model/Version': 'Forcepoint NGFW SMC 1000 G5 Appliance', 'General Availability': '2024-12-12', 'End of Sale': null, 'Last Supported Release': null, 'End Of Maintenance': null, 'Last Date for Warranty Extension': null, 'End of Life': null, 'Migration Path': null },
  ],
};

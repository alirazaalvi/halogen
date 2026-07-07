export type StockholmManualDistrictAliasSeed = {
  municipality_code: string;
  display_name: string;
  search_aliases?: string[];
  lat: number;
  lng: number;
  priority?: number;
};

export const STOCKHOLM_MANUAL_DISTRICT_ALIAS_SEEDS: StockholmManualDistrictAliasSeed[] = [
  {
    municipality_code: "0180",
    display_name: "Akalla",
    search_aliases: ["Akalla"],
    lat: 59.4147,
    lng: 17.9125,
    priority: 10,
  },
  {
    municipality_code: "0180",
    display_name: "Kista",
    search_aliases: ["Kista"],
    lat: 59.4024,
    lng: 17.9424,
    priority: 10,
  },
  {
    municipality_code: "0180",
    display_name: "Husby",
    search_aliases: ["Husby"],
    lat: 59.4104,
    lng: 17.9266,
    priority: 10,
  },
  {
    municipality_code: "0180",
    display_name: "Rinkeby",
    search_aliases: ["Rinkeby"],
    lat: 59.3909,
    lng: 17.9283,
    priority: 10,
  },
  {
    municipality_code: "0180",
    display_name: "Tensta",
    search_aliases: ["Tensta"],
    lat: 59.3938,
    lng: 17.9011,
    priority: 10,
  },
  {
    municipality_code: "0163",
    display_name: "Tureberg",
    search_aliases: ["Tureberg", "Centrala Sollentuna", "Sollentuna centrum", "Tureby"],
    lat: 59.4285,
    lng: 17.9492,
    priority: 10,
  },
  {
    municipality_code: "0163",
    display_name: "Rotebro",
    search_aliases: ["Rotebro"],
    lat: 59.4772,
    lng: 17.9142,
    priority: 15,
  },
  {
    municipality_code: "0184",
    display_name: "Frösunda",
    search_aliases: ["Frösunda", "Frosunda"],
    lat: 59.3728,
    lng: 18.0144,
    priority: 10,
  },
  {
    municipality_code: "0184",
    display_name: "Hagalund",
    search_aliases: ["Hagalund"],
    lat: 59.3792,
    lng: 18.0026,
    priority: 15,
  },
  {
    municipality_code: "0183",
    display_name: "Hallonbergen",
    search_aliases: ["Hallonbergen"],
    lat: 59.3753,
    lng: 17.9707,
    priority: 15,
  },
  {
    municipality_code: "0183",
    display_name: "Rissne",
    search_aliases: ["Rissne"],
    lat: 59.3785,
    lng: 17.9413,
    priority: 15,
  },
  {
    municipality_code: "0163",
    display_name: "Helenelund",
    search_aliases: ["Helenelund"],
    lat: 59.4077,
    lng: 17.9591,
    priority: 15,
  },
];

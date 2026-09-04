import type { Coord } from './lib/geo.ts'

export type Waypoint = {
  name: string
  country: string
  at: Coord
  /** Shown to the user as a milestone when they pass it. */
  landmark?: boolean
}

/** A run of waypoints expected to be connected by road. */
export type Stage = {
  kind: 'stage'
  name: string
  waypoints: Waypoint[]
}

/**
 * A gap the road network does not bridge.
 *
 * These are declared rather than discovered, but the build script does not
 * take them on trust: it still asks for a road route first, and only draws a
 * sea arc once routing has actually failed. If a crossing declared here turns
 * out to be drivable, the script says so and uses the road.
 */
export type Crossing = {
  kind: 'crossing'
  from: Waypoint
  to: Waypoint
  reason: string
}

const wp = (name: string, country: string, lon: number, lat: number, landmark = false): Waypoint => ({
  name,
  country,
  at: [lon, lat],
  landmark,
})

// Eastbound circumnavigation, starting and ending in Stockholm. Waypoints are
// spaced closely enough that each stage stays inside ORS's 6,000 km limit and
// dense enough to pin the route to the intended continent-crossing corridors.
export const WORLD_ROUTE: (Stage | Crossing)[] = [
  {
    kind: 'stage',
    name: 'The Baltic to Anatolia',
    waypoints: [
      wp('Stockholm', 'Sweden', 18.07, 59.33, true),
      wp('Copenhagen', 'Denmark', 12.57, 55.68, true),
      wp('Hamburg', 'Germany', 9.99, 53.55),
      wp('Berlin', 'Germany', 13.40, 52.52, true),
      wp('Prague', 'Czechia', 14.42, 50.09, true),
      wp('Vienna', 'Austria', 16.37, 48.21, true),
      wp('Budapest', 'Hungary', 19.04, 47.50, true),
      wp('Belgrade', 'Serbia', 20.46, 44.79),
      wp('Sofia', 'Bulgaria', 23.32, 42.70),
      wp('Istanbul', 'Türkiye', 28.98, 41.01, true),
      wp('Ankara', 'Türkiye', 32.86, 39.93),
    ],
  },
  {
    kind: 'stage',
    name: 'The Caucasus and Persia',
    waypoints: [
      wp('Ankara', 'Türkiye', 32.86, 39.93),
      wp('Trabzon', 'Türkiye', 39.72, 41.00),
      wp('Tbilisi', 'Georgia', 44.80, 41.72, true),
      wp('Baku', 'Azerbaijan', 49.87, 40.41, true),
      // South around the Caspian. The direct crossing to Turkmenbashi is a
      // ferry, and there is a perfectly good road through Iran instead.
      wp('Tehran', 'Iran', 51.39, 35.69, true),
      wp('Mashhad', 'Iran', 59.61, 36.30),
    ],
  },
  {
    kind: 'stage',
    name: 'The Silk Road',
    waypoints: [
      wp('Mashhad', 'Iran', 59.61, 36.30),
      wp('Ashgabat', 'Turkmenistan', 58.38, 37.95),
      wp('Bukhara', 'Uzbekistan', 64.42, 39.77, true),
      wp('Samarkand', 'Uzbekistan', 66.98, 39.65, true),
      wp('Tashkent', 'Uzbekistan', 69.24, 41.30),
      wp('Bishkek', 'Kyrgyzstan', 74.60, 42.87),
      wp('Almaty', 'Kazakhstan', 76.89, 43.24),
      wp('Ürümqi', 'China', 87.62, 43.83),
    ],
  },
  {
    kind: 'stage',
    name: 'Across China',
    waypoints: [
      wp('Ürümqi', 'China', 87.62, 43.83),
      wp('Lanzhou', 'China', 103.83, 36.06),
      wp("Xi'an", 'China', 108.95, 34.34, true),
      wp('Chengdu', 'China', 104.07, 30.57, true),
      wp('Kunming', 'China', 102.83, 24.88),
    ],
  },
  {
    kind: 'stage',
    name: 'Southeast Asia',
    waypoints: [
      wp('Kunming', 'China', 102.83, 24.88),
      wp('Hanoi', 'Vietnam', 105.83, 21.03, true),
      wp('Vientiane', 'Laos', 102.63, 17.97),
      wp('Bangkok', 'Thailand', 100.50, 13.75, true),
      wp('Kuala Lumpur', 'Malaysia', 101.69, 3.14, true),
      wp('Singapore', 'Singapore', 103.82, 1.35, true),
    ],
  },
  {
    kind: 'crossing',
    from: wp('Singapore', 'Singapore', 103.82, 1.35),
    to: wp('Darwin', 'Australia', 130.84, -12.46, true),
    reason:
      'No road reaches Australia. The Indonesian archipelago breaks the land ' +
      'connection and the Timor Sea has no fixed crossing.',
  },
  {
    kind: 'stage',
    name: 'The Australian interior',
    waypoints: [
      wp('Darwin', 'Australia', 130.84, -12.46),
      wp('Alice Springs', 'Australia', 133.88, -23.70, true),
      wp('Adelaide', 'Australia', 138.60, -34.93),
      wp('Melbourne', 'Australia', 144.96, -37.81, true),
      wp('Sydney', 'Australia', 151.21, -33.87, true),
    ],
  },
  {
    kind: 'crossing',
    from: wp('Sydney', 'Australia', 151.21, -33.87),
    to: wp('Santiago', 'Chile', -70.67, -33.45, true),
    reason: 'The South Pacific. The longest crossing on the route by far.',
  },
  {
    kind: 'stage',
    name: 'The Pan-American, southern half',
    waypoints: [
      wp('Santiago', 'Chile', -70.67, -33.45),
      wp('Antofagasta', 'Chile', -70.40, -23.65),
      wp('Lima', 'Peru', -77.04, -12.05, true),
      wp('Guayaquil', 'Ecuador', -79.90, -2.19),
      wp('Quito', 'Ecuador', -78.47, -0.18, true),
      wp('Cali', 'Colombia', -76.52, 3.44),
      wp('Medellín', 'Colombia', -75.56, 6.25, true),
      wp('Turbo', 'Colombia', -76.73, 8.09),
    ],
  },
  {
    kind: 'crossing',
    from: wp('Turbo', 'Colombia', -76.73, 8.09),
    to: wp('Panama City', 'Panama', -79.52, 8.98, true),
    reason:
      'The Darién Gap. The only break in the Pan-American Highway: roughly ' +
      '100 km of roadless rainforest and swamp between Colombia and Panama.',
  },
  {
    kind: 'stage',
    name: 'The Pan-American, northern half',
    waypoints: [
      wp('Panama City', 'Panama', -79.52, 8.98),
      wp('San José', 'Costa Rica', -84.09, 9.93),
      wp('Managua', 'Nicaragua', -86.25, 12.11),
      wp('Guatemala City', 'Guatemala', -90.51, 14.63),
      wp('Oaxaca', 'Mexico', -96.72, 17.06),
      wp('Mexico City', 'Mexico', -99.13, 19.43, true),
      wp('Monterrey', 'Mexico', -100.32, 25.69),
      wp('San Antonio', 'United States', -98.49, 29.42),
      wp('Dallas', 'United States', -96.80, 32.78),
      wp('St. Louis', 'United States', -90.20, 38.63),
      wp('Chicago', 'United States', -87.63, 41.88, true),
      wp('Detroit', 'United States', -83.05, 42.33),
      wp('Toronto', 'Canada', -79.38, 43.65, true),
      wp('Montréal', 'Canada', -73.57, 45.50, true),
      wp('Halifax', 'Canada', -63.57, 44.65),
    ],
  },
  {
    kind: 'crossing',
    from: wp('Halifax', 'Canada', -63.57, 44.65),
    to: wp('Lisbon', 'Portugal', -9.14, 38.72, true),
    reason: 'The North Atlantic.',
  },
  {
    kind: 'stage',
    name: 'Iberia home to the Baltic',
    waypoints: [
      wp('Lisbon', 'Portugal', -9.14, 38.72),
      wp('Madrid', 'Spain', -3.70, 40.42, true),
      wp('Bordeaux', 'France', -0.58, 44.84),
      wp('Paris', 'France', 2.35, 48.86, true),
      wp('Brussels', 'Belgium', 4.35, 50.85),
      wp('Amsterdam', 'Netherlands', 4.90, 52.37, true),
      wp('Hamburg', 'Germany', 9.99, 53.55),
      // Around Jutland rather than the Puttgarden ferry, and over the Øresund
      // bridge into Sweden — both genuine road connections.
      wp('Copenhagen', 'Denmark', 12.57, 55.68),
      wp('Stockholm', 'Sweden', 18.07, 59.33),
    ],
  },
]

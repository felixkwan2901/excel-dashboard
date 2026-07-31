// Christchurch, NZ
const LATITUDE = -43.532
const LONGITUDE = 172.6306
const CACHE_KEY = 'cde-weather-cache'
const CACHE_MS = 30 * 60 * 1000 // 30 minutes

const FORECAST_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
  '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
  '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
  '&timezone=auto&forecast_days=1'

// WMO weather codes -> { condition label, emoji icon }.
// https://open-meteo.com/en/docs (see "WMO Weather interpretation codes")
const WEATHER_CODES = {
  0: { condition: 'Clear sky', icon: '☀️' },
  1: { condition: 'Mostly clear', icon: '🌤️' },
  2: { condition: 'Partly cloudy', icon: '⛅' },
  3: { condition: 'Overcast', icon: '☁️' },
  45: { condition: 'Fog', icon: '🌫️' },
  48: { condition: 'Fog', icon: '🌫️' },
  51: { condition: 'Light drizzle', icon: '🌦️' },
  53: { condition: 'Drizzle', icon: '🌦️' },
  55: { condition: 'Heavy drizzle', icon: '🌦️' },
  61: { condition: 'Light rain', icon: '🌧️' },
  63: { condition: 'Rain', icon: '🌧️' },
  65: { condition: 'Heavy rain', icon: '🌧️' },
  71: { condition: 'Light snow', icon: '🌨️' },
  73: { condition: 'Snow', icon: '🌨️' },
  75: { condition: 'Heavy snow', icon: '🌨️' },
  80: { condition: 'Rain showers', icon: '🌦️' },
  81: { condition: 'Rain showers', icon: '🌦️' },
  82: { condition: 'Violent showers', icon: '⛈️' },
  95: { condition: 'Thunderstorm', icon: '⛈️' },
  96: { condition: 'Thunderstorm', icon: '⛈️' },
  99: { condition: 'Thunderstorm', icon: '⛈️' },
}

/**
 * @typedef {Object} WeatherData
 * @property {number} tempC - current temperature, Celsius
 * @property {string} condition - short condition label (e.g. "Partly cloudy")
 * @property {string} icon - emoji representing the condition
 * @property {number} high - today's forecast high, Celsius
 * @property {number} low - today's forecast low, Celsius
 * @property {number} rainChance - chance of rain today, 0-100
 * @property {number} windKph - current wind speed, km/h
 * @property {number} humidity - current relative humidity, 0-100
 * @property {string} location - display location label
 * @property {number} updatedAt - epoch ms when this data was fetched
 */

function normalize(json) {
  const weatherInfo = WEATHER_CODES[json.current.weather_code] ?? {
    condition: 'Unknown',
    icon: '🌡️',
  }
  return {
    tempC: Math.round(json.current.temperature_2m),
    condition: weatherInfo.condition,
    icon: weatherInfo.icon,
    high: Math.round(json.daily.temperature_2m_max[0]),
    low: Math.round(json.daily.temperature_2m_min[0]),
    rainChance: Math.round(json.daily.precipitation_probability_max[0] ?? 0),
    windKph: Math.round(json.current.wind_speed_10m),
    humidity: Math.round(json.current.relative_humidity_2m),
    location: 'Christchurch, NZ',
    updatedAt: Date.now(),
  }
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw)
    if (Date.now() - cached.updatedAt > CACHE_MS) return null
    return cached
  } catch {
    return null
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // localStorage unavailable (private browsing, quota) — safe to ignore,
    // it only affects caching, not correctness.
  }
}

/**
 * Fetches current weather + today's forecast for Christchurch, NZ.
 * Serves a cached response (localStorage) if it's under 30 minutes old,
 * to avoid unnecessary network calls (e.g. on every remount).
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<WeatherData>}
 */
export async function fetchWeather({ force = false } = {}) {
  if (!force) {
    const cached = readCache()
    if (cached) return cached
  }

  const res = await fetch(FORECAST_URL)
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`)
  const json = await res.json()
  const data = normalize(json)
  writeCache(data)
  return data
}

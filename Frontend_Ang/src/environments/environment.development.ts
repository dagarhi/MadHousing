const maptilerKey = process.env['NG_APP_MAPTILER_KEY'] ?? '';

export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8000',
  mapStyleLight:  `https://api.maptiler.com/maps/streets-v4-pastel/style.json?key=${maptilerKey}`,
  mapStyleDark: `https://api.maptiler.com/maps/streets-v4-dark/style.json?key=${maptilerKey}`,
  orsApiKey: process.env['NG_APP_ORS_API_KEY'] ?? '',
};

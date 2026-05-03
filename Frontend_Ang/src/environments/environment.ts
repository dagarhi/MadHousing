const maptilerKey = process.env['NG_APP_MAPTILER_KEY'] ?? '';

export const environment = {
  production: true,
  apiBaseUrl: 'https://madhousing-backend-37799814091.europe-southwest1.run.app',
  mapStyleLight:  `https://api.maptiler.com/maps/streets-v4-pastel/style.json?key=${maptilerKey}`,
  mapStyleDark: `https://api.maptiler.com/maps/streets-v4-dark/style.json?key=${maptilerKey}`,
  orsApiKey: process.env['NG_APP_ORS_API_KEY'] ?? '',
};

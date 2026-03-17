INSERT OR IGNORE INTO drone_fleet (
  id,
  model,
  role,
  callsign,
  status,
  battery_cycles,
  home_base,
  created_at
)
VALUES
  (1, 'DJI Inspire 3', 'cinematic', 'AURORA-01', 'ready', 184, 'Chisinau HQ', '2026-03-10T08:10:00.000Z'),
  (2, 'DJI Mavic 3 Thermal', 'thermal scan', 'VECTOR-02', 'ready', 126, 'Balti Field Node', '2026-03-10T08:15:00.000Z'),
  (3, 'DJI Agras T50', 'agro spray', 'HARVEST-03', 'charging', 88, 'Cahul Agro Bay', '2026-03-10T08:20:00.000Z'),
  (4, 'DJI Matrice 350 RTK', 'survey', 'ATLAS-04', 'maintenance', 211, 'Orhei Survey Hub', '2026-03-10T08:25:00.000Z');

INSERT OR IGNORE INTO hangar_logs (
  id,
  drone_id,
  mission_code,
  mission_type,
  sector,
  status,
  pilot_name,
  battery_delta,
  summary,
  logged_at
)
VALUES
  (1, 1, 'CINE-771', 'Filmare cinematica', 'Vadul lui Voda', 'completed', 'M. Rusu', -31, 'Secventa golden-hour capturata pentru campanie auto.', '2026-03-16T15:20:00.000Z'),
  (2, 2, 'THERM-442', 'Inspectie industriala', 'Balti Nord', 'completed', 'A. Dragan', -24, 'Punct cald detectat pe un transformator exterior.', '2026-03-16T13:05:00.000Z'),
  (3, 3, 'AGRO-208', 'Agricultura de precizie', 'Cahul Est', 'charging', 'V. Pavaloi', -46, 'Harta de stres hidric actualizata pentru 180 ha.', '2026-03-16T10:40:00.000Z'),
  (4, 4, 'MAP-903', 'Mapare 3D', 'Orheiul Vechi', 'maintenance scheduled', 'L. Gaina', -18, 'Calibrare RTK ceruta dupa vant lateral puternic.', '2026-03-15T17:15:00.000Z'),
  (5, 1, 'NIGHT-118', 'Filmare cinematica', 'Chisinau Center', 'completed', 'S. Sava', -22, 'Cadre nocturne stabile livrate pentru teaser urban.', '2026-03-15T20:45:00.000Z');


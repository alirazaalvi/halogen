-- Insert all 13 Stockholm County municipalities
INSERT INTO municipalities (id, name, code, population) VALUES
(1, 'Stockholm', '0180', 975551),
(2, 'Sollentuna', '0163', 70000),
(3, 'Solna', '0184', 80000),
(4, 'Täby', '0160', 75000),
(5, 'Sundbyberg', '0183', 42000),
(6, 'Järfälla', '0123', 110000),
(7, 'Upplands Väsby', '0114', 48000),
(8, 'Danderyd', '0162', 36000),
(9, 'Lidingö', '0186', 45000),
(10, 'Nacka', '0182', 103000),
(11, 'Huddinge', '0126', 104000),
(12, 'Botkyrka', '0127', 90000),
(13, 'Haninge', '0136', 82000)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, population = EXCLUDED.population;

-- Add districts for Stockholm (municipality_id = 1)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('STH-OSTERMALM', 'Östermalm', 1, ST_GeomFromText('POINT(18.08 59.33)')),
('STH-GAMLA-STAN', 'Gamla Stan', 1, ST_GeomFromText('POINT(18.07 59.33)')),
('STH-KUNGSHOLMEN', 'Kungsholmen', 1, ST_GeomFromText('POINT(18.03 59.32)')),
('STH-SODERMALM', 'Södermalm', 1, ST_GeomFromText('POINT(18.07 59.30)')),
('STH-VASASTAN', 'Vasastan', 1, ST_GeomFromText('POINT(18.05 59.35)')),
('STH-BLAAKEBERG', 'Blåkeberg', 1, ST_GeomFromText('POINT(18.01 59.34)')),
('STH-RIDDARHOLMEN', 'Riddarholmen', 1, ST_GeomFromText('POINT(18.06 59.32)')),
('STH-SKEPPSHOLMEN', 'Skeppsholmen', 1, ST_GeomFromText('POINT(18.08 59.31)')),
('STH-NORRMALM-S', 'Norrmalm Söder', 1, ST_GeomFromText('POINT(18.06 59.33)')),
('STH-ROPSTEN', 'Ropsten', 1, ST_GeomFromText('POINT(18.10 59.36)')),
('STH-DROTTNING', 'Drottningholm', 1, ST_GeomFromText('POINT(17.98 59.30)')),
('STH-NORRMALM', 'Norrmalm', 1, ST_GeomFromText('POINT(18.07 59.34)')),
('STH-DJURGARDEN', 'Djurgården', 1, ST_GeomFromText('POINT(18.12 59.32)')),
('STH-MALARHOJDEN', 'Mälarhöjden', 1, ST_GeomFromText('POINT(18.02 59.31)')),
('STH-NORRMALM-N', 'Norrmalm Nord', 1, ST_GeomFromText('POINT(18.07 59.35)')),
('STH-RINKEBY', 'Rinkeby', 1, ST_GeomFromText('POINT(17.92 59.39)')),
('STH-HUSBY', 'Husby', 1, ST_GeomFromText('POINT(17.90 59.40)'))
ON CONFLICT (id) DO NOTHING;

-- Add districts for Sollentuna (municipality_id = 2)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('SOLLN-BROTORP', 'Brotorp', 2, ST_GeomFromText('POINT(17.95 59.42)')),
('SOLLN-CENTRALA', 'Centrala Sollentuna', 2, ST_GeomFromText('POINT(17.93 59.41)')),
('SOLLN-DANDERYD', 'Danderydsvägen', 2, ST_GeomFromText('POINT(17.94 59.40)')),
('SOLLN-JARVA', 'Järvastaden', 2, ST_GeomFromText('POINT(17.96 59.42)')),
('SOLLN-ROTEBRO', 'Rotebro', 2, ST_GeomFromText('POINT(17.88 59.39)')),
('SOLLN-TUREBY', 'Tureby', 2, ST_GeomFromText('POINT(17.91 59.38)'))
ON CONFLICT (id) DO NOTHING;

-- Add districts for Solna (municipality_id = 3)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('SOLNA-ARSTADAL', 'Årstadal', 3, ST_GeomFromText('POINT(18.05 59.36)')),
('SOLNA-BERGSUND', 'Bergsund', 3, ST_GeomFromText('POINT(18.02 59.37)')),
('SOLNA-CENTRALA', 'Centrala Solna', 3, ST_GeomFromText('POINT(18.04 59.37)')),
('SOLNA-HAGALUND', 'Hagalund', 3, ST_GeomFromText('POINT(18.08 59.38)')),
('SOLNA-HAGERSTENS', 'Hägerstensåsen', 3, ST_GeomFromText('POINT(18.06 59.36)')),
('SOLNA-VASTRA', 'Västra Solna', 3, ST_GeomFromText('POINT(18.01 59.37)'))
ON CONFLICT (id) DO NOTHING;

-- Add districts for Täby (municipality_id = 4)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('TABY-CENTRALA', 'Centrala Täby', 4, ST_GeomFromText('POINT(18.32 59.43)')),
('TABY-FRESTA', 'Fresta', 4, ST_GeomFromText('POINT(18.35 59.44)')),
('TABY-HELENELUND', 'Helenelund', 4, ST_GeomFromText('POINT(18.30 59.42)')),
('TABY-LINDHOLMEN', 'Lindholmen', 4, ST_GeomFromText('POINT(18.31 59.41)')),
('TABY-RUNBY', 'Runby', 4, ST_GeomFromText('POINT(18.28 59.44)')),
('TABY-STOCKHOLM', 'Stockholmsvägen', 4, ST_GeomFromText('POINT(18.34 59.42)'))
ON CONFLICT (id) DO NOTHING;

-- Add districts for Sundbyberg (municipality_id = 5)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('SUNDB-BROTORP', 'Brotorp', 5, ST_GeomFromText('POINT(17.96 59.35)')),
('SUNDB-CENTRALA', 'Centrala Sundbyberg', 5, ST_GeomFromText('POINT(17.95 59.36)')),
('SUNDB-DUVBO', 'Duvbo', 5, ST_GeomFromText('POINT(17.92 59.36)')),
('SUNDB-HALLONBERGEN', 'Hallonbergen', 5, ST_GeomFromText('POINT(17.98 59.35)')),
('SUNDB-LILLAALSVIK', 'Lilla Alsvik', 5, ST_GeomFromText('POINT(17.93 59.37)')),
('SUNDB-RISSNE', 'Rissne', 5, ST_GeomFromText('POINT(17.94 59.33)')),
('SUNDB-STORARSVIK', 'Stora Ursvik', 5, ST_GeomFromText('POINT(17.91 59.34)')),
('SUNDB-STORSKOGEN', 'Storskogen', 5, ST_GeomFromText('POINT(17.97 59.34)'))
ON CONFLICT (id) DO NOTHING;

-- Add districts for Järfälla (municipality_id = 6)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('JARFALLA-CENTRALA', 'Centrala Järfälla', 6, ST_GeomFromText('POINT(17.86 59.35)')),
('JARFALLA-JARFALLA', 'Järfälla by', 6, ST_GeomFromText('POINT(17.85 59.35)')),
('JARFALLA-KULLBY', 'Kullbyverken', 6, ST_GeomFromText('POINT(17.82 59.36)')),
('JARFALLA-LINDKVARN', 'Lindkvarn', 6, ST_GeomFromText('POINT(17.83 59.33)')),
('JARFALLA-LOTSVERKEN', 'Lotsverken', 6, ST_GeomFromText('POINT(17.88 59.32)')),
('JARFALLA-SKARHEDEN', 'Skärholmen', 6, ST_GeomFromText('POINT(17.84 59.34)'))
ON CONFLICT (id) DO NOTHING;

-- Add districts for Upplands Väsby (municipality_id = 7)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('UPVSBY-CENTRALA', 'Centrala Väsby', 7, ST_GeomFromText('POINT(17.58 59.47)')),
('UPVSBY-EDSBERG', 'Edsberg', 7, ST_GeomFromText('POINT(17.62 59.49)')),
('UPVSBY-HOLMBY', 'Holmby', 7, ST_GeomFromText('POINT(17.55 59.46)')),
('UPVSBY-LINDAHL', 'Lindahl', 7, ST_GeomFromText('POINT(17.60 59.48)')),
('UPVSBY-URSVIK', 'Ursvik', 7, ST_GeomFromText('POINT(17.57 59.45)')),
('UPVSBY-VASYCENTR', 'Väsby centrum', 7, ST_GeomFromText('POINT(17.59 59.47)'))
ON CONFLICT (id) DO NOTHING;

-- Add districts for Danderyd (municipality_id = 8)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('DAND-CENTRALA', 'Centrala Danderyd', 8, ST_GeomFromText('POINT(18.43 59.37)')),
('DAND-DJURSHOLM', 'Djursholm', 8, ST_GeomFromText('POINT(18.46 59.38)')),
('DAND-JORLUNDE', 'Jörlundevägen', 8, ST_GeomFromText('POINT(18.41 59.36)')),
('DAND-ROSLAGSBRO', 'Roslags-Bro', 8, ST_GeomFromText('POINT(18.45 59.39)')),
('DAND-TURINGE', 'Turinge', 8, ST_GeomFromText('POINT(18.40 59.35)'))
ON CONFLICT (id) DO NOTHING;

-- Add districts for Lidingö (municipality_id = 9)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('LIDING-CENTRALA', 'Centrala Lidingö', 9, ST_GeomFromText('POINT(18.46 59.35)')),
('LIDING-ELFVIK', 'Elfvik', 9, ST_GeomFromText('POINT(18.51 59.32)')),
('LIDING-GADDVIKEN', 'Gäddviken', 9, ST_GeomFromText('POINT(18.48 59.34)')),
('LIDING-LIDINGOBY', 'Lidingö by', 9, ST_GeomFromText('POINT(18.49 59.35)')),
('LIDING-NACKA', 'Nacka strand', 9, ST_GeomFromText('POINT(18.42 59.33)'))
ON CONFLICT (id) DO NOTHING;

-- Add districts for Nacka (municipality_id = 10)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('NACKA-CENTRALA', 'Centrala Nacka', 10, ST_GeomFromText('POINT(18.36 59.30)')),
('NACKA-DANVIKTULL', 'Danvikstull', 10, ST_GeomFromText('POINT(18.33 59.28)')),
('NACKA-FISKSATRA', 'Fisksätra', 10, ST_GeomFromText('POINT(18.38 59.27)')),
('NACKA-GULLMARS', 'Gullmarsvägen', 10, ST_GeomFromText('POINT(18.35 59.29)')),
('NACKA-SALTSJOBA', 'Saltsjöbaden', 10, ST_GeomFromText('POINT(18.41 59.26)'))
ON CONFLICT (id) DO NOTHING;

-- Add districts for Huddinge (municipality_id = 11)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('HUDD-CENTRALA', 'Centrala Huddinge', 11, ST_GeomFromText('POINT(18.16 59.24)')),
('HUDD-FARSTA', 'Farsta', 11, ST_GeomFromText('POINT(18.19 59.22)')),
('HUDD-GRANSHILL', 'Granshill', 11, ST_GeomFromText('POINT(18.13 59.23)')),
('HUDD-HOGDALEN', 'Högdalen', 11, ST_GeomFromText('POINT(18.20 59.25)')),
('HUDD-JORDBRO', 'Jordbro', 11, ST_GeomFromText('POINT(18.14 59.21)')),
('HUDD-TYRESO', 'Tyresö', 11, ST_GeomFromText('POINT(18.25 59.20)'))
ON CONFLICT (id) DO NOTHING;

-- Add districts for Botkyrka (municipality_id = 12)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('BOTKYRKA-ALBY', 'Alby', 12, ST_GeomFromText('POINT(17.82 59.21)')),
('BOTKYRKA-CENTRALA', 'Centrala Botkyrka', 12, ST_GeomFromText('POINT(17.88 59.20)')),
('BOTKYRKA-FITTJA', 'Fittja', 12, ST_GeomFromText('POINT(17.84 59.18)')),
('BOTKYRKA-GRODINGE', 'Grödinge', 12, ST_GeomFromText('POINT(17.90 59.17)')),
('BOTKYRKA-RONNINGE', 'Rönninge', 12, ST_GeomFromText('POINT(17.92 59.19)')),
('BOTKYRKA-SEGELTORP', 'Segeltorp', 12, ST_GeomFromText('POINT(17.86 59.22)'))
ON CONFLICT (id) DO NOTHING;

-- Add districts for Haninge (municipality_id = 13)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('HANINGE-CENTRALA', 'Centrala Haninge', 13, ST_GeomFromText('POINT(18.18 59.11)')),
('HANINGE-DALARO', 'Dalarö', 13, ST_GeomFromText('POINT(18.43 58.97)')),
('HANINGE-EKERO', 'Ekerö', 13, ST_GeomFromText('POINT(17.95 59.18)')),
('HANINGE-NYNASHAMN', 'Nynäshamn', 13, ST_GeomFromText('POINT(18.72 58.85)')),
('HANINGE-OSMO', 'Ösmo', 13, ST_GeomFromText('POINT(18.28 59.02)')),
('HANINGE-VASTERHAN', 'Västerhaninge', 13, ST_GeomFromText('POINT(18.08 59.08)'))
ON CONFLICT (id) DO NOTHING;

-- Insert placeholder scores for all new districts
INSERT INTO district_scores (district_id, overall_score, schools_score, transport_score, green_areas_score)
SELECT d.id, 75.0, 75.0, 75.0, 75.0
FROM districts d
WHERE NOT EXISTS (SELECT 1 FROM district_scores WHERE district_id = d.id)
ON CONFLICT (district_id) DO NOTHING;

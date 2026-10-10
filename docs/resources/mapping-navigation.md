# Mapping, GIS and navigation tools, data feeds and APIs

Web and mobile map libraries (MapLibre GL JS and Native, Leaflet, OpenLayers, CesiumJS), navigation apps (Organic Maps, OsmAnd, CoMaps), tile servers and hosted tiles (Martin, OpenFreeMap), routing and trip planning (OpenTripPlanner, OSRM, Valhalla, GraphHopper), geospatial servers (GeoServer, PostGIS), geocoding, OpenStreetMap tooling, geo-processing libraries in 12 languages, desktop GIS, map styles and location SDKs. It also holds every tool, API and data feed used by God's Eye View (formerly WorldView), Bilawal Sidhu and Sameh Khamis's open-source 3D globe: CesiumJS, Google Photorealistic 3D Tiles, Cesium ion, OpenSky, adsb.lol, AISStream, CelesTrak, USGS, NASA FIRMS and GIBS, NOAA and ECMWF weather, TomTom traffic, public traffic cameras, GTFS-Realtime feeds, Mapillary and the OpenAI Realtime API (search `gods-eye-view`). Tested Genlib code for common map math lives in the geo, tile-math, polyline and geometry capabilities.

Repositories were checked with `git ls-remote`, packages and versions with each registry's API, and licenses read from registry metadata or the LICENSE file on 2026-10-10; installs are pinned. Hosted APIs and data feeds were link-checked and carry their provider terms. OpenStreetMap-derived data is ODbL (attribution and share-alike on the data); OsmAnd and GeoServer are GPL; several vendor SDKs wrap paid services.

## Find and install

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" quick vector map web --target "$APP_ROOT"
node "$GENLIB_ROOT/bin/genlib.mjs" find gods-eye-view --type resource --limit 8
node "$GENLIB_ROOT/bin/genlib.mjs" capability inspect tile-math --language python
```

## Coverage

| Language | Records |
| --- | ---: |
| typescript | 239 |
| python | 157 |
| go | 33 |
| rust | 52 |
| java | 58 |
| kotlin | 15 |
| csharp | 28 |
| ruby | 19 |
| php | 18 |
| dart | 30 |
| swift | 16 |
| elixir | 11 |
| any | 138 |

Total: 814 records in `resources/catalog/mapping-navigation*.json`.

## Web map libraries

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `react-leaflet`, `react-leaflet-core`, `react-map-gl`, `vis-gl-react-maplibre`, `loaders-gl-core` | Hippocratic-2.1, MIT |
| python | `pydeck`, `folium`, `keplergl` (review), `streamlit-folium` (review), `ipyleaflet` | Apache-2.0, MIT |
| rust | `walkers`, `galileo` | MIT, MIT OR Apache-2.0 |

## Mobile map SDKs

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `react-native-maps`, `maplibre-maplibre-react-native`, `expo-maps`, `stadiamaps-ferrostar-webcomponents` | BSD-3-Clause, MIT |
| rust | `ferrostar-navigation-sdk` | BSD-3-Clause |
| java | `org-mapsforge-mapsforge-map-android`, `osmbonuspack`, `org-mapsforge-vtm` | LGPL-3.0 |
| kotlin | `org-maplibre-gl-android-sdk`, `com-google-maps-android-maps-compose`, `org-maplibre-compose-maplibre-compose`, `org-maplibre-gl-android-plugin-annotation-v9` | Apache-2.0, BSD-2-Clause, BSD-3-Clause |
| csharp | `brutile`, `microsoft-maui-controls-maps`, `mapsui`, `gmap-net-core`, `mapsui-maui` | Apache-2.0, MIT |
| dart | `google-maps-flutter`, `flutter-map`, `flutter-osm-plugin`, `flutter-map-marker-cluster`, `flutter-map-location-marker` | BSD-3-Clause, MIT |
| swift | `cluster-mapkit-clustering`, `google-maps-ios-utils`, `maplibre-swiftui-dsl`, `google-maps-sdk-for-ios-swiftpm` (review), `maplibre-native-ios-swiftpm` | Apache-2.0, BSD-2-Clause, BSD-3-Clause, Google Maps Platform Terms (proprietary binary), MIT |
| any | `maplibre-native`, `libosmscout` (review) | BSD-2-Clause, LGPL (with app-store exceptions) |

## Open-source navigation and map apps

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `openrailwaymap` (review), `brouter-web`, `osrm-frontend`, `graphhopper-maps-web-ui`, `maproulette` | Apache-2.0, BSD-2-Clause, GPL-3.0, MIT |
| python | `umap` (review), `transitous`, `pure-maps` (review) | AGPL-3.0, CC0-1.0, GPL-3.0 |
| java | `osmand` (review), `osmtracker-for-android` (review), `vespucci` (review) | Apache-2.0 (presets partly CC-BY-SA/GPL-3.0), GPL-3.0, GPL-3.0 (with additional restrictions on some assets) |
| kotlin | `streetcomplete` (review), `trail-sense`, `transportr` (review), `scee-streetcomplete-expert-edition` (review), `cyclestreets-android` (review) | GPL-3.0, MIT |
| dart | `every-door` (review), `openstop` (review) | GPL-3.0 |
| swift | `go-map` | ISC |
| any | `organic-maps`, `comaps`, `navit`, `osmand-ios` (review), `osm-scout-server` (review) | Apache-2.0, GPL-2.0 (most code; some parts LGPL), GPL-3.0, GPL-3.0 (code); CC-BY-NC-ND-4.0 (artwork) |

## Routing engines and trip planners

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `otp-react-redux-otp-ui`, `vroom-express` | BSD-2-Clause, MIT |
| python | `routingpy`, `pyvalhalla`, `gtfs-kit`, `pandana` (review), `python-r5py` (review) | AGPL-3.0-or-later, Apache-2.0, GPL-3.0-or-later or MIT, MIT |
| rust | `fast-paths` | MIT/Apache-2.0 |
| java | `com-graphhopper-graphhopper-core`, `graphhopper`, `opentripplanner`, `openrouteservice-github` (review), `com-graphhopper-jsprit-core` | Apache-2.0, GPL-3.0 |
| csharp | `itinero` | Apache-2.0 |
| any | `project-osrm-osrm`, `osrm-open-source-routing-machine`, `valhalla`, `vroom-vehicle-routing-optimizer`, `pgrouting` (review) | BSD-2-Clause, GPL-2.0, MIT |

## Tile servers and tile tooling

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `mapbox-vector-tile`, `geojson-vt`, `vt-pbf`, `pmtiles`, `mapbox-sphericalmercator` (review) | BSD-3-Clause, ISC, MIT |
| python | `mercantile`, `morecantile`, `rio-tiler`, `pmtiles-pypi`, `rio-cogeo` | BSD-3-Clause, MIT |
| go | `tegola`, `pg-tileserv`, `mbtileserver`, `go-pmtiles` | Apache-2.0, BSD-3-Clause, ISC, MIT |
| rust | `pmtiles-crates`, `versatiles`, `mbtiles`, `martin`, `martin-github` | Apache-2.0, MIT, MIT OR Apache-2.0 |
| java | `com-onthegomap-planetiler-planetiler-core`, `planetiler`, `maplibre-tile-mlt-spec` | Apache-2.0 |
| any | `mapnik`, `tilemaker` (review), `tippecanoe`, `openstreetmap-tile-server-docker`, `mod-tile-renderd` (review) | Apache-2.0, BSD-2-Clause, FTWPL (permissive), GPL-2.0, LGPL-2.1 |

## Geospatial servers and databases

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `mapstore`, `qwc2-qgis-web-client` | BSD-2-Clause, BSD-3-Clause |
| python | `pystac`, `apache-sedona`, `pystac-client`, `geonode` (review), `geoparquet-specification` | Apache-2.0, GPL-3.0 |
| go | `tile38`, `pg-featureserv` | Apache-2.0, MIT |
| rust | `sedonadb` | Apache-2.0 |
| java | `geoserver` (review), `apache-sedona-github`, `geonetwork` (review), `h2gis`, `deegree` | Apache-2.0, GPL-2.0, LGPL-2.1, LGPL-3.0 |
| php | `lizmap-web-client` | MPL-2.0 |
| any | `qgis-server` (review), `h3`, `s2-geometry`, `postgis` (review), `geomesa` | Apache-2.0, GPL-2.0 |

## Geocoding and place search

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `geo-tz`, `node-geocoder`, `which-polygon`, `rapideditor-country-coder`, `geocodio-library-node` | ISC, MIT |
| python | `geopy`, `timezonefinder` (review), `usaddress`, `opencage`, `reverse-geocoder` | BSD-3-Clause, MIT, lgpl |
| go | `geo-golang` | MIT |
| rust | `reverse-geocoder-crates`, `geocoding` | MIT OR Apache-2.0 |
| java | `photon` | Apache-2.0 |
| ruby | `geocoder` | MIT |
| php | `willdurand-geocoder`, `geocoder-php-google-maps-provider`, `toin0u-geocoder-laravel`, `geocoder-php-nominatim-provider`, `opencage-geocode` | BSD-2-Clause, MIT |
| dart | `geocoding-pub` | MIT |
| any | `libpostal`, `pelias-docker`, `google-geocoding-api`, `google-places-api`, `osm-nominatim-public-api` | Google Maps Platform Terms, MIT, ODbL-1.0 data |

## Geospatial processing libraries

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `types-geojson`, `d3-geo`, `kdbush`, `earcut`, `supercluster` | ISC, MIT |
| python | `shapely`, `pyproj`, `python-h3`, `geopandas`, `pyogrio` | Apache-2.0, BSD-3-Clause, MIT |
| go | `go-geo`, `go-orb`, `go-geom`, `geohash-go`, `h3-go` | Apache-2.0, BSD-2-Clause, MIT |
| rust | `rstar`, `geo-types`, `robust`, `rust-geo`, `geographiclib-rs` | MIT, MIT OR Apache-2.0 |
| java | `org-hibernate-orm-hibernate-spatial`, `org-gdal-gdal`, `org-apache-sedona-sedona-spark-shaded-3-5-2-12`, `org-locationtech-jts-jts-core`, `geotools` | Apache-2.0, EPL-2.0 OR EDL-1.0, LGPL-2.1, MIT |
| kotlin | `org-maplibre-spatialk-geojson`, `org-maplibre-spatialk-turf` | MIT |
| csharp | `nettopologysuite`, `microsoft-entityframeworkcore-sqlserver-nettopologysuite`, `npgsql-nettopologysuite`, `geojson-net`, `npgsql-entityframeworkcore-postgresql-nettopologysuite` | BSD-3-Clause, MIT, postgresql |
| ruby | `ruby-rgeo`, `geokit`, `activerecord-postgis-adapter`, `geokit-rails`, `rgeo-geojson` | BSD-3-Clause, MIT |
| php | `mjaschen-phpgeo`, `matanyadaev-laravel-eloquent-spatial`, `brick-geo`, `jmikola-geojson`, `league-geotools` | MIT |
| dart | `latlong2`, `dart-gpx`, `geojson-vi`, `dart-geohash`, `dart-turf` | Apache-2.0, MIT |
| swift | `geoswift`, `coregpx`, `turf-for-swift`, `geohash-swift`, `geoswiftmapkit` | ISC, MIT |
| elixir | `elixir-geo`, `geo-postgis`, `geocalc`, `distance`, `geohash-hex` | Apache-2.0, MIT |
| any | `gdal`, `proj`, `geos`, `earcut-hpp`, `libspatialindex` | ISC, LGPL-2.1, MIT, MIT (with per-file notices) |

## OpenStreetMap data tools

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `osmtogeojson`, `osm-auth`, `osm-api`, `id-editor`, `overpass-turbo` | ISC, MIT |
| python | `osmium`, `overpy`, `overturemaps`, `pyrosm`, `quackosm` | Apache-2.0, BSD-2-Clause, MIT |
| go | `imposm3`, `go-osm`, `osmpbf-go` | Apache-2.0, MIT |
| rust | `osmpbfreader`, `osmpbf`, `osm2streets` | Apache-2.0, MIT OR Apache-2.0, WTFPL |
| java | `osmosis` (review), `josm`, `geodesk-for-java`, `overture-tiles`, `ohsome-api` (review) | AGPL-3.0, Apache-2.0, MIT, unknown |
| ruby | `openstreetmap-website` (review), `taginfo` (review) | GPL-2.0, GPL-3.0 |
| any | `osm2pgsql` (review), `overpass-api` (review), `osmium-tool` (review), `libosmium`, `osmexpress-osmx` | AGPL-3.0, BSD-3-Clause, GPL-2.0, GPL-3.0, bsl-1.0 |

## Desktop GIS

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `webodm` (review) | AGPL-3.0 |
| python | `whitebox`, `opendronemap-odm` (review), `grass-addons` (review) | AGPL-3.0, GPL-2.0, MIT |
| rust | `whiteboxtools` | MIT |
| java | `udig` (review) | unknown |
| dart | `smash-field-mapping` (review) | GPL-3.0 |
| any | `cloudcompare` (review), `pdal`, `qfield` (review), `gpxsee` (review), `grass-gis` (review) | BSD-3-Clause, GPL-2.0, GPL-2.0-or-later, GPL-3.0 |

## Map styles, fonts, icons and base data

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `maplibre-maplibre-gl-style-spec`, `us-atlas`, `protomaps-basemaps`, `mapbox-maki`, `geostyler-sld-parser` | BSD-2-Clause, BSD-3-Clause, CC0-1.0, ISC |
| python | `natural-earth-vector`, `openmaptiles-tools`, `geoboundaries` | CC-BY-4.0, MIT, Public Domain (data) |
| rust | `spreet` | MIT |
| any | `fontnik` (review), `openmaptiles`, `openstreetmap-carto`, `opentopomap` (review), `cyclosm` | Apache-2.0, BSD-3-Clause, BSD-3-Clause (code); CC-BY-4.0 (schema/design), CC-BY-SA, CC0-1.0 |

## Location SDKs and API clients

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `googlemaps-js-api-loader`, `mapbox-gl` (review), `googlemaps-markerclusterer`, `expo-location`, `vis-gl-react-google-maps` | Apache-2.0, MIT, Mapbox ToS (proprietary, source-available) |
| python | `geoip2`, `googlemaps`, `google-maps-places`, `google-maps-routing`, `flexpolyline` | Apache-2.0, MIT |
| go | `georoutes`, `location`, `geoip2-golang` | Apache-2.0, ISC |
| rust | `maxminddb`, `aws-sdk-location`, `aws-sdk-georoutes` | Apache-2.0, ISC |
| java | `software-amazon-awssdk-geoplaces`, `software-amazon-awssdk-location`, `com-azure-azure-maps-route`, `com-azure-azure-maps-search`, `com-google-maps-google-maps-services` | Apache-2.0, MIT |
| kotlin | `com-google-maps-android-android-maps-utils`, `mapbox-navigation-android` (review), `mapbox-maps-sdk-android` (review), `com-stadiamaps-api` | Apache-2.0, BSD-3-Clause, Mapbox ToS (proprietary, source-available) |
| csharp | `maxmind-geoip2`, `microsoft-maui-essentials`, `googleapi`, `googlemapsapi`, `awssdk-locationservice` | Apache-2.0, BSD-2-Clause, MIT |
| ruby | `aws-sdk-locationservice`, `maxmind-geoip2-gem` | Apache-2.0, Apache-2.0, MIT |
| php | `geoip2-geoip2` | Apache-2.0 |
| dart | `geolocator`, `location-pub`, `flutter-background-geolocation` (review), `mapbox-maps-flutter` (review), `flutter-radar` | Apache-2.0, MIT, MIT (iOS); paid license required for Android release builds, Mapbox ToS (proprietary) |
| swift | `mapbox-navigation-ios` (review), `mapbox-maps-sdk-ios` (review), `arcgis-maps-sdk-for-swift` (review), `stadia-maps-api-swift` | BSD-3-Clause, Esri proprietary (MLA), Mapbox ToS (proprietary, source-available) |
| any | `geoclue` (review), `openai-realtime-api` | GPL-2.0-or-later, OpenAI terms |

## 3D globe apps (God's Eye View) and launchers

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `gods-eye-view` (review), `pinokio` | MIT |

## Hosted imagery, 3D tile and terrain services

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| any | `cesium-ion`, `esri-world-imagery`, `google-photorealistic-3d-tiles-map-tiles-api`, `mapterhorn-terrain`, `re-earth-terrain` | CC-BY-4.0 terrain, Cesium ion Terms, Esri Master Agreement, Google Maps Platform Terms |

## Street-level imagery

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| any | `google-street-view-static-api`, `kartaview`, `mapillary-api`, `panoramax` | CC-BY-SA-4.0 imagery, Google Maps Platform Terms, Open licence per instance |

## Hosted routing services

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| any | `osrm-on-fossgis-servers` | ODbL-1.0 data |

## Live aircraft, ship, satellite and launch feeds

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| any | `adsb-lol-api`, `adsbdb` (review), `aisstream`, `celestrak`, `launch-library-2-the-space-devs` | Beta, no formal terms, No published data license, ODbL-1.0 data, The Space Devs terms, US-government-origin data |

## Transit and micromobility data (GTFS, GTFS-RT, GBFS)

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `gtfs-realtime-bindings` (review) | Apache-2.0 |
| any | `entur-api-norway`, `gbfs-general-bikeshare-feed-specification`, `gtfs-realtime-capmetro-austin`, `gtfs-realtime-mbta-boston`, `gtfs-realtime-metro-transit-minneapolis-st-paul` | CC-BY-4.0, CapMetro open data terms, MassDOT developers license, Metropolitan Council open data terms, NLOD |

## Earthquake, fire and Earth-observation feeds

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| any | `inciweb`, `nasa-cmr`, `nasa-firms`, `nasa-gibs`, `nifc-wfigs-wildfire-data` | US government information, US public domain |

## Weather data and forecast services

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| any | `ecmwf-open-data`, `noaa-gfs-on-aws-open-data`, `noaa-nhc-cphc-tropical-advisories`, `noaa-nowcoast`, `open-meteo` | CC-BY-4.0, CC-BY-4.0 data, AGPL-3.0 code, NOAA disclaimer, NWS public data, US public domain |

## Traffic flow and public traffic cameras

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| any | `caltrans-cwwp2-cameras`, `city-of-austin-open-data-traffic-cameras`, `deldot-traffic-cameras`, `drivebc`, `fintraffic-digitraffic` | CC-BY-4.0, City of Austin Open Data Terms, DelDOT terms, Open Government Licence - British Columbia, Public Caltrans data |

## News and event feeds

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| any | `gdelt-doc-2-0-api`, `google-news-rss` (review) | GDELT terms (citation required), Google News Terms |


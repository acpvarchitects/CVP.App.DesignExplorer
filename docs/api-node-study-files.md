# Study file endpoint: caching, compression and Range

**Open reminder, to carry over when this repository migrates to Iride.** Nothing to change in this
repository: the fix belongs to the service that serves the study files (api-node today). It is kept
here as a file because Issues are not enabled on this repository.

Written on 2026-11-14.

## Problem

The 3D analysis page (`v2/analysis.html`) downloads, per option, `field.bin` (18 MB) and `model.glb`
(13-15 MB). A two-option comparison is 66 MB, and nothing of it is kept between visits.

Measured on 2026-11-14 on the office LAN, in a headless Chrome with the real GPU and an empty cache,
comparing `ZRCH_261113_HotelNoise_Option01_Updated_Paths_Grid1p6_143951` and
`ZRCH_261113_HotelNoise_Option02_Updated_Paths_Grid1p6_SectionFixed_v1`: about 4.5 s until both
viewers are ready, of which 2-3 s are these downloads. The page's own computation is 0.16-0.38 s per
option, so the download is the bottleneck. On VPN or Wi-Fi it will be worse.

## What the endpoint does today

`GET http://api-node.acpv.local/dev/v1/design-explorer/projects/<project>/<file>`

- No `ETag`, no `Last-Modified`, no `Cache-Control`, no `Content-Length`: the browser cannot cache or
  revalidate, so every visit downloads everything again.
- No compression: `Accept-Encoding: gzip, br` is ignored.
- `Range` is ignored (200 with the whole file), although CORS already exposes `ETag`, `Accept-Ranges`
  and `Content-Range`.
- CORS accepts the origin `http://localhost:<port>` but not `http://127.0.0.1:<port>`. This only
  matters for local tests: the browser tests in `scripts/` need `scripts/serve-local.py`, which
  proxies the API.

## What is needed

1. `ETag` (or `Last-Modified`) and `Cache-Control` on the study files, so a repeat visit revalidates
   instead of downloading 30+ MB per option.
2. `Content-Length`.
3. gzip or brotli for `.bin`, `.glb`, `.json` and `.svg`.
4. `Range` support. `field.bin` holds every scenario one after the other (offsets in `volume.json`),
   so the page could fetch only the scenario on screen and the mask: 7 MB instead of 18 MB.

When the study files move to Iride, the new endpoint should have these from the start.

## Decided not to do in the page

A browser-side cache (IndexedDB keyed by `volume.json.fieldSha256`) was considered and set aside on
2026-11-14: it is a workaround for the missing HTTP caching, and the model has no hash in the export.

## Related, on the exporter side

- `vegetationDelta` can be derived from the other two fields: dropping it makes `field.bin` a third
  smaller.
- float16 fields and a compressed GLB would cut the rest.
- A `modelSha256` in the export would let any cache key the model too.

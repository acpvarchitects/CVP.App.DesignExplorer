# Generation-based clustering

Upload these **additional** files beside the study's existing `data.csv` and GLBs:

- `generation.csv`: one row per option, ID plus numeric generation features.
- `generation.json`: feature definition, ID join and compatibility contract.
- `generation_source.csv`: optional original generator input, retained for provenance.

Existing metric CSVs, GLBs and analyses need no re-export. These are inputs to a
browser-side reduction, not additional analytical results. No server code or
database migration is required. A study without generation files keeps working;
its clustering control explains why the reduction is unavailable.

## Generic numerical vectors

Example `generation.csv`:

```csv
option,tower_spacing,rotation,height
1,35,0,60
2,40,15,70
```

Corresponding `generation.json`:

```json
{
  "version": 1,
  "file": "generation.csv",
  "key_column": "option",
  "join_column": "in:Index",
  "feature_space": "my-generator-v1-metres-degrees",
  "features": ["tower_spacing", "rotation", "height"],
  "scaling": "standardize",
  "description": "Tower spacing, rotation and height from the generator."
}
```

The ID is joined **inside its own study**. Equal IDs in different studies stay
distinct. Numeric spellings such as `1` and `1.0` join; duplicate, empty and
nonfinite feature values are rejected. Extra generator rows not exported in the
study are allowed. Every option surviving the other filters needs a vector.

Only pool studies with exactly the same feature-space identity, ordered feature
names and scaling. Standardization, when requested, is joint over the currently
eligible options across all selected studies. Constant features are removed.
Use `none` only for vectors that already share meaningful units and weights.
Never use option IDs, author IDs, filenames or categorical labels as distances.
Raw rotation angles need periodic encoding (`sin`, `cos`) rather than direct
degree differences if 0° and 360° should be identical.

## Building-per-row geometry CSVs

The project's tower CSV stores one building per row, including apartment/core
polygons. It is not a fixed-dimensional numerical vector: different building
counts and arbitrary names prevent directly flattening these rows into k-means.

`scripts/prepare-generation.py` converts that format using the source project's
canonical, headless `building_parser.py` (`parse`, `footprint_m2`, `Building.world`,
`Building.tiles`, `Building.height`). Python and numpy are required. It makes
one vector per exported option, independent of building IDs and row order:

- A fixed site grid represents footprint coverage and height above each
  building's ground. Both channels carry equal weights. Default 10 m cells,
  four subcell samples (5 m spacing); building placement/orientation is retained.
- The same XY frame, grid, height scale and feature weights are reused across
  batches. No per-option rotation or recentering. The feature-space identity is
  the SHA256 of this full specification.
- It verifies option IDs and exported footprint values before writing and stores
  the original source's SHA256. This does **not** prove the entire generator
  revision matches an export: select the actual immutable source used to export.
- Interior apartment layouts, precise subgrid facade details, terrain elevation
  and analysis scores are not features. This is an approximation of site massing,
  not a metric of every architectural quality. Nearby alternatives may be grouped
  together; inspect representatives and adjust k.

### Optional v2 descriptor: layout and apartment aspects

The saved site specification can use `version: 2` with
`block_weights: {"site": 0.8, "layout": 0.2}` and
`layout: {"schema": "floor-plan-aspects-v1", "plan_grid": 12, "aspect_bins": 8}`.
This is a data preparation setting, with no additional interface controls.
V1 remains supported for older studies; v1 and v2 are incompatible for pooling.

V2 scales blocks by square roots of their weights, so squared Euclidean distance
is `0.8 * siteDistance² + 0.2 * layoutDistance²`. The site block remains unchanged.
The layout block combines a normalized local 12×12 plan grid (core mask, apartment
mask and apartment centroid fields), world-oriented exterior apartment aspects,
and six compact plan summaries (unit/core counts, core fraction, plan proportions,
unit compactness and perimeter). It aggregates typology composition by residential
apartment floor area. Internal layouts here mean unit/core polygons, not room layouts.

Aspect extraction subtracts unions of shared collinear edge intervals, including
partially shared edges, before computing outward unit normals. Core facades and
party walls are excluded. Normals are rotated by the building's model rotation and
interpolated into eight periodic direction bins. Mean directions plus per-unit
direction-pair moments distinguish single- and multi-aspect unit distributions.
This models facade orientation, not actual windows, unobstructed views, daylight,
sunlight or visibility. The original analyses continue to measure those effects.

The layout block weights plan, aspects and summaries 60/30/10 internally; these
constants, grids and normalizations define the versioned algorithm. Actual
distance contributions also depend on how much each property varies in the pool.
Changing apartment row order or IDs has no effect. Fixed building frames retain
local plan organization; world aspects explicitly retain orientation. Coarse grids
and averaged typology mixtures do not encode every exact plan or tower adjacency.

Use `--vector-file generation-v2.csv` to write a new file; upload this CSV before
replacing `generation.json`, which points to it. Keep older vectors available for
rollback. Updating multiple studies can briefly make mixed feature versions
unavailable until all manifests match; the dashboard reports this instead of
silently mixing incompatible vectors. Reload after metadata changes.

Example, using absolute or caller-relative paths:

```sh
python scripts/prepare-generation.py --parser path/to/building_parser.py \
  --spec site-feature-spec.json \
  --study path/to/source_A.csv path/to/study_A/data.csv output_A \
  --study path/to/source_B.csv path/to/study_B/data.csv output_B
```

On the first call only, the specification is created around the union of the
provided studies, rounded outwards to the grid. **Keep it for later studies.**
Future options outside its bounds are refused; extending the frame requires
regenerating vectors for every study that should be clustered together. Upload
the three generated files in each output folder into that study's own prefix.

## Filtering and reproducibility

Clustering captures the methods selected when enabled and groups that combined
base pool, not one batch at a time. Measurement ranges, Pareto, batch bars and
subsequent method toggles only hide representatives from this fixed base; they
do not enter fitting, standardization or representative choice. Five seeded
k-means++ starts followed by Lloyd iterations select minimum inertia. The
algorithm is deterministic for the same ordered inputs, specification and k.
It is not a guarantee of the global optimum. Exact duplicate vectors remain
together; requesting more clusters than distinct vectors returns fewer groups.

Closest-to-centroid chooses a real member, not a synthetic option. Best-on-result
changes only this representative and uses the result's higher/lower direction;
ties prefer the member closer to the centroid. If a whole cluster has no finite
score, it falls back to the centroid representative and reports that count.

Changing filters preserves groups, numbering and representatives, including when
no representatives survive. A filtered representative is not replaced by another
passing member. Clearing those filters restores exactly the same representatives.
Changing k refits the same base; changing representative mode/metric chooses
different members of the same groups. Turn clustering off and on to capture a
different set of methods as its base. Hiding a result axis keeps the existing
representative criterion intact.
Clear the Clustering section to restore all eligible options. Clear chart filters
also clears clustering. Selection state is retained in the URL (`clusters`,
`cbase`, `crep`, `cdir`); `cbase=all` means all loaded studies independently of
current method filters. Old URLs without cbase capture their selected methods.
Copy link continues to copy the unfiltered study home page.

Tests: `node scripts/test-clustering.mjs` and
`python scripts/test-prepare-generation.py` (numpy required for the latter).

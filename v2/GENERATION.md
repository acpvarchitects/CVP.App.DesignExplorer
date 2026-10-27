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

Clustering follows method selection, batch bars, measurement ranges and Pareto.
It groups the combined eligible pool, not one batch at a time. Five seeded
k-means++ starts followed by Lloyd iterations select minimum inertia. The
algorithm is deterministic for the same ordered inputs, specification and k.
It is not a guarantee of the global optimum. Exact duplicate vectors remain
together; requesting more clusters than distinct vectors returns fewer groups.

Closest-to-centroid chooses a real member, not a synthetic option. Best-on-result
changes only this representative and uses the result's higher/lower direction;
ties prefer the member closer to the centroid. If a whole cluster has no finite
score, it falls back to the centroid representative and reports that count.

Changing upstream filters recomputes groups; numbering is local to that view.
Clear the Clustering section to restore all eligible options. Clear chart filters
also clears clustering. Selection state is retained in the URL (`clusters`,
`crep`, `cdir`); Copy link continues to copy the unfiltered study home page.

Tests: `node scripts/test-clustering.mjs` and
`python scripts/test-prepare-generation.py` (numpy required for the latter).

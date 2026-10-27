"""Prepare comparable one-row-per-option massing vectors from building CSVs.

No Rhino/GH solve. Uses the project's canonical parser and verifies exported
footprint values before writing. A reusable specification fixes XY frame,
grid, height scale and feature weights across every future batch.
"""
import argparse
import csv
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
import numpy as np


def inside(x, y, polygon):
    mask = np.zeros(len(x), dtype=bool)
    for i, (ax, ay) in enumerate(polygon):
        bx, by = polygon[(i + 1) % len(polygon)]
        if by == ay:
            continue
        mask ^= ((ay > y) != (by > y)) & (x < (bx - ax) * (y - ay) / (by - ay) + ax)
    return mask


def vectors(buildings, spec):
    xmin, ymin, xmax, ymax = spec['bounds_m']
    step, supersample = spec['cell_m'], spec['samples_per_axis']
    nx, ny = round((xmax-xmin)/step), round((ymax-ymin)/step)
    # Grid cells in y/x order, then fixed subcell samples.
    x, y = np.meshgrid(xmin + (np.arange(nx*supersample)+0.5)*step/supersample,
                       ymin + (np.arange(ny*supersample)+0.5)*step/supersample)
    x, y = x.ravel(), y.ravel()
    occupancy, heights = np.zeros(len(x)), np.zeros(len(x))
    for b in buildings:
        polygons = [b.world(p) for p in b.tiles]
        pts = [p for poly in polygons for p in poly]
        if any(px < xmin or px > xmax or py < ymin or py > ymax for px,py in pts):
            raise ValueError('Building outside feature frame; use the SAME expanded spec for every study')
        hit = np.zeros(len(x), dtype=bool)
        for polygon in polygons:
            hit |= inside(x,y,polygon)
        occupancy[hit] = 1
        heights[hit] = np.maximum(heights[hit], b.height/spec['height_scale_m'])
    def average(a):
        return a.reshape(ny,supersample,nx,supersample).mean(axis=(1,3)).ravel()
    # Equal weights for coverage and height channels; no per-cell z-score.
    return np.concatenate([average(occupancy),average(heights)]) / math.sqrt(2*nx*ny)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--parser',required=True,type=Path)
    ap.add_argument('--study',action='append',nargs=3,metavar=('SOURCE_CSV','DATA_CSV','OUTPUT_DIR'),required=True)
    ap.add_argument('--spec',required=True,type=Path,help='Read existing specification; create it from all studies only on the first invocation')
    args=ap.parse_args()
    module=importlib.util.spec_from_file_location('canonical_building_parser',args.parser)
    bp=importlib.util.module_from_spec(module);module.loader.exec_module(bp)
    studies=[];all_points=[]
    for source,data,out in args.study:
        source,data,out=Path(source),Path(data),Path(out)
        rows=list(csv.DictReader(data.open(encoding='utf-8-sig')))
        indices=[int(r['in:Index']) for r in rows]
        if len(indices)!=len(set(indices)):raise ValueError('Duplicate exported indices')
        buildings=[]
        for row,index in zip(rows,indices):
            bs=bp.parse(str(source),index)
            if not bs or abs(bp.footprint_m2(bs)-float(row['out:Footprint [m²]']))>1e-5:
                raise ValueError('Source/export mismatch for option '+str(index))
            buildings.append(bs)
            all_points.extend(p for b in bs for tile in b.tiles for p in b.world(tile))
        studies.append((source,out,indices,buildings))
    if args.spec.exists():spec=json.loads(args.spec.read_text(encoding='utf-8'))
    else:
        step=10
        spec={'version':1,'kind':'site-massing-grid','units':'metres','axes':'model XY, fixed north; no recentering or rotation',
              'bounds_m':[math.floor(min(p[0] for p in all_points)/step)*step-step,
                          math.floor(min(p[1] for p in all_points)/step)*step-step,
                          math.ceil(max(p[0] for p in all_points)/step)*step+step,
                          math.ceil(max(p[1] for p in all_points)/step)*step+step],
              'cell_m':step,'samples_per_axis':2,'height_scale_m':80,
              'channels':['footprint coverage','height above local building ground'],
              'weights':[0.5,0.5]}
        args.spec.parent.mkdir(parents=True,exist_ok=True)
        args.spec.write_text(json.dumps(spec,indent=2),encoding='utf-8')
    signature=hashlib.sha256(json.dumps(spec,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    for source,out,indices,buildings in studies:
        out.mkdir(parents=True,exist_ok=True)
        feature_rows=[vectors(bs,spec) for bs in buildings]
        features=['f%04d'%i for i in range(len(feature_rows[0]))]
        with (out/'generation.csv').open('w',encoding='utf-8',newline='') as f:
            writer=csv.writer(f);writer.writerow(['option',*features])
            for index,values in zip(indices,feature_rows):writer.writerow([index,*[format(float(v),'.12g') for v in values]])
        shutil.copy2(source,out/'generation_source.csv')
        manifest={'version':1,'file':'generation.csv','key_column':'option','join_column':'in:Index',
                  'feature_space':'site-massing-grid-v1:'+signature,'features':features,'scaling':'none',
                  'source_file':'generation_source.csv','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                  'description':'Building placement, footprint and height on a shared 10 m grid; 5 m subcell sampling. Building names and row order do not affect similarity. Interior layouts and environmental results are not clustering features.',
                  'specification':spec}
        (out/'generation.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
        print(json.dumps({'output':str(out),'options':len(indices),'features':len(features),'feature_space':manifest['feature_space']}))


if __name__=='__main__':main()

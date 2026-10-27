"""Typical-floor layout and apartment aspect descriptors; no Rhino dependency.

Local plan coordinates describe apartment/core organization. World-oriented
exterior apartment edges describe aspects, excluding shared unit/core walls.
"""
import math
import numpy as np


def area_centroid(poly):
    cross=[poly[i][0]*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*poly[i][1] for i in range(len(poly))]
    twice=sum(cross)
    if abs(twice)<1e-10:raise ValueError('Degenerate plan polygon')
    center=[sum((poly[i][j]+poly[(i+1)%len(poly)][j])*cross[i] for i in range(len(poly)))/(3*twice) for j in (0,1)]
    return abs(twice)/2,center,1 if twice>0 else -1


def perimeter(poly):
    return sum(math.dist(p,poly[(i+1)%len(poly)]) for i,p in enumerate(poly))


def exposed_edges(poly,others,tol=1e-6):
    """Return unit edge + exact unshared length, including partially shared edges."""
    for i,p in enumerate(poly):
        q=poly[(i+1)%len(poly)];length=math.dist(p,q)
        if length<tol:continue
        ux,uy=(q[0]-p[0])/length,(q[1]-p[1])/length
        intervals=[]
        for other in others:
            for j,r in enumerate(other):
                t=other[(j+1)%len(other)]
                if any(abs((v[0]-p[0])*uy-(v[1]-p[1])*ux)>tol for v in (r,t)):continue
                a,b=sorted(((r[0]-p[0])*ux+(r[1]-p[1])*uy,(t[0]-p[0])*ux+(t[1]-p[1])*uy))
                a,b=max(0,a),min(length,b)
                if b-a>tol:intervals.append((a,b))
        end=0;shared=0
        for a,b in sorted(intervals):
            shared+=max(0,b-max(a,end));end=max(end,b)
        if length-shared>tol:yield ux,uy,length-shared


def unit_aspects(poly,others,rotation_deg,bins=8):
    """Smooth periodic histogram of world outward normals, weighted by exposure length."""
    _,_,winding=area_centroid(poly)
    result=np.zeros(bins);angle=math.radians(rotation_deg);c,s=math.cos(angle),math.sin(angle)
    for ux,uy,length in exposed_edges(poly,others):
        nx,ny=winding*uy,-winding*ux
        nx,ny=nx*c-ny*s,nx*s+ny*c
        at=(math.atan2(ny,nx)%(2*math.pi))*bins/(2*math.pi)
        lower=math.floor(at);fraction=at-lower
        result[lower%bins]+=length*(1-fraction);result[(lower+1)%bins]+=length*fraction
    if result.sum()>0:result/=result.sum()
    return result


def layout_vector(buildings,inside,settings):
    grid,bins=settings['plan_grid'],settings['aspect_bins']
    size=4*grid*grid+bins+bins*bins+6
    total=np.zeros(size);weight_total=0
    for b in buildings:
        levels=[l for l in b.levels if l.use=='residential']
        if not levels:raise ValueError('No residential floor layout')
        level=levels[0];units=[p for _,p in level.units];cores=level.cores
        points=[p for poly in units+cores for p in poly]
        low=np.min(points,axis=0);high=np.max(points,axis=0);span=max(high-low)
        if span<=0:raise ValueError('Empty floor plate')
        center=(low+high)/2
        xs,ys=np.meshgrid(center[0]+((np.arange(grid)+.5)/grid-.5)*span,
                          center[1]+((np.arange(grid)+.5)/grid-.5)*span)
        x,y=xs.ravel(),ys.ravel();plan=np.zeros((4,len(x)))
        for poly in cores:plan[0,inside(x,y,poly)]=1
        unit_areas=[];compactness=[];aspects=[]
        for i,poly in enumerate(units):
            area,centroid,_=area_centroid(poly);unit_areas.append(area)
            compactness.append(4*math.pi*area/perimeter(poly)**2)
            hit=inside(x,y,poly);plan[1,hit]=1
            plan[2,hit]=.5+(centroid[0]-center[0])/span
            plan[3,hit]=.5+(centroid[1]-center[1])/span
            aspects.append(unit_aspects(poly,units[:i]+units[i+1:]+cores,b.rot,bins))
        weights=np.asarray(unit_areas)/sum(unit_areas)
        # Joint moments distinguish single-aspect units from dual-aspect units
        # even when the whole building has the same aggregate exterior directions.
        mean=np.average(aspects,axis=0,weights=weights)
        joint=sum(w*np.outer(a,a) for w,a in zip(weights,aspects))
        core_area=sum(area_centroid(p)[0] for p in cores)
        summary=np.array([len(units)/12,len(cores)/4,core_area/(core_area+sum(unit_areas)),
                          min(high-low)/span,np.average(compactness,weights=weights),
                          np.average([perimeter(p) for p in units],weights=weights)/(4*span)])
        vector=np.concatenate([math.sqrt(.6)*plan.ravel()/math.sqrt(plan.size),
                               math.sqrt(.3)*np.concatenate([mean,joint.ravel()])/math.sqrt(2),
                               math.sqrt(.1)*summary/math.sqrt(len(summary))])
        # Weight typology composition by residential apartment floor area.
        weight=sum(unit_areas)*len(levels)
        total+=weight*vector;weight_total+=weight
    return total/weight_total

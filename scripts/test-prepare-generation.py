"""Numerical tests for the site descriptor, with no model or Rhino dependency."""
import importlib.util
from pathlib import Path
import unittest
import numpy as np
import math
from types import SimpleNamespace
from layout_features import exposed_edges,unit_aspects,layout_vector

spec=importlib.util.spec_from_file_location('prepare',Path(__file__).with_name('prepare-generation.py'))
prepare=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepare)

class Building:
    def __init__(self,x=0,height=40):
        self.x=x;self.height=height;self.tiles=[[(0,0),(10,0),(10,10),(0,10)]]
    def world(self,p):return [(x+self.x,y) for x,y in p]

class DescriptorTests(unittest.TestCase):
    settings={'bounds_m':[0,0,40,20],'cell_m':10,'samples_per_axis':2,'height_scale_m':80}
    def test_coverage_height_and_names_independent_of_order(self):
        a,b=Building(0,40),Building(20,80)
        v=prepare.vectors([a,b],self.settings)
        np.testing.assert_array_equal(v,prepare.vectors([b,a],self.settings))
        self.assertEqual(len(v),16)
        self.assertAlmostEqual(v[0],.25)
        self.assertAlmostEqual(v[8],.125)
        self.assertAlmostEqual(v[10],.25)
        self.assertEqual(v[1],0)
    def test_placement_and_height_are_meaningful(self):
        v=prepare.vectors([Building()],self.settings)
        self.assertFalse(np.array_equal(v,prepare.vectors([Building(20)],self.settings)))
        self.assertFalse(np.array_equal(v,prepare.vectors([Building(0,80)],self.settings)))
    def test_different_frame_is_not_silently_clipped(self):
        with self.assertRaisesRegex(ValueError,'outside feature frame'):
            prepare.vectors([Building(40)],self.settings)

class LayoutTests(unittest.TestCase):
    settings={'plan_grid':12,'aspect_bins':8}
    left=[(0,0),(5,0),(5,10),(0,10)]
    right=[(5,0),(10,0),(10,10),(5,10)]
    def building(self,units=None,cores=None,rot=0):
        units=units or [self.left,self.right]
        return SimpleNamespace(rot=rot,levels=[SimpleNamespace(use='residential',units=[('',p) for p in units],cores=cores or [])])
    def test_partial_party_wall_removed_exactly(self):
        core=[(5,2),(8,2),(8,8),(5,8)]
        self.assertAlmostEqual(sum(n for _,_,n in exposed_edges(self.left,[core])),24)
        self.assertAlmostEqual(sum(n for _,_,n in exposed_edges(self.left,[self.right])),20)
    def test_aspects_rotate_periodically_and_ignore_polygon_winding(self):
        a=unit_aspects(self.left,[self.right],0)
        np.testing.assert_allclose(unit_aspects(self.left,[self.right],90),np.roll(a,2),atol=1e-14)
        np.testing.assert_allclose(unit_aspects(self.left,[self.right],360),a,atol=1e-14)
        np.testing.assert_allclose(unit_aspects(list(reversed(self.left)),[self.right],0),a,atol=1e-14)
        self.assertAlmostEqual(a[0],0) # shared east face is excluded
        self.assertGreater(a[4],0) # west apartment facade remains
    def test_partition_changes_with_identical_outer_mass_and_relabeling_does_not(self):
        a=self.building()
        split_y=self.building([[(0,0),(10,0),(10,5),(0,5)],[(0,5),(10,5),(10,10),(0,10)]])
        va=layout_vector([a],prepare.inside,self.settings)
        self.assertFalse(np.allclose(va,layout_vector([split_y],prepare.inside,self.settings)))
        a.levels[0].units.reverse()
        np.testing.assert_allclose(va,layout_vector([a],prepare.inside,self.settings),atol=1e-14)
    def test_core_location_and_world_rotation_are_meaningful(self):
        a=self.building(cores=[[(4,4),(6,4),(6,6),(4,6)]])
        b=self.building(cores=[[(1,4),(3,4),(3,6),(1,6)]])
        self.assertFalse(np.allclose(layout_vector([a],prepare.inside,self.settings),layout_vector([b],prepare.inside,self.settings)))
        a=self.building();b=self.building(rot=90)
        self.assertFalse(np.allclose(layout_vector([a],prepare.inside,self.settings),layout_vector([b],prepare.inside,self.settings)))
    def test_site_and_layout_weights_are_explicit(self):
        a=Building();a.rot=0;a.levels=self.building().levels
        spec=dict(DescriptorTests.settings,version=2,block_weights={'site':.8,'layout':.2},layout=self.settings)
        vector=prepare.vectors([a],spec)
        np.testing.assert_allclose(vector[:16],math.sqrt(.8)*prepare.vectors([a],DescriptorTests.settings))
        np.testing.assert_allclose(vector[16:],math.sqrt(.2)*layout_vector([a],prepare.inside,self.settings))

if __name__=='__main__':unittest.main()

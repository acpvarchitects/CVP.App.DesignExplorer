"""Numerical tests for the site descriptor, with no model or Rhino dependency."""
import importlib.util
from pathlib import Path
import unittest
import numpy as np

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

if __name__=='__main__':unittest.main()

import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { DataService, DataItem } from '../../../../core/services/data.service';
import { VisualizationService } from '../../../../core/services/visualization.service';

interface SliderInfo {
  name: string;
  displayName: string;
  min: number;
  max: number;
  step: number;
  currentValue: [number, number];
  isInput: boolean;
}

@Component({
  selector: 'app-sliders',
  templateUrl: './sliders.component.html',
  styleUrl: './sliders.component.scss'
})
export class SlidersComponent implements OnInit, OnDestroy {
  sliders: SliderInfo[] = [];
  private subscriptions: Subscription[] = [];
  
  constructor(
    private dataService: DataService,
    private visualizationService: VisualizationService
  ) {}
  
  ngOnInit(): void {
    this.subscriptions.push(
      this.dataService.data$.subscribe(data => {
        if (data.length > 0) {
          this.prepareSliders(data);
        }
      })
    );
    
    this.subscriptions.push(
      this.dataService.inputParams$.subscribe(params => {
        if (params.length > 0) {
          this.dataService.data$.subscribe(data => {
            if (data.length > 0) {
              this.prepareSliders(data);
            }
          }).unsubscribe();
        }
      })
    );
  }
  
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  private prepareSliders(data: DataItem[]): void {
    if (!data || data.length === 0) return;
    
    let inputParams: string[] = [];
    let outputParams: string[] = [];
    
    this.dataService.inputParams$.subscribe(params => {
      inputParams = params;
    }).unsubscribe();
    
    this.dataService.outputParams$.subscribe(params => {
      outputParams = params;
    }).unsubscribe();
    
    const allParams = [...inputParams, ...outputParams];
    
    this.sliders = allParams.map(param => {
      const range = this.dataService.getParameterRange(param);
      const step = (range[1] - range[0]) / 100;
      
      return {
        name: param,
        displayName: this.getDisplayName(param),
        min: range[0],
        max: range[1],
        step: step > 0 ? step : 0.01,
        currentValue: [...range] as [number, number],
        isInput: inputParams.includes(param)
      };
    });
  }
  
  onSliderChange(slider: SliderInfo): void {
    this.applyFilters();
  }
  
  resetFilters(): void {
    this.sliders.forEach(slider => {
      slider.currentValue = [slider.min, slider.max];
    });
    this.applyFilters();
  }
  
  private applyFilters(): void {
    this.dataService.filterData(item => {
      return this.sliders.every(slider => {
        const value = this.dataService.getCleanValue(item, slider.name);
        if (typeof value !== 'number') return true;
        
        const [min, max] = slider.currentValue;
        return value >= min && value <= max;
      });
    });
  }
  
  private getDisplayName(param: string): string {
    if (param.toUpperCase().startsWith('IN:')) {
      return param.substring(3).trim();
    } else if (param.toUpperCase().startsWith('OUT:')) {
      return param.substring(4).trim();
    }
    return param;
  }
}

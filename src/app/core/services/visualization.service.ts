import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface VisualizationConfig {
  parallelCoordinates: {
    dimensions: string[];
    height: number;
    width: number;
    margin: { top: number; right: number; bottom: number; left: number };
    showGrid: boolean;
    brushMode: 'None' | '1D-axes' | '2D-strums';
    alphaOnBrushed: number;
  };
  scatterPlot: {
    xAxis: string;
    yAxis: string;
    height: number;
    width: number;
    margin: { top: number; right: number; bottom: number; left: number };
    showGrid: boolean;
    dotSize: number;
    highlightSize: number;
  };
  thumbnails: {
    columns: number;
    size: number;
    showLabels: boolean;
  };
  layout: {
    showSidebar: boolean;
    fullScreen: boolean;
    activeView: 'all' | 'parallel' | 'scatter' | 'thumbnails' | 'viewer';
  };
}

@Injectable({
  providedIn: 'root'
})
export class VisualizationService {
  private defaultConfig: VisualizationConfig = {
    parallelCoordinates: {
      dimensions: [],
      height: 500,
      width: 1200,
      margin: { top: 30, right: 10, bottom: 10, left: 10 },
      showGrid: true,
      brushMode: '1D-axes',
      alphaOnBrushed: 0.3
    },
    scatterPlot: {
      xAxis: '',
      yAxis: '',
      height: 300,
      width: 400,
      margin: { top: 20, right: 20, bottom: 30, left: 40 },
      showGrid: true,
      dotSize: 5,
      highlightSize: 8
    },
    thumbnails: {
      columns: 4,
      size: 150,
      showLabels: true
    },
    layout: {
      showSidebar: true,
      fullScreen: false,
      activeView: 'all'
    }
  };

  private configSubject = new BehaviorSubject<VisualizationConfig>(this.defaultConfig);
  public config$ = this.configSubject.asObservable();

  constructor() { }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const currentConfig = this.configSubject.value;
    this.configSubject.next({
      ...currentConfig,
      ...config
    });
  }

  updateParallelCoordinatesConfig(config: Partial<VisualizationConfig['parallelCoordinates']>): void {
    const currentConfig = this.configSubject.value;
    this.configSubject.next({
      ...currentConfig,
      parallelCoordinates: {
        ...currentConfig.parallelCoordinates,
        ...config
      }
    });
  }

  updateScatterPlotConfig(config: Partial<VisualizationConfig['scatterPlot']>): void {
    const currentConfig = this.configSubject.value;
    this.configSubject.next({
      ...currentConfig,
      scatterPlot: {
        ...currentConfig.scatterPlot,
        ...config
      }
    });
  }

  updateThumbnailsConfig(config: Partial<VisualizationConfig['thumbnails']>): void {
    const currentConfig = this.configSubject.value;
    this.configSubject.next({
      ...currentConfig,
      thumbnails: {
        ...currentConfig.thumbnails,
        ...config
      }
    });
  }

  updateLayoutConfig(config: Partial<VisualizationConfig['layout']>): void {
    const currentConfig = this.configSubject.value;
    this.configSubject.next({
      ...currentConfig,
      layout: {
        ...currentConfig.layout,
        ...config
      }
    });
  }

  setParallelCoordinatesDimensions(dimensions: string[]): void {
    this.updateParallelCoordinatesConfig({ dimensions });
  }

  setScatterAxes(xAxis: string, yAxis: string): void {
    this.updateScatterPlotConfig({ xAxis, yAxis });
  }

  toggleSidebar(): void {
    const currentConfig = this.configSubject.value;
    this.updateLayoutConfig({ 
      showSidebar: !currentConfig.layout.showSidebar 
    });
  }

  toggleFullScreen(): void {
    const currentConfig = this.configSubject.value;
    this.updateLayoutConfig({ 
      fullScreen: !currentConfig.layout.fullScreen 
    });
  }

  setActiveView(view: VisualizationConfig['layout']['activeView']): void {
    this.updateLayoutConfig({ activeView: view });
  }

  resetConfig(): void {
    this.configSubject.next(this.defaultConfig);
  }
}

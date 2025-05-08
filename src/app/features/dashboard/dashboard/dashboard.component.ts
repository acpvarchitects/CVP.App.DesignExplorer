import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../../core/services/data.service';
import { VisualizationService, VisualizationConfig } from '../../../core/services/visualization.service';
import { ParallelCoordinatesComponent } from '../components/parallel-coordinates/parallel-coordinates.component';
import { ScatterChartComponent } from '../components/scatter-chart/scatter-chart.component';
import { ThumbnailsGridComponent } from '../components/thumbnails-grid/thumbnails-grid.component';
import { ViewerComponent } from '../components/viewer/viewer.component';
import { SlidersComponent } from '../components/sliders/sliders.component';
import { DataLoaderComponent } from '../components/data-loader/data-loader.component';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { SidebarComponent } from '../../../core/components/sidebar/sidebar.component';
import { DataSettingsComponent } from '../components/data-settings/data-settings.component';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  imports: [
    CommonModule,
    ParallelCoordinatesComponent,
    ScatterChartComponent,
    ThumbnailsGridComponent,
    ViewerComponent,
    SlidersComponent,
    DataLoaderComponent,
    HeaderComponent,
    SidebarComponent,
    DataSettingsComponent
  ],
  standalone: true
})
export class DashboardComponent implements OnInit {
  showSidebar = true;
  isLoading = false;
  hasData = false;
  layoutConfig: VisualizationConfig['layout'] | null = null;

  constructor(
    private dataService: DataService,
    private visualizationService: VisualizationService
  ) {}

  ngOnInit(): void {
    this.dataService.data$.subscribe(data => {
      this.hasData = data.length > 0;
      this.isLoading = false;
    });

    this.visualizationService.config$.subscribe(config => {
      this.layoutConfig = config.layout;
      this.showSidebar = config.layout.showSidebar;
    });

    this.loadDefaultData();
  }

  toggleSidebar(): void {
    this.visualizationService.toggleSidebar();
  }

  toggleFullScreen(): void {
    this.visualizationService.toggleFullScreen();
  }

  setActiveView(view: VisualizationConfig['layout']['activeView']): void {
    this.visualizationService.setActiveView(view);
  }

  private loadDefaultData(): void {
    this.isLoading = true;
    this.dataService.loadCsvData('assets/data/default_data.csv').subscribe({
      next: () => {
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading default data:', error);
        this.isLoading = false;
      }
    });
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
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
    private visualizationService: VisualizationService,
    private http: HttpClient
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
    
    const dataPath = './assets/data/default_onload.csv';
    console.log('Dashboard - Loading default data from:', dataPath);
    
    this.dataService.loadCsvData(dataPath).subscribe({
      next: (data) => {
        console.log('Dashboard - Successfully loaded data:', data.length, 'records');
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Dashboard - Error loading default data:', error);
        this.isLoading = false;
        
        this.tryAlternativePath();
      }
    });
  }
  
  private tryAlternativePath(): void {
    const altPath = '/assets/data/default_onload.csv';
    console.log('Dashboard - Trying alternative path:', altPath);
    
    this.dataService.loadCsvData(altPath).subscribe({
      next: (data) => {
        console.log('Dashboard - Successfully loaded data from alternative path:', data.length, 'records');
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Dashboard - Error loading from alternative path:', err);
        
        this.tryRelativePath();
      }
    });
  }
  
  private tryRelativePath(): void {
    this.http.get('./assets/data/test.json').subscribe({
      next: (data) => {
        console.log('Dashboard - Successfully loaded test file:', data);
        
        const relativePath = 'assets/data/default_onload.csv';
        console.log('Dashboard - Trying relative path:', relativePath);
        
        this.dataService.loadCsvData(relativePath).subscribe({
          next: (csvData) => {
            console.log('Dashboard - Successfully loaded data from relative path:', csvData.length, 'records');
            this.isLoading = false;
          },
          error: (csvErr) => {
            console.error('Dashboard - Error loading from relative path:', csvErr);
          }
        });
      },
      error: (testErr) => {
        console.error('Dashboard - Error loading test file:', testErr);
      }
    });
  }
}

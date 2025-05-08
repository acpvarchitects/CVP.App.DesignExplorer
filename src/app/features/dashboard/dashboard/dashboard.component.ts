import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DataService } from '../../../core/services/data.service';
import { VisualizationService, VisualizationConfig } from '../../../core/services/visualization.service';
import { ParallelCoordinatesComponent } from '../components/parallel-coordinates/parallel-coordinates.component';
import { ScatterChartComponent } from '../components/scatter-chart/scatter-chart.component';
import { ThumbnailsGridComponent } from '../components/thumbnails-grid/thumbnails-grid.component';
import { ViewerComponent } from '../components/viewer/viewer.component';
import { DataLoaderComponent } from '../components/data-loader/data-loader.component';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { SidebarComponent } from '../../../core/components/sidebar/sidebar.component';
import { DataSettingsComponent } from '../components/data-settings/data-settings.component';

import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenav } from '@angular/material/sidenav';

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
    DataLoaderComponent,
    HeaderComponent,
    SidebarComponent,
    DataSettingsComponent,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule
  ],
  standalone: true
})
export class DashboardComponent implements OnInit {
  @ViewChild('sidenav') sidenav!: MatSidenav;
  
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
    
    const sampleData = `in:Depth [ft],in:Height [ft],in:Orientation,in:WWR [%],in:SHD,out:Cooling[kWh],out:Heating[kWh],out:Lighting[kWh],out:EffDepth[m],out:DA [%],out:UDI [%],out:CDA [%],out:SDA [Area%],img,threeD
10,3,0,0.4,0,1775.336166,4019.071531,694.957328,4.75,40,46.111111,54.444444,50,assets/images/placeholder.png,
10,3.6,0,0.4,0,1913.459768,4279.592955,627.582736,5.25,43.888889,51.111111,57.222222,55,assets/images/placeholder.png,
10,4.2,0,0.4,0,2044.072567,4561.665896,452.009184,5.75,46.666667,56.666667,61.111111,58.89,assets/images/placeholder.png,
6,3,0,0.4,0,1220.922529,2548.142723,67.991593,5.75,72.222222,60.185185,100,100,assets/images/placeholder.png,
6,3.6,0,0.4,0,1380.964697,2719.688415,50.255212,5.75,80.555556,57.407407,100,100,assets/images/placeholder.png,`;
    
    console.log('Dashboard - Loading sample data');
    
    this.dataService.loadCsvFromText(sampleData).subscribe({
      next: (data) => {
        console.log('Dashboard - Successfully loaded sample data:', data.length, 'records');
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Dashboard - Error loading sample data:', err);
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

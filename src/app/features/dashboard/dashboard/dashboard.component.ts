import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../../core/services/data.service';
import { VisualizationService, VisualizationConfig } from '../../../core/services/visualization.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
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

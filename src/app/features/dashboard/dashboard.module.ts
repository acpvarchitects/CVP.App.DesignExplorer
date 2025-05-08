import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { DashboardRoutingModule } from './dashboard-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { CoreModule } from '../../core/core.module';

import { DashboardComponent } from './dashboard/dashboard.component';
import { ParallelCoordinatesComponent } from './components/parallel-coordinates/parallel-coordinates.component';
import { ScatterChartComponent } from './components/scatter-chart/scatter-chart.component';
import { ThumbnailsGridComponent } from './components/thumbnails-grid/thumbnails-grid.component';
import { ViewerComponent } from './components/viewer/viewer.component';
import { SlidersComponent } from './components/sliders/sliders.component';
import { DataSettingsComponent } from './components/data-settings/data-settings.component';
import { DataLoaderComponent } from './components/data-loader/data-loader.component';

@NgModule({
  imports: [
    CommonModule,
    SharedModule,
    CoreModule,
    DashboardRoutingModule,
    DashboardComponent,
    ParallelCoordinatesComponent,
    ScatterChartComponent,
    ThumbnailsGridComponent,
    ViewerComponent,
    SlidersComponent,
    DataSettingsComponent,
    DataLoaderComponent
  ],
  exports: [
    DashboardComponent
  ]
})
export class DashboardModule { }

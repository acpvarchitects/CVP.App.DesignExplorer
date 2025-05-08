import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { DataService } from './services/data.service';
import { SettingsService } from './services/settings.service';
import { VisualizationService } from './services/visualization.service';

@NgModule({
  imports: [
    CommonModule,
    HttpClientModule
  ],
  exports: [
    CommonModule,
    HttpClientModule
  ],
  providers: [
    DataService,
    SettingsService,
    VisualizationService
  ]
})
export class CoreModule { }

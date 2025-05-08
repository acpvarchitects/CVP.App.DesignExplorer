import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { DataService } from './services/data.service';
import { SettingsService } from './services/settings.service';
import { VisualizationService } from './services/visualization.service';

@NgModule({
  declarations: [
    HeaderComponent,
    SidebarComponent
  ],
  imports: [
    CommonModule,
    HttpClientModule
  ],
  exports: [
    HeaderComponent,
    SidebarComponent
  ],
  providers: [
    DataService,
    SettingsService,
    VisualizationService
  ]
})
export class CoreModule { }

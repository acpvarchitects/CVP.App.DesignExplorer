import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DataService, DataItem } from '../../../../core/services/data.service';
import { VisualizationService } from '../../../../core/services/visualization.service';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-data-settings',
  templateUrl: './data-settings.component.html',
  styleUrl: './data-settings.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatListModule,
    MatButtonModule
  ],
  standalone: true
})
export class DataSettingsComponent implements OnInit, OnDestroy {
  availableParams: string[] = [];
  inputParamsControl = new FormControl<string[]>([]);
  outputParamsControl = new FormControl<string[]>([]);
  thumbnailColumns = 4;
  showLabels = true;
  
  private subscriptions: Subscription[] = [];
  
  constructor(
    private dataService: DataService,
    private visualizationService: VisualizationService
  ) {}
  
  ngOnInit(): void {
    this.subscriptions.push(
      this.dataService.data$.subscribe(data => {
        if (data.length > 0) {
          this.updateAvailableParams(data);
        }
      })
    );
    
    this.subscriptions.push(
      this.dataService.inputParams$.subscribe(params => {
        this.inputParamsControl.setValue(params);
      })
    );
    
    this.subscriptions.push(
      this.dataService.outputParams$.subscribe(params => {
        this.outputParamsControl.setValue(params);
      })
    );
    
    this.subscriptions.push(
      this.visualizationService.config$.subscribe(config => {
        this.thumbnailColumns = config.thumbnails.columns;
        this.showLabels = config.thumbnails.showLabels;
      })
    );
  }
  
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  private updateAvailableParams(data: DataItem[]): void {
    if (!data || data.length === 0) return;
    
    const item = data[0];
    this.availableParams = Object.keys(item).filter(key => {
      const upperKey = key.toUpperCase();
      return !upperKey.startsWith('IMG') && !upperKey.startsWith('THREED');
    });
  }
  
  isInputParam(param: string): boolean {
    return this.inputParamsControl.value?.includes(param) || false;
  }
  
  isOutputParam(param: string): boolean {
    return this.outputParamsControl.value?.includes(param) || false;
  }
  
  getDisplayName(param: string): string {
    if (param.toUpperCase().startsWith('IN:')) {
      return param.substring(3).trim();
    } else if (param.toUpperCase().startsWith('OUT:')) {
      return param.substring(4).trim();
    }
    return param;
  }
  
  updateSettings(): void {
    this.visualizationService.setThumbnailSettings(this.thumbnailColumns, this.showLabels);
  }
  
  applySettings(): void {
    const inputParams = this.inputParamsControl.value || [];
    const outputParams = this.outputParamsControl.value || [];
    
    this.dataService.setParameters(inputParams, outputParams);
    this.updateSettings();
  }
  
  resetSettings(): void {
    this.thumbnailColumns = 4;
    this.showLabels = true;
    
    const inputParams = this.availableParams.filter(param => param.toUpperCase().startsWith('IN:'));
    const outputParams = this.availableParams.filter(param => param.toUpperCase().startsWith('OUT:'));
    
    this.inputParamsControl.setValue(inputParams);
    this.outputParamsControl.setValue(outputParams);
    
    this.applySettings();
  }
}

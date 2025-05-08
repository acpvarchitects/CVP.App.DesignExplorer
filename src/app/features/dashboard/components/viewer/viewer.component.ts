import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { DataService, DataItem } from '../../../../core/services/data.service';
import { VisualizationService } from '../../../../core/services/visualization.service';

@Component({
  selector: 'app-viewer',
  templateUrl: './viewer.component.html',
  styleUrl: './viewer.component.scss',
  imports: [
    CommonModule
  ],
  standalone: true
})
export class ViewerComponent implements OnInit, OnDestroy {
  selectedItem: DataItem | null = null;
  viewMode: '2D' | '3D' = '2D';
  imageUrl: string = '';
  modelUrl: string = '';
  hasImage: boolean = false;
  hasModel: boolean = false;
  
  private subscriptions: Subscription[] = [];
  
  constructor(
    private dataService: DataService,
    private visualizationService: VisualizationService
  ) {}
  
  ngOnInit(): void {
    this.subscriptions.push(
      this.dataService.selectedData$.subscribe(data => {
        if (data.length > 0) {
          this.selectedItem = data[0];
          this.updateViewer();
        } else {
          this.selectedItem = null;
          this.imageUrl = '';
          this.modelUrl = '';
          this.hasImage = false;
          this.hasModel = false;
        }
      })
    );
  }
  
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  setViewMode(mode: '2D' | '3D'): void {
    this.viewMode = mode;
    this.updateViewer();
  }
  
  private updateViewer(): void {
    if (!this.selectedItem) return;
    
    const imgKey = Object.keys(this.selectedItem).find(key => 
      key.toUpperCase().startsWith('IMG')
    );
    
    const modelKey = Object.keys(this.selectedItem).find(key => 
      key.toUpperCase().startsWith('THREED')
    );
    
    this.hasImage = !!imgKey;
    this.hasModel = !!modelKey;
    
    if (this.viewMode === '2D' && imgKey) {
      this.imageUrl = this.getImageUrl(this.selectedItem[imgKey]);
    } else if (this.viewMode === '3D' && modelKey) {
      this.modelUrl = this.getModelUrl(this.selectedItem[modelKey]);
      this.init3DViewer();
    }
  }
  
  private getImageUrl(path: string): string {
    if (!path) return '';
    
    if (path.includes('drive.google.com')) {
      const match = path.match(/[-\w]{25,}/);
      if (match) {
        return `https://drive.google.com/uc?export=view&id=${match[0]}`;
      }
    }
    
    if (!path.startsWith('http') && !path.startsWith('/')) {
      return `assets/images/${path}`;
    }
    
    return path;
  }
  
  private getModelUrl(path: string): string {
    if (!path) return '';
    
    if (!path.startsWith('http') && !path.startsWith('/')) {
      return `assets/models/${path}`;
    }
    
    return path;
  }
  
  private init3DViewer(): void {
    console.log('3D viewer initialized with model:', this.modelUrl);
  }
  
  getItemDetails(): string[] {
    if (!this.selectedItem) return [];
    
    return Object.entries(this.selectedItem)
      .filter(([key]) => {
        const upperKey = key.toUpperCase();
        return upperKey.startsWith('IN:') || upperKey.startsWith('OUT:');
      })
      .map(([key, value]) => {
        const displayName = key.toUpperCase().startsWith('IN:') 
          ? key.substring(3).trim() 
          : key.toUpperCase().startsWith('OUT:')
            ? key.substring(4).trim()
            : key;
        return `${displayName}: ${value}`;
      });
  }
}

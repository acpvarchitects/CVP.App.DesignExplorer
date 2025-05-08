import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { DataService, DataItem } from '../../../../core/services/data.service';
import { VisualizationService } from '../../../../core/services/visualization.service';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';

interface Thumbnail {
  item: DataItem;
  imageUrl: string;
  title: string;
}

@Component({
  selector: 'app-thumbnails-grid',
  templateUrl: './thumbnails-grid.component.html',
  styleUrl: './thumbnails-grid.component.scss',
  imports: [
    CommonModule,
    MatCheckboxModule,
    MatCardModule
  ],
  standalone: true
})
export class ThumbnailsGridComponent implements OnInit, OnDestroy {
  thumbnails: Thumbnail[] = [];
  columns = 4;
  showLabels = true;
  private subscriptions: Subscription[] = [];
  
  constructor(
    private dataService: DataService,
    private visualizationService: VisualizationService
  ) {}
  
  ngOnInit(): void {
    this.subscriptions.push(
      this.dataService.filteredData$.subscribe(data => {
        this.updateThumbnails(data);
      })
    );
    
    this.subscriptions.push(
      this.visualizationService.config$.subscribe(config => {
        this.columns = config.thumbnails.columns;
        this.showLabels = config.thumbnails.showLabels;
      })
    );
  }
  
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  private updateThumbnails(data: DataItem[]): void {
    if (!data || data.length === 0) {
      this.thumbnails = [];
      return;
    }
    
    this.thumbnails = data.map(item => {
      const imgKey = Object.keys(item).find(key => 
        key.toUpperCase().startsWith('IMG')
      );
      
      const title = this.createTitle(item);
      
      return {
        item,
        imageUrl: imgKey ? this.getImageUrl(item[imgKey]) : 'assets/images/placeholder.png',
        title
      };
    });
  }
  
  private createTitle(item: DataItem): string {
    return Object.entries(item)
      .filter(([key]) => key.toUpperCase().startsWith('IN:'))
      .slice(0, 3)
      .map(([key, value]) => {
        const displayName = key.toUpperCase().startsWith('IN:') 
          ? key.substring(3).trim() 
          : key;
        return `${displayName}: ${value}`;
      })
      .join(', ');
  }
  
  private getImageUrl(path: string): string {
    if (!path) return 'assets/images/placeholder.png';
    
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
  
  selectThumbnail(item: DataItem): void {
    this.dataService.selectData([item]);
  }
  
  getColumnWidth(): string {
    return `calc(${100 / this.columns}% - 20px)`;
  }
}

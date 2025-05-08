import { Component, ElementRef, OnInit, OnDestroy, ViewChild } from '@angular/core';
import * as d3 from 'd3';
import { Subscription } from 'rxjs';
import { DataService, DataItem } from '../../../../core/services/data.service';
import { VisualizationService } from '../../../../core/services/visualization.service';

@Component({
  selector: 'app-parallel-coordinates',
  templateUrl: './parallel-coordinates.component.html',
  styleUrl: './parallel-coordinates.component.scss'
})
export class ParallelCoordinatesComponent implements OnInit, OnDestroy {
  @ViewChild('chart', { static: true }) private chartContainer!: ElementRef;
  
  private data: DataItem[] = [];
  private dimensions: string[] = [];
  private svg: any;
  private parCoords: any;
  private width = 0;
  private height = 0;
  private margin = { top: 30, right: 10, bottom: 10, left: 10 };
  private subscriptions: Subscription[] = [];
  
  constructor(
    private dataService: DataService,
    private visualizationService: VisualizationService
  ) {}
  
  ngOnInit(): void {
    this.subscriptions.push(
      this.dataService.filteredData$.subscribe(data => {
        this.data = data;
        if (data.length > 0) {
          this.updateDimensions();
          this.initChart();
        }
      })
    );
    
    this.subscriptions.push(
      this.visualizationService.config$.subscribe(config => {
        if (config.parallelCoordinates.dimensions.length > 0) {
          this.dimensions = config.parallelCoordinates.dimensions;
          this.margin = config.parallelCoordinates.margin;
          this.height = config.parallelCoordinates.height;
          this.width = config.parallelCoordinates.width;
          
          if (this.data.length > 0) {
            this.initChart();
          }
        }
      })
    );
    
    this.subscriptions.push(
      this.dataService.selectedData$.subscribe(selectedData => {
        if (this.parCoords && selectedData.length > 0) {
          this.highlightLines(selectedData);
        }
      })
    );
  }
  
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  private updateDimensions(): void {
    if (!this.data || this.data.length === 0) return;
    
    const inputParams: string[] = [];
    const outputParams: string[] = [];
    
    const keys = Object.keys(this.data[0]);
    
    keys.forEach(key => {
      const upperKey = key.toUpperCase();
      if (upperKey.startsWith('IN:') || upperKey.startsWith('OUT:')) {
        if (upperKey.startsWith('IN:')) {
          inputParams.push(key);
        } else {
          outputParams.push(key);
        }
      }
    });
    
    this.dimensions = [...inputParams, ...outputParams];
    
    this.visualizationService.setParallelCoordinatesDimensions(this.dimensions);
  }
  
  private initChart(): void {
    if (!this.data || this.data.length === 0 || this.dimensions.length === 0) return;
    
    const element = this.chartContainer.nativeElement;
    
    d3.select(element).select('svg').remove();
    
    if (!this.width || !this.height) {
      const containerWidth = element.clientWidth;
      this.width = containerWidth || 1200;
      this.height = 500;
    }
    
    this.svg = d3.select(element)
      .append('svg')
      .attr('width', this.width)
      .attr('height', this.height);
    
    const scales: any = {};
    
    this.dimensions.forEach(dimension => {
      const values = this.data.map(d => this.getCleanValue(d, dimension));
      const extent = d3.extent(values);
      
      scales[dimension] = d3.scaleLinear()
        .domain(extent as [number, number])
        .range([this.height - this.margin.bottom, this.margin.top]);
    });
    
    const axes = this.dimensions.map((dimension, i) => {
      const x = this.margin.left + i * ((this.width - this.margin.left - this.margin.right) / (this.dimensions.length - 1));
      
      const axis = d3.axisLeft(scales[dimension])
        .ticks(5);
      
      this.svg.append('g')
        .attr('transform', `translate(${x}, 0)`)
        .call(axis);
      
      this.svg.append('text')
        .attr('x', x)
        .attr('y', this.margin.top / 2)
        .attr('text-anchor', 'middle')
        .text(this.getDisplayName(dimension));
      
      return { dimension, x, scale: scales[dimension] };
    });
    
    const line = d3.line()
      .defined((d: any) => !isNaN(d.y))
      .x((d: any) => d.x)
      .y((d: any) => d.y);
    
    this.data.forEach(d => {
      const points = axes.map(axis => {
        const value = this.getCleanValue(d, axis.dimension);
        return {
          x: axis.x,
          y: axis.scale(value)
        };
      });
      
      this.svg.append('path')
        .datum(points)
        .attr('class', 'line')
        .attr('d', line)
        .attr('fill', 'none')
        .attr('stroke', '#69b3a2')
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.5)
        .attr('data-id', this.getItemId(d))
        .on('mouseover', () => this.handleLineHover(d))
        .on('mouseout', this.handleLineMouseOut.bind(this))
        .on('click', () => this.handleLineClick(d));
    });
  }
  
  private getCleanValue(item: DataItem, key: string): number {
    const value = item[key];
    if (typeof value === 'string' && !isNaN(Number(value))) {
      return Number(value);
    }
    return 0;
  }
  
  private getDisplayName(dimension: string): string {
    if (dimension.toUpperCase().startsWith('IN:')) {
      return dimension.substring(3).trim();
    } else if (dimension.toUpperCase().startsWith('OUT:')) {
      return dimension.substring(4).trim();
    }
    return dimension;
  }
  
  private getItemId(item: DataItem): string {
    return Object.entries(item)
      .filter(([key]) => key.toUpperCase().startsWith('IN:'))
      .map(([_, value]) => value)
      .join('_');
  }
  
  private handleLineHover(item: DataItem): void {
    d3.select(this.chartContainer.nativeElement)
      .selectAll('.line')
      .attr('opacity', 0.1);
    
    d3.select(this.chartContainer.nativeElement)
      .selectAll(`.line[data-id="${this.getItemId(item)}"]`)
      .attr('opacity', 1)
      .attr('stroke', '#ff7f0e')
      .attr('stroke-width', 2.5);
  }
  
  private handleLineMouseOut(): void {
    this.dataService.selectedData$.subscribe(selectedData => {
      if (selectedData.length === 0) {
        d3.select(this.chartContainer.nativeElement)
          .selectAll('.line')
          .attr('opacity', 0.5)
          .attr('stroke', '#69b3a2')
          .attr('stroke-width', 1.5);
      } else {
        this.highlightLines(selectedData);
      }
    }).unsubscribe(); // Unsubscribe immediately after use
  }
  
  private handleLineClick(item: DataItem): void {
    this.dataService.selectData([item]);
  }
  
  private highlightLines(selectedItems: DataItem[]): void {
    d3.select(this.chartContainer.nativeElement)
      .selectAll('.line')
      .attr('opacity', 0.1)
      .attr('stroke', '#69b3a2')
      .attr('stroke-width', 1.5);
    
    selectedItems.forEach(item => {
      d3.select(this.chartContainer.nativeElement)
        .selectAll(`.line[data-id="${this.getItemId(item)}"]`)
        .attr('opacity', 1)
        .attr('stroke', '#ff7f0e')
        .attr('stroke-width', 2.5);
    });
  }
}

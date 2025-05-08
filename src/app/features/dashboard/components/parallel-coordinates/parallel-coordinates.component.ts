import { Component, ElementRef, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { Subscription } from 'rxjs';
import { DataService, DataItem } from '../../../../core/services/data.service';
import { VisualizationService } from '../../../../core/services/visualization.service';

interface AxisFilter {
  dimension: string;
  range: [number, number];
  active: boolean;
}

@Component({
  selector: 'app-parallel-coordinates',
  templateUrl: './parallel-coordinates.component.html',
  styleUrl: './parallel-coordinates.component.scss',
  imports: [CommonModule],
  standalone: true
})
export class ParallelCoordinatesComponent implements OnInit, OnDestroy {
  @ViewChild('chart', { static: true }) private chartContainer!: ElementRef;
  
  private data: DataItem[] = [];
  private filteredData: DataItem[] = [];
  private dimensions: string[] = [];
  private svg: any;
  private parCoords: any;
  private width = 0;
  private height = 0;
  private margin = { top: 30, right: 10, bottom: 30, left: 10 };
  private subscriptions: Subscription[] = [];
  private scales: any = {};
  private axisFilters: AxisFilter[] = [];
  
  constructor(
    private dataService: DataService,
    private visualizationService: VisualizationService
  ) {}
  
  ngOnInit(): void {
    this.subscriptions.push(
      this.dataService.filteredData$.subscribe(data => {
        this.data = data;
        this.filteredData = data;
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
        if (this.svg && selectedData.length > 0) {
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
    
    this.axisFilters = this.dimensions.map(dimension => {
      const values = this.data.map(d => this.getCleanValue(d, dimension));
      const extent = d3.extent(values) as [number, number];
      return {
        dimension,
        range: extent,
        active: false
      };
    });
    
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
    
    this.scales = {};
    
    this.dimensions.forEach(dimension => {
      const values = this.data.map(d => this.getCleanValue(d, dimension));
      const extent = d3.extent(values);
      
      this.scales[dimension] = d3.scaleLinear()
        .domain(extent as [number, number])
        .range([this.height - this.margin.bottom, this.margin.top]);
    });
    
    const axes = this.dimensions.map((dimension, i) => {
      const x = this.margin.left + i * ((this.width - this.margin.left - this.margin.right) / (this.dimensions.length - 1));
      
      const axis = d3.axisLeft(this.scales[dimension])
        .ticks(5);
      
      const axisGroup = this.svg.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(${x}, 0)`)
        .call(axis);
      
      this.svg.append('text')
        .attr('x', x)
        .attr('y', this.margin.top / 2)
        .attr('text-anchor', 'middle')
        .text(this.getDisplayName(dimension));
      
      const brush = d3.brushY()
        .extent([[x - 10, this.margin.top], [x + 10, this.height - this.margin.bottom]])
        .on('end', (event) => {
          if (!event.selection) {
            const filterIndex = this.axisFilters.findIndex(f => f.dimension === dimension);
            if (filterIndex >= 0) {
              this.axisFilters[filterIndex].active = false;
              this.applyFilters();
            }
            return;
          }
          
          const range = event.selection.map((d: number) => this.scales[dimension].invert(d)) as [number, number];
          range.sort((a, b) => a - b);
          
          const filterIndex = this.axisFilters.findIndex(f => f.dimension === dimension);
          if (filterIndex >= 0) {
            this.axisFilters[filterIndex].range = range;
            this.axisFilters[filterIndex].active = true;
            this.applyFilters();
          }
        });
      
      axisGroup.append('g')
        .attr('class', 'brush')
        .call(brush);
      
      return { dimension, x, scale: this.scales[dimension] };
    });
    
    this.drawLines(axes);
  }
  
  private drawLines(axes: any[]): void {
    this.svg.selectAll('.line').remove();
    
    const line = d3.line()
      .defined((d: any) => !isNaN(d.y))
      .x((d: any) => d.x)
      .y((d: any) => d.y);
    
    this.filteredData.forEach(d => {
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
  
  private applyFilters(): void {
    const activeFilters = this.axisFilters.filter(f => f.active);
    
    if (activeFilters.length === 0) {
      this.filteredData = this.data;
    } else {
      this.filteredData = this.data.filter(item => {
        return activeFilters.every(filter => {
          const value = this.getCleanValue(item, filter.dimension);
          return value >= filter.range[0] && value <= filter.range[1];
        });
      });
    }
    
    const axes = this.dimensions.map((dimension, i) => {
      const x = this.margin.left + i * ((this.width - this.margin.left - this.margin.right) / (this.dimensions.length - 1));
      return { dimension, x, scale: this.scales[dimension] };
    });
    
    this.drawLines(axes);
    
    this.dataService.filterData(item => this.filteredData.includes(item));
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
  
  resetFilters(): void {
    this.axisFilters.forEach(filter => {
      filter.active = false;
    });
    
    this.svg.selectAll('.brush').each((d: any, i: number, nodes: any[]) => {
      d3.select(nodes[i]).call(d3.brush().clear);
    });
    
    this.applyFilters();
  }
}

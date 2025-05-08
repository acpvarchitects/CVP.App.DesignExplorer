import { Component, ElementRef, OnInit, OnDestroy, ViewChild } from '@angular/core';
import * as d3 from 'd3';
import { Subscription } from 'rxjs';
import { DataService, DataItem } from '../../../../core/services/data.service';
import { VisualizationService } from '../../../../core/services/visualization.service';

@Component({
  selector: 'app-scatter-chart',
  templateUrl: './scatter-chart.component.html',
  styleUrl: './scatter-chart.component.scss'
})
export class ScatterChartComponent implements OnInit, OnDestroy {
  @ViewChild('chart', { static: true }) private chartContainer!: ElementRef;
  
  private data: DataItem[] = [];
  private svg: any;
  private xScale: any;
  private yScale: any;
  private xAxis: any;
  private yAxis: any;
  private width = 0;
  private height = 0;
  private margin = { top: 20, right: 20, bottom: 30, left: 40 };
  private subscriptions: Subscription[] = [];
  
  xAxisParam: string = '';
  yAxisParam: string = '';
  
  availableParams: string[] = [];
  
  constructor(
    private dataService: DataService,
    private visualizationService: VisualizationService
  ) {}
  
  ngOnInit(): void {
    this.subscriptions.push(
      this.dataService.filteredData$.subscribe(data => {
        this.data = data;
        if (data.length > 0) {
          this.updateAvailableParams();
          this.initChart();
        }
      })
    );
    
    this.subscriptions.push(
      this.visualizationService.config$.subscribe(config => {
        if (config.scatterPlot.xAxis && config.scatterPlot.yAxis) {
          this.xAxisParam = config.scatterPlot.xAxis;
          this.yAxisParam = config.scatterPlot.yAxis;
          this.margin = config.scatterPlot.margin;
          this.height = config.scatterPlot.height;
          this.width = config.scatterPlot.width;
          
          if (this.data.length > 0) {
            this.initChart();
          }
        }
      })
    );
    
    this.subscriptions.push(
      this.dataService.selectedData$.subscribe(selectedData => {
        if (this.svg && selectedData.length > 0) {
          this.highlightPoints(selectedData);
        }
      })
    );
  }
  
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  private updateAvailableParams(): void {
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
    
    this.availableParams = [...inputParams, ...outputParams];
    
    if (!this.xAxisParam && inputParams.length > 0) {
      this.xAxisParam = inputParams[0];
    }
    
    if (!this.yAxisParam && outputParams.length > 0) {
      this.yAxisParam = outputParams[0];
    } else if (!this.yAxisParam && inputParams.length > 1) {
      this.yAxisParam = inputParams[1];
    }
    
    this.visualizationService.setScatterAxes(this.xAxisParam, this.yAxisParam);
  }
  
  setXAxis(param: string): void {
    this.xAxisParam = param;
    this.visualizationService.setScatterAxes(this.xAxisParam, this.yAxisParam);
    this.initChart();
  }
  
  setYAxis(param: string): void {
    this.yAxisParam = param;
    this.visualizationService.setScatterAxes(this.xAxisParam, this.yAxisParam);
    this.initChart();
  }
  
  private initChart(): void {
    if (!this.data || this.data.length === 0 || !this.xAxisParam || !this.yAxisParam) return;
    
    const element = this.chartContainer.nativeElement;
    
    d3.select(element).select('svg').remove();
    
    if (!this.width || !this.height) {
      const containerWidth = element.clientWidth;
      this.width = containerWidth || 400;
      this.height = 300;
    }
    
    this.svg = d3.select(element)
      .append('svg')
      .attr('width', this.width)
      .attr('height', this.height);
    
    const xValues = this.data.map(d => this.getCleanValue(d, this.xAxisParam));
    const yValues = this.data.map(d => this.getCleanValue(d, this.yAxisParam));
    
    const xExtent = d3.extent(xValues) as [number, number];
    const yExtent = d3.extent(yValues) as [number, number];
    
    const xPadding = (xExtent[1] - xExtent[0]) * 0.05;
    const yPadding = (yExtent[1] - yExtent[0]) * 0.05;
    
    this.xScale = d3.scaleLinear()
      .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
      .range([this.margin.left, this.width - this.margin.right]);
    
    this.yScale = d3.scaleLinear()
      .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
      .range([this.height - this.margin.bottom, this.margin.top]);
    
    this.xAxis = d3.axisBottom(this.xScale);
    this.yAxis = d3.axisLeft(this.yScale);
    
    this.svg.append('g')
      .attr('transform', `translate(0, ${this.height - this.margin.bottom})`)
      .call(this.xAxis);
    
    this.svg.append('g')
      .attr('transform', `translate(${this.margin.left}, 0)`)
      .call(this.yAxis);
    
    this.svg.append('text')
      .attr('x', this.width / 2)
      .attr('y', this.height - 5)
      .attr('text-anchor', 'middle')
      .text(this.getDisplayName(this.xAxisParam));
    
    this.svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -(this.height / 2))
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .text(this.getDisplayName(this.yAxisParam));
    
    this.svg.selectAll('circle')
      .data(this.data)
      .enter()
      .append('circle')
      .attr('cx', (d: DataItem) => this.xScale(this.getCleanValue(d, this.xAxisParam)))
      .attr('cy', (d: DataItem) => this.yScale(this.getCleanValue(d, this.yAxisParam)))
      .attr('r', 5)
      .attr('fill', '#69b3a2')
      .attr('opacity', 0.7)
      .attr('data-id', (d: DataItem) => this.getItemId(d))
      .on('mouseover', (event: any, d: DataItem) => this.handlePointHover(d))
      .on('mouseout', this.handlePointMouseOut.bind(this))
      .on('click', (event: any, d: DataItem) => this.handlePointClick(d));
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
  
  private handlePointHover(item: DataItem): void {
    d3.select(this.chartContainer.nativeElement)
      .selectAll('circle')
      .attr('opacity', 0.3);
    
    d3.select(this.chartContainer.nativeElement)
      .selectAll(`circle[data-id="${this.getItemId(item)}"]`)
      .attr('opacity', 1)
      .attr('fill', '#ff7f0e')
      .attr('r', 8);
  }
  
  private handlePointMouseOut(): void {
    this.dataService.selectedData$.subscribe(selectedData => {
      if (selectedData.length === 0) {
        d3.select(this.chartContainer.nativeElement)
          .selectAll('circle')
          .attr('opacity', 0.7)
          .attr('fill', '#69b3a2')
          .attr('r', 5);
      } else {
        this.highlightPoints(selectedData);
      }
    }).unsubscribe(); // Unsubscribe immediately after use
  }
  
  private handlePointClick(item: DataItem): void {
    this.dataService.selectData([item]);
  }
  
  private highlightPoints(selectedItems: DataItem[]): void {
    d3.select(this.chartContainer.nativeElement)
      .selectAll('circle')
      .attr('opacity', 0.3)
      .attr('fill', '#69b3a2')
      .attr('r', 5);
    
    selectedItems.forEach(item => {
      d3.select(this.chartContainer.nativeElement)
        .selectAll(`circle[data-id="${this.getItemId(item)}"]`)
        .attr('opacity', 1)
        .attr('fill', '#ff7f0e')
        .attr('r', 8);
    });
  }
}

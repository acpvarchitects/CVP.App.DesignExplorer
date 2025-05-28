import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../services/data.service';
import { Option } from '../../models/option.interface';
import { Subscription } from 'rxjs';

declare var Plotly: any;

@Component({
  selector: 'app-parallel-plot',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="plot-container">
      <div id="parallel-plot" style="width: 100%; height: 400px;"></div>
    </div>
  `,
  styles: [`
    .plot-container {
      width: 100%;
      height: 400px;
      margin-bottom: 20px;
    }
  `]
})
export class ParallelPlotComponent implements OnInit, OnDestroy {
  private options: Option[] = [];
  private subscription: Subscription | null = null;
  private plot: any;
  private currentRanges: { [key: string]: [number, number] } = {};

  constructor(private dataService: DataService) {}

  ngOnInit(): void {
    this.subscription = this.dataService.getOptions().subscribe(options => {
      this.options = options;
      this.initPlot();
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private initPlot(): void {
    if (!this.options.length) return;

    const dimensions = [
      { label: 'P1', values: this.options.map(o => o.parameters.P1), range: [0, 100] },
      { label: 'P2', values: this.options.map(o => o.parameters.P2), range: [0, 100] },
      { label: 'P3', values: this.options.map(o => o.parameters.P3), range: [0, 100] },
      { label: 'P4', values: this.options.map(o => o.parameters.P4), range: [0, 100] },
      { label: 'P5', values: this.options.map(o => o.parameters.P5), range: [0, 100] },
      { label: 'P6', values: this.options.map(o => o.parameters.P6), range: [0, 100] }
    ];

    dimensions.forEach(dim => {
      this.currentRanges[dim.label] = [0, 100];
    });

    const data = [{
      type: 'parcoords',
      line: {
        color: 'blue',
        colorscale: 'Jet',
        showscale: false
      },
      dimensions: dimensions
    }];

    const layout = {
      title: 'Parallel Coordinates Plot',
      font: { size: 12 },
      margin: { l: 50, r: 50, b: 30, t: 50, pad: 4 }
    };

    Plotly.newPlot('parallel-plot', data, layout);

    const plotElement = document.getElementById('parallel-plot');
    if (plotElement) {
      plotElement.addEventListener('plotly_restyle', (event: any) => {
        const eventData = event.detail;
        if (eventData && eventData[0] && eventData[0].dimensions) {
          const dimensions = eventData[0].dimensions[0];
          
          dimensions.forEach((dim: any) => {
            if (dim.constraintrange) {
              this.currentRanges[dim.label] = dim.constraintrange;
            } else {
              this.currentRanges[dim.label] = [0, 100];
            }
          });
          
          this.dataService.applyFilters(this.currentRanges);
        }
      });
    }
  }
}

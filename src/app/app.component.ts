import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ParallelPlotComponent } from './components/parallel-plot/parallel-plot.component';
import { CardsGridComponent } from './components/cards-grid/cards-grid.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, ParallelPlotComponent, CardsGridComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Design Explorer';
}

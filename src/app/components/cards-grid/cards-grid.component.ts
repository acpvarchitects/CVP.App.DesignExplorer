import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { DataService } from '../../services/data.service';
import { Option } from '../../models/option.interface';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-cards-grid',
  standalone: true,
  imports: [CommonModule, MatCardModule],
  template: `
    <div class="cards-grid">
      <mat-card *ngFor="let option of options" [class.hidden]="!option.visible">
        <mat-card-header>
          <mat-card-title>{{ option.name }}</mat-card-title>
        </mat-card-header>
      </mat-card>
    </div>
  `,
  styles: [`
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 16px;
    }
    
    .hidden {
      display: none;
    }
    
    mat-card {
      margin-bottom: 16px;
    }
  `]
})
export class CardsGridComponent implements OnInit, OnDestroy {
  options: Option[] = [];
  private subscription: Subscription | null = null;

  constructor(private dataService: DataService) {}

  ngOnInit(): void {
    this.subscription = this.dataService.getOptions().subscribe(options => {
      this.options = options;
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}

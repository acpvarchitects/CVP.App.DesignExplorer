import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Option } from '../models/option.interface';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private options: Option[] = [];
  private optionsSubject = new BehaviorSubject<Option[]>([]);
  
  constructor() {
    this.generateOptions();
  }

  getOptions(): Observable<Option[]> {
    return this.optionsSubject.asObservable();
  }

  getAllOptions(): Option[] {
    return this.options;
  }

  private generateOptions(): void {
    this.options = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      name: `Option ${i + 1}`,
      parameters: {
        P1: this.getRandomValue(),
        P2: this.getRandomValue(),
        P3: this.getRandomValue(),
        P4: this.getRandomValue(),
        P5: this.getRandomValue(),
        P6: this.getRandomValue()
      },
      visible: true
    }));
    
    this.optionsSubject.next(this.options);
  }

  private getRandomValue(): number {
    return Math.floor(Math.random() * 101); // 0-100
  }

  applyFilters(filters: { [key: string]: [number, number] }): void {
    this.options.forEach(option => {
      option.visible = Object.entries(filters).every(([param, [min, max]]) => {
        const paramKey = param as keyof typeof option.parameters;
        const value = option.parameters[paramKey];
        return value >= min && value <= max;
      });
    });
    
    this.optionsSubject.next([...this.options]);
  }
}

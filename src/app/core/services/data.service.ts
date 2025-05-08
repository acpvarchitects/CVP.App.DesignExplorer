import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import * as d3 from 'd3';

export interface DataItem {
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private dataSubject = new BehaviorSubject<DataItem[]>([]);
  private inputParamsSubject = new BehaviorSubject<string[]>([]);
  private outputParamsSubject = new BehaviorSubject<string[]>([]);
  private imageParamsSubject = new BehaviorSubject<string[]>([]);
  private threeDParamsSubject = new BehaviorSubject<string[]>([]);
  private selectedDataSubject = new BehaviorSubject<DataItem[]>([]);
  private filteredDataSubject = new BehaviorSubject<DataItem[]>([]);
  
  public data$ = this.dataSubject.asObservable();
  public inputParams$ = this.inputParamsSubject.asObservable();
  public outputParams$ = this.outputParamsSubject.asObservable();
  public imageParams$ = this.imageParamsSubject.asObservable();
  public threeDParams$ = this.threeDParamsSubject.asObservable();
  public selectedData$ = this.selectedDataSubject.asObservable();
  public filteredData$ = this.filteredDataSubject.asObservable();
  
  constructor(private http: HttpClient) {}
  
  loadCsvData(url: string): Observable<DataItem[]> {
    return this.http.get(url, { responseType: 'text' })
      .pipe(
        map(text => this.parseCsv(text)),
        tap(data => this.processData(data))
      );
  }
  
  loadCsvFromFile(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const csvText = e.target?.result as string;
          const data = this.parseCsv(csvText);
          this.processData(data);
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Error reading file'));
      };
      
      reader.readAsText(file);
    });
  }
  
  loadCsvFromText(csvText: string): Observable<DataItem[]> {
    return new Observable(observer => {
      try {
        const data = this.parseCsv(csvText);
        this.processData(data);
        observer.next(data);
        observer.complete();
      } catch (error) {
        observer.error(error);
      }
    });
  }
  
  private parseCsv(text: string): DataItem[] {
    return d3.csvParse(text);
  }
  
  private processData(data: DataItem[]): void {
    if (!data || data.length === 0) return;
    
    this.dataSubject.next(data);
    
    const inputParams: string[] = [];
    const outputParams: string[] = [];
    const imageParams: string[] = [];
    const threeDParams: string[] = [];
    
    const keys = Object.keys(data[0]);
    
    keys.forEach(key => {
      const upperKey = key.toUpperCase();
      if (upperKey.startsWith('IN:')) {
        inputParams.push(key);
      } else if (upperKey.startsWith('OUT:')) {
        outputParams.push(key);
      } else if (upperKey.startsWith('IMG')) {
        imageParams.push(key);
      } else if (upperKey.startsWith('THREED')) {
        threeDParams.push(key);
      }
    });
    
    this.inputParamsSubject.next(inputParams);
    this.outputParamsSubject.next(outputParams);
    this.imageParamsSubject.next(imageParams);
    this.threeDParamsSubject.next(threeDParams);
    
    this.filteredDataSubject.next(data);
  }
  
  selectData(items: DataItem[]): void {
    this.selectedDataSubject.next(items);
  }
  
  filterData(filterFn: (item: DataItem) => boolean): void {
    const filtered = this.dataSubject.value.filter(filterFn);
    this.filteredDataSubject.next(filtered);
  }
  
  getCleanValue(item: DataItem, key: string): number | string {
    const value = item[key];
    if (typeof value === 'string' && !isNaN(Number(value))) {
      return Number(value);
    }
    return value;
  }
  
  getParameterRange(key: string): [number, number] {
    const data = this.dataSubject.value;
    if (!data || data.length === 0) return [0, 0];
    
    const values = data
      .map(item => this.getCleanValue(item, key))
      .filter(value => typeof value === 'number') as number[];
    
    if (values.length === 0) return [0, 0];
    
    return [Math.min(...values), Math.max(...values)];
  }
}

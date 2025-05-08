import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DataService } from '../../../../core/services/data.service';

@Component({
  selector: 'app-data-loader',
  templateUrl: './data-loader.component.html',
  styleUrl: './data-loader.component.scss',
  imports: [
    CommonModule,
    FormsModule
  ],
  standalone: true
})
export class DataLoaderComponent {
  folderLink: string = '';
  csvFile: File | null = null;
  loading: boolean = false;
  error: string = '';
  
  constructor(
    private dataService: DataService,
    private http: HttpClient
  ) {}
  
  loadFromGoogleDrive(): void {
    if (!this.folderLink) {
      this.error = 'Please enter a valid Google Drive folder link';
      return;
    }
    
    this.loading = true;
    this.error = '';
    
    const match = this.folderLink.match(/[-\w]{25,}/);
    if (!match) {
      this.error = 'Invalid Google Drive folder link';
      this.loading = false;
      return;
    }
    
    const folderId = match[0];
    const csvUrl = `https://drive.google.com/uc?export=download&id=${folderId}`;
    
    this.dataService.loadCsvData(csvUrl).subscribe({
      next: () => {
        this.loading = false;
        this.folderLink = '';
      },
      error: (err) => {
        console.error('Error loading data from Google Drive:', err);
        this.error = 'Failed to load data from Google Drive. Please check the link and try again.';
        this.loading = false;
      }
    });
  }
  
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    
    this.csvFile = input.files[0];
  }
  
  loadFromFile(): void {
    if (!this.csvFile) {
      this.error = 'Please select a CSV file';
      return;
    }
    
    this.loading = true;
    this.error = '';
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target?.result as string;
      try {
        this.dataService.loadCsvFromText(csvText).subscribe({
          next: () => {
            this.loading = false;
            this.csvFile = null;
          },
          error: (err: unknown) => {
            console.error('Error processing CSV file:', err);
            this.error = 'Failed to process CSV file. Please check the file format and try again.';
            this.loading = false;
          }
        });
      } catch (err) {
        console.error('Error reading CSV file:', err);
        this.error = 'Failed to read CSV file. Please check the file format and try again.';
        this.loading = false;
      }
    };
    
    reader.onerror = () => {
      this.error = 'Failed to read the file. Please try again.';
      this.loading = false;
    };
    
    reader.readAsText(this.csvFile);
  }
  
  loadDefaultData(): void {
    this.loading = true;
    this.error = '';
    
    const dataPath = './assets/data/default_onload.csv';
    console.log('Loading default data from:', dataPath);
    
    this.dataService.loadCsvData(dataPath).subscribe({
      next: (data) => {
        console.log('Successfully loaded data:', data.length, 'records');
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading default data:', err);
        this.error = 'Failed to load default data. Please try again.';
        this.loading = false;
        
        this.tryAlternativePath();
      }
    });
  }
  
  private tryAlternativePath(): void {
    const altPath = '/assets/data/default_onload.csv';
    console.log('Trying alternative path:', altPath);
    
    this.dataService.loadCsvData(altPath).subscribe({
      next: (data) => {
        console.log('Successfully loaded data from alternative path:', data.length, 'records');
        this.loading = false;
        this.error = '';
      },
      error: (err) => {
        console.error('Error loading from alternative path:', err);
      }
    });
  }
}

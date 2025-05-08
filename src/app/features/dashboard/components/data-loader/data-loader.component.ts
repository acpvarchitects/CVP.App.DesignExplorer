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
    
    const sampleData = `in:Depth [ft],in:Height [ft],in:Orientation,in:WWR [%],in:SHD,out:Cooling[kWh],out:Heating[kWh],out:Lighting[kWh],out:EffDepth[m],out:DA [%],out:UDI [%],out:CDA [%],out:SDA [Area%],img,threeD
10,3,0,0.4,0,1775.336166,4019.071531,694.957328,4.75,40,46.111111,54.444444,50,assets/images/placeholder.png,
10,3.6,0,0.4,0,1913.459768,4279.592955,627.582736,5.25,43.888889,51.111111,57.222222,55,assets/images/placeholder.png,
10,4.2,0,0.4,0,2044.072567,4561.665896,452.009184,5.75,46.666667,56.666667,61.111111,58.89,assets/images/placeholder.png,
6,3,0,0.4,0,1220.922529,2548.142723,67.991593,5.75,72.222222,60.185185,100,100,assets/images/placeholder.png,
6,3.6,0,0.4,0,1380.964697,2719.688415,50.255212,5.75,80.555556,57.407407,100,100,assets/images/placeholder.png,`;
    
    console.log('Loading sample data');
    
    this.dataService.loadCsvFromText(sampleData).subscribe({
      next: (data) => {
        console.log('Successfully loaded sample data:', data.length, 'records');
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading sample data:', err);
        this.error = 'Failed to load sample data. Please try again.';
        this.loading = false;
        
        this.tryLoadFromFile();
      }
    });
  }
  
  private tryLoadFromFile(): void {
    const dataPath = './assets/data/default_onload.csv';
    console.log('Trying to load from file:', dataPath);
    
    this.dataService.loadCsvData(dataPath).subscribe({
      next: (data) => {
        console.log('Successfully loaded data from file:', data.length, 'records');
        this.loading = false;
        this.error = '';
      },
      error: (err) => {
        console.error('Error loading from file:', err);
        this.error = 'Failed to load data from file. Please try uploading a CSV file manually.';
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
        
        this.tryRelativePath();
      }
    });
  }
  
  private tryRelativePath(): void {
    this.http.get('./assets/data/test.json').subscribe({
      next: (data) => {
        console.log('Successfully loaded test file:', data);
        
        const relativePath = 'assets/data/default_onload.csv';
        console.log('Trying relative path:', relativePath);
        
        this.dataService.loadCsvData(relativePath).subscribe({
          next: (csvData) => {
            console.log('Successfully loaded data from relative path:', csvData.length, 'records');
            this.loading = false;
            this.error = '';
          },
          error: (csvErr) => {
            console.error('Error loading from relative path:', csvErr);
          }
        });
      },
      error: (testErr) => {
        console.error('Error loading test file:', testErr);
      }
    });
  }
}

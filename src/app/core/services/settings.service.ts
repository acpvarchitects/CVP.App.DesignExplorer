import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface StudyInfo {
  name: string;
  date: string;
}

export interface DimensionSettings {
  dimScales: { [key: string]: string };
  dimTicks: { [key: string]: number[] };
  dimMark: { [key: string]: string[] };
}

export interface Settings extends DimensionSettings {
  studyInfo: StudyInfo;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private defaultSettings: Settings = {
    studyInfo: {
      name: '',
      date: new Date().toISOString().split('T')[0]
    },
    dimScales: {},
    dimTicks: {},
    dimMark: {}
  };

  private settingsSubject = new BehaviorSubject<Settings>(this.defaultSettings);
  public settings$ = this.settingsSubject.asObservable();

  constructor() { }

  updateSettings(settings: Partial<Settings>): void {
    const currentSettings = this.settingsSubject.value;
    this.settingsSubject.next({
      ...currentSettings,
      ...settings
    });
  }

  updateStudyInfo(studyInfo: Partial<StudyInfo>): void {
    const currentSettings = this.settingsSubject.value;
    this.settingsSubject.next({
      ...currentSettings,
      studyInfo: {
        ...currentSettings.studyInfo,
        ...studyInfo
      }
    });
  }

  updateDimensionScale(dimension: string, scale: string): void {
    const currentSettings = this.settingsSubject.value;
    const dimScales = { ...currentSettings.dimScales };
    dimScales[dimension] = scale;
    
    this.settingsSubject.next({
      ...currentSettings,
      dimScales
    });
  }

  updateDimensionTicks(dimension: string, ticks: number[]): void {
    const currentSettings = this.settingsSubject.value;
    const dimTicks = { ...currentSettings.dimTicks };
    dimTicks[dimension] = ticks;
    
    this.settingsSubject.next({
      ...currentSettings,
      dimTicks
    });
  }

  updateDimensionMark(dimension: string, marks: string[]): void {
    const currentSettings = this.settingsSubject.value;
    const dimMark = { ...currentSettings.dimMark };
    dimMark[dimension] = marks;
    
    this.settingsSubject.next({
      ...currentSettings,
      dimMark
    });
  }

  loadSettingsFromJson(jsonString: string): void {
    try {
      const settings = JSON.parse(jsonString) as Settings;
      this.settingsSubject.next({
        ...this.defaultSettings,
        ...settings
      });
    } catch (error) {
      console.error('Error parsing settings JSON:', error);
    }
  }

  getSettingsAsJson(): string {
    return JSON.stringify(this.settingsSubject.value);
  }

  resetSettings(): void {
    this.settingsSubject.next(this.defaultSettings);
  }
}

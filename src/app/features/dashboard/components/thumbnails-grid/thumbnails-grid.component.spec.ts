import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThumbnailsGridComponent } from './thumbnails-grid.component';

describe('ThumbnailsGridComponent', () => {
  let component: ThumbnailsGridComponent;
  let fixture: ComponentFixture<ThumbnailsGridComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThumbnailsGridComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ThumbnailsGridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

# Design Explorer - Angular Version

Design Explorer is a web application for exploring multi-dimensional design spaces in an enjoyable and meaningful way. This version has been completely rebuilt using Angular components and modern architecture.

## Features

- Interactive parallel coordinates visualization
- Scatter chart for exploring relationships between parameters
- Thumbnail grid for visual exploration of design options
- 2D/3D viewer for detailed design inspection
- Parameter sliders for filtering designs
- Support for CSV data loading from files and Google Drive

## Technologies Used

- [Angular](https://angular.io/) - Frontend framework
- [D3.js](https://d3js.org/) - Data visualization library
- [Bootstrap](https://getbootstrap.com/) - UI components and styling
- [RxJS](https://rxjs.dev/) - Reactive programming library

## Development Setup

### Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

### Development Server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Building for Production

To build the project for production, run:

```bash
ng build --prod
```

This will compile your project and store the build artifacts in the `dist/` directory.

## Project Structure

- `src/app/core` - Core services and components used throughout the application
- `src/app/shared` - Shared modules, components, directives, and pipes
- `src/app/features` - Feature modules (dashboard)
- `src/assets` - Static assets (images, data files)

## Original Design Explorer

This project is a rebuild of the original Design Explorer, which was built on top of these plugins and web technologies:

- [Bootstrap template with side bar](http://getbootstrap.com/)
- [D3 Parallel coordinates](https://syntagmatic.github.io/parallel-coordinates/)
- [D3js](http://d3js.org/)
- [Ion.Range Slider](http://ionden.com/a/plugins/ion.rangeSlider/en.html)
- [jQuery Star Rating Plugin](http://www.fyneworks.com/jquery/star-rating/)
- [Pace](http://github.hubspot.com/pace/docs/welcome/)
- [Radar Chart](https://github.com/alangrafu/radar-chart-d3)
- [Spectacles](https://github.com/tt-acm/Spectacles.WebViewer) - 3D viewer
- [Scatter-matrix Chart](https://github.com/benjiec/scatter-matrix)

// Root.js

import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import ErrorBoundary from './components/ErrorBoundary.js'; // ErrorBoundary import

const Root = () => (
  <BrowserRouter>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </BrowserRouter>
);

export default Root;

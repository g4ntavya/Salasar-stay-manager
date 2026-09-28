import React from 'react';
import { LoadingState } from '../ui';

interface LoadingSpinnerProps {
  message?: string;
}

/** Full-screen branded loading state (kept under this name for existing screens). */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message }) => <LoadingState message={message} />;

export default LoadingSpinner;

import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import LoadingSpinner from '../src/components/LoadingSpinner';

export default function Index() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user && !profile) {
      router.replace('/login');
    } else {
      router.replace('/dashboard');
    }
  }, [user, profile, loading, router]);

  return <LoadingSpinner message="Restoring session..." />;
}

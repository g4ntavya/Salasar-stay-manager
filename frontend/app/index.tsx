import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth, homeRouteFor } from '../src/context/AuthContext';
import LoadingSpinner from '../src/components/LoadingSpinner';

export default function Index() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // Only a confirmed Firebase session with an authorized profile enters the app.
    if (user && profile) router.replace(homeRouteFor(profile.role));
    else router.replace('/login');
  }, [user, profile, loading, router]);

  return <LoadingSpinner message="Restoring session..." />;
}

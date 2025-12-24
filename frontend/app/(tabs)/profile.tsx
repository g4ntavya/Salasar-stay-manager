import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import LoadingSpinner from '../../src/components/LoadingSpinner';

const ProfileScreen = () => {
  const router = useRouter();
  const { user, profile, loading, signOut } = useAuth();

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/login');
            } catch (error) {
              console.error('Sign out error:', error);
              alert('Failed to sign out');
            }
          },
        },
      ]
    );
  };

  if (loading && !profile) {
    return <LoadingSpinner message="Loading profile..." />;
  }

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (!user && !loading) {
    return <LoadingSpinner message="Redirecting..." />;
  }

  const effectiveProfile =
    profile ||
    (user && {
      full_name: user.displayName || user.email || 'User',
      email: user.email || 'N/A',
      role:
        (user.displayName || '').trim().toLowerCase() === 'sarita rohilla' ||
        (user.email || '').trim().toLowerCase() === 'sarita@salasar.com'
          ? 'ADMIN'
          : 'STAFF',
      id: user.uid,
    });

  if (!effectiveProfile) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#6b7280' }}>No profile found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={48} color="#fff" />
          </View>
        </View>
        <Text style={styles.name}>{effectiveProfile.full_name}</Text>
        <View
          style={[
            styles.roleBadge,
            effectiveProfile.role === 'ADMIN' ? styles.adminBadge : styles.staffBadge,
          ]}
        >
          <Text style={styles.roleText}>{effectiveProfile.role}</Text>
        </View>
      </View>

      {/* Profile Details */}
      <View style={styles.section}>
        <View style={styles.detailItem}>
          <View style={styles.detailIcon}>
            <Ionicons name="mail" size={20} color="#6b7280" />
          </View>
          <View style={styles.detailContent}>
            <Text style={styles.detailLabel}>Email</Text>
            <Text style={styles.detailValue}>{effectiveProfile.email}</Text>
          </View>
        </View>

        <View style={styles.detailItem}>
          <View style={styles.detailIcon}>
            <Ionicons name="shield-checkmark" size={20} color="#6b7280" />
          </View>
          <View style={styles.detailContent}>
            <Text style={styles.detailLabel}>Role</Text>
            <Text style={styles.detailValue}>{effectiveProfile.role}</Text>
          </View>
        </View>

        <View style={styles.detailItem}>
          <View style={styles.detailIcon}>
            <Ionicons name="id-card" size={20} color="#6b7280" />
          </View>
          <View style={styles.detailContent}>
            <Text style={styles.detailLabel}>User ID</Text>
            <Text style={styles.detailValue}>{effectiveProfile.id}</Text>
          </View>
        </View>
      </View>

      {/* Permissions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Permissions</Text>
        <View style={styles.permissionsList}>
          <View style={styles.permissionItem}>
            <Ionicons name="checkmark-circle" size={20} color="#10b981" />
            <Text style={styles.permissionText}>View Dashboard</Text>
          </View>
          <View style={styles.permissionItem}>
            <Ionicons name="checkmark-circle" size={20} color="#10b981" />
            <Text style={styles.permissionText}>Manage Bookings</Text>
          </View>
          <View style={styles.permissionItem}>
            <Ionicons name="checkmark-circle" size={20} color="#10b981" />
            <Text style={styles.permissionText}>View Customers</Text>
          </View>
          {effectiveProfile.role === 'ADMIN' && (
            <>
              <View style={styles.permissionItem}>
                <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                <Text style={styles.permissionText}>Manage Rooms</Text>
              </View>
              <View style={styles.permissionItem}>
                <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                <Text style={styles.permissionText}>Delete Bookings</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Sign Out Button */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out" size={20} color="#fff" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Version Info */}
      <Text style={styles.versionText}>Salasar Stay Manager v1.0.0</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#fff',
    padding: 32,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  roleBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  adminBadge: {
    backgroundColor: '#dbeafe',
  },
  staffBadge: {
    backgroundColor: '#fef3c7',
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailIcon: {
    width: 40,
    alignItems: 'center',
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#1f2937',
    fontWeight: '500',
  },
  permissionsList: {
    gap: 12,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  permissionText: {
    fontSize: 16,
    color: '#4b5563',
  },
  signOutButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  signOutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  versionText: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 12,
    marginVertical: 24,
  },
});

export default ProfileScreen;

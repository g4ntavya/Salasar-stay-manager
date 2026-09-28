import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, colors, radius, space } from '../ui';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** Catches render crashes and shows a calm recovery screen instead of a blank app. */
class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  private handleReset = () => this.setState({ hasError: false, error: null });

  public render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.icon}>
            <Ionicons name="cloud-offline-outline" size={34} color={colors.brand} />
          </View>
          <AppText variant="title1" align="center">
            Something went wrong
          </AppText>
          <AppText variant="body" tone="soft" align="center" style={{ marginTop: space.sm, maxWidth: 300 }}>
            The app hit an unexpected problem. Your bookings and guest data are safe on the server.
          </AppText>
          {__DEV__ && this.state.error ? (
            <View style={styles.details}>
              <AppText variant="caption" tone="danger">
                {this.state.error.toString()}
              </AppText>
            </View>
          ) : null}
          <Button title="Try again" icon="refresh" size="lg" onPress={this.handleReset} style={{ marginTop: space.xxl, alignSelf: 'stretch' }} />
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxxl },
  icon: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.xl },
  details: { marginTop: space.xl, padding: space.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft, alignSelf: 'stretch' },
});

export default ErrorBoundary;

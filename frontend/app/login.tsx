import React, { useEffect, useRef, useState } from 'react';
import { Image, Keyboard, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth, homeRouteFor } from '../src/context/AuthContext';
import { AppText, Button, Field, PressableScale, colors, radius, space, GUTTER, haptic } from '../src/ui';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Keep the whole form (fields + button) above the keyboard while typing.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scrollRef.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);
  const { signIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      haptic.warning();
      return;
    }
    setError('');
    setLoading(true);
    try {
      const profile = await signIn(email, password);
      haptic.success();
      router.replace(homeRouteFor(profile.role));
    } catch (err: any) {
      haptic.warning();
      setError(err.message || 'Could not sign in. Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView ref={scrollRef} contentContainerStyle={styles.flexGrow} keyboardShouldPersistTaps="handled" bounces={false}>
          <LinearGradient colors={[colors.brand, colors.brandDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + space.huge }]}>
            <View style={styles.ring}>
              <View style={styles.logoWrap}>
                <Image source={require('../assets/images/logo.jpeg')} style={styles.logo} resizeMode="contain" />
              </View>
            </View>
            <AppText variant="overline" color="rgba(255,255,255,0.7)" align="center" style={{ marginTop: space.xl }}>
              Welcome to
            </AppText>
            <AppText variant="display" color={colors.inkInverse} align="center" style={{ marginTop: space.xs }}>
              Shri Salasar{'\n'}Sewa Sadan
            </AppText>
          </LinearGradient>

          <View style={[styles.panel, { paddingBottom: insets.bottom + space.xxl }]}>
            <AppText variant="title2">Staff sign in</AppText>
            <AppText variant="footnote" tone="soft" style={{ marginTop: space.xs, marginBottom: space.xxl }}>
              Use the login your administrator gave you.
            </AppText>

            <Field
              label="Email"
              icon="mail-outline"
              placeholder="you@example.com"
              value={email}
              onChangeText={t => {
                setEmail(t);
                if (error) setError('');
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!loading}
            />
            <Field
              ref={passwordRef}
              label="Password"
              icon="lock-closed-outline"
              placeholder="Your password"
              value={password}
              onChangeText={t => {
                setPassword(t);
                if (error) setError('');
              }}
              secureTextEntry={!showPassword}
              textContentType="password"
              autoComplete="password"
              returnKeyType="go"
              onSubmitEditing={handleSignIn}
              editable={!loading}
              right={
                <PressableScale
                  onPress={() => setShowPassword(v => !v)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.inkMuted} />
                </PressableScale>
              }
            />

            {error ? (
              <View style={styles.error} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <AppText variant="footnote" tone="danger" style={styles.flex}>
                  {error}
                </AppText>
              </View>
            ) : null}

            <Button title="Sign in" iconRight="arrow-forward" size="lg" onPress={handleSignIn} loading={loading} fullWidth style={{ marginTop: space.sm }} />

            <View style={styles.footer}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.inkMuted} />
              <AppText variant="caption" tone="muted">
                Secure staff access · Guest data stays private
              </AppText>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
  hero: { alignItems: 'center', paddingBottom: space.huge + space.xl, paddingHorizontal: GUTTER },
  ring: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  logoWrap: { width: 108, height: 108, borderRadius: 54, backgroundColor: colors.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 100, height: 100 },
  panel: {
    flexGrow: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    marginTop: -space.xxl,
    paddingHorizontal: GUTTER + 4,
    paddingTop: space.xxxl,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: space.xxl },
});

export default LoginScreen;

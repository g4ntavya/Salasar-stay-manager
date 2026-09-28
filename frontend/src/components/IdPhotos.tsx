import React from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { mediaImageSource } from '../utils/imageStorage';
import { MAX_ID_IMAGES } from '../utils/rtdbService';
import { AppText, Button, PressableScale, colors, radius, space } from '../ui';

export interface IdPhotosProps {
  photos: string[];
  onChange: (photos: string[]) => void;
}

/** ID photo strip with camera / gallery buttons. New photos stay local until the upload queue sends them. */
export const IdPhotos: React.FC<IdPhotosProps> = ({ photos, onChange }) => {
  const room = MAX_ID_IMAGES - photos.length;

  const add = (uris: string[]) => onChange([...photos, ...uris].slice(0, MAX_ID_IMAGES));

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to photograph the ID.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true });
    if (!result.canceled && result.assets?.[0]?.uri) add([result.assets[0].uri]);
  };

  const pickPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo access needed', 'Allow photo access in Settings to attach ID photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, room),
    });
    if (!result.canceled) add(result.assets.map(a => a.uri).filter(Boolean));
  };

  return (
    <View>
      <View style={styles.buttons}>
        <Button title="Camera" icon="camera-outline" variant="tonal" onPress={takePhoto} disabled={room <= 0} style={{ flex: 1 }} />
        <Button title="Gallery" icon="images-outline" variant="secondary" onPress={pickPhotos} disabled={room <= 0} style={{ flex: 1 }} />
      </View>
      {photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {photos.map((uri, idx) => (
            <View key={`${uri}-${idx}`} style={styles.thumb}>
              <Image source={uri.startsWith('http') ? mediaImageSource(uri) : { uri }} style={styles.thumbImg} contentFit="cover" transition={120} />
              <PressableScale
                onPress={() => onChange(photos.filter((_, i) => i !== idx))}
                style={styles.remove}
                hitSlop={8}
                accessibilityLabel={`Remove photo ${idx + 1}`}
              >
                <Ionicons name="close" size={14} color={colors.inkInverse} />
              </PressableScale>
            </View>
          ))}
        </ScrollView>
      ) : (
        <AppText variant="caption" tone="muted" style={{ marginTop: space.md }}>
          Front and back of the ID, up to {MAX_ID_IMAGES} photos. They upload in the background.
        </AppText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', gap: space.md },
  thumbs: { gap: space.sm, marginTop: space.md },
  thumb: { width: 96, height: 72, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  thumbImg: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

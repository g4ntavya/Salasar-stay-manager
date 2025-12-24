import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

export const requestCameraPermission = async (): Promise<boolean> => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    alert('Sorry, we need camera permissions to capture ID photos!');
    return false;
  }
  return true;
};

export const captureIDPhoto = async (): Promise<string | null> => {
  const hasPermission = await requestCameraPermission();
  if (!hasPermission) return null;

  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5, // Reduce quality for smaller base64 size
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      return `data:image/jpeg;base64,${base64}`;
    }
    return null;
  } catch (error) {
    console.error('Error capturing photo:', error);
    alert('Failed to capture photo. Please try again.');
    return null;
  }
};

export const pickIDPhotoFromGallery = async (): Promise<string | null> => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    alert('Sorry, we need gallery permissions to select photos!');
    return null;
  }

  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      return `data:image/jpeg;base64,${base64}`;
    }
    return null;
  } catch (error) {
    console.error('Error picking photo:', error);
    alert('Failed to select photo. Please try again.');
    return null;
  }
};

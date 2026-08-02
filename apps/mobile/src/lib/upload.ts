import { SOCIAL_MEDIA_BUCKET } from "@aiesec/api-contract";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

export type PickedImage = { uri: string; width: number; height: number };

/**
 * Instagram accepts up to 1440px on the long edge and re-compresses anything
 * larger anyway, so downscaling before upload costs nothing visually and saves
 * a lot of cellular data and Storage space.
 */
const MAX_EDGE = 1440;
const JPEG_QUALITY = 0.85;

export async function pickImage(source: "library" | "camera"): Promise<PickedImage | null> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error(
      source === "camera"
        ? "Camera access is off for this app. Turn it on in Settings to take a photo."
        : "Photo access is off for this app. Turn it on in Settings to pick an image."
    );
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    // Instagram feed posts are cropped to 1:1 anyway; cropping here means what
    // you see in the composer is what gets published.
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1
  };

  const result =
    source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

async function compress(image: PickedImage): Promise<string> {
  const longEdge = Math.max(image.width, image.height);
  if (longEdge <= MAX_EDGE) return image.uri;

  const context = ImageManipulator.ImageManipulator.manipulate(image.uri);
  context.resize(image.width >= image.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG });
  return saved.uri;
}

/**
 * Upload an image to the public `social-media` bucket and return its public URL.
 *
 * Goes straight to Supabase Storage rather than through /api/mobile/v1 for two
 * reasons: Vercel caps serverless request bodies at 4.5 MB, and Instagram
 * publishes from a URL it fetches itself, so the file has to be publicly
 * readable regardless. Storage RLS (migration 0011) restricts writes to a
 * folder named after an LC the caller belongs to.
 */
export async function uploadSocialImage(image: PickedImage, lcId: string): Promise<string> {
  const uri = await compress(image);

  const response = await fetch(uri);
  if (!response.ok) throw new Error("Couldn't read that image from your device.");
  const bytes = await response.arrayBuffer();

  // crypto.randomUUID is available via react-native-get-random-values in the
  // Supabase polyfill chain; fall back to a timestamp if it isn't.
  const unique =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const path = `${lcId}/${unique}.jpg`;

  const { error } = await supabase.storage.from(SOCIAL_MEDIA_BUCKET).upload(path, bytes, {
    contentType: "image/jpeg",
    upsert: false
  });

  if (error) {
    // The most common cause by far is migration 0011 not having been applied.
    throw new Error(
      /bucket not found/i.test(error.message)
        ? "Image storage isn't set up yet. Apply migration 0011 in Supabase, then try again."
        : `Upload failed: ${error.message}`
    );
  }

  const { data } = supabase.storage.from(SOCIAL_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
